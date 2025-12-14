import { Flags } from "@oclif/core";
import { loadPluginsForTemplate } from "@timonteutelink/skaff-lib";

import Base from "../../base-command.js";
import { getCurrentProject } from "../../utils/cli-utils.js";

export default class PluginRun extends Base {
  static description =
    "List and invoke CLI commands contributed by configured template plugins";

  static flags = {
    ...Base.flags,
    command: Flags.string({
      char: "c",
      description: "The plugin command to execute",
    }),
    list: Flags.boolean({
      char: "l",
      description: "Only list available plugin commands",
      default: false,
    }),
    args: Flags.string({
      description: "Arguments to forward to the plugin command",
      multiple: true,
    }),
  };

  async run(): Promise<void> {
    const { flags } = await this.parse(PluginRun);

    const projectResult = await getCurrentProject(flags.project);

    if ("error" in projectResult) {
      this.error(projectResult.error, { exit: 1 });
    }

    if (!projectResult.data) {
      this.error("No project found in the current directory", { exit: 1 });
    }

    const project = projectResult.data;
    const pluginLoadResult = await loadPluginsForTemplate(
      project.rootTemplate,
      project.instantiatedProjectSettings,
    );

    if ("error" in pluginLoadResult) {
      this.error(pluginLoadResult.error, { exit: 1 });
    }

    const commandEntries = pluginLoadResult.data.flatMap((plugin) => {
      const pluginName =
        plugin.name || plugin.reference.module || "unnamed-plugin";
      return (
        plugin.cliPlugin?.commands?.map((command) => ({
          pluginName,
          fullName: `${pluginName}:${command.name}`,
          command,
        })) ?? []
      );
    });

    if (!commandEntries.length) {
      this.log("No CLI plugin commands available for this project.");
      return;
    }

    if (flags.list || !flags.command) {
      this.output(
        commandEntries.map((entry) => ({
          name: entry.fullName,
          description: entry.command.description ?? "",
        })),
      );
      return;
    }

    const selected = commandEntries.find(
      (entry) => entry.fullName === flags.command || entry.command.name === flags.command,
    );

    if (!selected) {
      this.error(
        `Command ${flags.command} not found. Available commands: ${commandEntries
          .map((entry) => entry.fullName)
          .join(", ")}`,
        { exit: 1 },
      );
    }

    await selected!.command.run({
      argv: flags.args ?? [],
      projectPath: project.absoluteRootDir,
      projectSettings: project.instantiatedProjectSettings,
    });
  }
}

