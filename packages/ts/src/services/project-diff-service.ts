import { AutoInstantiatedSubtemplate, TemplateSettingsType, UserTemplateSettings } from "@timonteutelink/template-types-lib";
import * as fs from "node:fs/promises";
import { AnyZodObject } from "zod";
import { NewTemplateDiffResult, ParsedFile, ProjectSettings, Result } from "../lib/types";
import { Project } from "../models/project-models";
import { Template } from "../models/template-models";
import { getHash, pathInCache, retrieveFromCache, saveToCache } from "./cache-service";
import { addAllAndDiff, applyDiffToGitRepo, diffDirectories, isConflictAfterApply, parseGitDiff } from "./git-service";
import { PROJECT_REGISTRY } from "./project-registry-service";
import { generateProjectFromExistingProject, generateProjectFromTemplateSettings, getParsedUserSettingsWithParentSettings } from "./project-service";
import { ROOT_TEMPLATE_REGISTRY } from "./root-template-registry-service";
import { logger } from "../lib/logger";
import { anyOrCallbackToAny, logError } from "../lib/utils";

async function modifyAutoInstantiatedTemplatesInProjectSettings(
  projectSettings: ProjectSettings,
  currentTemplateToAddChildren: Template,
  parentInstanceId: string,
  parentTemplateSettings: UserTemplateSettings,
): Promise<Result<ProjectSettings>> {
  const newFullTemplateSettings = getParsedUserSettingsWithParentSettings(
    parentTemplateSettings,
    currentTemplateToAddChildren,
    projectSettings,
    parentInstanceId,
  );
  if ("error" in newFullTemplateSettings) {
    return newFullTemplateSettings;
  }

  const templatesToAutoInstantiate = anyOrCallbackToAny(currentTemplateToAddChildren.config.autoInstantiatedSubtemplates, newFullTemplateSettings.data);

  if ("error" in templatesToAutoInstantiate) {
    return templatesToAutoInstantiate;
  }

  if (!templatesToAutoInstantiate.data) {
    return { data: projectSettings };
  }

  return recursivelyModifyAutoInstantiatedTemplatesInProjectSettings(
    templatesToAutoInstantiate.data,
    projectSettings,
    currentTemplateToAddChildren,
    parentInstanceId,
    newFullTemplateSettings.data,
  );
}

