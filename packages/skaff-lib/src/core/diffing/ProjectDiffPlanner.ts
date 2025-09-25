import {
  ProjectSettings,
  UserTemplateSettings,
} from "@timonteutelink/template-types-lib";
import crypto from "node:crypto";

import { backendLogger } from "../../lib/logger";
import { Result, NewTemplateDiffResult, ParsedFile } from "../../lib/types";
import { logError } from "../../lib/utils";
import { Project } from "../../models/project";
import { Template } from "../../models/template";
import { getRootTemplateRepository } from "../../repositories";
import {
  addAllAndRetrieveDiff,
  applyDiffToGitRepo,
  diffDirectories,
  isConflictAfterApply,
  parseGitDiff,
} from "../infra/git-service";
import { MigrationApplier } from "./MigrationApplier";
import { DiffCache } from "./DiffCache";
import { AutoInstantiationSettingsAdjuster } from "./AutoInstantiationSettingsAdjuster";
import { TemporaryProjectFactory } from "./TemporaryProjectFactory";

export class ProjectDiffPlanner {
  private readonly cache: DiffCache;
  private readonly autoInstantiationAdjuster: AutoInstantiationSettingsAdjuster;
  private readonly tempProjectFactory: TemporaryProjectFactory;
  private readonly migrationApplier: MigrationApplier;

  constructor(
    cache = new DiffCache(),
    autoInstantiationAdjuster = new AutoInstantiationSettingsAdjuster(),
    tempProjectFactory = new TemporaryProjectFactory(cache),
    migrationApplier = new MigrationApplier(),
  ) {
    this.cache = cache;
    this.autoInstantiationAdjuster = autoInstantiationAdjuster;
    this.tempProjectFactory = tempProjectFactory;
    this.migrationApplier = migrationApplier;
  }

  private async diffProjectSettings(
    oldProjectSettings: ProjectSettings,
    newProjectSettings: ProjectSettings,
  ): Promise<Result<NewTemplateDiffResult>> {
    const oldHash = this.cache.computeSettingsHash(oldProjectSettings);
    const newHash = this.cache.computeSettingsHash(newProjectSettings);
    const diffCacheKey = `${oldHash}-${newHash}`;

    const existingDiff = await this.cache.getCachedDiff(
      "new-template-diff",
      diffCacheKey,
      "patch",
    );

    if ("error" in existingDiff) {
      return existingDiff;
    }

    if (existingDiff.data) {
      return {
        data: {
          diffHash: diffCacheKey,
          parsedDiff: parseGitDiff(existingDiff.data.data),
        },
      };
    }

    const tempOldProjectName = `${oldProjectSettings.projectName}-${crypto.randomUUID()}`;
    const tempNewProjectName = `${oldProjectSettings.projectName}-${crypto.randomUUID()}`;

    const tempOldResult = await this.tempProjectFactory.createFromSettings(
      oldProjectSettings,
      tempOldProjectName,
    );

    if ("error" in tempOldResult) {
      return tempOldResult;
    }

    const tempNewResult = await this.tempProjectFactory.createFromSettings(
      newProjectSettings,
      tempNewProjectName,
    );

    if ("error" in tempNewResult) {
      await tempOldResult.data.cleanup();
      return tempNewResult;
    }

    try {
      const diff = await diffDirectories(
        tempOldResult.data.path,
        tempNewResult.data.path,
      );

      if ("error" in diff) {
        return diff;
      }

      const saveResult = await this.cache.saveDiff(
        "new-template-diff",
        diffCacheKey,
        "patch",
        diff.data,
      );

      if ("error" in saveResult) {
        return saveResult;
      }

      return {
        data: {
          diffHash: diffCacheKey,
          parsedDiff: parseGitDiff(diff.data),
        },
      };
    } finally {
      await tempOldResult.data.cleanup();
      await tempNewResult.data.cleanup();
    }
  }

  private async loadRootTemplate(
    rootTemplateName: string,
    commitHash: string,
  ): Promise<Result<Template>> {
    const repository = await getRootTemplateRepository();
    const template = await repository.loadRevision(
      rootTemplateName,
      commitHash,
    );

    if ("error" in template) {
      return template;
    }

    if (!template.data) {
      backendLogger.error(`Root template not found: ${rootTemplateName}`);
      return { error: "Root template not found" };
    }

    return { data: template.data };
  }

