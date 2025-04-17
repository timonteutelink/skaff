import * as fs from "node:fs/promises";
import path from "node:path";
import { Template } from "../models/template-models";
import { InstantiatedTemplate, ProjectSettings, ProjectSettingsSchema, Result } from "../utils/types";
import { makeDir } from "./file-service";
import { ROOT_TEMPLATE_REGISTRY } from "./root-template-registry-service";

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
      console.error(`Project settings file already exists at ${projectSettingsPath}`);
      return {
        error: `Project settings file already exists at ${projectSettingsPath}`,
      };
    } catch {
      // File does not exist, continue
    }
  }

  await makeDir(absoluteProjectPath);
  const serializedProjectSettings = JSON.stringify(
    projectSettings,
    null,
    2,
  );

  try {
    await fs.writeFile(
      projectSettingsPath,
      serializedProjectSettings,
      "utf-8",
    );
  } catch (error) {
    console.error(`Failed to write templateSettings.json: ${error}`);
    return { error: `Failed to write templateSettings.json: ${error}` };
  }
  return { data: undefined };
}

export async function writeNewTemplateToSettings(
  absoluteProjectPath: string,
  instantiatedTemplate: InstantiatedTemplate,
): Promise<Result<void>> {
  const projectSettingsPath = path.join(
    absoluteProjectPath,
    "templateSettings.json",
  );
  const projectSettingsResult = await loadProjectSettings(projectSettingsPath);

  if ("error" in projectSettingsResult) {
    console.error(`Failed to load project settings: ${projectSettingsResult.error}`);
    return { error: projectSettingsResult.error };
  }

  const projectSettings = projectSettingsResult.data.settings;
  projectSettings.instantiatedTemplates.push(instantiatedTemplate);

  const result = await writeNewProjectSettings(
    absoluteProjectPath,
    projectSettings,
    true,
  );

  if ("error" in result) {
    console.error(`Failed to write new template to project settings: ${result.error}`);
    return { error: result.error };
  }

  return { data: undefined };
}

interface LoadedProjectSettingsResult {
  settings: ProjectSettings;
  rootTemplate: Template;
}

export async function loadProjectSettings(
  projectSettingsPath: string,
): Promise<Result<LoadedProjectSettingsResult>> {
  let parsedProjectSettings: ProjectSettings;
  try {
    const projectSettings = await fs.readFile(projectSettingsPath, "utf-8");
    parsedProjectSettings = JSON.parse(projectSettings);
  } catch (error) {
    console.error(`Failed to read templateSettings.json: ${error}`);
    return {
      error: `Failed to read templateSettings.json: ${error}`,
    };
  }

  const finalProjectSettings = ProjectSettingsSchema.safeParse(
    parsedProjectSettings,
  );
  if (!finalProjectSettings.success) {
    console.error(
      `Invalid templateSettings.json: ${finalProjectSettings.error}`,
    );
    return {
      error: `Invalid templateSettings.json: ${finalProjectSettings.error}`,
    };
  }

  const rootTemplate = await ROOT_TEMPLATE_REGISTRY.findTemplate(
    finalProjectSettings.data.rootTemplateName,
  );
  if ("error" in rootTemplate) {
    console.error(
      `Failed to find root template ${finalProjectSettings.data.rootTemplateName}: ${rootTemplate.error}`,
    );
    return { error: rootTemplate.error };
  }

  if (!rootTemplate.data) {
    console.error(`Root template ${finalProjectSettings.data.rootTemplateName} not found`);
    return {
      error: `Root template ${finalProjectSettings.data.rootTemplateName} not found`,
    };
  }

  for (const subTemplateSettings of finalProjectSettings.data
    .instantiatedTemplates) {
    const subTemplate = rootTemplate.data.findSubTemplate(
      subTemplateSettings.templateName,
    );
    if (!subTemplate) {
      console.error(
        `Sub template ${subTemplateSettings.templateName} not found in root template ${finalProjectSettings.data.rootTemplateName}`,
      );
      return {
        error: `Template ${subTemplateSettings.templateName} not found in root template ${finalProjectSettings.data.rootTemplateName}`,
      };
    }

    const subTemplateSettingsSchema =
      subTemplate.config.templateSettingsSchema.safeParse(
        subTemplateSettings.templateSettings,
      );
    if (!subTemplateSettingsSchema.success) {
      console.error(
        `Invalid templateSettings.json for template ${subTemplateSettings.templateName}: ${subTemplateSettingsSchema.error}`,
      );
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
