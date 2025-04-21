import * as fs from "node:fs/promises";
import { Template } from "../models/template-models";
import { TEMPLATE_DIR_PATHS } from "../utils/env";
import { Result } from "../utils/types";
import path from "node:path";
import { cloneRevisionToCache } from "./git-service";

// now only stores the root templates at: <templateDirPath>/root-templates/*
// later also store reference to files and generic templates to allow direct instantiation without saving state of subtemplates
export class RootTemplateRegistry {
  private loading: boolean = false;
  private templatePaths: string[] = [];
  public templates: Template[] = [];

  constructor(templatePaths: string[]) {
    this.templatePaths = templatePaths;
  }

  // default templates are the template dirs defined by user. User decides which revision to use.
  private async loadDefaultTemplates(): Promise<Result<void>> {
    if (this.loading) {
      return { error: "Templates are already loading" };
    }
    this.loading = true;
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

    this.loading = false;

    return { data: undefined };
  }

  async reloadTemplates(): Promise<Result<void>> {
    return await this.loadDefaultTemplates();
  }

  async getAllTemplates(): Promise<Result<Template[]>> {
    if (!this.templates.length) {
      const result = await this.loadDefaultTemplates();
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

  async findDefaultTemplate(templateName: string): Promise<Result<Template | null>> {
    if (!this.templates.length) {
      const result = await this.loadDefaultTemplates();
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
      if (template.config.templateConfig.name === templateName && template.isDefault) {
        return { data: template };
      }
    }
    return { data: null };
  }

  async findAllTemplateRevisions(templateName: string): Promise<Result<Template[] | null>> {
    const template = await this.getAllTemplates();

    if ("error" in template) {
      console.error(`Failed to load templates: ${template.error}`);
      return { error: template.error };
    }

    const revisions = template.data.filter((template) => {
      return template.config.templateConfig.name === templateName;
    });

    if (revisions.length === 0) {
      console.error(`No revisions found for template ${templateName}`);
      return { data: null };
    }

    return { data: revisions };
  }

  async loadRevision(templateName: string, revisionHash: string): Promise<Result<Template | null>> {
    const result = await this.findAllTemplateRevisions(templateName);
    if ("error" in result) {
      console.error(`Failed to find template: ${result.error}`);
      return { error: result.error };
    }
    const revisions = result.data;
    if (!revisions || revisions.length === 0) {
      return { data: null };
    }

    let defaultTemplate: Template | undefined;
    for (const revision of revisions) {
      if (revision.commitHash === revisionHash) {
        return { data: revision };
      }
      if (revision.isDefault) {
        defaultTemplate = revision;
      }
    }

    if (!defaultTemplate) {
      console.error(`No default template found for ${templateName}`);
      return { data: null };
    }

    const saveRevisionInCacheResult = await cloneRevisionToCache(defaultTemplate, revisionHash);

    if ("error" in saveRevisionInCacheResult) {
      console.error(`Failed to save revision in cache: ${saveRevisionInCacheResult.error}`);
      return { error: saveRevisionInCacheResult.error };
    }

    const newTemplatePath = path.join(saveRevisionInCacheResult.data, "root-templates", path.basename(defaultTemplate.absoluteDir));

    const newTemplate = await Template.createAllTemplates(newTemplatePath);

    if ("error" in newTemplate) {
      console.error(`Failed to create template from revision: ${newTemplate.error}`);
      return { error: newTemplate.error };
    }

    this.templates.push(newTemplate.data);

    return { data: newTemplate.data };
  }
}

export const ROOT_TEMPLATE_REGISTRY = new RootTemplateRegistry(
  TEMPLATE_DIR_PATHS,
);
