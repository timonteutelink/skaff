import {
  addAllAndCommit,
  diffProjectFromTemplate,
  switchProjectBranch
} from "@timonteutelink/code-templator-lib";
import { Command, Option } from "commander";

import { getCurrentProject, withFormatting } from "../cli-utils";

/**
 * Registers every `git`‑related CLI command.
 *
 * Usage examples:
 * ```bash
 * # Commit all staged changes for a project
 * code-templator git commit my-project -m "feat: initial commit"
 *
 * # Switch to an existing branch (fails if there are uncommitted changes)
 * code-templator git switch my-project develop
 *
 * # View the diff between a project and the template revision it was created from
 * code-templator git diff-template my-project
 * ```
 */
export function registerGitCommand(program: Command) {
  const gitCmd = program
    .command("git")
    .description("Manage project Git operations");

  /**
   * GIT COMMIT <projectName>
   * ------------------------------------------------------------
   */
  gitCmd
    .command("commit")
    .description("Stage all changes and create a commit for a project")
    .requiredOption("-m, --message <msg>", "Commit message")
    .action(
      withFormatting(
        async (opts: { message: string }) => {
          const project = await getCurrentProject();

          if ('error' in project) {
            console.error(project.error);
            process.exit(1);
          }

          if (!project.data) {
            console.error("No project is currently selected.");
            process.exit(1);
          }

          const res = await addAllAndCommit(project.data, opts.message);
          if ("error" in res) {
            console.error(res.error);
            process.exit(1);
          }
          return {
            project: project.data.instantiatedProjectSettings.projectName,
            committed: true,
            message: opts.message,
          };
        }
      )
    );

  /**
   * GIT SWITCH <projectName> <branch>
   * ------------------------------------------------------------
   */
  gitCmd
    .command("switch")
    .description(
      "Switch the Git branch of a project (requires a clean working tree)"
    )
    .argument("<branch>", "Target branch name")
    .action(
      withFormatting(async (branch: string) => {
        const project = await getCurrentProject();

        if ('error' in project) {
          console.error(project.error);
          process.exit(1);
        }

        if (!project.data) {
          console.error("No project is currently selected.");
          process.exit(1);
        }

        const res = await switchProjectBranch(project.data, branch);
        if ("error" in res) {
          console.error(res.error);
          process.exit(1);
        }
        return {
          project: project.data.instantiatedProjectSettings.projectName,
          branchSwitchedTo: branch,
        };
      })
    );

  /**
   * GIT DIFF-TEMPLATE <projectName>
   * ------------------------------------------------------------
   */
  gitCmd
    .command("diff-template")
    .description(
      "Show the diff between a project and the template revision it was instantiated from"
    )
    .addOption(
      new Option("-f, --format <format>", "Output format")
        .choices(["json", "ndjson", "tsv", "table"])
        .default("table")
    )
    .action(
      withFormatting(async () => {
        const project = await getCurrentProject();
        if ('error' in project) {
          console.error(project.error);
          process.exit(1);
        }
        if (!project.data) {
          console.error("No project is currently selected.");
          process.exit(1);
        }

        const res = await diffProjectFromTemplate(project.data);
        if ("error" in res) {
          console.error(res.error);
          process.exit(1);
        }
        return res.data.map((file) => ({
          path: file.path,
          status: file.status,
          changes: file.hunks.length,
        }));
      })
    );
}

export default registerGitCommand;

