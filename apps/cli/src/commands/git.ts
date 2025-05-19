import { Command, Option } from "commander";
import {
  addAllAndCommit,
  switchProjectBranch,
  diffProjectFromTemplate,
  logger,
} from "@timonteutelink/code-templator-lib";

import { withFormatting } from "../cli-utils";

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
    .argument("<projectName>", "Project name")
    .requiredOption("-m, --message <msg>", "Commit message")
    .action(
      withFormatting(
        async (projectName: string, opts: { message: string }) => {
          const res = await addAllAndCommit(projectName, opts.message);
          if ("error" in res) {
            logger.error(res.error);
            process.exit(1);
          }
          return {
            project: projectName,
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
    .argument("<projectName>", "Project name")
    .argument("<branch>", "Target branch name")
    .action(
      withFormatting(async (projectName: string, branch: string) => {
        const res = await switchProjectBranch(projectName, branch);
        if ("error" in res) {
          logger.error(res.error);
          process.exit(1);
        }
        return {
          project: projectName,
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
    .argument("<projectName>", "Project name")
    .addOption(
      new Option("-f, --format <format>", "Output format")
        .choices(["json", "ndjson", "tsv", "table"])
        .default("table")
    )
    .action(
      withFormatting(async (projectName: string) => {
        const res = await diffProjectFromTemplate(projectName);
        if ("error" in res) {
          logger.error(res.error);
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

