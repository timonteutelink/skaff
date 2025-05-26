import {
  addAllAndDiff,
  applyDiff,
  deleteProject,
  findTemplate,
  generateNewProject,
  generateNewProjectFromExisting,
  generateNewProjectFromSettings,
  getDefaultTemplate,
  getProjectFromPath,
  prepareInstantiationDiff,
  prepareModificationDiff,
  prepareUpdateDiff,
  restoreAllChanges,
} from "@timonteutelink/code-templator-lib";
import { Command } from "commander";
import fs from "node:fs";
import {
  getCurrentProject,
  withFormatting
} from "../cli-utils";
import { UserTemplateSettings } from "@timonteutelink/template-types-lib";
import { promptForSchema } from "../zod-schema-prompt";

async function promptUserTemplateSettings(
  rootTemplateName: string,
  templateName: string
): Promise<UserTemplateSettings> {
  const rootTemplate = await getDefaultTemplate(rootTemplateName);
  if ('error' in rootTemplate) {
    console.error(rootTemplate.error);
    process.exit(1);
  }
  if (!rootTemplate.data) {
    console.error(`No template found with name "${rootTemplateName}"`);
    process.exit(1);
  }
  const templateSettingsSchema = rootTemplate.data.template.config.templateSettingsSchema;
  const promptResult = await promptForSchema(templateSettingsSchema);

  if (Object.keys(promptResult).length === 0) {
    console.error("No settings provided. Exiting.");
    process.exit(1);
  }

  return promptResult as UserTemplateSettings;
}

