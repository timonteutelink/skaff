import type { Dirent } from "node:fs";
import * as fs from "node:fs/promises";
import path from "node:path";

import { TemplateParentReference } from "@timonteutelink/template-types-lib";

import { getConfig } from "../lib";
import { backendLogger } from "../lib/logger";
import { Result, TemplateRepoLoadResult } from "../lib/types";
import { logError } from "../lib/utils";
import type { GitService } from "../core/infra/git-service";
import { CacheService } from "../core/infra/cache-service";
import { TemplateRegistry } from "../core/templates/TemplateRegistry";
import { TemplateTreeBuilder } from "../core/templates/TemplateTreeBuilder";
import type { Template } from "../core/templates/Template";
import {
  normalizeGitRepositorySpecifier,
  parseTemplatePathEntry,
} from "../lib/git-repo-spec";

export type TemplatePathsProvider = () => Promise<string[]>;

export const defaultTemplatePathsProvider: TemplatePathsProvider = async () => {
  const config = await getConfig();
  return config.TEMPLATE_DIR_PATHS;
};

// TODO: findTemplate and loadRevision should only load that specific template not load all templates

// now only stores the root templates at: <templateDirPath>/templates/*
// later also store reference to files and generic templates to allow direct instantiation without saving state of subtemplates
type RemoteRepoSource = "config" | "manual" | "cache";

interface RemoteRepoEntry {
  url: string;
  branch?: string;
  revision?: string;
  path: string;
  source: RemoteRepoSource;
  commitHash?: string;
}

interface CacheDirDescriptorInfo {
  branch?: string;
  hasExplicitRevision: boolean;
  revisionFromSuffix?: string;
}

const LONG_REVISION_SUFFIX = /-([0-9a-f]{40})$/i;
const SHORT_HASH_SUFFIX = /-([0-9a-f]{8})$/i;

function isDevTemplatesEnabled(): boolean {
  const raw = process.env.SKAFF_DEV_TEMPLATES?.toLowerCase().trim();
  return raw === "1" || raw === "true" || raw === "yes" || raw === "on";
}

function extractDescriptorSegment(dirName: string): string | null {
  const branchTokenIndex = dirName.lastIndexOf("-branch-");
  if (branchTokenIndex >= 0) {
    return dirName.slice(branchTokenIndex + 1);
  }

  const revisionTokenIndex = dirName.lastIndexOf("-rev-");
  if (revisionTokenIndex >= 0) {
    return dirName.slice(revisionTokenIndex + 1);
  }

  const defaultTokenIndex = dirName.lastIndexOf("-default");
  if (defaultTokenIndex >= 0) {
    return dirName.slice(defaultTokenIndex + 1);
  }

  return null;
}

function inferCacheDirDescriptor(dirName: string): CacheDirDescriptorInfo {
  let workingName = dirName;
  let revisionFromSuffix: string | undefined;

  const revisionMatch = workingName.match(LONG_REVISION_SUFFIX);
  if (revisionMatch?.[1]) {
    revisionFromSuffix = revisionMatch[1];
    const matchedSuffix = revisionMatch[0] ?? "";
    workingName = workingName.slice(0, -matchedSuffix.length);
  }

  const shortHashMatch = workingName.match(SHORT_HASH_SUFFIX);
  if (shortHashMatch?.[0]) {
    const matchedShortSuffix = shortHashMatch[0];
    workingName = workingName.slice(0, -matchedShortSuffix.length);
  }

  const descriptorSegment = extractDescriptorSegment(workingName);

  if (!descriptorSegment || descriptorSegment === "default") {
    return {
      branch: undefined,
      hasExplicitRevision: Boolean(revisionFromSuffix),
      revisionFromSuffix,
    };
  }

  if (descriptorSegment.startsWith("branch-")) {
    const remainder = descriptorSegment.slice("branch-".length);
    const revisionDelimiter = remainder.lastIndexOf("-rev-");

    if (revisionDelimiter >= 0) {
      const branchValue = remainder.slice(0, revisionDelimiter).trim();
      return {
        branch: branchValue.length ? branchValue : undefined,
        hasExplicitRevision: true,
        revisionFromSuffix,
      };
    }

    const trimmedBranch = remainder.trim();
    return {
      branch: trimmedBranch.length ? trimmedBranch : undefined,
      hasExplicitRevision: Boolean(revisionFromSuffix),
      revisionFromSuffix,
    };
  }

  if (descriptorSegment.startsWith("rev-")) {
    return {
      branch: undefined,
      hasExplicitRevision: true,
      revisionFromSuffix,
    };
  }

  return {
    branch: undefined,
    hasExplicitRevision: Boolean(revisionFromSuffix),
    revisionFromSuffix,
  };
}

