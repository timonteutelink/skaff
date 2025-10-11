import * as fs from "node:fs/promises";
import path from "node:path";

import { inject, injectable } from "tsyringe";

import { TemplateParentReference } from "@timonteutelink/template-types-lib";

import { getConfig } from "../lib";
import { backendLogger } from "../lib/logger";
import { Result } from "../lib/types";
import { logError } from "../lib/utils";
import type { GitService } from "../core/infra/git-service";
import { TemplateRegistry } from "../core/templates/TemplateRegistry";
import { TemplateTreeBuilder } from "../core/templates/TemplateTreeBuilder";
import type { Template } from "../core/templates/Template";
import {
  GitServiceToken,
  TemplatePathsProviderToken,
  TemplateTreeBuilderToken,
} from "../di/tokens";

export type TemplatePathsProvider = () => Promise<string[]>;

export const defaultTemplatePathsProvider: TemplatePathsProvider = async () => {
  const config = await getConfig();
  return config.TEMPLATE_DIR_PATHS;
};

// TODO: findTemplate and loadRevision should only load that specific template not load all templates

// now only stores the root templates at: <templateDirPath>/root-templates/*
// later also store reference to files and generic templates to allow direct instantiation without saving state of subtemplates
type RemoteRepoSource = "config" | "manual";

interface RemoteRepoEntry {
  url: string;
  branch: string;
  path: string;
  source: RemoteRepoSource;
}

type TemplatePathEntry =
  | { kind: "local"; path: string }
  | { kind: "remote"; repoUrl: string; branch?: string };

function normalizeGithubRepoUrl(spec: string): string {
  const repoPath = spec.replace(/\.git$/, "");
  return `https://github.com/${repoPath}.git`;
}

