import {
  TemplateSettingsType,
  UserTemplateSettings,
} from "@timonteutelink/template-types-lib";
import * as fs from "node:fs/promises";
import { AnyZodObject, z } from "zod";
import { Project } from "../models/project-models";
import { Template } from "../models/template-models";
import {
  NewTemplateDiffResult,
  ParsedFile,
  ProjectCreationResult,
  ProjectSettings,
  Result,
} from "../utils/types";
import { stringOrCallbackToString } from "../utils/shared-utils";
import {
  getHash,
  pathInCache,
  retrieveFromCache,
  saveToCache,
} from "./cache-service";
import {
  addAllAndDiff,
  applyDiffToGitRepo,
  diffDirectories,
  isConflictAfterApply,
  parseGitDiff,
} from "./git-service";
import { PROJECT_REGISTRY } from "./project-registry-service";
import { ROOT_TEMPLATE_REGISTRY } from "./root-template-registry-service";
import { TemplateGeneratorService } from "./template-generator-service";

// TODO: do some refactoring so most functions in this file take a full Project not projectname
export function getParsedUserSettingsWithParentSettings(
  userSettings: UserTemplateSettings,
  currentlyGeneratingTemplate: Template,
  destinationProjectSettings: ProjectSettings,
  currentlyGeneratingTemplateParentInstanceId?: string,
): Result<TemplateSettingsType<AnyZodObject>> {
  const parsedUserSettings =
    currentlyGeneratingTemplate.config.templateSettingsSchema.safeParse(
      userSettings,
    );
  if (!parsedUserSettings?.success) {
    console.error(
      `Failed to parse user settings: ${parsedUserSettings?.error}`,
    );
    return {
      error: `Failed to parse user settings: ${parsedUserSettings?.error}`,
    };
  }
  let newUserSettings: TemplateSettingsType<z.AnyZodObject> = {
    ...parsedUserSettings.data,
    project_name: destinationProjectSettings.projectName,
  } as TemplateSettingsType<z.AnyZodObject>;

  if (
    currentlyGeneratingTemplate?.parentTemplate &&
    currentlyGeneratingTemplateParentInstanceId
  ) {
    const newInstantiatedSettings = Project.getInstantiatedSettings(
      currentlyGeneratingTemplate.parentTemplate,
      currentlyGeneratingTemplateParentInstanceId,
      destinationProjectSettings,
    );

    if ("error" in newInstantiatedSettings) {
      console.error(
        `Failed to get instantiated settings: ${newInstantiatedSettings.error}`,
      );
      return { error: newInstantiatedSettings.error };
    }

    newUserSettings = {
      ...newUserSettings,
      ...newInstantiatedSettings.data,
    };
  }
  return { data: newUserSettings };
}

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
  for (const autoInstantiatedTemplate of currentTemplateToAddChildren.config
    .autoInstatiatedSubtemplates || []) {
    const existingTemplateIndex =
      projectSettings.instantiatedTemplates.findIndex(
        (template) =>
          template.templateName === autoInstantiatedTemplate.subTemplateName &&
          template.id === parentInstanceId,
      );
    if (existingTemplateIndex === -1) {
      console.error(
        `Auto instantiated template ${autoInstantiatedTemplate.subTemplateName} not found`,
      );
      continue;
    }

    const existingTemplate =
      projectSettings.instantiatedTemplates[existingTemplateIndex]!;

    let newTemplateSettings: UserTemplateSettings;
    try {
      newTemplateSettings = autoInstantiatedTemplate.mapSettings(
        fullParentTemplateSettings,
      );
    } catch (e) {
      console.error(
        `Failed to map settings for auto instantiated template: ${e}`,
      );
      return {
        error: `Failed to map settings for auto instantiated template: ${e}`,
      };
    }

    const newFullTemplateSettings = Object.assign(
      {},
      fullParentTemplateSettings,
      newTemplateSettings,
    );

    const subTemplateName = stringOrCallbackToString(
      autoInstantiatedTemplate.subTemplateName,
      newFullTemplateSettings,
    );
    console.log(newFullTemplateSettings);
    console.log(newTemplateSettings);
    console.log(subTemplateName);

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
      templateSettings: newTemplateSettings,
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
  for (const autoInstantiatedTemplate of currentTemplateToAddChildren.config
    .autoInstatiatedSubtemplates || []) {
    const autoInstantiatedTemplateInstanceId = crypto.randomUUID();
    let newTemplateSettings: UserTemplateSettings;
    try {
      newTemplateSettings = autoInstantiatedTemplate.mapSettings(
        fullParentTemplateSettings,
      );
    } catch (e) {
      console.error(
        `Failed to map settings for auto instantiated template: ${e}`,
      );
      return {
        error: `Failed to map settings for auto instantiated template: ${e}`,
      };
    }
    const newFullTemplateSettings = Object.assign(
      {},
      fullParentTemplateSettings,
      newTemplateSettings,
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
      templateSettings: newTemplateSettings,
    });

    const rootTemplate = await ROOT_TEMPLATE_REGISTRY.findTemplate(
      projectSettings.rootTemplateName,
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
  projectName: string,
  instantiatedTemplateId: string,
): Promise<Result<NewTemplateDiffResult>> {
  const project = await PROJECT_REGISTRY.findProject(projectName);

  if ("error" in project) {
    console.error(`Failed to find project: ${project.error}`);
    return { error: project.error };
  }

  if (!project.data) {
    console.error(`Project ${projectName} not found`);
    return { error: "Project not found" };
  }

  const instantiatedTemplateIndex =
    project.data.instantiatedProjectSettings.instantiatedTemplates.findIndex(
      (template) => template.id === instantiatedTemplateId,
    );

  if (instantiatedTemplateIndex === -1) {
    console.error(`Instantiated template ${instantiatedTemplateId} not found`);
    return { error: "Instantiated template not found" };
  }

  const instantiatedTemplate =
    project.data.instantiatedProjectSettings.instantiatedTemplates[
    instantiatedTemplateIndex
    ]!;

  const template = await ROOT_TEMPLATE_REGISTRY.findTemplate(
    instantiatedTemplate.templateName,
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
    ...project.data.instantiatedProjectSettings,
    instantiatedTemplates: [
      ...project.data.instantiatedProjectSettings.instantiatedTemplates,
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
    project.data.instantiatedProjectSettings,
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

    // TODO: When the project settings contains the hash of the entire template we can hash the entire project settings and combine the old and new project settings hashes to create a unique key for retrieving the diff without having to generate all files again. Add logic to retrieve old projects now then change the diff everywhere to cache results since now projectsettings instantiation is 100% predictable
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
  destinationProjectName: string,
  userTemplateSettings: UserTemplateSettings,
): Promise<Result<NewTemplateDiffResult>> {
  const rootTemplate =
    await ROOT_TEMPLATE_REGISTRY.findTemplate(rootTemplateName);

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

  const destinationProject = await PROJECT_REGISTRY.findProject(
    destinationProjectName,
  );

  if ("error" in destinationProject) {
    console.error(
      `Failed to find destination project: ${destinationProject.error}`,
    );
    return { error: destinationProject.error };
  }

  if (!destinationProject.data) {
    console.error(`Destination project ${destinationProjectName} not found`);
    return { error: "Destination project not found" };
  }

  const templateInstanceId = crypto.randomUUID();
  const newProjectSettings: ProjectSettings = {
    ...destinationProject.data.instantiatedProjectSettings,
    instantiatedTemplates: [
      ...destinationProject.data.instantiatedProjectSettings
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
    destinationProject.data.instantiatedProjectSettings,
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

export async function instantiateProject(
  rootTemplateName: string,
  parentDirPath: string,
  projectName: string,
  userTemplateSettings: UserTemplateSettings,
): Promise<Result<ProjectCreationResult>> {
  const template = await ROOT_TEMPLATE_REGISTRY.findTemplate(rootTemplateName);

  if ("error" in template) {
    console.error(`Failed to find root template: ${template.error}`);
    return { error: template.error };
  }

  if (!template.data) {
    console.error(`Root template not found: ${rootTemplateName}`);
    return { error: "Root template not found" };
  }

  const instatiationResult = await template.data.instantiateNewProject(
    userTemplateSettings,
    parentDirPath,
    projectName,
  );

  if ("error" in instatiationResult) {
    console.error(`Failed to instantiate project: ${instatiationResult.error}`);
    return { error: "Failed to create project, " + instatiationResult.error };
  }

  const reloadResult = await PROJECT_REGISTRY.reloadProjects();

  if ("error" in reloadResult) {
    console.error(`Failed to reload projects: ${reloadResult.error}`);
    return { error: reloadResult.error };
  }

  const project = await PROJECT_REGISTRY.findProject(projectName);

  if ("error" in project) {
    console.error(`Failed to find project: ${project.error}`);
    return { error: project.error };
  }

  if (!project.data) {
    console.error(`Project ${projectName} not found after creation`);
    return {
      error: "Failed to create project, project not found after creation",
    };
  }

  const processedDiff = parseGitDiff(instatiationResult.data.diff);

  const projectDTO = project.data.mapToDTO();

  if ("error" in projectDTO) {
    console.error(`Failed to map project to DTO: ${projectDTO.error}`);
    return { error: projectDTO.error };
  }

  return { data: { newProject: projectDTO.data, diff: processedDiff } };
}

export async function generateProjectFromExistingProject(
  existingProjectName: string,
  newProjectPath: string,
): Promise<Result<string>> {
  const project = await PROJECT_REGISTRY.findProject(existingProjectName);

  if ("error" in project) {
    console.error(`Failed to find project: ${project.error}`);
    return { error: project.error };
  }

  if (!project.data) {
    console.error(`Project ${existingProjectName} not found`);
    return { error: "Project not found" };
  }
  const templateSettings = project.data.instantiatedProjectSettings;

  return await generateProjectFromTemplateSettings(
    templateSettings,
    newProjectPath,
  );
}

// TODO: make sure every time a template is retrieved it retrieves the newest one or it retrieves the one with the right commitHash.
export async function generateProjectFromTemplateSettings(
  projectSettings: ProjectSettings,
  newProjectPath: string,
): Promise<Result<string>> {
  const rootTemplate = await ROOT_TEMPLATE_REGISTRY.findTemplate(
    projectSettings.rootTemplateName,
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

  const newProjectGenerator = new TemplateGeneratorService(
    {
      dontDoGit: true,
      dontAutoInstantiate: true,
      absoluteDestinationPath: newProjectPath,
    },
    rootTemplate.data,
    projectSettings,
  );

  const instatiationResult =
    await newProjectGenerator.instantiateFullProjectFromSettings();

  if ("error" in instatiationResult) {
    console.error(`Failed to instantiate project: ${instatiationResult.error}`);
    return { error: instatiationResult.error };
  }

  return { data: newProjectPath };
}

export async function diffProjectFromTemplate(
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

  if (!project.data.gitStatus.isClean) {
    console.error("Cannot diff project with uncommitted changes");
    return { error: "Cannot diff project with uncommitted changes" };
  }

  const projectCommitHash = project.data.gitStatus.currentCommitHash;

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

  const tempNewProjectName = `${projectName}-${crypto.randomUUID()}`;
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
        projectName,
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
      project.data.absoluteRootDir,
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