// Only all automatically instantiated subtemplates have settings influenced by the parent so we only need to modify the settings of subtemplates that are auto instantiated. This is done by recursively adding all auto instantiated templates to the project settings.
async function recursivelyModifyAutoInstantiatedTemplatesInProjectSettings(
  templatesToAutoInstantiate: AutoInstantiatedSubtemplate[],
  projectSettings: ProjectSettings,
  currentTemplateToAddChildren: Template,
  parentInstanceId: string,
  fullParentTemplateSettings: TemplateSettingsType<AnyZodObject>,// TODO Force autoInstantiatedTemplate to be direct child of template. If nested use 'children' to autoinstantiate parent and child. Then also merge this modify function with the add function below if possible
): Promise<Result<ProjectSettings>> {

  for (const autoInstantiatedTemplate of templatesToAutoInstantiate || []) {
    const existingTemplateIndex =
      projectSettings.instantiatedTemplates.findIndex(
        (template) =>
          template.templateName === autoInstantiatedTemplate.subTemplateName &&
          template.parentId === parentInstanceId &&
          template.automaticallyInstantiatedByParent,
      );

    if (existingTemplateIndex === -1) {
      logger.error(
        `Auto instantiated template ${autoInstantiatedTemplate.subTemplateName} not found`,
      );
      return {
        error: `Auto instantiated template ${autoInstantiatedTemplate.subTemplateName} not found`,
      }
    }

    const existingTemplate =
      projectSettings.instantiatedTemplates[existingTemplateIndex]!;

    const newTemplateSettings = anyOrCallbackToAny(autoInstantiatedTemplate.mapSettings, fullParentTemplateSettings);

    if ("error" in newTemplateSettings) {
      return newTemplateSettings;
    }

    const newFullTemplateSettings = Object.assign(
      {},
      fullParentTemplateSettings,
      newTemplateSettings.data,
    );

    const subTemplateName = autoInstantiatedTemplate.subTemplateName;

    if (!projectSettings.instantiatedTemplates[existingTemplateIndex]) {
      logger.error(
        `Instantiated template ${autoInstantiatedTemplate.subTemplateName} not found in project settings`,
      );
      return { error: "Instantiated template not found in project settings" };
    }

    const subTemplate = currentTemplateToAddChildren.findSubTemplate(
      subTemplateName,
    );

    if (!subTemplate) {
      logger.error(
        `Subtemplate ${autoInstantiatedTemplate.subTemplateName} not found`,
      );
      return {
        error: `Subtemplate ${autoInstantiatedTemplate.subTemplateName} not found`,
      };
    }

    if (!subTemplate.parentTemplate || subTemplate.parentTemplate.config.templateConfig.name !== currentTemplateToAddChildren.config.templateConfig.name) {
      logger.error(
        `Subtemplate ${autoInstantiatedTemplate.subTemplateName} is not a child of template ${currentTemplateToAddChildren.config.templateConfig.name}`,
      );
      return {
        error: `Subtemplate ${autoInstantiatedTemplate.subTemplateName} is not a child of template ${currentTemplateToAddChildren.config.templateConfig.name}`,
      };
    }

    projectSettings.instantiatedTemplates[existingTemplateIndex] = {
      ...projectSettings.instantiatedTemplates[existingTemplateIndex],
      templateName: subTemplateName,
      templateSettings: newTemplateSettings.data,
    };

    const childTemplatesToAutoInstantiate = autoInstantiatedTemplate.children;

    if (childTemplatesToAutoInstantiate) {
      const result =
        await recursivelyModifyAutoInstantiatedTemplatesInProjectSettings(
          childTemplatesToAutoInstantiate,
          projectSettings,
          subTemplate,
          existingTemplate.id,
          newFullTemplateSettings,
        );

      if ("error" in result) {
        return result;
      }

      projectSettings = result.data;
    }

    const newTemplatesToAutoInstantiate = anyOrCallbackToAny(subTemplate.config.autoInstantiatedSubtemplates, newFullTemplateSettings);

    if ("error" in newTemplatesToAutoInstantiate) {
      return newTemplatesToAutoInstantiate;
    }

    if (newTemplatesToAutoInstantiate.data) {
      const result =
        await recursivelyModifyAutoInstantiatedTemplatesInProjectSettings(
          newTemplatesToAutoInstantiate.data,
          projectSettings,
          subTemplate,
          existingTemplate.id,
          newFullTemplateSettings,
        );

      if ("error" in result) {
        return result;
      }

      projectSettings = result.data;
    }
  }
  return { data: projectSettings };
}

async function addAutoInstantiatedTemplatesToProjectSettings(
  projectSettings: ProjectSettings,
  currentTemplateToAddChildren: Template,
  parentInstanceId: string,
  parentTemplateSettings: UserTemplateSettings,
): Promise<Result<ProjectSettings>> {
  const newFullTemplateSettings = getParsedUserSettingsWithParentSettings(
    parentTemplateSettings,
    currentTemplateToAddChildren,
    projectSettings,
    parentInstanceId,
  );
  if ("error" in newFullTemplateSettings) {
    return newFullTemplateSettings;
  }

  const templatesToAutoInstantiate = anyOrCallbackToAny(currentTemplateToAddChildren.config.autoInstantiatedSubtemplates, newFullTemplateSettings.data);
  if ("error" in templatesToAutoInstantiate) {
    return templatesToAutoInstantiate;
  }
  if (!templatesToAutoInstantiate.data) {
    return { data: projectSettings };
  }

  return recursivelyAddAutoInstantiatedTemplatesToProjectSettings(
    templatesToAutoInstantiate.data,
    projectSettings,
    currentTemplateToAddChildren,
    parentInstanceId,
    newFullTemplateSettings.data,
  );
}

