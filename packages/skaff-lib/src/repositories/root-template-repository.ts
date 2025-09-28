import * as fs from "node:fs/promises";
import path from "node:path";

import { inject, injectable } from "tsyringe";

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
@injectable()
export class RootTemplateRepository {
  private loading: boolean = false;
  private readonly templatePathsProvider: TemplatePathsProvider;
  private remoteRepos: { url: string; branch: string; path: string }[] = [];
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
    } else {
      this.remoteRepos.push({ url, branch, path: cloneResult.data });
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

    const paths = [
      ...baseTemplatePaths,
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

    this.templates = this.registry.getAllRootTemplates();
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

    const newTemplatePath = path.join(
      saveRevisionInCacheResult.data,
      "root-templates",
      templateName,
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
}