  public async generateModifyTemplateDiff(
    newTemplateSettings: UserTemplateSettings,
    project: Project,
    instantiatedTemplateId: string,
  ): Promise<Result<NewTemplateDiffResult>> {
    const instantiatedTemplateIndex =
      project.instantiatedProjectSettings.instantiatedTemplates.findIndex(
        (template) => template.id === instantiatedTemplateId,
      );

    if (instantiatedTemplateIndex === -1) {
      backendLogger.error(
        `Instantiated template ${instantiatedTemplateId} not found`,
      );
      return { error: "Instantiated template not found" };
    }

    const instantiatedTemplate =
      project.instantiatedProjectSettings.instantiatedTemplates[
        instantiatedTemplateIndex
      ]!;

    const rootTemplateResult = await this.loadRootTemplate(
      project.rootTemplate.config.templateConfig.name,
      project.instantiatedProjectSettings.instantiatedTemplates[0]!
        .templateCommitHash!,
    );

    if ("error" in rootTemplateResult) {
      return rootTemplateResult;
    }

    const targetTemplate = rootTemplateResult.data.findSubTemplate(
      instantiatedTemplate.templateName,
    );

    if (!targetTemplate) {
      backendLogger.error(
        `Template ${instantiatedTemplate.templateName} not found`,
      );
      return { error: `Template ${instantiatedTemplate.templateName} not found` };
    }

    const newProjectSettings: ProjectSettings = {
      ...project.instantiatedProjectSettings,
      instantiatedTemplates: [
        ...project.instantiatedProjectSettings.instantiatedTemplates,
      ],
    };

    if (!newProjectSettings.instantiatedTemplates[instantiatedTemplateIndex]) {
      backendLogger.error(
        `Instantiated template ${instantiatedTemplateId} not found in project settings`,
      );
      return { error: "Instantiated template not found in project settings" };
    }

    newProjectSettings.instantiatedTemplates[instantiatedTemplateIndex] = {
      ...newProjectSettings.instantiatedTemplates[instantiatedTemplateIndex],
      templateSettings: newTemplateSettings,
    };

    const modifyChildrenResult =
      await this.autoInstantiationAdjuster.modifyAutoInstantiatedTemplates(
        newProjectSettings,
        targetTemplate,
        instantiatedTemplate.id,
        instantiatedTemplate.parentId,
        newTemplateSettings,
      );

    if ("error" in modifyChildrenResult) {
      return modifyChildrenResult;
    }

    return this.diffProjectSettings(
      project.instantiatedProjectSettings,
      modifyChildrenResult.data,
    );
  }

  public async generateNewTemplateDiff(
    templateName: string,
    parentInstanceId: string | undefined,
    userTemplateSettings: UserTemplateSettings,
    destinationProject: Project,
  ): Promise<Result<NewTemplateDiffResult>> {
    const rootTemplateRepository = await getRootTemplateRepository();
    const rootTemplateName =
      destinationProject.rootTemplate.config.templateConfig.name;
    const rootTemplate = await rootTemplateRepository.loadRevision(
      rootTemplateName,
      destinationProject.instantiatedProjectSettings.instantiatedTemplates[0]!
        .templateCommitHash!,
    );

    if ("error" in rootTemplate) {
      return rootTemplate;
    }

    if (!rootTemplate.data) {
      backendLogger.error(`Root template not found: ${rootTemplateName}`);
      return { error: "Root template not found" };
    }

    const template = rootTemplate.data.findSubTemplate(templateName);

    if (!template) {
      backendLogger.error(`Template ${templateName} not found`);
      return { error: "Template not found" };
    }

    const templateInstanceId = crypto.randomUUID();
    const newProjectSettings: ProjectSettings = {
      ...destinationProject.instantiatedProjectSettings,
      instantiatedTemplates: [
        ...destinationProject.instantiatedProjectSettings.instantiatedTemplates,
        {
          id: templateInstanceId,
          parentId: parentInstanceId,
          templateCommitHash: template.commitHash,
          templateRepoUrl: template.repoUrl,
          templateBranch: template.branch,
          templateName: template.config.templateConfig.name,
          templateSettings: userTemplateSettings,
          lastMigration: this.migrationApplier.getLatestMigration(
            template.config.migrations,
          ),
        },
      ],
    };

    const addResult = await this.autoInstantiationAdjuster.addAutoInstantiatedTemplates(
      newProjectSettings,
      template,
      templateInstanceId,
      parentInstanceId,
      userTemplateSettings,
    );

    if ("error" in addResult) {
      return addResult;
    }

    return this.diffProjectSettings(
      destinationProject.instantiatedProjectSettings,
      addResult.data,
    );
  }