async function recursivelyAddAutoInstantiatedTemplatesToProjectSettings(
  templatesToAutoInstantiate: AutoInstantiatedSubtemplate[],
  projectSettings: ProjectSettings,
  currentTemplateToAddChildren: Template,
  parentInstanceId: string,
  fullParentTemplateSettings: TemplateSettingsType<AnyZodObject>,
): Promise<Result<ProjectSettings>> {
  for (const autoInstantiatedTemplate of templatesToAutoInstantiate || []) {
    const autoInstantiatedTemplateInstanceId = crypto.randomUUID();
    const newTemplateSettings = anyOrCallbackToAny(autoInstantiatedTemplate.mapSettings, fullParentTemplateSettings);
    if ("error" in newTemplateSettings) {
      return newTemplateSettings;
    }
    const newFullTemplateSettings = Object.assign(
      {},
      fullParentTemplateSettings,
      newTemplateSettings.data,
    );
    const subTemplateName = autoInstantiatedTemplate.subTemplateName;

    projectSettings.instantiatedTemplates.push({
      id: autoInstantiatedTemplateInstanceId,
      parentId: parentInstanceId,
      templateCommitHash: currentTemplateToAddChildren.commitHash,
      automaticallyInstantiatedByParent: true,
      templateName: subTemplateName,
      templateSettings: newTemplateSettings.data,
    });

    const rootTemplate = await ROOT_TEMPLATE_REGISTRY.loadRevision(
      projectSettings.rootTemplateName,
      currentTemplateToAddChildren.findRootTemplate().commitHash!,
    );

    if ("error" in rootTemplate) {
      return rootTemplate;
    }

    if (!rootTemplate.data) {
      logger.error(`Root template not found: ${projectSettings.rootTemplateName}`);
      return { error: `Root template not found: ${projectSettings.rootTemplateName}` };
    }

    const subTemplate = rootTemplate.data.findSubTemplate(subTemplateName);

    if (!subTemplate) {
      logger.error(
        `Subtemplate ${autoInstantiatedTemplate.subTemplateName} not found`,
      );
      return {
        error: `Subtemplate ${autoInstantiatedTemplate.subTemplateName} not found`,
      };
    }

    if (!subTemplate.parentTemplate || subTemplate.parentTemplate.config.templateConfig.name !== currentTemplateToAddChildren.config.templateConfig.name) {
      logger.error(
        `Subtemplate ${autoInstantiatedTemplate.subTemplateName} is not a child of template ${currentTemplateToAddChildren.config.templateConfig.name}`,
      );
      return {
        error: `Subtemplate ${autoInstantiatedTemplate.subTemplateName} is not a child of template ${currentTemplateToAddChildren.config.templateConfig.name}`,
      };
    }

    const childTemplatesToAutoInstantiate = autoInstantiatedTemplate.children;
    if (childTemplatesToAutoInstantiate) {
      const result =
        await recursivelyAddAutoInstantiatedTemplatesToProjectSettings(
          childTemplatesToAutoInstantiate,
          projectSettings,
          subTemplate,
          autoInstantiatedTemplateInstanceId,
          newFullTemplateSettings,
        );

      if ("error" in result) {
        return result;
      }

      projectSettings = result.data;
    }

    const newTemplatesToAutoInstantiate = anyOrCallbackToAny(subTemplate.config.autoInstantiatedSubtemplates, newFullTemplateSettings);
    if ("error" in newTemplatesToAutoInstantiate) {
      return newTemplatesToAutoInstantiate;
    }

    if (newTemplatesToAutoInstantiate.data) {
      const result =
        await recursivelyAddAutoInstantiatedTemplatesToProjectSettings(
          newTemplatesToAutoInstantiate.data,
          projectSettings,
          subTemplate,
          autoInstantiatedTemplateInstanceId,
          newFullTemplateSettings,
        );

      if ("error" in result) {
        return result
      }

      projectSettings = result.data;
    }
  }
  return { data: projectSettings };
}
// this function is used to edit an already instantiated template. Will create a diff with current template. Where base project is a clean slate of current project(use createProjectFromExisting in this file). The Changed project will be a clean project with the new settings. This can later be extended to allow the base project to use an old version of a template so we can update the template. The diff between these projects can be cached with as key the hash of old project settings and hash of new settings. Since templatecommithash is in settings the hash of the projectSettings will always uniquely identify exactly the same project. So for the same projectSettings this will ALWAYS generate the same project.
export async function generateModifyTemplateDiff(
  newTemplateSettings: UserTemplateSettings,
  project: Project,
  instantiatedTemplateId: string,
): Promise<Result<NewTemplateDiffResult>> {
  const instantiatedTemplateIndex =
    project.instantiatedProjectSettings.instantiatedTemplates.findIndex(
      (template) => template.id === instantiatedTemplateId,
    );

  if (instantiatedTemplateIndex === -1) {
    logger.error(`Instantiated template ${instantiatedTemplateId} not found`);
    return { error: "Instantiated template not found" };
  }

  const instantiatedTemplate =
    project.instantiatedProjectSettings.instantiatedTemplates[
    instantiatedTemplateIndex
    ]!;

  const template = await ROOT_TEMPLATE_REGISTRY.loadRevision(
    instantiatedTemplate.templateName,
    project.instantiatedProjectSettings.instantiatedTemplates[0]!.templateCommitHash!
  );

  if ("error" in template) {
    return template;
  }

  if (!template.data) {
    logger.error(`Template ${instantiatedTemplate.templateName} not found`);
    return { error: `Template ${instantiatedTemplate.templateName} not found` };
  }

  const newProjectSettings: ProjectSettings = {
    ...project.instantiatedProjectSettings,
    instantiatedTemplates: [
      ...project.instantiatedProjectSettings.instantiatedTemplates,
    ],
  };

  if (!newProjectSettings.instantiatedTemplates[instantiatedTemplateIndex]) {
    logger.error(
      `Instantiated template ${instantiatedTemplateId} not found in project settings`,
    );
    return { error: "Instantiated template not found in project settings" };
  }

  newProjectSettings.instantiatedTemplates[instantiatedTemplateIndex] = {
    ...newProjectSettings.instantiatedTemplates[instantiatedTemplateIndex],
    templateSettings: newTemplateSettings,
  };

  const modifyChildrenResult =
    await modifyAutoInstantiatedTemplatesInProjectSettings(
      newProjectSettings,
      template.data,
      instantiatedTemplate.id,
      newTemplateSettings,
    );

  if ("error" in modifyChildrenResult) {
    return modifyChildrenResult;
  }

  return await diffNewTempProjects(
    project.instantiatedProjectSettings,
    modifyChildrenResult.data,
  );
}

