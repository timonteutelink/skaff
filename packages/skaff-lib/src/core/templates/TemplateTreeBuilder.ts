import fs from "node:fs/promises";
import path from "node:path";

import { inject, injectable } from "tsyringe";

import {
  TemplateConfigLoader,
  TemplateConfigWithFileInfo,
  RemoteTemplateReference,
} from "./config/TemplateConfigLoader";
import { backendLogger } from "../../lib/logger";
import { Result } from "../../lib/types";
import { logError } from "../../lib/utils";
import { GitServiceToken, TemplateConfigLoaderToken } from "../../di/tokens";
import type { GitService } from "../infra/git-service";
import { Template } from "./Template";
import { validateTemplate } from "./TemplateValidation";

interface TemplateBuildContext {
  absoluteRootDir: string;
  absoluteBaseDir: string;
  commitHash: string;
  branch: string;
  repoUrl?: string;
}

async function ensureTemplatesDirectoryExists(dir: string): Promise<boolean> {
  try {
    const stat = await fs.stat(dir);
    return stat.isDirectory();
  } catch {
    return false;
  }
}

async function getPartialsDirectory(
  templateDir: string,
): Promise<string | undefined> {
  const partialsDir = path.join(templateDir, "partials");
  try {
    const stat = await fs.stat(partialsDir);
    if (stat.isDirectory()) {
      return partialsDir;
    }
  } catch {
    // ignore missing partials dir
  }
  return undefined;
}

function createTemplateInstance(
  info: TemplateConfigWithFileInfo,
  context: TemplateBuildContext,
  templateDir: string,
  templatesDir: string,
  partialsDir?: string,
): Template {
  const rootCommitHash =
    templateDir === context.absoluteRootDir ? context.commitHash : "";

  return new Template({
    config: info.templateConfig,
    absoluteBaseDir: context.absoluteBaseDir,
    absoluteDir: templateDir,
    absoluteTemplatesDir: templatesDir,
    commitHash: rootCommitHash,
    branch: context.branch,
    repoUrl: context.repoUrl,
    refDir: info.refDir,
    partialsDir,
  });
}

async function loadTemplateCandidates(
  configs: Record<string, TemplateConfigWithFileInfo>,
  context: TemplateBuildContext,
): Promise<Result<Record<string, Template>>> {
  const templatesMap: Record<string, Template> = {};

  for (const info of Object.values(configs)) {
    const configPath = path.resolve(context.absoluteRootDir, info.configPath);
    const templateDir = path.dirname(configPath);
    const templatesDir = path.join(templateDir, "templates");

    if (!(await ensureTemplatesDirectoryExists(templatesDir))) {
      continue;
    }

    const partialsDir = await getPartialsDirectory(templateDir);

    try {
      const template = createTemplateInstance(
        info,
        context,
        templateDir,
        templatesDir,
        partialsDir,
      );

      await validateTemplate(template);
      templatesMap[templateDir] = template;
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "A problem occured while initializing the template class";
      backendLogger.error(message);
      return { error: message };
    }
  }

  return { data: templatesMap };
}

function linkExplicitReferences(
  templatesMap: Record<string, Template>,
  absoluteRootDir: string,
): void {
  const allTemplates = Object.values(templatesMap);

  for (const candidate of allTemplates) {
    if (!candidate.relativeRefDir) {
      continue;
    }

    const refAbsolute = path.resolve(absoluteRootDir, candidate.relativeRefDir);
    const intendedParentDir = path.dirname(refAbsolute);
    const parent = templatesMap[intendedParentDir];
    if (!parent) {
      continue;
    }

    candidate.parentTemplate = parent;
    const key = path.basename(refAbsolute);
    if (!parent.subTemplates[key]) {
      parent.subTemplates[key] = [];
    }
    parent.subTemplates[key].push(candidate);
  }
}

