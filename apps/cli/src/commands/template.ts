import { Command } from "commander";
import {
  logger,
  getDefaultTemplate,
  getDefaultTemplates,
  getLoadedRevisions,
  loadProjectTemplateRevision,
  eraseCache,
  reloadTemplates,
} from "@timonteutelink/code-templator-lib";

import {
  addGlobalFormatOption,
  withFormatting,
} from "../cli-utils";

/**
 * Register the **template** command‑group.
 *
 * Only the high‑level actions exported from
 * `@timonteutelink/code-templator-lib` are used – no direct repository access.
 */
export function registerTemplateCommand(program: Command) {
  /**
   * Root `template` command.
   */
  const templateCmd = program
    .command("template")
    .description("Interact with code‑templator templates");

  /* Add global --format option (json | ndjson | tsv | table) */
  addGlobalFormatOption(templateCmd);

  /**
   * ------------------------------------------------------------
   * template defaults
   * ------------------------------------------------------------
   * List every default template (name, description, revision).
   */
  templateCmd
    .command("defaults")
    .description("List all default root templates")
    .action(
      withFormatting(async () => {
        const res = await getDefaultTemplates();
        if ("error" in res) {
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

  /**
   * ------------------------------------------------------------
   * template default <name>
   * ------------------------------------------------------------
   * Show the current default revision of a single template.
   */
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

  /**
   * ------------------------------------------------------------
   * template revisions <name>
   * ------------------------------------------------------------
   * List all revisions that are *currently loaded* for a template.
   */
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

  /**
   * ------------------------------------------------------------
   * template show <name> <revision>
   * ------------------------------------------------------------
   * Show details for a *loaded* revision (no repository calls).
   */
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

  /**
   * ------------------------------------------------------------
   * template reload
   * ------------------------------------------------------------
   * Reload templates and show the refreshed defaults.
   */
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

  /**
   * ------------------------------------------------------------
   * template erase-cache
   * ------------------------------------------------------------
   * Clear the cache and reload templates in one go.
   */
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

  /**
   * ------------------------------------------------------------
   * template project-revision <projectName>
   * ------------------------------------------------------------
   * Show which template revision was used to create a project.
   */
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

