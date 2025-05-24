import {
  eraseCache,
  getDefaultTemplate,
  getDefaultTemplates,
  getLoadedRevisions,
  loadProjectTemplateRevision,
  logger,
  reloadTemplates,
} from "@timonteutelink/code-templator-lib";
import { Command } from "commander";

import {
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
          console.log(res.error);
          logger.error(res.error);
          process.exit(1);
        }

        return res.data.map(({ template }) => ({
          name: template.config.templateConfig.name,
          description: template.config.templateConfig.description,
          defaultRevision: template.currentCommitHash,
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
          logger.error(res.error);
          process.exit(1);
        }
        if (!res.data) {
          logger.error("Template not found");
          process.exit(1);
        }
        const { template, revisions } = res.data;
        return {
          name: template.config.templateConfig.name,
          description: template.config.templateConfig.description,
          defaultRevision: template.currentCommitHash,
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
          logger.error(res.error);
          process.exit(1);
        }
        if (!res.data) {
          logger.error("No revisions found for this template");
          process.exit(1);
        }

        return res.data.map((t) => ({
          revision: t.currentCommitHash,
          dir: t.dir,
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
          logger.error(res.error);
          process.exit(1);
        }
        if (!res.data) {
          logger.error("Template not found");
          process.exit(1);
        }
        const tpl = res.data.find((t) => t.currentCommitHash === revision);
        if (!tpl) {
          logger.error(
            "Revision not loaded; use `template revisions` to see available hashes",
          );
          process.exit(1);
        }
        return {
          name: tpl.config.templateConfig.name,
          description: tpl.config.templateConfig.description,
          revision: tpl.currentCommitHash,
          templatesDir: tpl.templatesDir,
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
          logger.error(res.error);
          process.exit(1);
        }

        return res.data.map(({ template, revisions }) => ({
          name: template.config.templateConfig.name,
          defaultRevision: template.currentCommitHash,
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
          logger.error(res.error);
          process.exit(1);
        }

        return res.data.map(({ template, revisions }) => ({
          name: template.config.templateConfig.name,
          defaultRevision: template.currentCommitHash,
          totalRevisions: revisions.length,
        }));
      }),
    );

  templateCmd
    .command("project-revision")
    .description(
      "Show the template revision that was instantiated for a project",
    )
    .argument("<projectName>", "Project name")
    .action(
      withFormatting(async (projectName: string) => {
        const res = await loadProjectTemplateRevision(projectName);
        if ("error" in res) {
          logger.error(res.error);
          process.exit(1);
        }
        if (!res.data) {
          logger.error(
            "Project not found or no associated template revision",
          );
          process.exit(1);
        }
        const tpl = res.data;
        return {
          project: projectName,
          template: tpl.config.templateConfig.name,
          revision: tpl.currentCommitHash,
          description: tpl.config.templateConfig.description,
        };
      }),
    );
}

export default registerTemplateCommand;