export class RootTemplateRepository {
  private loading: boolean = false;
  private readonly templatePathsProvider: TemplatePathsProvider;
  private remoteRepos: RemoteRepoEntry[] = [];
  private readonly registry = new TemplateRegistry();
  public templates: Template[] = [];
  private readonly devTemplatesEnabled: boolean;

  constructor(
    private readonly templateTreeBuilder: TemplateTreeBuilder,
    private readonly gitService: GitService,
    templatePathsProvider: TemplatePathsProvider = defaultTemplatePathsProvider,
  ) {
    this.templatePathsProvider = templatePathsProvider;
    this.devTemplatesEnabled = isDevTemplatesEnabled();
  }

  private async hydrateCachedRepos(): Promise<void> {
    const cacheDir = CacheService.getCacheDirPath();
    let entries: Dirent[];
    try {
      entries = await fs.readdir(cacheDir, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      if (!entry.isDirectory()) {
        continue;
      }

      const repoPath = path.join(cacheDir, entry.name);
      const gitDir = await fs
        .stat(path.join(repoPath, ".git"))
        .catch(() => null);
      if (!gitDir || (!gitDir.isDirectory() && !gitDir.isFile())) {
        continue;
      }

      const templatesDir = path.join(repoPath, "templates");
      const hasTemplates = await fs
        .stat(templatesDir)
        .then((stat) => stat.isDirectory())
        .catch(() => false);
      if (!hasTemplates) {
        continue;
      }

      const repoUrlResult = await this.gitService.getRemoteUrl(repoPath);
      if ("error" in repoUrlResult) {
        continue;
      }
      const branchResult = await this.gitService.getCurrentBranch(repoPath);
      if ("error" in branchResult) {
        continue;
      }
      const commitHashResult = await this.gitService.getCommitHash(repoPath);
      if ("error" in commitHashResult) {
        continue;
      }

      const descriptorInfo = inferCacheDirDescriptor(entry.name);
      const branchFromGit = branchResult.data?.trim() || undefined;
      const branch =
        branchFromGit && branchFromGit !== "HEAD"
          ? branchFromGit
          : descriptorInfo.branch;
      const revision =
        descriptorInfo.revisionFromSuffix ??
        (descriptorInfo.hasExplicitRevision
          ? commitHashResult.data
          : undefined);
      const existing = this.remoteRepos.find(
        (repo) =>
          repo.url === repoUrlResult.data &&
          (repo.branch ?? "") === (branch ?? "") &&
          (repo.revision ?? "") === (revision ?? ""),
      );

      if (existing) {
        existing.path = repoPath;
        existing.commitHash = commitHashResult.data;
        existing.source = existing.source ?? "cache";
        existing.revision = revision;
        existing.branch = branch;
      } else {
        this.remoteRepos.push({
          url: repoUrlResult.data,
          branch,
          revision,
          path: repoPath,
          source: "cache",
          commitHash: commitHashResult.data,
        });
      }
    }
  }

  async addRemoteRepo(
    url: string,
    branch?: string,
    options?: { refresh?: boolean; revision?: string },
  ): Promise<Result<TemplateRepoLoadResult>> {
    const normalized = normalizeGitRepositorySpecifier(url);
    const repoUrl = normalized?.repoUrl ?? url;
    const requestedBranch = normalized?.branch ?? branch;
    const targetRevision = normalized?.revision ?? options?.revision;
    const shouldInferDefaultBranch = !requestedBranch && !targetRevision;

    let targetBranch = requestedBranch;
    if (shouldInferDefaultBranch) {
      const defaultBranchResult =
        await this.gitService.getRemoteDefaultBranch(repoUrl);
      if ("error" in defaultBranchResult) {
        return { error: defaultBranchResult.error };
      }
      targetBranch = defaultBranchResult.data;
    }

    let existing = this.remoteRepos.find(
      (r) =>
        r.url === repoUrl &&
        (r.branch ?? "") === (targetBranch ?? "") &&
        (r.revision ?? "") === (targetRevision ?? ""),
    );

    if (!existing && shouldInferDefaultBranch) {
      existing = this.remoteRepos.find(
        (r) =>
          r.url === repoUrl &&
          (r.branch ?? "") === "" &&
          (r.revision ?? "") === "",
      );
    }

    if (existing && !options?.refresh) {
      return { data: { alreadyExisted: true } };
    }

    const cloneResult = await this.gitService.cloneRepoBranchToCache(
      repoUrl,
      targetBranch,
      { forceRefresh: Boolean(options?.refresh), revision: targetRevision },
    );
    if ("error" in cloneResult) {
      return { error: cloneResult.error };
    }

    if (existing) {
      existing.path = cloneResult.data;
      existing.source = existing.source ?? "manual";
      existing.revision = targetRevision;
      existing.branch = targetBranch;
    } else {
      this.remoteRepos.push({
        url: repoUrl,
        branch: targetBranch,
        revision: targetRevision,
        path: cloneResult.data,
        source: "manual",
      });
    }

    const loadResult = await this.loadTemplates();
    if ("error" in loadResult) {
      return loadResult;
    }

    return { data: { alreadyExisted: Boolean(existing) } };
  }

  // load templates from configured paths and cached remote repos
  private async loadTemplates(): Promise<Result<void>> {
    if (this.loading) {
      return { error: "Templates are already loading" };
    }
    this.loading = true;
    this.registry.reset();
    this.templates = [];

    // Drop config-sourced repositories; the active configuration below will
    // rehydrate them so removals take effect without clearing manual loads.
    this.remoteRepos = this.remoteRepos.filter(
      (repo) => repo.source === "manual",
    );

    await this.hydrateCachedRepos();

    let baseTemplatePaths: string[];
    try {
      baseTemplatePaths = await this.templatePathsProvider();
    } catch (error) {
      this.loading = false;
      logError({
        error,
        shortMessage: "Failed to resolve template directory paths",
      });
      return {
        error: `Failed to resolve template directory paths: ${error}`,
      };
    }

    const localTemplatePaths: string[] = [];
    const localTemplateRoots = new Set<string>();

    for (const basePath of baseTemplatePaths) {
      const parsed = parseTemplatePathEntry(basePath);
      if (!parsed) {
        continue;
      }

      if (parsed.kind === "remote") {
        const branch = parsed.branch;
        const revision = parsed.revision;
        const cloneResult = await this.gitService.cloneRepoBranchToCache(
          parsed.repoUrl,
          branch,
          { revision },
        );
        if ("error" in cloneResult) {
          backendLogger.warn(
            `Failed to load remote template repository ${parsed.repoUrl} (${branch ?? "default"}): ${cloneResult.error}`,
          );
          continue;
        }

        const existing = this.remoteRepos.find(
          (repo) =>
            repo.url === parsed.repoUrl &&
            (repo.branch ?? "") === (branch ?? "") &&
            (repo.revision ?? "") === (revision ?? ""),
        );
        if (existing) {
          existing.path = cloneResult.data;
          existing.revision = revision;
        } else {
          this.remoteRepos.push({
            url: parsed.repoUrl,
            branch,
            revision,
            path: cloneResult.data,
            source: "config",
          });
        }
      } else {
        localTemplatePaths.push(parsed.path);
        localTemplateRoots.add(parsed.path);
      }
    }

    const paths = Array.from(
      new Set([...localTemplatePaths, ...this.remoteRepos.map((r) => r.path)]),
    );
    for (const templatePath of paths) {
      const repoInfo = this.remoteRepos.find((r) => r.path === templatePath);
      const isLocalPath = localTemplateRoots.has(templatePath);
      const devTemplates = this.devTemplatesEnabled && isLocalPath;
      const templatesRootDir = path.join(templatePath, "templates");
      let templateEntries: Dirent[] = [];
      try {
        templateEntries = await fs.readdir(templatesRootDir, {
          withFileTypes: true,
        });
      } catch (error) {
        backendLogger.warn(
          `Failed to read template directories at ${templatesRootDir}.`,
          error,
        );
        continue;
      }
      for (const entry of templateEntries) {
        if (!entry.isDirectory()) {
          continue;
        }
        const rootTemplateDirPath = path.join(templatesRootDir, entry.name);
        try {
          const stat = await fs.stat(rootTemplateDirPath);
          if (!stat.isDirectory()) {
            backendLogger.warn(
              `Root template directory at ${rootTemplateDirPath} is not a directory`,
            );
            continue;
          }
        } catch (e) {
          backendLogger.warn(
            `Failed to read root template directory at ${rootTemplateDirPath}: ${e}`,
          );
          continue;
        }

        const templateResult = await this.templateTreeBuilder.build(
          rootTemplateDirPath,
          {
            repoUrl: repoInfo?.url,
            branchOverride: repoInfo?.branch,
            trackedRevision: repoInfo?.revision,
            skipBranchResolution: Boolean(repoInfo),
            devTemplates,
          },
        );
        if ("error" in templateResult) {
          continue;
        }
        if (!templateResult.data.config.templateConfig.isRootTemplate) {
          backendLogger.debug(
            `Skipping template ${templateResult.data.config.templateConfig.name} because it is not marked as a root template`,
          );
          continue;
        }
        this.registry.registerRoot(templateResult.data);
      }
    }

    const rootTemplates = this.registry.getAllRootTemplates();
    this.attachDetachedTemplates(rootTemplates);
    this.templates = rootTemplates;
    this.loading = false;

    return { data: undefined };
  }

  async reloadTemplates(): Promise<Result<void>> {
    return await this.loadTemplates();
  }

  async listTemplatesInRepo(
    repoUrl: string,
    branch?: string,
    options?: { revision?: string },
  ): Promise<Result<Template[]>> {
    const normalized = normalizeGitRepositorySpecifier(repoUrl);
    const resolvedRepoUrl = normalized?.repoUrl ?? repoUrl;
    let resolvedBranch = normalized?.branch ?? branch;
    const resolvedRevision = normalized?.revision ?? options?.revision;

    if (!resolvedBranch && !resolvedRevision) {
      const defaultBranchResult =
        await this.gitService.getRemoteDefaultBranch(resolvedRepoUrl);
      if ("error" in defaultBranchResult) {
        return { error: defaultBranchResult.error };
      }
      resolvedBranch = defaultBranchResult.data;
    }

    const cloneResult = await this.gitService.cloneRepoBranchToCache(
      resolvedRepoUrl,
      resolvedBranch,
      { revision: resolvedRevision },
    );
    if ("error" in cloneResult) {
      return { error: cloneResult.error };
    }

    const repoPath = cloneResult.data;
    const rootTemplatesDir = path.join(repoPath, "templates");

    let templateEntries: Dirent[];
    try {
      templateEntries = await fs.readdir(rootTemplatesDir, {
        withFileTypes: true,
      });
    } catch (error) {
      const message = `Failed to read template directories at ${rootTemplatesDir}`;
      logError({ error, shortMessage: message });
      return { error: message };
    }

    const templates: Template[] = [];

    for (const entry of templateEntries) {
      if (!entry.isDirectory()) {
        continue;
      }

      const templateDir = path.join(rootTemplatesDir, entry.name);

      const templateResult = await this.templateTreeBuilder.build(templateDir, {
        repoUrl: resolvedRepoUrl,
        branchOverride: resolvedBranch,
        trackedRevision: resolvedRevision,
        skipBranchResolution: true,
      });

      if ("error" in templateResult) {
        return { error: templateResult.error };
      }

      if (!templateResult.data.config.templateConfig.isRootTemplate) {
        backendLogger.debug(
          `Skipping template ${templateResult.data.config.templateConfig.name} from ${repoUrl} because it is not marked as a root template`,
        );
        continue;
      }

      templates.push(templateResult.data);
    }

    if (!templates.length) {
      const message = `No templates found in repository ${resolvedRepoUrl} on branch ${resolvedBranch ?? "default"}`;
      logError({ shortMessage: message });
      return { error: message };
    }

    return { data: templates };
  }

  async getAllTemplates(): Promise<Result<Template[]>> {
    if (!this.templates.length) {
      const result = await this.loadTemplates();
      if ("error" in result) {
        return result;
      }
      if (!this.templates.length) {
        logError({ level: "trace", shortMessage: "No templates found." });
        return { data: [] };
      }
    }
    return { data: this.templates };
  }

  async findTemplate(templateName: string): Promise<Result<Template | null>> {
    if (!this.templates.length) {
      const result = await this.loadTemplates();
      if ("error" in result) {
        return result;
      }
      if (!this.templates.length) {
        logError({ shortMessage: "Template not found." });
        return { error: "Template not found." };
      }
    }
    const template = this.registry.findRootTemplate(templateName);
    return { data: template };
  }

  async findAllTemplateRevisions(
    templateName: string,
  ): Promise<Result<Template[] | null>> {
    if (!this.templates.length) {
      const loadResult = await this.loadTemplates();
      if ("error" in loadResult) {
        return loadResult;
      }
    }

    const revisions = this.registry.findAllRevisions(templateName);

    if (!revisions || revisions.length === 0) {
      backendLogger.warn(`No revisions found for template ${templateName}`);
      return { data: null };
    }

    return { data: revisions };
  }

  async loadRevision(
    templateName: string,
    revisionHash: string,
  ): Promise<Result<Template | null>> {
    const revisionsResult = await this.findAllTemplateRevisions(templateName);
    if ("error" in revisionsResult) {
      return revisionsResult;
    }
    const revisions = revisionsResult.data;
    if (!revisions || revisions.length === 0) {
      return { data: null };
    }

    for (const revision of revisions) {
      if (revision.commitHash === revisionHash) {
        return { data: revision };
      }
    }

    const sourceTemplate = revisions[0];
    if (!sourceTemplate) {
      return { data: null };
    }

    const saveRevisionInCacheResult =
      await this.gitService.cloneRevisionToCache(sourceTemplate, revisionHash);

    if ("error" in saveRevisionInCacheResult) {
      return saveRevisionInCacheResult;
    }

    const templateRelativePath = path.relative(
      path.dirname(sourceTemplate.absoluteBaseDir),
      sourceTemplate.absoluteDir,
    );

    const newTemplatePath = path.join(
      saveRevisionInCacheResult.data,
      templateRelativePath,
    );

    const templateResult = await this.templateTreeBuilder.build(
      newTemplatePath,
      {
        repoUrl: sourceTemplate.repoUrl,
        branchOverride: sourceTemplate.branch,
        commitHash: revisionHash,
        trackedRevision: sourceTemplate.trackedRevision,
        skipBranchResolution: true,
      },
    );

    if ("error" in templateResult) {
      return templateResult;
    }

    return { data: templateResult.data };
  }

  private matchesParentReference(
    candidate: Template,
    child: Template,
    reference: TemplateParentReference,
  ): boolean {
    if (candidate === child) {
      return false;
    }

    if (reference.repoUrl) {
      if (!candidate.repoUrl) {
        return false;
      }
      if (candidate.repoUrl !== reference.repoUrl) {
        return false;
      }
    }

    return true;
  }

  private linkDetachedTemplate(parent: Template, child: Template): void {
    if (child.parentTemplate && child.parentTemplate !== parent) {
      return;
    }

    const key = child.config.templateConfig.name;
    const existing = parent.subTemplates[key] ?? [];
    if (!existing.includes(child)) {
      parent.subTemplates[key] = [...existing, child];
    }

    child.parentTemplate = parent;
    child.isDetachedSubtreeRoot = child.possibleParentTemplates.length > 0;
  }

  public attachDetachedChild(parent: Template, child: Template): void {
    if (!child.possibleParentTemplates.length) {
      return;
    }

    for (const reference of child.possibleParentTemplates) {
      if (reference.templateName !== parent.config.templateConfig.name) {
        continue;
      }

      if (!this.matchesParentReference(parent, child, reference)) {
        continue;
      }

      this.linkDetachedTemplate(parent, child);
      break;
    }
  }

  private attachDetachedTemplates(rootTemplates: Template[]): void {
    if (!rootTemplates.length) {
      return;
    }

    const templatesByName = new Map<string, Template[]>();
    for (const template of rootTemplates) {
      const name = template.config.templateConfig.name;
      const list = templatesByName.get(name) ?? [];
      list.push(template);
      templatesByName.set(name, list);
    }

    for (const child of rootTemplates) {
      if (!child.possibleParentTemplates.length || child.parentTemplate) {
        continue;
      }

      for (const reference of child.possibleParentTemplates) {
        const candidates = templatesByName.get(reference.templateName);
        if (!candidates || !candidates.length) {
          continue;
        }

        const parent = candidates.find((candidate) =>
          this.matchesParentReference(candidate, child, reference),
        );

        if (parent) {
          this.linkDetachedTemplate(parent, child);
          break;
        }
      }
    }
  }
}
