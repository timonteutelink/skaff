import * as fs from "node:fs/promises";
import path from "node:path";
import { Template } from "../models/template";
import {
  Result,
} from "../lib/types";
import { makeDir } from "./file-service";
import { deepSortObject } from "../utils/shared-utils";
import { logError } from "../lib/utils";
import { getRootTemplateRepository } from "../repositories";
import {
  InstantiatedTemplate,
  ProjectSettings,
  projectSettingsSchema,
} from "@timonteutelink/template-types-lib";
import { applyTemplateMigrations } from "./migration-service";

export async function writeNewProjectSettings(
  absoluteProjectPath: string,
  projectSettings: ProjectSettings,
  overwrite?: boolean,
): Promise<Result<void>> {
  if (!projectSettings.instantiatedTemplates[0]) {
    logError({
      shortMessage: "No instantiated templates found in project settings",
    });
    return { error: "No instantiated templates found in project settings" };
  }
  const newProjectSettings: ProjectSettings = {
    ...projectSettings,
    instantiatedTemplates: [projectSettings.instantiatedTemplates[0]!],
  };

  return writeProjectSettings(
    absoluteProjectPath,
    newProjectSettings,
    overwrite,
  );
}

async function writeProjectSettings(
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
      logError({
        shortMessage: `Project settings file already exists at ${projectSettingsPath}`,
      });
      return {
        error: `Project settings file already exists at ${projectSettingsPath}`,
      };
    } catch {
      // File does not exist, continue
    }
  }

  await makeDir(absoluteProjectPath);

  const canonical = deepSortObject(projectSettings);

  const serializedProjectSettings = JSON.stringify(canonical, null, 2) + "\n";

  try {
    await fs.writeFile(projectSettingsPath, serializedProjectSettings, "utf-8");
  } catch (error) {
    logError({
      shortMessage: "Failed to write templateSettings.json",
      error,
    });
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
    return projectSettingsResult;
  }

  const projectSettings = projectSettingsResult.data.settings;
  projectSettings.instantiatedTemplates.push(instantiatedTemplate);

  const result = await writeProjectSettings(
    absoluteProjectPath,
    projectSettings,
    true,
  );

  if ("error" in result) {
    return result;
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
    logError({
      shortMessage: "Failed to read templateSettings.json",
      error,
    });
    return {
      error: `Failed to read templateSettings.json: ${error}`,
    };
  }

  const finalProjectSettings = projectSettingsSchema.safeParse(
    parsedProjectSettings,
  );
  if (!finalProjectSettings.success) {
    logError({
      shortMessage: `Invalid templateSettings.json: ${finalProjectSettings.error}`,
    });
    return {
      error: `Invalid templateSettings.json: ${finalProjectSettings.error}`,
    };
  }

  // TODO here we would also load other reference template repos. For now all templates of a root template need to be in same repo.
  const instantiatedRootTemplateCommitHash =
    finalProjectSettings.data.instantiatedTemplates[0]?.templateCommitHash;

  if (!instantiatedRootTemplateCommitHash) {
    logError({
      shortMessage: `No instantiated root template commit hash found in project settings`,
    });
    return {
      error: `No instantiated root template commit hash found in project settings`,
    };
  }

  const rootTemplate = await (
    await getRootTemplateRepository()
  ).loadRevision(
    finalProjectSettings.data.rootTemplateName,
    instantiatedRootTemplateCommitHash,
  );
  if ("error" in rootTemplate) {
    return rootTemplate;
  }

  if (!rootTemplate.data) {
    logError({
      shortMessage: `Root template ${finalProjectSettings.data.rootTemplateName} not found`,
    });
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
      logError({
        shortMessage: `Sub template ${subTemplateSettings.templateName} not found in root template ${finalProjectSettings.data.rootTemplateName}`,
      });
      return {
        error: `Template ${subTemplateSettings.templateName} not found in root template ${finalProjectSettings.data.rootTemplateName}`,
      };
    }

    const subTemplateSettingsSchema =
      subTemplate.config.templateSettingsSchema.safeParse(
        subTemplateSettings.templateSettings,
      );
    if (!subTemplateSettingsSchema.success) {
      logError({
        shortMessage: `Invalid templateSettings.json for template ${subTemplateSettings.templateName}: ${subTemplateSettingsSchema.error}`,
      });
      return {
        error: `Invalid templateSettings.json for template ${subTemplateSettings.templateName}: ${subTemplateSettingsSchema.error}`,
      };
    }
  }

  const instantiatedProjectSettings = {
    settings: finalProjectSettings.data,
    rootTemplate: rootTemplate.data,
  };

  let migrationsApplied = false;
  for (const instantiatedTemplate of instantiatedProjectSettings.settings
    .instantiatedTemplates) {
    const template = instantiatedProjectSettings.rootTemplate.findSubTemplate(
      instantiatedTemplate.templateName,
    );
    if (!template) {
      logError({
        shortMessage: `Template ${instantiatedTemplate.templateName} not found in root template ${finalProjectSettings.data.rootTemplateName}`,
      });
      return {
        error: `Template ${instantiatedTemplate.templateName} not found in root template ${finalProjectSettings.data.rootTemplateName}`,
      };
    }
    const changed = applyTemplateMigrations(template, instantiatedTemplate);
    if (changed) {
      migrationsApplied = true;
      const schemaCheck = template.config.templateSettingsSchema.safeParse(
        instantiatedTemplate.templateSettings,
      );
      if (!schemaCheck.success) {
        logError({
          shortMessage: `Invalid templateSettings.json for template ${instantiatedTemplate.templateName}: ${schemaCheck.error}`,
        });
        return {
          error: `Invalid templateSettings.json for template ${instantiatedTemplate.templateName}: ${schemaCheck.error}`,
        };
      }
    }
  }

  if (migrationsApplied) {
    const projectDir = path.dirname(projectSettingsPath);
    const writeResult = await writeProjectSettings(
      projectDir,
      instantiatedProjectSettings.settings,
      true,
    );
    if ("error" in writeResult) {
      return writeResult;
    }
  }
  return { data: instantiatedProjectSettings };
}