  public async generateUpdateTemplateDiff(
    project: Project,
    newTemplateRevisionHash: string,
  ): Promise<Result<NewTemplateDiffResult>> {
    const rootProjectRepository = await getRootTemplateRepository();
    const rootTemplateName = project.rootTemplate.config.templateConfig.name;
    const template = await rootProjectRepository.loadRevision(
      rootTemplateName,
      newTemplateRevisionHash,
    );

    if ("error" in template) {
      return template;
    }

    if (!template.data) {
      backendLogger.error(`Template ${rootTemplateName} not found`);
      return { error: "Template not found" };
    }

    const newProjectSettings: ProjectSettings = {
      ...project.instantiatedProjectSettings,
      instantiatedTemplates: [
        ...project.instantiatedProjectSettings.instantiatedTemplates,
      ],
    };

    if (!newProjectSettings.instantiatedTemplates[0]) {
      backendLogger.error(
        `Instantiated template ${rootTemplateName} not found in project settings`,
      );
      return { error: "Instantiated template not found in project settings" };
    }

    newProjectSettings.instantiatedTemplates[0] = {
      ...newProjectSettings.instantiatedTemplates[0],
      templateCommitHash: newTemplateRevisionHash,
    };

    for (const instantiated of newProjectSettings.instantiatedTemplates) {
      const tmpl =
        instantiated.templateName === rootTemplateName
          ? template.data
          : template.data.findSubTemplate(instantiated.templateName);

      if (!tmpl) {
        backendLogger.error(
          `Template ${instantiated.templateName} not found when applying migrations`,
        );
        return { error: `Template ${instantiated.templateName} not found` };
      }

      const migrationResult = this.migrationApplier.applyMigrations(
        tmpl.config.migrations,
        instantiated.templateSettings,
        instantiated.lastMigration,
      );
      instantiated.templateSettings = migrationResult.settings;
      instantiated.lastMigration = migrationResult.lastMigration;
    }

    return this.diffProjectSettings(
      project.instantiatedProjectSettings,
      newProjectSettings,
    );
  }

  public async resolveConflictsAndRetrieveAppliedDiff(
    project: Project,
  ): Promise<Result<ParsedFile[]>> {
    const addAllResult = await addAllAndRetrieveDiff(project.absoluteRootDir);

    if ("error" in addAllResult) {
      return addAllResult;
    }

    return { data: parseGitDiff(addAllResult.data) };
  }

  public async applyDiffToProject(
    project: Project,
    diffHash: string,
  ): Promise<Result<ParsedFile[] | { resolveBeforeContinuing: true }>> {
    const diff = await this.cache.getCachedDiff(
      "new-template-diff",
      diffHash,
      "patch",
    );

    if ("error" in diff) {
      return diff;
    }

    if (!diff.data) {
      backendLogger.error(`Diff not found in cache`);
      return { error: "Diff not found" };
    }

    const applyResult = await applyDiffToGitRepo(
      project.absoluteRootDir,
      diff.data.path,
    );

    if (!applyResult) {
      backendLogger.error(`Failed to apply diff to project`);
      return { error: "Failed to apply diff" };
    }

    const isConflict = await isConflictAfterApply(project.absoluteRootDir);
    if ("error" in isConflict) {
      return isConflict;
    }
    if (isConflict.data) {
      return { data: { resolveBeforeContinuing: true } };
    }

    const addAllResult = await addAllAndRetrieveDiff(project.absoluteRootDir);

    if ("error" in addAllResult) {
      return addAllResult;
    }

    return { data: parseGitDiff(addAllResult.data) };
  }

  public async diffProjectFromTemplate(
    project: Project,
  ): Promise<Result<{ files: ParsedFile[]; hash: string }>> {
    if (!project.gitStatus) {
      logError({ shortMessage: "" });
      return { error: "No git status on project" };
    }

    if (!project.gitStatus.isClean) {
      backendLogger.error("Cannot diff project with uncommitted changes");
      return { error: "Cannot diff project with uncommitted changes" };
    }

    const projectCommitHash = project.gitStatus.currentCommitHash;

    const existingDiff = await this.cache.getCachedDiff(
      "project-from-template-diff",
      projectCommitHash,
      "patch",
    );

    if ("error" in existingDiff) {
      return existingDiff;
    }

    if (existingDiff.data) {
      return {
        data: {
          files: parseGitDiff(existingDiff.data.data),
          hash: projectCommitHash,
        },
      };
    }

    const tempProjectName = `${project.instantiatedProjectSettings.projectName}-${crypto.randomUUID()}`;
    const tempProjectResult = await this.tempProjectFactory.createFromExistingProject(
      project,
      tempProjectName,
    );

    if ("error" in tempProjectResult) {
      return tempProjectResult;
    }

    try {
      const diff = await diffDirectories(
        tempProjectResult.data.path,
        project.absoluteRootDir,
      );

      if ("error" in diff) {
        return diff;
      }

      const saveResult = await this.cache.saveDiff(
        "project-from-template-diff",
        projectCommitHash,
        "patch",
        diff.data,
      );

      if ("error" in saveResult) {
        return saveResult;
      }

      return {
        data: {
          files: parseGitDiff(diff.data),
          hash: projectCommitHash,
        },
      };
    } finally {
      await tempProjectResult.data.cleanup();
    }
  }
}
