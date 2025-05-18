import {
  logger,
  getRootTemplateRepository,
} from "@timonteutelink/code-templator-lib";
import { Command } from "commander";
import { withFormatting } from "../cli-utils";

export function registerTemplateCommand(program: Command) {
  const templatesCommand = program.command("template");

  templatesCommand
    .command("ls")
    .option("-t, --template <name>", "Show only this template")
    .option(
      "-r, --revision <rev>",
      "Load and show a specific revision of the template(requires --template)",
    )
    .description("List all available root templates")
    .action(
      withFormatting(async (opts: { template?: string; revision?: string }) => {
        const { template: tplName, revision } = opts;

        if (revision && !tplName) {
          logger.error("--revision can only be used together with --template");
          process.exit(1);
        }

        const res = await (await getRootTemplateRepository()).getAllTemplates();
        if ("error" in res) {
          logger.error(res.error);
          process.exit(1);
        }
        if (!res.data) {
          logger.error("No templates found");
          process.exit(1);
        }

        let templateDtos = res.data.map((t) => t.mapToDTO());

        if (tplName)
          templateDtos = templateDtos.filter(
            (t) => t.config.templateConfig.name === tplName,
          );

        if (templateDtos.length === 0) {
          logger.error("No templates found with the given name");
          process.exit(1);
        }

        if (revision) {
          const foundTemplateRevision = templateDtos.find(
            (t) => t.currentCommitHash === revision,
          );
          if (!foundTemplateRevision) {
            const revisionResult = await (
              await getRootTemplateRepository()
            ).loadRevision(tplName!, revision);
            if ("error" in revisionResult) {
              logger.error(revisionResult.error);
              process.exit(1);
            }
            if (!revisionResult.data) {
              logger.error("Revision not found for this template");
              process.exit(1);
            }
            templateDtos = [revisionResult.data.mapToDTO()];
          } else {
            templateDtos = [foundTemplateRevision];
          }
        }

        const payload = templateDtos.map((t) => ({
          name: t.config.templateConfig.name,
          description: t.config.templateConfig.description,
          revision: t.currentCommitHash,
        }));

        return payload.length === 1 ? payload[0] : payload;
      }),
    );
}
