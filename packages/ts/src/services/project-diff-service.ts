import { TemplateSettingsType, UserTemplateSettings } from "@timonteutelink/template-types-lib";
import { Template } from "../models/template-models";
import { NewTemplateDiffResult, ParsedFile, ProjectSettings, Result } from "../utils/types";
import { generateProjectFromExistingProject, generateProjectFromTemplateSettings, getParsedUserSettingsWithParentSettings } from "./project-service";
import { AnyZodObject } from "zod";
import { anyOrCallbackToAny, stringOrCallbackToString } from "../utils/shared-utils";
import { ROOT_TEMPLATE_REGISTRY } from "./root-template-registry-service";
import { Project } from "../models/project-models";
import { PROJECT_REGISTRY } from "./project-registry-service";
import { getHash, pathInCache, retrieveFromCache, saveToCache } from "./cache-service";
import { addAllAndDiff, applyDiffToGitRepo, diffDirectories, isConflictAfterApply, parseGitDiff } from "./git-service";
import * as fs from "node:fs/promises";

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
    console.error(
      `Failed to parse user settings: ${newFullTemplateSettings.error}`,
    );
    return { error: newFullTemplateSettings.error };
  }

  return recursivelyModifyAutoInstantiatedTemplatesInProjectSettings(
    projectSettings,
    currentTemplateToAddChildren,
    parentInstanceId,
    newFullTemplateSettings.data,
  );
}

