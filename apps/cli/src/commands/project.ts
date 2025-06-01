import {
  getProjects,
} from "@timonteutelink/code-templator-lib";
import { Command } from "commander";

import { getCurrentProject, withFormatting } from "../cli-utils";

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
    .description("List projects in current dir. Add --project to filter by name")
    .option("-p, --project <name>", "Filter by project name")
    .action(
      withFormatting(async (opts: { project?: string }) => {
        const res = await getProjects(process.cwd());
        if ("error" in res) {
          console.error(res.error);
          process.exit(1);
        }

        let projects = res.data;
        if (opts.project) {
          projects = projects.filter((p) => p.instantiatedProjectSettings.projectName === opts.project);
          if (projects.length === 0) {
            console.error("No projects found with the given name");
            process.exit(1);
          }
        }

        return projects.map(p => p.mapToDTO()).filter(p => 'data' in p).map(p => p.data).map((p) => ({
          name: p.name,
          path: p.absPath,
          template: p.rootTemplateName,
          branch: p.gitStatus!.currentBranch,
          clean: p.gitStatus!.isClean,
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
    .description("Display details for this project")
    .action(
      withFormatting(async () => {
        const res = await getCurrentProject();
        if ("error" in res) {
          console.error(res.error);
          process.exit(1);
        }
        if (!res.data) {
          console.error("Project not found");
          process.exit(1);
        }

        const pRes = res.data.mapToDTO();
        if ("error" in pRes) {
          console.error(pRes.error);
          process.exit(1);
        }
        const p = pRes.data;
        return {
          name: p.name,
          path: p.absPath,
          rootTemplate: p.rootTemplateName,
          gitClean: p.gitStatus!.isClean,
          currentBranch: p.gitStatus!.currentBranch,
          currentCommit: p.gitStatus!.currentCommitHash,
          outdatedTemplate: p.outdatedTemplate,
          instantiatedTemplates: p.settings.instantiatedTemplates.length,
        };
      }),
    );


  /**
   * PROJECT RUN <projectName> -i <instance> -c <command>
   * ------------------------------------------------------------
   */
  projectCmd
    .command("run")
    .description("Execute a template command inside a project")
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
          opts: { instance: string; command: string },
        ) => {
          const proj = await getCurrentProject();
          if ("error" in proj) {
            console.error(proj.error);
            process.exit(1);
          }
          if (!proj.data) {
            console.error("No project found in the current directory");
            process.exit(1);
          }
          const res = await proj.data.executeTemplateCommand(
            opts.instance,
            opts.command,
          );
          if ("error" in res) {
            console.error(res.error);
            process.exit(1);
          }

          return { output: res.data };
        },
      ),
    );
}

export default registerProjectCommand;

