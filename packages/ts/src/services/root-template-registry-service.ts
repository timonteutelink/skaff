import * as fs from "node:fs/promises";
import { Template } from "../models/template-models";
import { TEMPLATE_DIR_PATHS } from "../utils/env";
import { Result } from "../utils/types";
import path from "node:path";

// now only stores the root templates at: <templateDirPath>/root-templates/*
// later also store reference to files and generic templates to allow direct instantiation without saving state of subtemplates
export class RootTemplateRegistry {
  private templatePaths: string[] = [];
  public templates: Template[] = [];

  constructor(templatePaths: string[]) {
    this.templatePaths = templatePaths;
  }

  private async loadTemplates(): Promise<Result<void>> {
    this.templates = [];
    for (const templatePath of this.templatePaths) {
      const rootTemplateDirsPath = path.join(templatePath, "root-templates");
      let rootTemplateDirs: string[] = [];
      try {
        rootTemplateDirs = await fs.readdir(rootTemplateDirsPath);
      } catch (e) {
        console.error(
          `Failed to read root template directories at ${rootTemplateDirsPath}: ${e}`,
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
            console.error(
              `Root template directory at ${rootTemplateDirPath} is not a directory`,
            );
            continue;
          }
        } catch (e) {
          console.error(
            `Failed to read root template directory at ${rootTemplateDirPath}: ${e}`,
          );
          continue;
        }

        const template = await Template.createAllTemplates(rootTemplateDirPath);
        if ("error" in template) {
          console.error(
            `Failed to create template from directory ${rootTemplateDirPath}: ${template.error}`,
          );
          continue;
        }
        this.templates.push(template.data);
      }
    }

    return { data: undefined };
  }

  async reloadTemplates(): Promise<Result<void>> {
    this.templates = [];
    return await this.loadTemplates();
  }

  async getTemplates(): Promise<Result<Template[]>> {
    if (!this.templates.length) {
      const result = await this.loadTemplates();
      if ("error" in result) {
        console.error(`Failed to load templates: ${result.error}`);
        return { error: result.error };
      }
      if (!this.templates.length) {
        console.error("No templates found.");
        return { error: "No templates found." };
      }
    }
    return { data: this.templates };
  }

  async findTemplate(templateName: string): Promise<Result<Template | null>> {
    if (!this.templates.length) {
      const result = await this.loadTemplates();
      if ("error" in result) {
        console.error(`Failed to load templates: ${result.error}`);
        return { error: result.error };
      }
      if (!this.templates.length) {
        console.error("No templates found.");
        return { error: "No templates found." };
      }
    }

    for (const template of this.templates) {
      if (template.config.templateConfig.name === templateName) {
        return { data: template };
      }
    }
    return { data: null };
  }
}

export const ROOT_TEMPLATE_REGISTRY = new RootTemplateRegistry(
  TEMPLATE_DIR_PATHS,
);
