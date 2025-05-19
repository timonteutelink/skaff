import {
  eraseCache,
  getDefaultTemplate,
  getDefaultTemplates,
  getLoadedRevisions,
  getRootTemplateRepository,
  loadProjectTemplateRevision,
  logger,
  reloadTemplates,
} from "@timonteutelink/code-templator-lib";
import { Command } from "commander";

import {
  withFormatting
} from "../cli-utils";

/**
 * Registers every `template`-related CLI command.
 *
 * Usage examples:
 * ```bash
 * # List all templates (table by default)
 * code-templator template ls
 *
 * # Show a single template by name
 * code-templator template ls -t react-app
 *
 * # Show a specific revision
 * code-templator template ls -t react-app -r a1b2c3d
 *
 * # View all default templates
 * code-templator template defaults
 *
 * # View the default revision of a single template
 * code-templator template default react-app
 *
 * # List every revision that is currently loaded
 * code-templator template revisions react-app
 *
 * # Show details for a single revision
 * code-templator template show react-app a1b2c3d
 *
 * # Reload templates from disk
 * code-templator template reload
 *
 * # Erase the template cache and reload
 * code-templator template erase-cache
 *
 * # Show the template revision that was instantiated for a project
 * code-templator template project-revision my-project
 * ```
 */
export function registerTemplateCommand(program: Command) {
  const templateCmd = program
    .command("template")
    .description("Manage code-templator templates");

  /**
   * TEMPLATE LS
   * ------------------------------------------------------------
   */
  templateCmd
    .command("ls")
    .description(
      "List root templates. Add --template to filter by name or --revision to load a specific commit hash."
    )
    .option("-t, --template <name>", "Filter by template name")
    .option(
      "-r, --revision <hash>",
      "Load and show a specific revision (requires --template)"
    )
    .action(
      withFormatting(
        async (opts: { template?: string; revision?: string }) => {
          const { template: tplName, revision } = opts;

          if (revision && !tplName) {
            logger.error("--revision can only be used together with --template");
            process.exit(1);
          }

          const repo = await getRootTemplateRepository();
          const res = await repo.getAllTemplates();
          if ("error" in res) {
            logger.error(res.error);
            process.exit(1);
          }

          let templates = res.data.map((t) => t.mapToDTO());

          // Filter by name
          if (tplName) {
            templates = templates.filter(
              (t) => t.config.templateConfig.name === tplName
            );
            if (templates.length === 0) {
              logger.error("No templates found with the given name");
              process.exit(1);
            }
          }

          // Load specific commit hash if requested
          if (revision) {
            const found = templates.find((t) => t.currentCommitHash === revision);
            if (found) {
              templates = [found];
            } else {
              const rev = await repo.loadRevision(tplName!, revision);
              if ("error" in rev) {
                logger.error(rev.error);
                process.exit(1);
              }
              if (!rev.data) {
                logger.error("Revision not found for this template");
                process.exit(1);
              }
              templates = [rev.data.mapToDTO()];
            }
          }

          return templates.map((t) => ({
            name: t.config.templateConfig.name,
            description: t.config.templateConfig.description,
            revision: t.currentCommitHash,
            isDefault: t.isDefault,
          }));
        }
      )
    );

  /**
   * TEMPLATE DEFAULTS
   * ------------------------------------------------------------
   */
  templateCmd
    .command("defaults")
    .description("List every default template, including all its revisions.")
    .action(
      withFormatting(async () => {
        const res = await getDefaultTemplates();
        if ("error" in res) {
          logger.error(res.error);
          process.exit(1);
        }

        return res.data.map(({ template, revisions }) => ({
          name: template.config.templateConfig.name,
          description: template.config.templateConfig.description,
          defaultRevision: template.currentCommitHash,
          totalRevisions: revisions.length,
        }));
      })
    );

  /**
   * TEMPLATE DEFAULT <name>
   * ------------------------------------------------------------
   */
  templateCmd
    .command("default")
    .description("Show the default revision for a single template")
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
      })
    );

  /**
   * TEMPLATE REVISIONS <name>
   * ------------------------------------------------------------
   */
  templateCmd
    .command("revisions")
    .description("List all loaded revisions for a template")
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
      })
    );

  /**
   * TEMPLATE SHOW <name> <revision>
   * ------------------------------------------------------------
   */
  templateCmd
    .command("show")
    .description("Display details for a specific template revision")
    .argument("<templateName>", "Template name")
    .argument("<revision>", "Commit hash")
    .action(
      withFormatting(async (templateName: string, revision: string) => {
        const repo = await getRootTemplateRepository();
        const rev = await repo.loadRevision(templateName, revision);
        if ("error" in rev) {
          logger.error(rev.error);
          process.exit(1);
        }
        if (!rev.data) {
          logger.error("Revision not found");
          process.exit(1);
        }
        const tpl = rev.data.mapToDTO();
        return {
          name: tpl.config.templateConfig.name,
          description: tpl.config.templateConfig.description,
          revision: tpl.currentCommitHash,
          templatesDir: tpl.templatesDir,
          subTemplateCount: Object.keys(tpl.subTemplates).length,
        };
      })
    );

  /**
   * TEMPLATE RELOAD
   * ------------------------------------------------------------
   */
  templateCmd
    .command("reload")
    .description("Reload templates from disk and show updated defaults")
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
      })
    );

  /**
   * TEMPLATE ERASE-CACHE
   * ------------------------------------------------------------
   */
  templateCmd
    .command("erase-cache")
    .description("Erase the template cache and reload the templates")
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
      })
    );

  /**
   * TEMPLATE PROJECT-REVISION <projectName>
   * ------------------------------------------------------------
   */
  templateCmd
    .command("project-revision")
    .description("Show the template revision used to instantiate a project")
    .argument("<projectName>", "Project name")
    .action(
      withFormatting(async (projectName: string) => {
        const res = await loadProjectTemplateRevision(projectName);
        if ("error" in res) {
          logger.error(res.error);
          process.exit(1);
        }
        if (!res.data) {
          logger.error("Project not found or no associated template revision");
          process.exit(1);
        }

        const tpl = res.data;
        return {
          project: projectName,
          template: tpl.config.templateConfig.name,
          revision: tpl.currentCommitHash,
          description: tpl.config.templateConfig.description,
        };
      })
    );
}

export default registerTemplateCommand;

