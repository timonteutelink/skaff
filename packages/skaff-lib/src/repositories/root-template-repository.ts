import * as fs from "node:fs/promises";
import { Template } from "../models/template";
import { Result } from "../lib/types";
import path from "node:path";
import {
  cloneRepoBranchToCache,
  cloneRevisionToCache,
  getCommitHash,
  getRemoteCommitHash,
} from "../services/git-service";
import { backendLogger } from "../lib/logger";
import { logError } from "../lib/utils";

// TODO: findTemplate and loadRevision should only load that specific template not load all templates

// now only stores the root templates at: <templateDirPath>/root-templates/*
// later also store reference to files and generic templates to allow direct instantiation without saving state of subtemplates
export class RootTemplateRepository {
  private loading: boolean = false;
  private templatePaths: string[] = [];
  private remoteRepos: { url: string; branch: string; path: string; hash: string; isOutdated: boolean }[] = [];
  public templates: Template[] = [];

  constructor(templatePaths: string[]) {
    this.templatePaths = templatePaths;
  }

  async addRemoteRepo(url: string, branch: string = "main"): Promise<Result<void>> {
    const cloneResult = await cloneRepoBranchToCache(url, branch);
    if ("error" in cloneResult) {
      return { error: cloneResult.error };
    }
    const hashResult = await getCommitHash(cloneResult.data);
    if ("error" in hashResult) {
      return { error: hashResult.error };
    }
    const existing = this.remoteRepos.find(
      (r) => r.url === url && r.branch === branch,
    );
    if (existing) {
      existing.path = cloneResult.data;
      existing.hash = hashResult.data;
      existing.isOutdated = false;
    } else {
      this.remoteRepos.push({ url, branch, path: cloneResult.data, hash: hashResult.data, isOutdated: false });
    }
    return await this.loadTemplates();
  }

  // load templates from configured paths and cached remote repos
  private async loadTemplates(): Promise<Result<void>> {
    if (this.loading) {
      return { error: "Templates are already loading" };
    }
    this.loading = true;
    this.templates = [];
    const paths = [
      ...this.templatePaths,
      ...this.remoteRepos.map((r) => r.path),
    ];
    for (const templatePath of paths) {
      const rootTemplateDirsPath = path.join(templatePath, "root-templates");
      let rootTemplateDirs: string[] = [];
      try {
        rootTemplateDirs = await fs.readdir(rootTemplateDirsPath);
      } catch (error) {
        backendLogger.warn(
          `Failed to read root template directories at ${rootTemplateDirsPath}.`,
          error
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

        const repo = this.remoteRepos.find((r) => r.path === templatePath);
        const template = await Template.createAllTemplates(
          rootTemplateDirPath,
          repo?.url,
        );
        if ("error" in template) {
          continue;
        }
        const tpl = template.data;
        if (repo) {
          tpl.branch = repo.branch;
        }
        this.templates.push(tpl);
      }
    }

    this.loading = false;
    await this.updateOutdatedStatus();
    return { data: undefined };
  }

  private async updateOutdatedStatus(): Promise<void> {
    for (const repo of this.remoteRepos) {
      const remote = await getRemoteCommitHash(repo.url, repo.branch);
      if ("error" in remote) {
        repo.isOutdated = false;
      } else {
        repo.isOutdated = remote.data !== repo.hash;
      }
    }

    const mark = (tpl: Template, outdated: boolean) => {
      tpl.isOutdated = outdated;
      for (const arr of Object.values(tpl.subTemplates)) {
        for (const child of arr) {
          mark(child, outdated);
        }
      }
    };

    for (const tpl of this.templates) {
      const repoPath = path.dirname(tpl.absoluteBaseDir);
      const repo = this.remoteRepos.find((r) => r.path === repoPath);
      if (repo) {
        tpl.repoUrl = repo.url;
        mark(tpl, repo.isOutdated);
      } else {
        mark(tpl, false);
      }
    }
  }

  async reloadTemplates(): Promise<Result<void>> {
    // refresh remote repos to latest commit on their branches
    for (const repo of this.remoteRepos) {
      const cloneResult = await cloneRepoBranchToCache(repo.url, repo.branch);
      if ("error" in cloneResult) {
        return { error: cloneResult.error };
      }
      const hashResult = await getCommitHash(cloneResult.data);
      if ("error" in hashResult) {
        return { error: hashResult.error };
      }
      repo.path = cloneResult.data;
      repo.hash = hashResult.data;
      repo.isOutdated = false;
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
        logError({ shortMessage: "No templates found." });
        return { error: "No templates found." };
      }
    }
    await this.updateOutdatedStatus();
    return { data: this.templates };
  }

  async findTemplate(templateName: string): Promise<Result<Template | null>> {
    if (!this.templates.length) {
      const result = await this.loadTemplates();
      if ("error" in result) {
        return result;
      }
      if (!this.templates.length) {
        logError({ shortMessage: "No templates found." });
        return { error: "No templates found." };
      }
    }
    await this.updateOutdatedStatus();

    const local = this.templates.find(
      (t) => t.config.templateConfig.name === templateName && t.isLocal,
    );
    if (local) {
      return { data: local };
    }
    const any = this.templates.find(
      (t) => t.config.templateConfig.name === templateName,
    );
    return { data: any ?? null };
  }

  async findAllTemplateRevisions(
    templateName: string,
  ): Promise<Result<Template[] | null>> {
    const template = await this.getAllTemplates();

    if ("error" in template) {
      return template;
    }

    const revisions = template.data.filter((template) => {
      return template.config.templateConfig.name === templateName;
    });

    if (revisions.length === 0) {
      backendLogger.warn(`No revisions found for template ${templateName}`);
      return { data: null };
    }

    return { data: revisions };
  }

  async loadRevision(
    templateName: string,
    revisionHash: string,
  ): Promise<Result<Template | null>> {
    const result = await this.findAllTemplateRevisions(templateName);
    if ("error" in result) {
      return result;
    }
    const revisions = result.data;
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

    const saveRevisionInCacheResult = await cloneRevisionToCache(
      sourceTemplate,
      revisionHash,
    );

    if ("error" in saveRevisionInCacheResult) {
      return saveRevisionInCacheResult;
    }

    const newTemplatePath = path.join(
      saveRevisionInCacheResult.data,
      "root-templates",
      path.basename(sourceTemplate.absoluteDir),
    );

    const newTemplate = await Template.createAllTemplates(newTemplatePath);

    if ("error" in newTemplate) {
      return newTemplate;
    }

    this.templates.push(newTemplate.data);

    return { data: newTemplate.data };
  }
}