function linkByDirectoryContainment(templatesMap: Record<string, Template>): void {
  const allTemplates = Object.values(templatesMap);

  for (const candidate of allTemplates) {
    if (candidate.parentTemplate) {
      continue;
    }

    let immediateParent: Template | null = null;
    let longestMatchLength = 0;

    for (const potentialParent of allTemplates) {
      if (potentialParent === candidate) {
        continue;
      }

      const relative = path.relative(
        potentialParent.absoluteDir,
        candidate.absoluteDir,
      );

      if (!relative || relative.startsWith("..") || path.isAbsolute(relative)) {
        continue;
      }

      const segments = relative.split(path.sep).filter(Boolean);
      if (segments[0] === "templates") {
        continue;
      }

      if (potentialParent.absoluteDir.length > longestMatchLength) {
        immediateParent = potentialParent;
        longestMatchLength = potentialParent.absoluteDir.length;
      }
    }

    if (!immediateParent) {
      continue;
    }

    const relPath = path.relative(
      immediateParent.absoluteDir,
      candidate.absoluteDir,
    );
    const key = relPath.split(path.sep)[0];
    if (!key) {
      continue;
    }
    if (!immediateParent.subTemplates[key]) {
      immediateParent.subTemplates[key] = [];
    }
    immediateParent.subTemplates[key].push(candidate);
    candidate.parentTemplate = immediateParent;
  }
}

function findRootTemplate(templatesMap: Record<string, Template>): Result<Template> {
  const allTemplates = Object.values(templatesMap);
  const rootTemplates = allTemplates.filter((template) => !template.parentTemplate);

  if (rootTemplates.length === 0) {
    logError({ shortMessage: "No root templates found." });
    return { error: "No root templates found" };
  }

  if (rootTemplates.length > 1) {
    backendLogger.error(
      "Multiple root templates found. Make sure the directory structure is correct.",
      rootTemplates,
    );
    return {
      error:
        "Multiple root templates found. Make sure the directory structure is correct.",
    };
  }

  return { data: rootTemplates[0]! };
}

export interface TemplateTreeBuilderOptions {
  repoUrl?: string;
  branchOverride?: string;
}

@injectable()
export class TemplateTreeBuilder {
  constructor(
    @inject(GitServiceToken)
    private readonly gitService: GitService,
    @inject(TemplateConfigLoaderToken)
    private readonly templateConfigLoader: TemplateConfigLoader,
  ) {}

  public async build(
    rootTemplateDir: string,
    options: TemplateTreeBuilderOptions = {},
  ): Promise<Result<Template>> {
    const absoluteRootDir = path.resolve(rootTemplateDir);
    const contextResult = await this.buildContext(
      absoluteRootDir,
      options.repoUrl,
      options.branchOverride,
    );
    if ("error" in contextResult) {
      return contextResult;
    }

    const configsResult = await this.loadTemplateConfigs(
      contextResult.data.absoluteRootDir,
      contextResult.data.commitHash,
    );
    if ("error" in configsResult) {
      return configsResult;
    }

    const templatesResult = await loadTemplateCandidates(
      configsResult.data.configs,
      contextResult.data,
    );
    if ("error" in templatesResult) {
      return templatesResult;
    }

    const templatesMap = templatesResult.data;

    linkExplicitReferences(templatesMap, contextResult.data.absoluteRootDir);
    linkByDirectoryContainment(templatesMap);

    const remoteLinkResult = await this.attachRemoteReferences(
      configsResult.data.remoteRefs,
      contextResult.data,
      templatesMap,
    );
    if ("error" in remoteLinkResult) {
      return remoteLinkResult;
    }

    const rootTemplateResult = findRootTemplate(templatesMap);
    if ("error" in rootTemplateResult) {
      return rootTemplateResult;
    }

    return { data: rootTemplateResult.data };
  }