async function diffNewTempProjects(
  oldProjectSettings: ProjectSettings,
  newProjectSettings: ProjectSettings,
): Promise<Result<NewTemplateDiffResult>> {
  const projectName = oldProjectSettings.projectName;

  const project = await PROJECT_REGISTRY.findProject(projectName);
  if ("error" in project) {
    return project;
  }
  if (!project.data) {
    logger.error(`Project ${projectName} not found`);
    return { error: `Project ${projectName} not found` };
  }

  const oldProjectSettingsHash = getHash(JSON.stringify(oldProjectSettings));
  const newProjectSettingsHash = getHash(JSON.stringify(newProjectSettings));
  const diffCacheKey = `${oldProjectSettingsHash}-${newProjectSettingsHash}`;
  const existingSavedDiff = await retrieveFromCache(
    "new-template-diff",
    diffCacheKey,
    "patch",
  );

  if ("error" in existingSavedDiff) {
    return existingSavedDiff;
  }

  if (existingSavedDiff.data) {
    return {
      data: {
        diffHash: diffCacheKey,
        parsedDiff: parseGitDiff(existingSavedDiff.data.data),
      },
    };
  }

  const tempOldProjectName = `${projectName}-${crypto.randomUUID()}`;
  const tempNewProjectName = `${projectName}-${crypto.randomUUID()}`;

  const tempOldProjectPath = await pathInCache(tempOldProjectName);
  const tempNewProjectPath = await pathInCache(tempNewProjectName);
  if ("error" in tempOldProjectPath) {
    return tempOldProjectPath;
  }
  if ("error" in tempNewProjectPath) {
    return tempNewProjectPath;
  }

  try {
    const cleanProjectFromCurrentProjectSettingsResult =
      await generateProjectFromTemplateSettings(
        project.data.instantiatedProjectSettings,
        tempOldProjectPath.data,
      );

    const cleanProjectFromNewSettingsResult =
      await generateProjectFromTemplateSettings(
        newProjectSettings,
        tempNewProjectPath.data,
      );

    if ("error" in cleanProjectFromCurrentProjectSettingsResult) {
      return cleanProjectFromCurrentProjectSettingsResult
    }

    if ("error" in cleanProjectFromNewSettingsResult) {
      return cleanProjectFromNewSettingsResult;
    }

    const cleanProjectFromCurrentProjectSettingsPath =
      cleanProjectFromCurrentProjectSettingsResult.data;
    const cleanProjectFromNewSettingsPath =
      cleanProjectFromNewSettingsResult.data;

    const diff = await diffDirectories(
      cleanProjectFromCurrentProjectSettingsPath,
      cleanProjectFromNewSettingsPath,
    );

    if ("error" in diff) {
      return diff;
    }

    const saveResult = await saveToCache(
      "new-template-diff",
      diffCacheKey,
      "patch",
      diff.data,
    );

    if ("error" in saveResult) {
      return saveResult;
    }

    const parsedDiff = parseGitDiff(diff.data);

    return {
      data: {
        diffHash: diffCacheKey,
        parsedDiff,
      },
    };
  } catch (error) {
    logError({
      shortMessage: "Failed to create clean project from current project settings",
      error,
    })
    return {
      error: "Failed to create clean project from current project settings",
    };
  } finally {
    await fs.rm(tempOldProjectPath.data, { recursive: true });
    await fs.rm(tempNewProjectPath.data, { recursive: true });
  }
}