async function readUserTemplateSettings(rootTemplateName: string, templateName: string, arg?: string): Promise<UserTemplateSettings> {
  if (!arg) {
    return promptUserTemplateSettings(rootTemplateName, templateName);
  }

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
  const projCmd = instCmd
    .command("project")
    .description("Project-level operations")

  // new
  projCmd
    .command("new")
    .description("Create a new project from a template")
    .argument("<projectName>")
    .argument("<templateName>")
    .option(
      "-s, --settings <jsonOrFile>",
      "Inline JSON or path to JSON file with template settings. If not provided will be asked interactively."
    )
    .action(
      withFormatting(async (projectName, templateName, opts) => {
        const settings = await readUserTemplateSettings(
          templateName,
          templateName,
          opts.settings
        );

        const res = await generateNewProject(
          projectName,
          templateName,
          process.cwd(),
          settings
        );
        if ("error" in res) {
          console.error(res.error);
          process.exit(1);
        }
        console.log(res.data);
      })
    );

  // clone
  projCmd
    .command("clone")
    .description("Generate a new project from an existing one")
    .argument("<oldProjectPath>")
    .argument("<newProjectName>")
    .action(
      withFormatting(async (oldProjectPath, newProjectName) => {
        const oldProject = await getProjectFromPath(oldProjectPath);

        if ("error" in oldProject) {
          console.error(oldProject.error);
          process.exit(1);
        }

        if (!oldProject.data) {
          console.error("No project found at the specified path.");
          process.exit(1);
        }

        const res = await generateNewProjectFromExisting(
          oldProject.data,
          process.cwd(),
          newProjectName
        );

        if ("error" in res) {
          console.error(res.error);
          process.exit(1);
        }

        return { path: res.data };
      })
    );

  // from-settings
  projCmd
    .command("from-settings")
    .description("Generate a project entirely from a ProjectSettings JSON")
    .argument("<settingsFileOrJson>")
    .argument("<newProjectName>")
    .action(
      withFormatting(async (jsonOrFile, newProjectName) => {
        const res = await generateNewProjectFromSettings(
          fs.existsSync(jsonOrFile)
            ? fs.readFileSync(jsonOrFile, "utf8")
            : jsonOrFile,
          process.cwd(),
          newProjectName
        );

        if ("error" in res) {
          console.error(res.error);
          process.exit(1);
        }
        console.log(res.data);
      })
    );

  // delete
  projCmd
    .command("delete")
    .description("Delete a project (removes its git repo)")
    .argument("<projectPath>")
    .action(
      withFormatting(async (projectPath) => {
        const proj = await getProjectFromPath(projectPath);
        if ("error" in proj) {
          console.error(proj.error);
          process.exit(1);
        }
        if (!proj.data) {
          console.error("No project found at the specified path.");
          process.exit(1);
        }
        const res = await deleteProject(proj.data);
        if ("error" in res) {
          console.error(res.error);
          process.exit(1);
        }
      })
    );

  // restore
  projCmd
    .command("restore")
    .description("Restore (git reset) all uncommitted changes in a project")
    .action(
      withFormatting(async () => {
        const currentProject = await getCurrentProject();
        if ("error" in currentProject) {
          console.error(currentProject.error);
          process.exit(1);
        }
        if (!currentProject.data) {
          console.error("No project found in the current directory.");
          process.exit(1);
        }
        const res = await restoreAllChanges(currentProject.data);
        if ("error" in res) {
          console.error(res.error);
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
    .action(
      withFormatting(async () => {
        const proj = await getCurrentProject();
        if ("error" in proj) {
          console.error(proj.error);
          process.exit(1);
        }
        if (!proj.data) {
          console.error("No project found in the current directory.");
          process.exit(1);
        }
        const res = await addAllAndDiff(proj.data);
        if ("error" in res) {
          console.error(res.error);
          process.exit(1);
        }
        console.log(res.data);
      })
    );

  // BIG TODO
  // prepare-instantiation
  diffCmd
    .command("prepare-instantiation")
    .description("Prepare a diff for adding a sub-template instance")
    .argument("<rootTemplateName>")
    .argument("<templateName>")
    .argument("<parentInstanceId>")
    .option("-s, --settings <jsonOrFile>")
    .option("-a, --apply", "Apply immediately after generation")
    .action(
      withFormatting(
        async (
          rootTpl,
          tplName,
          parentId,
          opts: { settings?: string; apply?: boolean }
        ) => {
          const proj = await getCurrentProject();
          if ("error" in proj) {
            console.error(proj.error);
            process.exit(1);
          }
          if (!proj.data) {
            console.error("No project found in the current directory.");
            process.exit(1);
          }

          const settings = await readUserTemplateSettings(
            rootTpl,
            tplName,
            opts.settings
          );

          const res = await prepareInstantiationDiff(
            rootTpl,
            tplName,
            parentId,
            proj.data,
            settings
          );
          if ("error" in res) {
            console.error(res.error);
            process.exit(1);
          }
          if (opts.apply) {
            const applied = await applyDiff(proj.data, res.data.diffHash);
            if ("error" in applied) {
              console.error(applied.error);
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
    .argument("<templateInstanceId>")
    .option("-s, --settings <jsonOrFile>")
    .option("-a, --apply")
    .action(
      withFormatting(
        async (
          instanceId,
          opts: { settings?: string; apply?: boolean }
        ) => {
          const proj = await getCurrentProject();
          if ("error" in proj) {
            console.error(proj.error);
            process.exit(1);
          }
          if (!proj.data) {
            console.error("No project found in the current directory.");
            process.exit(1);
          }

          const instantiatedTemplate = proj.data.instantiatedProjectSettings.instantiatedTemplates.find(
            (inst) => inst.id === instanceId
          );

          if (!instantiatedTemplate) {
            console.error(
              `No instantiated template found with ID "${instanceId}"`
            );
            process.exit(1);
          }

          const settings = await readUserTemplateSettings(
            proj.data.rootTemplate.config.templateConfig.name,
            instantiatedTemplate.templateName,
            opts.settings
          );

          const res = await prepareModificationDiff(
            settings,
            proj.data,
            instanceId
          );
          if ("error" in res) {
            console.error(res.error);
            process.exit(1);
          }
          if (opts.apply) {
            const applied = await applyDiff(proj.data, res.data.diffHash);
            if ("error" in applied) {
              console.error(applied.error);
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
    .argument("<newRevisionHash>")
    .option("-a, --apply")
    .action(
      withFormatting(
        async (revHash, opts: { apply?: boolean }) => {
          const proj = await getCurrentProject();
          if ("error" in proj) {
            console.error(proj.error);
            process.exit(1);
          }
          if (!proj.data) {
            console.error("No project found in the current directory.");
            process.exit(1);
          }
          const res = await prepareUpdateDiff(proj.data, revHash);
          if ("error" in res) {
            console.error(res.error);
            process.exit(1);
          }
          if (opts.apply) {
            const applied = await applyDiff(proj.data, res.data.diffHash);
            if ("error" in applied) {
              console.error(applied.error);
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
    .argument("<diffHash>")
    .action(
      withFormatting(async (diffHash) => {
        const proj = await getCurrentProject();
        if ("error" in proj) {
          console.error(proj.error);
          process.exit(1);
        }
        if (!proj.data) {
          console.error("No project found in the current directory.");
          process.exit(1);
        }
        const res = await applyDiff(proj.data, diffHash);
        if ("error" in res) {
          console.error(res.error);
          process.exit(1);
        }
        console.log(res.data);
      })
    );
}
export default registerInstantiationCommand;

