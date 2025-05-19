import {
  addAllAndDiff,
  applyDiff,
  deleteProject,
  generateNewProject,
  generateNewProjectFromExisting,
  generateNewProjectFromSettings,
  logger,
  prepareInstantiationDiff,
  prepareModificationDiff,
  prepareUpdateDiff,
  restoreAllChanges,
} from "@timonteutelink/code-templator-lib";
import { Command } from "commander";
import fs from "node:fs";
import {
  withFormatting
} from "../cli-utils";

function readSettings(arg?: string) {
  if (!arg) return {};
  if (fs.existsSync(arg)) {
    return JSON.parse(fs.readFileSync(arg, "utf8"));
  }
  return JSON.parse(arg);
}

export function registerInstantiationCommand(program: Command) {
  const instCmd = program
    .command("instantiation")
    .description("Manage template instantiation in projects");

  /* ---------------------------------------------------------- *
   * PROJECT-LEVEL COMMANDS
   * ---------------------------------------------------------- */
  // NEW
  instCmd
    .command("project")
    .description("Project-level operations")
    // new
    .command("new")
    .description("Create a new project from a template")
    .argument("<projectName>")
    .argument("<templateName>")
    .requiredOption("-d, --dir <dirId>", "Parent directory path ID")
    .option(
      "-s, --settings <jsonOrFile>",
      "Inline JSON or path to JSON file with template settings"
    )
    .action(
      withFormatting(async (projectName, templateName, opts) => {
        const settings = readSettings(opts.settings);
        const res = await generateNewProject(
          projectName,
          templateName,
          opts.dir,
          settings
        );
        if ("error" in res) {
          logger.error(res.error);
          process.exit(1);
        }
        return res.data;
      })
    );

  // clone
  instCmd
    .command("project clone")
    .description("Generate a new project from an existing one")
    .argument("<currentProjectName>")
    .argument("<newProjectName>")
    .requiredOption("-d, --dir <dirId>", "Destination dir path ID")
    .action(
      withFormatting(async (curr, next, opts) => {
        const res = await generateNewProjectFromExisting(
          curr,
          opts.dir,
          next
        );
        if ("error" in res) {
          logger.error(res.error);
          process.exit(1);
        }
        return { path: res.data };
      })
    );

  // from-settings
  instCmd
    .command("project from-settings")
    .description("Generate a project entirely from a ProjectSettings JSON")
    .argument("<settingsFileOrJson>")
    .argument("<newProjectDirName>")
    .requiredOption("-d, --dir <dirId>")
    .action(
      withFormatting(async (jsonOrFile, dirName, opts) => {
        const res = await generateNewProjectFromSettings(
          fs.existsSync(jsonOrFile)
            ? fs.readFileSync(jsonOrFile, "utf8")
            : jsonOrFile,
          opts.dir,
          dirName
        );
        if ("error" in res) {
          logger.error(res.error);
          process.exit(1);
        }
        return res.data;
      })
    );

  // delete
  instCmd
    .command("project delete")
    .description("Delete a project (removes its git repo)")
    .argument("<projectName>")
    .action(
      withFormatting(async (proj) => {
        const res = await deleteProject(proj);
        if ("error" in res) {
          logger.error(res.error);
          process.exit(1);
        }
      })
    );

  // restore
  instCmd
    .command("project restore")
    .description("Restore (git reset) all uncommitted changes in a project")
    .argument("<projectName>")
    .action(
      withFormatting(async (proj) => {
        const res = await restoreAllChanges(proj);
        if ("error" in res) {
          logger.error(res.error);
          process.exit(1);
        }
      })
    );

  /* ---------------------------------------------------------- *
   * DIFF COMMANDS
   * ---------------------------------------------------------- */
  const diffCmd = instCmd
    .command("diff")
    .description("Diff generation, staging and application");

  // stage (add-all-and-diff)
  diffCmd
    .command("stage")
    .description("Stage all changes in a project and show the diff")
    .argument("<projectName>")
    .action(
      withFormatting(async (proj) => {
        const res = await addAllAndDiff(proj);
        if ("error" in res) {
          logger.error(res.error);
          process.exit(1);
        }
        return res.data;
      })
    );

  // prepare-instantiation
  diffCmd
    .command("prepare-instantiation")
    .description("Prepare a diff for adding a sub-template instance")
    .argument("<rootTemplateName>")
    .argument("<templateName>")
    .argument("<parentInstanceId>")
    .argument("<destinationProjectName>")
    .option("-s, --settings <jsonOrFile>")
    .option("-a, --apply", "Apply immediately after generation")
    .action(
      withFormatting(
        async (
          rootTpl,
          tplName,
          parentId,
          proj,
          opts: { settings?: string; apply?: boolean }
        ) => {
          const res = await prepareInstantiationDiff(
            rootTpl,
            tplName,
            parentId,
            proj,
            readSettings(opts.settings)
          );
          if ("error" in res) {
            logger.error(res.error);
            process.exit(1);
          }
          if (opts.apply) {
            const applied = await applyDiff(proj, res.data.diffHash);
            if ("error" in applied) {
              logger.error(applied.error);
              process.exit(1);
            }
            return { applied: true, files: applied.data };
          }
          return { diffHash: res.data.diffHash };
        }
      )
    );

  // prepare-modification
  diffCmd
    .command("prepare-modification")
    .description("Prepare a diff for modifying an existing template instance")
    .argument("<destinationProjectName>")
    .argument("<templateInstanceId>")
    .option("-s, --settings <jsonOrFile>")
    .option("-a, --apply")
    .action(
      withFormatting(
        async (
          proj,
          instanceId,
          opts: { settings?: string; apply?: boolean }
        ) => {
          const res = await prepareModificationDiff(
            readSettings(opts.settings),
            proj,
            instanceId
          );
          if ("error" in res) {
            logger.error(res.error);
            process.exit(1);
          }
          if (opts.apply) {
            const applied = await applyDiff(proj, res.data.diffHash);
            if ("error" in applied) {
              logger.error(applied.error);
              process.exit(1);
            }
            return { applied: true, files: applied.data };
          }
          return { diffHash: res.data.diffHash };
        }
      )
    );

  // prepare-update
  diffCmd
    .command("prepare-update")
    .description("Prepare a project-wide template update diff")
    .argument("<projectName>")
    .argument("<newRevisionHash>")
    .option("-a, --apply")
    .action(
      withFormatting(
        async (proj, revHash, opts: { apply?: boolean }) => {
          const res = await prepareUpdateDiff(proj, revHash);
          if ("error" in res) {
            logger.error(res.error);
            process.exit(1);
          }
          if (opts.apply) {
            const applied = await applyDiff(proj, res.data.diffHash);
            if ("error" in applied) {
              logger.error(applied.error);
              process.exit(1);
            }
            return { applied: true, files: applied.data };
          }
          return { diffHash: res.data.diffHash };
        }
      )
    );

  // manual apply
  diffCmd
    .command("apply")
    .description("Apply a previously prepared diff by its hash")
    .argument("<projectName>")
    .argument("<diffHash>")
    .action(
      withFormatting(async (proj, diffHash) => {
        const res = await applyDiff(proj, diffHash);
        if ("error" in res) {
          logger.error(res.error);
          process.exit(1);
        }
        return res.data;
      })
    );
}
export default registerInstantiationCommand;