export async function generateNewTemplateDiff(
  rootTemplateName: string,
  templateName: string,
  parentInstanceId: string,
  destinationProject: Project,
  userTemplateSettings: UserTemplateSettings,
): Promise<Result<NewTemplateDiffResult>> {
  const instantiatedRootTemplate = destinationProject.instantiatedProjectSettings.instantiatedTemplates[0]?.templateCommitHash;
  if (!instantiatedRootTemplate) {
    logger.error(`No instantiated root template commit hash found in project settings`);
    return { error: "No instantiated root template commit hash found in project settings" };
  }
  const rootTemplate =
    await ROOT_TEMPLATE_REGISTRY.loadRevision(rootTemplateName, instantiatedRootTemplate);

  if ("error" in rootTemplate) {
    return rootTemplate;
  }

  if (!rootTemplate.data) {
    logger.error(`Root template not found: ${rootTemplateName}`);
    return { error: "Root template not found" };
  }

  const template = rootTemplate.data.findSubTemplate(templateName);

  if (!template) {
    logger.error(`Template ${templateName} not found`);
    return { error: "Template not found" };
  }

  const templateInstanceId = crypto.randomUUID();
  const newProjectSettings: ProjectSettings = {
    ...destinationProject.instantiatedProjectSettings,
    instantiatedTemplates: [
      ...destinationProject.instantiatedProjectSettings
        .instantiatedTemplates,
      {
        id: templateInstanceId,
        parentId: parentInstanceId,
        templateCommitHash: template.commitHash,
        templateName: template.config.templateConfig.name,
        templateSettings: userTemplateSettings,
      },
    ],
  };

  const addResult = await addAutoInstantiatedTemplatesToProjectSettings(
    newProjectSettings,
    template,
    templateInstanceId,
    userTemplateSettings,
  );

  if ("error" in addResult) {
    return addResult;
  }

  return await diffNewTempProjects(
    destinationProject.instantiatedProjectSettings,
    addResult.data,
  );
}

export async function resolveConflictsAndRetrieveAppliedDiff(
  projectName: string,
): Promise<Result<ParsedFile[]>> {
  const project = await PROJECT_REGISTRY.findProject(projectName);
  if ("error" in project) {
    return project;
  }

  if (!project.data) {
    logger.error(`Project ${projectName} not found`);
    return { error: "Project not found" };
  }

  const addAllResult = await addAllAndDiff(project.data.absoluteRootDir);

  if ("error" in addAllResult) {
    return addAllResult;
  }

  return { data: parseGitDiff(addAllResult.data) };
}

