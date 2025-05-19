import {
  getProject,
  getProjects,
  getSearchPaths,
  logger,
  runProjectCommand,
} from "@timonteutelink/code-templator-lib";
import { Command } from "commander";

import { withFormatting } from "../cli-utils";

/**
 * Registers every `project`‑related CLI command.
 *
 * Usage examples:
 * ```bash
 * # List all projects (table by default)
 * code-templator project ls
 *
 * # Show a single project by name
 * code-templator project show my-project
 *
 * # View all configured search paths
 * code-templator project search-paths
 *
 * # Execute a template command on a project
 * code-templator project run my-project -i root -c "Build"
 *
 * # Reload projects from disk (useful after adding/removing projects)
 * code-templator project reload
 * ```
 */
export function registerProjectCommand(program: Command) {
  const projectCmd = program
    .command("project")
    .description("Manage code‑templator projects");

  /**
   * PROJECT LS
   * ------------------------------------------------------------
   */
  projectCmd
    .command("ls")
    .description("List projects. Add --project to filter by name")
    .option("-p, --project <name>", "Filter by project name")
    .action(
      withFormatting(async (opts: { project?: string }) => {
        const res = await getProjects();
        if ("error" in res) {
          logger.error(res.error);
          process.exit(1);
        }

        let projects = res.data;
        if (opts.project) {
          projects = projects.filter((p) => p.name === opts.project);
          if (projects.length === 0) {
            logger.error("No projects found with the given name");
            process.exit(1);
          }
        }

        return projects.map((p) => ({
          name: p.name,
          path: p.absPath,
          template: p.rootTemplateName,
          branch: p.gitStatus.currentBranch,
          clean: p.gitStatus.isClean,
          outdatedTemplate: p.outdatedTemplate,
        }));
      }),
    );

  /**
   * PROJECT SHOW <name>
   * ------------------------------------------------------------
   */
  projectCmd
    .command("show")
    .description("Display details for a single project")
    .argument("<projectName>", "Project name")
    .action(
      withFormatting(async (projectName: string) => {
        const res = await getProject(projectName);
        if ("error" in res) {
          logger.error(res.error);
          process.exit(1);
        }
        if (!res.data) {
          logger.error("Project not found");
          process.exit(1);
        }

        const p = res.data;
        return {
          name: p.name,
          path: p.absPath,
          rootTemplate: p.rootTemplateName,
          gitClean: p.gitStatus.isClean,
          currentBranch: p.gitStatus.currentBranch,
          currentCommit: p.gitStatus.currentCommitHash,
          outdatedTemplate: p.outdatedTemplate,
          instantiatedTemplates: p.settings.instantiatedTemplates.length,
        };
      }),
    );

  /**
   * PROJECT SEARCH‑PATHS
   * ------------------------------------------------------------
   */
  projectCmd
    .command("search-paths")
    .description("Show directories that are scanned for projects")
    .action(
      withFormatting(async () => {
        const paths = await getSearchPaths();
        return paths;
      }),
    );

  /**
   * PROJECT RUN <projectName> -i <instance> -c <command>
   * ------------------------------------------------------------
   */
  projectCmd
    .command("run")
    .description("Execute a template command inside a project")
    .argument("<projectName>", "Project name")
    .requiredOption(
      "-i, --instance <id>",
      "Template instance id (use 'root' for the root template)",
    )
    .requiredOption(
      "-c, --command <title>",
      "Command title as defined by the template",
    )
    .action(
      withFormatting(
        async (
          projectName: string,
          opts: { instance: string; command: string },
        ) => {
          const res = await runProjectCommand(
            projectName,
            opts.instance,
            opts.command,
          );
          if ("error" in res) {
            logger.error(res.error);
            process.exit(1);
          }

          return { output: res.data };
        },
      ),
    );

  /**
   * PROJECT RELOAD
   * ------------------------------------------------------------
   */
  projectCmd
    .command("reload")
    .description("Reload projects from disk and show updated list")
    .action(
      withFormatting(async () => {
        const res = await getProjects();
        if ("error" in res) {
          logger.error(res.error);
          process.exit(1);
        }

        return res.data.map((p) => ({
          name: p.name,
          path: p.absPath,
          template: p.rootTemplateName,
          branch: p.gitStatus.currentBranch,
          clean: p.gitStatus.isClean,
          outdatedTemplate: p.outdatedTemplate,
        }));
      }),
    );
}

export default registerProjectCommand;

