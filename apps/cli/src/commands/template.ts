import {
  eraseCache,
  getDefaultTemplate,
  getDefaultTemplates,
  getLoadedRevisions,
  loadProjectTemplateRevision,
  reloadTemplates,
} from "@timonteutelink/code-templator-lib";
import { Command } from "commander";

import {
  getCurrentProject,
  withFormatting
} from "../cli-utils";

export function registerTemplateCommand(program: Command) {
  const templateCmd = program
    .command("template")
    .description("Interact with code‑templator templates");

  templateCmd
    .command("defaults")
    .description("List all default root templates")
    .action(
      withFormatting(async () => {
        console.log("Loading default templates...");
        const res = await getDefaultTemplates();
        if ("error" in res) {
          console.error(res.error);
          process.exit(1);
        }

        return res.data.map(({ template }) => ({
          name: template.config.templateConfig.name,
          description: template.config.templateConfig.description,
          defaultRevision: template.commitHash,
        }));
      }),
    );

  templateCmd
    .command("default")
    .description("Show the default revision of a template")
    .argument("<templateName>", "Template name")
    .action(
      withFormatting(async (templateName: string) => {
        const res = await getDefaultTemplate(templateName);
        if ("error" in res) {
          console.error(res.error);
          process.exit(1);
        }
        if (!res.data) {
          console.error("Template not found");
          process.exit(1);
        }
        const { template, revisions } = res.data;
        return {
          name: template.config.templateConfig.name,
          description: template.config.templateConfig.description,
          defaultRevision: template.commitHash,
          totalRevisions: revisions.length,
        };
      }),
    );

  templateCmd
    .command("revisions")
    .description("List loaded revisions for a template")
    .argument("<templateName>", "Template name")
    .action(
      withFormatting(async (templateName: string) => {
        const res = await getLoadedRevisions(templateName);
        if ("error" in res) {
          console.error(res.error);
          process.exit(1);
        }
        if (!res.data) {
          console.error("No revisions found for this template");
          process.exit(1);
        }

        return res.data.map((t) => ({
          revision: t.commitHash,
          dir: t.absoluteDir,
          isDefault: t.isDefault,
        }));
      }),
    );

  templateCmd
    .command("show")
    .description("Display details for a loaded template revision")
    .argument("<templateName>", "Template name")
    .argument("<revision>", "Commit hash (must already be loaded)")
    .action(
      withFormatting(async (templateName: string, revision: string) => {
        const res = await getLoadedRevisions(templateName);
        if ("error" in res) {
          console.error(res.error);
          process.exit(1);
        }
        if (!res.data) {
          console.error("Template not found");
          process.exit(1);
        }
        const tpl = res.data.find((t) => t.commitHash === revision);
        if (!tpl) {
          console.error(
            "Revision not loaded; use `template revisions` to see available hashes",
          );
          process.exit(1);
        }
        return {
          name: tpl.config.templateConfig.name,
          description: tpl.config.templateConfig.description,
          revision: tpl.commitHash,
          templatesDir: tpl.absoluteBaseDir,
          subTemplateCount: Object.keys(tpl.subTemplates).length,
        };
      }),
    );

  templateCmd
    .command("reload")
    .description("Reload templates from disk and show defaults afterwards")
    .action(
      withFormatting(async () => {
        const res = await reloadTemplates();
        if ("error" in res) {
          console.error(res.error);
          process.exit(1);
        }

        return res.data.map(({ template, revisions }) => ({
          name: template.config.templateConfig.name,
          defaultRevision: template.commitHash,
          totalRevisions: revisions.length,
        }));
      }),
    );

  templateCmd
    .command("erase-cache")
    .description("Erase the template cache, then reload")
    .action(
      withFormatting(async () => {
        const res = await eraseCache();
        if ("error" in res) {
          console.error(res.error);
          process.exit(1);
        }

        return res.data.map(({ template, revisions }) => ({
          name: template.config.templateConfig.name,
          defaultRevision: template.commitHash,
          totalRevisions: revisions.length,
        }));
      }),
    );

  templateCmd
    .command("project-revision")
    .description(
      "Show the template revision that was instantiated for this project",
    )
    .action(
      withFormatting(async () => {
        const project = await getCurrentProject();
        if ('error' in project) {
          console.error(project.error);
          process.exit(1);
        }
        if (!project.data) {
          console.error("No project found. Please run this command in a project directory.");
          process.exit(1);
        }
        const res = await loadProjectTemplateRevision(project.data);
        if ("error" in res) {
          console.error(res.error);
          process.exit(1);
        }
        if (!res.data) {
          console.error(
            "Project not found or no associated template revision",
          );
          process.exit(1);
        }
        const tpl = res.data;
        return {
          project: project.data.instantiatedProjectSettings.projectName,
          template: tpl.config.templateConfig.name,
          revision: tpl.commitHash,
          description: tpl.config.templateConfig.description,
        };
      }),
    );
}

export default registerTemplateCommand;