export async function applyDiffToProject(
  projectName: string,
  diffHash: string,
): Promise<Result<ParsedFile[] | { resolveBeforeContinuing: true }>> {
  const project = await PROJECT_REGISTRY.findProject(projectName);

  if ("error" in project) {
    return project;
  }

  if (!project.data) {
    logger.error(`Project ${projectName} not found`);
    return { error: "Project not found" };
  }

  const diff = await retrieveFromCache("new-template-diff", diffHash, "patch");

  if ("error" in diff) {
    return diff;
  }

  if (!diff.data) {
    logger.error(`Diff not found in cache`);
    return { error: "Diff not found" };
  }

  const applyResult = await applyDiffToGitRepo(
    project.data.absoluteRootDir,
    diff.data.path,
  );

  if (!applyResult) {
    logger.error(`Failed to apply diff to project`);
    return { error: "Failed to apply diff" };
  }

  // TODO: check if there are any merge conflicts and notify user. Then user will press button("Conflicts Resolved") to add all after he has manually resolved the conflicts. Otherwise here we automatically add all and diff.
  const isConflict = await isConflictAfterApply(project.data.absoluteRootDir);
  if ("error" in isConflict) {
    return isConflict;
  }
  if (isConflict.data) {
    return { data: { resolveBeforeContinuing: true } };
  }

  const addAllResult = await addAllAndDiff(project.data.absoluteRootDir);

  if ("error" in addAllResult) {
    return addAllResult;
  }

  return { data: parseGitDiff(addAllResult.data) };
}
export async function diffProjectFromTemplate(
  project: Project,
): Promise<Result<ParsedFile[]>> {

  if (!project.gitStatus.isClean) {
    logger.error("Cannot diff project with uncommitted changes");
    return { error: "Cannot diff project with uncommitted changes" };
  }

  const projectCommitHash = project.gitStatus.currentCommitHash;

  const existingSavedDiff = await retrieveFromCache(
    "project-from-template-diff",
    projectCommitHash,
    "patch",
  );

  if ("error" in existingSavedDiff) {
    return existingSavedDiff;
  }

  if (existingSavedDiff.data) {
    return { data: parseGitDiff(existingSavedDiff.data.data) };
  }

  const tempNewProjectName = `${project.instantiatedProjectSettings.projectName}-${crypto.randomUUID()}`;
  const tempNewProjectPath = await pathInCache(tempNewProjectName);
  if ("error" in tempNewProjectPath) {
    return tempNewProjectPath;
  }

  try {
    const newProjectFromExistingProjectResult =
      await generateProjectFromExistingProject(
        project,
        tempNewProjectPath.data,
      );

    if ("error" in newProjectFromExistingProjectResult) {
      return newProjectFromExistingProjectResult;
    }

    const diff = await diffDirectories(
      tempNewProjectPath.data,
      project.absoluteRootDir,
    );

    if ("error" in diff) {
      return diff;
    }

    const saveCacheResult = await saveToCache(
      "project-from-template-diff",
      projectCommitHash,
      "patch",
      diff.data,
    );

    if ("error" in saveCacheResult) {
      return saveCacheResult;
    }

    return { data: parseGitDiff(diff.data) };
  } finally {
    await fs.rm(tempNewProjectPath.data, { recursive: true });
  }
}

export async function generateUpdateTemplateDiff(
  project: Project,
  newTemplateRevisionHash: string,
): Promise<Result<NewTemplateDiffResult>> {
  const rootInstantiatedTemplate = project.instantiatedProjectSettings.instantiatedTemplates[0];

  if (!rootInstantiatedTemplate) {
    logger.error(`No instantiated root template found`);
    return { error: "No instantiated root template found" };
  }

  const template = await ROOT_TEMPLATE_REGISTRY.loadRevision(
    rootInstantiatedTemplate.templateName,
    newTemplateRevisionHash,
  );

  if ("error" in template) {
    return template
  }

  if (!template.data) {
    logger.error(`Template ${rootInstantiatedTemplate.templateName} not found`);
    return { error: "Template not found" };
  }

  const newProjectSettings: ProjectSettings = {
    ...project.instantiatedProjectSettings,
    instantiatedTemplates: [
      ...project.instantiatedProjectSettings.instantiatedTemplates,
    ],
  };

  if (!newProjectSettings.instantiatedTemplates[0]) {
    logger.error(
      `Instantiated template ${rootInstantiatedTemplate.templateName} not found in project settings`,
    );
    return { error: "Instantiated template not found in project settings" };
  }

  newProjectSettings.instantiatedTemplates[0] = {
    ...newProjectSettings.instantiatedTemplates[0],
    templateCommitHash: newTemplateRevisionHash,
  };

  return await diffNewTempProjects(
    project.instantiatedProjectSettings,
    newProjectSettings,
  );
}
