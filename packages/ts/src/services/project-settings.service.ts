import path from "node:path";
import { ProjectSettings, ProjectSettingsSchema, Result } from "../utils/types";
import * as fs from "node:fs/promises";
import { Template } from "../models/template-models";
import { UserTemplateSettings } from "@timonteutelink/template-types-lib";
import { ROOT_TEMPLATE_REGISTRY } from "./root-template-registry-service";
import { makeDir } from "./file-service";

export async function writeNewProjectSettings(
  absoluteProjectPath: string,
  projectSettings: ProjectSettings,
  overwrite?: boolean,
): Promise<Result<void>> {
  const projectSettingsPath = path.join(
    absoluteProjectPath,
    "templateSettings.json",
  );
  if (!overwrite) {
    try {
      await fs.access(projectSettingsPath);
      return {
        error: `Project settings file already exists at ${projectSettingsPath}`,
      };
    } catch {
      // File does not exist, continue
    }
  }
  try {
    await makeDir(absoluteProjectPath);
    const serializedProjectSettings = JSON.stringify(
      projectSettings,
      null,
      2,
    );
    await fs.writeFile(
      projectSettingsPath,
      serializedProjectSettings,
      "utf-8",
    );
  } catch (error) {
    return { error: `Failed to write templateSettings.json: ${error}` };
  }
  return { data: undefined };
}

export async function addTemplateToSettings(
  absoluteProjectPath: string,
  parentInstanceId: string,
  template: Template,
  templateSettings: UserTemplateSettings,
  autoInstantiated?: boolean,
  uuid?: string,
): Promise<Result<string>> {
  const projectSettingsPath = path.join(
    absoluteProjectPath,
    "templateSettings.json",
  );
  const projectSettingsResult =
    await loadProjectSettings(projectSettingsPath);
  if ("error" in projectSettingsResult) {
    return { error: projectSettingsResult.error };
  }
  const projectSettings = projectSettingsResult.data.settings;
  const newTemplateInstanceId = uuid || crypto.randomUUID();
  projectSettings.instantiatedTemplates.push({
    id: newTemplateInstanceId,
    parentId: parentInstanceId,
    templateName: template.config.templateConfig.name,
    templateSettings,
    automaticallyInstantiatedByParent: autoInstantiated,
  });
  const result = await writeNewProjectSettings(
    absoluteProjectPath,
    projectSettings,
    true,
  );
  if ("error" in result) {
    return { error: result.error };
  }

  return { data: newTemplateInstanceId };
}

interface LoadedProjectSettingsResult {
  settings: ProjectSettings;
  rootTemplate: Template;
}

export async function loadProjectSettings(
  projectSettingsPath: string,
): Promise<Result<LoadedProjectSettingsResult>> {
  const projectSettings = await fs.readFile(projectSettingsPath, "utf-8");
  const parsedProjectSettings = JSON.parse(projectSettings);
  const finalProjectSettings = ProjectSettingsSchema.safeParse(
    parsedProjectSettings,
  );
  if (!finalProjectSettings.success) {
    return {
      error: `Invalid templateSettings.json: ${finalProjectSettings.error}`,
    };
  }
  const rootTemplate = await ROOT_TEMPLATE_REGISTRY.findTemplate(
    finalProjectSettings.data.rootTemplateName,
  );
  if ("error" in rootTemplate) {
    return { error: rootTemplate.error };
  }

  for (const subTemplateSettings of finalProjectSettings.data
    .instantiatedTemplates) {
    const subTemplate = rootTemplate.data.findSubTemplate(
      subTemplateSettings.templateName,
    );
    if (!subTemplate) {
      return {
        error: `Template ${subTemplateSettings.templateName} not found in root template ${finalProjectSettings.data.rootTemplateName}`,
      };
    }

    const subTemplateSettingsSchema =
      subTemplate.config.templateSettingsSchema.safeParse(
        subTemplateSettings.templateSettings,
      );
    if (!subTemplateSettingsSchema.success) {
      return {
        error: `Invalid templateSettings.json for template ${subTemplateSettings.templateName}: ${subTemplateSettingsSchema.error}`,
      };
    }
  }

  const instantiatedProjectSettings = {
    settings: finalProjectSettings.data,
    rootTemplate: rootTemplate.data,
  };
  return { data: instantiatedProjectSettings };
}