function parseTemplatePathEntry(raw: string): TemplatePathEntry | null {
  const trimmed = raw.trim();
  if (!trimmed) {
    return null;
  }

  if (trimmed.startsWith("github:")) {
    const remainder = trimmed.slice("github:".length);
    const branchSeparator = remainder.search(/[@#]/);
    const repoSpec =
      branchSeparator === -1
        ? remainder
        : remainder.slice(0, branchSeparator);
    const branch =
      branchSeparator === -1
        ? undefined
        : remainder.slice(branchSeparator + 1).trim() || undefined;
    const normalizedRepo = repoSpec.trim();
    if (!normalizedRepo) {
      return null;
    }
    const repoUrl = normalizeGithubRepoUrl(normalizedRepo);
    return { kind: "remote", repoUrl, branch };
  }

  if (/^(https?:\/\/|git@|ssh:\/\/)/i.test(trimmed)) {
    return { kind: "remote", repoUrl: trimmed };
  }

  return { kind: "local", path: trimmed };
}

@injectable()
export class RootTemplateRepository {
  private loading: boolean = false;
  private readonly templatePathsProvider: TemplatePathsProvider;
  private remoteRepos: RemoteRepoEntry[] = [];
  private readonly registry = new TemplateRegistry();
  public templates: Template[] = [];

  constructor(
    @inject(TemplateTreeBuilderToken)
    private readonly templateTreeBuilder: TemplateTreeBuilder,
    @inject(GitServiceToken) private readonly gitService: GitService,
    @inject(TemplatePathsProviderToken)
    templatePathsProvider: TemplatePathsProvider = defaultTemplatePathsProvider,
  ) {
    this.templatePathsProvider = templatePathsProvider;
  }

  async addRemoteRepo(url: string, branch: string = "main"): Promise<Result<void>> {
    const cloneResult = await this.gitService.cloneRepoBranchToCache(url, branch);
    if ("error" in cloneResult) {
      return { error: cloneResult.error };
    }
    const existing = this.remoteRepos.find(
      (r) => r.url === url && r.branch === branch,
    );
    if (existing) {
      existing.path = cloneResult.data;
      existing.source = existing.source ?? "manual";
    } else {
      this.remoteRepos.push({
        url,
        branch,
        path: cloneResult.data,
        source: "manual",
      });
    }
    return await this.loadTemplates();
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

    for (const basePath of baseTemplatePaths) {
      const parsed = parseTemplatePathEntry(basePath);
      if (!parsed) {
        continue;
      }

      if (parsed.kind === "remote") {
        const branch = parsed.branch ?? "main";
        const cloneResult = await this.gitService.cloneRepoBranchToCache(
          parsed.repoUrl,
          branch,
        );
        if ("error" in cloneResult) {
          backendLogger.warn(
            `Failed to load remote template repository ${parsed.repoUrl} (${branch}): ${cloneResult.error}`,
          );
          continue;
        }

        const existing = this.remoteRepos.find(
          (repo) => repo.url === parsed.repoUrl && repo.branch === branch,
        );
        if (existing) {
          existing.path = cloneResult.data;
        } else {
          this.remoteRepos.push({
            url: parsed.repoUrl,
            branch,
            path: cloneResult.data,
            source: "config",
          });
        }
      } else {
        localTemplatePaths.push(parsed.path);
      }
    }

    const paths = [
      ...localTemplatePaths,
      ...this.remoteRepos.map((r) => r.path),
    ];
    for (const templatePath of paths) {
      const repoInfo = this.remoteRepos.find((r) => r.path === templatePath);
      const rootTemplateDirsPath = path.join(templatePath, "root-templates");
      let rootTemplateDirs: string[] = [];
      try {
        rootTemplateDirs = await fs.readdir(rootTemplateDirsPath);
      } catch (error) {
        backendLogger.warn(
          `Failed to read root template directories at ${rootTemplateDirsPath}.`,
          error,
        );
        continue;
      }
      for (const rootTemplateDir of rootTemplateDirs) {
        const rootTemplateDirPath = path.join(
          rootTemplateDirsPath,
          rootTemplateDir,
        );
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
          },
        );
        if ("error" in templateResult) {
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
    // refresh remote repos to latest commit on their branches
    for (const repo of this.remoteRepos) {
      const cloneResult = await this.gitService.cloneRepoBranchToCache(
        repo.url,
        repo.branch,
      );
      if ("error" in cloneResult) {
        return { error: cloneResult.error };
      }
      repo.path = cloneResult.data;
    }
    return await this.loadTemplates();
  }

  async listTemplatesInRepo(
    repoUrl: string,
    branch: string = "main",
  ): Promise<Result<Template[]>> {
    const cloneResult = await this.gitService.cloneRepoBranchToCache(
      repoUrl,
      branch,
    );
    if ("error" in cloneResult) {
      return { error: cloneResult.error };
    }

    const repoPath = cloneResult.data;
    const rootTemplatesDir = path.join(repoPath, "root-templates");

    let rootTemplateDirs: string[];
    try {
      rootTemplateDirs = await fs.readdir(rootTemplatesDir);
    } catch (error) {
      const message = `Failed to read root template directories at ${rootTemplatesDir}`;
      logError({ error, shortMessage: message });
      return { error: message };
    }

    const templates: Template[] = [];

    for (const dir of rootTemplateDirs) {
      const templateDir = path.join(rootTemplatesDir, dir);
      let stat;
      try {
        stat = await fs.stat(templateDir);
      } catch (error) {
        backendLogger.warn(
          `Failed to read potential root template directory at ${templateDir}.`,
          error,
        );
        continue;
      }

      if (!stat.isDirectory()) {
        continue;
      }

      const templateResult = await this.templateTreeBuilder.build(templateDir, {
        repoUrl,
        branchOverride: branch,
      });

      if ("error" in templateResult) {
        return { error: templateResult.error };
      }

      templates.push(templateResult.data);
    }

    if (!templates.length) {
      const message = `No templates found in repository ${repoUrl} on branch ${branch}`;
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

    const saveRevisionInCacheResult = await this.gitService.cloneRevisionToCache(
      sourceTemplate,
      revisionHash,
    );

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