// Only all automatically instantiated subtemplates have settings influenced by the parent so we only need to modify the settings of subtemplates that are auto instantiated. This is done by recursively adding all auto instantiated templates to the project settings.
async function recursivelyModifyAutoInstantiatedTemplatesInProjectSettings(
  projectSettings: ProjectSettings,
  currentTemplateToAddChildren: Template,
  parentInstanceId: string,
  fullParentTemplateSettings: TemplateSettingsType<AnyZodObject>,
): Promise<Result<ProjectSettings>> {
  const templatesToAutoInstantiate = anyOrCallbackToAny(currentTemplateToAddChildren.config.autoInstatiatedSubtemplates, fullParentTemplateSettings);

  if ("error" in templatesToAutoInstantiate) {
    console.error(
      `Failed to parse auto instantiated templates: ${templatesToAutoInstantiate.error}`,
    );
    return { error: templatesToAutoInstantiate.error };
  }

  for (const autoInstantiatedTemplate of templatesToAutoInstantiate.data || []) {
    const existingTemplateIndex =
      projectSettings.instantiatedTemplates.findIndex(
        (template) =>
          template.templateName === autoInstantiatedTemplate.subTemplateName &&
          template.parentId === parentInstanceId &&
          template.automaticallyInstantiatedByParent,
      );

    if (existingTemplateIndex === -1) {
      console.error(
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
      console.error(
        `Failed to map settings for auto instantiated template: ${newTemplateSettings.error}`,
      );
      return {
        error: `Failed to map settings for auto instantiated template: ${newTemplateSettings.error}`,
      };
    }

    const newFullTemplateSettings = Object.assign(
      {},
      fullParentTemplateSettings,
      newTemplateSettings.data,
    );

    const subTemplateName = stringOrCallbackToString(
      autoInstantiatedTemplate.subTemplateName,
      newFullTemplateSettings,
    );

    if ("error" in subTemplateName) {
      console.error(
        `Failed to parse sub template name: ${subTemplateName.error}`,
      );
      return { error: subTemplateName.error };
    }

    if (!projectSettings.instantiatedTemplates[existingTemplateIndex]) {
      console.error(
        `Instantiated template ${autoInstantiatedTemplate.subTemplateName} not found in project settings`,
      );
      return { error: "Instantiated template not found in project settings" };
    }

    const subTemplate = currentTemplateToAddChildren.findSubTemplate(
      subTemplateName.data,
    );

    if (!subTemplate) {
      console.error(
        `Subtemplate ${autoInstantiatedTemplate.subTemplateName} not found`,
      );
      return {
        error: `Subtemplate ${autoInstantiatedTemplate.subTemplateName} not found`,
      };
    }

    projectSettings.instantiatedTemplates[existingTemplateIndex] = {
      ...projectSettings.instantiatedTemplates[existingTemplateIndex],
      templateName: subTemplateName.data,
      templateSettings: newTemplateSettings.data,
    };

    const result =
      await recursivelyModifyAutoInstantiatedTemplatesInProjectSettings(
        projectSettings,
        subTemplate,
        existingTemplate.id,
        newFullTemplateSettings,
      );

    if ("error" in result) {
      console.error(
        `Failed to recursively add auto instantiated templates: ${result.error}`,
      );
      return { error: result.error };
    }

    projectSettings = result.data;
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
    console.error(
      `Failed to parse user settings: ${newFullTemplateSettings.error}`,
    );
    return { error: newFullTemplateSettings.error };
  }

  return recursivelyAddAutoInstantiatedTemplatesToProjectSettings(
    projectSettings,
    currentTemplateToAddChildren,
    parentInstanceId,
    newFullTemplateSettings.data,
  );
}

async function recursivelyAddAutoInstantiatedTemplatesToProjectSettings(
  projectSettings: ProjectSettings,
  currentTemplateToAddChildren: Template,
  parentInstanceId: string,
  fullParentTemplateSettings: TemplateSettingsType<AnyZodObject>,
): Promise<Result<ProjectSettings>> {
  const templatesToAutoInstantiate = anyOrCallbackToAny(currentTemplateToAddChildren.config.autoInstatiatedSubtemplates, fullParentTemplateSettings);

  if ("error" in templatesToAutoInstantiate) {
    console.error(
      `Failed to parse auto instantiated templates: ${templatesToAutoInstantiate.error}`,
    );
    return { error: templatesToAutoInstantiate.error };
  }

  for (const autoInstantiatedTemplate of templatesToAutoInstantiate.data || []) {
    const autoInstantiatedTemplateInstanceId = crypto.randomUUID();
    const newTemplateSettings = anyOrCallbackToAny(autoInstantiatedTemplate.mapSettings, fullParentTemplateSettings);
    if ("error" in newTemplateSettings) {
      console.error(
        `Failed to map settings for auto instantiated template: ${newTemplateSettings.error}`,
      );
      return {
        error: `Failed to map settings for auto instantiated template: ${newTemplateSettings.error}`,
      };
    }
    const newFullTemplateSettings = Object.assign(
      {},
      fullParentTemplateSettings,
      newTemplateSettings.data,
    );
    const subTemplateName = stringOrCallbackToString(
      autoInstantiatedTemplate.subTemplateName,
      newFullTemplateSettings,
    );

    if ("error" in subTemplateName) {
      console.error(
        `Failed to parse sub template name: ${subTemplateName.error}`,
      );
      return { error: subTemplateName.error };
    }

    projectSettings.instantiatedTemplates.push({
      id: autoInstantiatedTemplateInstanceId,
      parentId: parentInstanceId,
      templateCommitHash: currentTemplateToAddChildren.commitHash,
      automaticallyInstantiatedByParent: true,
      templateName: subTemplateName.data,
      templateSettings: newTemplateSettings.data,
    });

    const rootTemplate = await ROOT_TEMPLATE_REGISTRY.loadRevision(
      projectSettings.rootTemplateName,
      currentTemplateToAddChildren.findRootTemplate().commitHash!,
    );

    if ("error" in rootTemplate) {
      console.error(`Failed to find root template: ${rootTemplate.error}`);
      return { error: rootTemplate.error };
    }

    if (!rootTemplate.data) {
      console.error(
        `Root template not found: ${projectSettings.rootTemplateName}`,
      );
      return { error: "Root template not found" };
    }

    const subTemplate = rootTemplate.data.findSubTemplate(subTemplateName.data);

    if (!subTemplate) {
      console.error(
        `Subtemplate ${autoInstantiatedTemplate.subTemplateName} not found`,
      );
      return {
        error: `Subtemplate ${autoInstantiatedTemplate.subTemplateName} not found`,
      };
    }

    const result =
      await recursivelyAddAutoInstantiatedTemplatesToProjectSettings(
        projectSettings,
        subTemplate,
        autoInstantiatedTemplateInstanceId,
        newFullTemplateSettings,
      );

    if ("error" in result) {
      console.error(
        `Failed to recursively add auto instantiated templates: ${result.error}`,
      );
      return { error: result.error };
    }

    projectSettings = result.data;
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
    console.error(`Instantiated template ${instantiatedTemplateId} not found`);
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
    console.error(`Failed to find template: ${template.error}`);
    return { error: template.error };
  }

  if (!template.data) {
    console.error(`Template ${instantiatedTemplate.templateName} not found`);
    return { error: "Template not found" };
  }

  const newProjectSettings: ProjectSettings = {
    ...project.instantiatedProjectSettings,
    instantiatedTemplates: [
      ...project.instantiatedProjectSettings.instantiatedTemplates,
    ],
  };

  if (!newProjectSettings.instantiatedTemplates[instantiatedTemplateIndex]) {
    console.error(
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
    console.error(
      `Failed to add auto instantiated templates: ${modifyChildrenResult.error}`,
    );
    return { error: modifyChildrenResult.error };
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
    console.error(`Failed to find project: ${project.error}`);
    return { error: project.error };
  }
  if (!project.data) {
    console.error(`Project ${projectName} not found`);
    return { error: "Project not found" };
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
    console.error(
      `Failed to retrieve diff from cache: ${existingSavedDiff.error}`,
    );
    return { error: existingSavedDiff.error };
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
    console.error(
      `Failed to create temp old project path: ${tempOldProjectPath.error}`,
    );
    return { error: tempOldProjectPath.error };
  }
  if ("error" in tempNewProjectPath) {
    console.error(
      `Failed to create temp new project path: ${tempNewProjectPath.error}`,
    );
    return { error: tempNewProjectPath.error };
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
      console.error(
        `Failed to create clean project from current project settings: ${cleanProjectFromCurrentProjectSettingsResult.error}`,
      );
      return { error: cleanProjectFromCurrentProjectSettingsResult.error };
    }

    if ("error" in cleanProjectFromNewSettingsResult) {
      console.error(
        `Failed to create clean project from new settings: ${cleanProjectFromNewSettingsResult.error}`,
      );
      return { error: cleanProjectFromNewSettingsResult.error };
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
      console.error(`Failed to diff directories: ${diff.error}`);
      return { error: diff.error };
    }

    const saveResult = await saveToCache(
      "new-template-diff",
      diffCacheKey,
      "patch",
      diff.data,
    );

    if ("error" in saveResult) {
      console.error(`Failed to save diff to cache: ${saveResult.error}`);
      return { error: saveResult.error };
    }

    const parsedDiff = parseGitDiff(diff.data);

    return {
      data: {
        diffHash: diffCacheKey,
        parsedDiff,
      },
    };
  } catch (e) {
    console.error(e);
    return {
      error: "Failed to create clean project from current project settings",
    };
  } finally {
    await fs.rm(tempOldProjectPath.data, { recursive: true });
    await fs.rm(tempNewProjectPath.data, { recursive: true });
  }
}

// First step for template instantiation. Takes all params and returns a diff of the changes that would be made to the project if the template was instantiated. This diff doesnt show changes on the real project but from a clean project.
export async function generateNewTemplateDiff(
  rootTemplateName: string,
  templateName: string,
  parentInstanceId: string,
  destinationProject: Project,
  userTemplateSettings: UserTemplateSettings,
): Promise<Result<NewTemplateDiffResult>> {
  const instantiatedRootTemplate = destinationProject.instantiatedProjectSettings.instantiatedTemplates[0]?.templateCommitHash;
  if (!instantiatedRootTemplate) {
    console.error(`No instantiated root template commit hash found in project settings`);
    return { error: "No instantiated root template commit hash found in project settings" };
  }
  const rootTemplate =
    await ROOT_TEMPLATE_REGISTRY.loadRevision(rootTemplateName, instantiatedRootTemplate);

  if ("error" in rootTemplate) {
    console.error(`Failed to find root template: ${rootTemplate.error}`);
    return { error: rootTemplate.error };
  }

  if (!rootTemplate.data) {
    console.error(`Root template not found: ${rootTemplateName}`);
    return { error: "Root template not found" };
  }

  const template = rootTemplate.data.findSubTemplate(templateName);

  if (!template) {
    console.error(`Template ${templateName} not found`);
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
    console.error(
      `Failed to add auto instantiated templates: ${addResult.error}`,
    );
    return { error: addResult.error };
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
    console.error(`Failed to find project: ${project.error}`);
    return { error: project.error };
  }

  if (!project.data) {
    console.error(`Project ${projectName} not found`);
    return { error: "Project not found" };
  }

  const addAllResult = await addAllAndDiff(project.data.absoluteRootDir);

  if ("error" in addAllResult) {
    console.error(`Failed to add all and generate diff: ${addAllResult.error}`);
    return { error: addAllResult.error };
  }

  return { data: parseGitDiff(addAllResult.data) };
}

export async function applyDiffToProject(
  projectName: string,
  diffHash: string,
): Promise<Result<ParsedFile[] | { resolveBeforeContinuing: true }>> {
  const project = await PROJECT_REGISTRY.findProject(projectName);

  if ("error" in project) {
    console.error(`Failed to find project: ${project.error}`);
    return { error: project.error };
  }

  if (!project.data) {
    console.error(`Project ${projectName} not found`);
    return { error: "Project not found" };
  }

  const diff = await retrieveFromCache("new-template-diff", diffHash, "patch");

  if ("error" in diff) {
    console.error(`Failed to retrieve diff from cache: ${diff.error}`);
    return { error: diff.error };
  }

  if (!diff.data) {
    console.error(`Diff not found in cache`);
    return { error: "Diff not found" };
  }

  const applyResult = await applyDiffToGitRepo(
    project.data.absoluteRootDir,
    diff.data.path,
  );

  if (!applyResult) {
    console.error(`Failed to apply diff to project`);
    return { error: "Failed to apply diff" };
  }

  // TODO: check if there are any merge conflicts and notify user. Then user will press button("Conflicts Resolved") to add all after he has manually resolved the conflicts. Otherwise here we automatically add all and diff.
  const isConflict = await isConflictAfterApply(project.data.absoluteRootDir);
  if ("error" in isConflict) {
    console.error(`Failed to check for conflicts: ${isConflict.error}`);
    return { error: isConflict.error };
  }
  if (isConflict.data) {
    return { data: { resolveBeforeContinuing: true } };
  }

  const addAllResult = await addAllAndDiff(project.data.absoluteRootDir);

  if ("error" in addAllResult) {
    console.error(`Failed to add all and generate diff: ${addAllResult.error}`);
    return { error: addAllResult.error };
  }

  return { data: parseGitDiff(addAllResult.data) };
}
export async function diffProjectFromTemplate(
  project: Project,
): Promise<Result<ParsedFile[]>> {

  if (!project.gitStatus.isClean) {
    console.error("Cannot diff project with uncommitted changes");
    return { error: "Cannot diff project with uncommitted changes" };
  }

  const projectCommitHash = project.gitStatus.currentCommitHash;

  const existingSavedDiff = await retrieveFromCache(
    "project-from-template-diff",
    projectCommitHash,
    "patch",
  );

  if ("error" in existingSavedDiff) {
    console.error(
      `Failed to existingSavedDiff directories: ${existingSavedDiff.error}`,
    );
    return { error: existingSavedDiff.error };
  }

  if (existingSavedDiff.data) {
    return { data: parseGitDiff(existingSavedDiff.data.data) };
  }

  const tempNewProjectName = `${project.instantiatedProjectSettings.projectName}-${crypto.randomUUID()}`;
  const tempNewProjectPath = await pathInCache(tempNewProjectName);
  if ("error" in tempNewProjectPath) {
    console.error(
      `Failed to create temp new project path: ${tempNewProjectPath.error}`,
    );
    return { error: tempNewProjectPath.error };
  }

  try {
    const newProjectFromExistingProjectResult =
      await generateProjectFromExistingProject(
        project,
        tempNewProjectPath.data,
      );
    if ("error" in newProjectFromExistingProjectResult) {
      console.error(
        `Failed to create new project from existing project: ${newProjectFromExistingProjectResult.error}`,
      );
      return { error: newProjectFromExistingProjectResult.error };
    }

    const diff = await diffDirectories(
      tempNewProjectPath.data,
      project.absoluteRootDir,
    );

    if ("error" in diff) {
      console.error(`Failed to diff directories: ${diff.error}`);
      return { error: diff.error };
    }

    const saveCacheResult = await saveToCache(
      "project-from-template-diff",
      projectCommitHash,
      "patch",
      diff.data,
    );

    if ("error" in saveCacheResult) {
      console.error(`Failed to save diff to cache: ${saveCacheResult.error}`);
      return { error: saveCacheResult.error };
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
    console.error(`No instantiated root template found`);
    return { error: "No instantiated root template found" };
  }

  const template = await ROOT_TEMPLATE_REGISTRY.loadRevision(
    rootInstantiatedTemplate.templateName,
    newTemplateRevisionHash,
  );

  if ("error" in template) {
    console.error(`Failed to find template: ${template.error}`);
    return { error: template.error };
  }

  if (!template.data) {
    console.error(`Template ${rootInstantiatedTemplate.templateName} not found`);
    return { error: "Template not found" };
  }

  const newProjectSettings: ProjectSettings = {
    ...project.instantiatedProjectSettings,
    instantiatedTemplates: [
      ...project.instantiatedProjectSettings.instantiatedTemplates,
    ],
  };

  if (!newProjectSettings.instantiatedTemplates[0]) {
    console.error(
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