  private async attachRemoteReferences(
    remoteRefs: RemoteTemplateReference[],
    context: TemplateBuildContext,
    templatesMap: Record<string, Template>,
  ): Promise<Result<void>> {
    for (const remoteRef of remoteRefs) {
      const refAbsolute = path.resolve(context.absoluteRootDir, remoteRef.refDir);
      const intendedParentDir = path.dirname(refAbsolute);
      const parent = templatesMap[intendedParentDir];

      if (!parent) {
        backendLogger.warn(
          `Unable to attach remote template for ref at ${refAbsolute}: parent template not found.`,
        );
        continue;
      }

      const branch = remoteRef.branch ?? "main";
      const cloneResult = await this.gitService.cloneRepoBranchToCache(
        remoteRef.repoUrl,
        branch,
      );

      if ("error" in cloneResult) {
        return { error: cloneResult.error };
      }

      const remoteTemplateDir = path.resolve(
        cloneResult.data,
        remoteRef.templatePath,
      );

      const remoteTemplateResult = await this.build(remoteTemplateDir, {
        repoUrl: remoteRef.repoUrl,
        branchOverride: branch,
      });

      if ("error" in remoteTemplateResult) {
        return remoteTemplateResult;
      }

      const remoteTemplate = remoteTemplateResult.data;
      remoteTemplate.parentTemplate = parent;
      remoteTemplate.relativeRefDir = path.relative(
        context.absoluteRootDir,
        refAbsolute,
      );

      const registerTemplate = (template: Template): void => {
        templatesMap[template.absoluteDir] = template;
        for (const childList of Object.values(template.subTemplates)) {
          for (const child of childList) {
            registerTemplate(child);
          }
        }
      };

      registerTemplate(remoteTemplate);

      const key = path.basename(refAbsolute);
      if (!parent.subTemplates[key]) {
        parent.subTemplates[key] = [];
      }
      parent.subTemplates[key].push(remoteTemplate);
    }

    return { data: undefined };
  }

  private async resolveBranch(
    absoluteRootDir: string,
    branchOverride?: string,
  ): Promise<Result<string>> {
    if (branchOverride) {
      return { data: branchOverride };
    }

    const branchResult = await this.gitService.getCurrentBranch(absoluteRootDir);
    if ("error" in branchResult) {
      return { error: branchResult.error };
    }

    return { data: branchResult.data };
  }

  private async buildContext(
    absoluteRootDir: string,
    repoUrl?: string,
    branchOverride?: string,
  ): Promise<Result<TemplateBuildContext>> {
    const absoluteBaseDir = path.dirname(absoluteRootDir);
    const isRepoCleanResult = await this.gitService.isGitRepoClean(
      absoluteBaseDir,
    );
    if ("error" in isRepoCleanResult) {
      return { error: isRepoCleanResult.error };
    }
    if (!isRepoCleanResult.data) {
      backendLogger.warn(`Ignoring template because the repo is not clean`);
      return { error: "Template dir is not clean" };
    }

    const commitHashResult = await this.gitService.getCommitHash(absoluteRootDir);
    if ("error" in commitHashResult) {
      return { error: commitHashResult.error };
    }

    const branchResult = await this.resolveBranch(
      absoluteRootDir,
      branchOverride,
    );
    if ("error" in branchResult) {
      return { error: branchResult.error };
    }

    return {
      data: {
        absoluteRootDir,
        absoluteBaseDir,
        commitHash: commitHashResult.data,
        branch: branchResult.data,
        repoUrl,
      },
    };
  }

  private async loadTemplateConfigs(
    absoluteRootDir: string,
    commitHash: string,
  ): Promise<
    Result<{
      configs: Record<string, TemplateConfigWithFileInfo>;
      remoteRefs: RemoteTemplateReference[];
    }>
  > {
    try {
      const configs = await this.templateConfigLoader.loadAllTemplateConfigs(
        absoluteRootDir,
        commitHash,
      );
      return { data: configs };
    } catch (error) {
      logError({
        error,
        shortMessage: "Failed to load template configurations",
      });
      return {
        error: `Failed to load template configurations: ${error}`,
      };
    }
  }
}
