import { logger } from "@repo/ts";
import { ROOT_TEMPLATE_REPOSITORY } from "@repo/ts";
import { Command } from "commander";
import { addGlobalFormatOption, withFormatting } from "./cli-utils";

const program = new Command();

program
  .name("code-templator")
  .description("CLI to manage projects and templates")
  .version("1.0.0");

addGlobalFormatOption(program);

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

      const res = await ROOT_TEMPLATE_REPOSITORY.getAllTemplates();
      if ("error" in res) {
        logger.error(res.error);
        process.exit(1);
      }
      if (!res.data) {
        logger.error("No templates found");
        process.exit(1);
      }

      let templateDtos = res.data.map(t => t.mapToDTO());

      if (tplName) templateDtos = templateDtos.filter(t => t.config.templateConfig.name === tplName);

      if (templateDtos.length === 0) {
        logger.error("No templates found with the given name");
        process.exit(1);
      }

      if (revision) {
        const foundTemplateRevision = templateDtos.find(t => t.currentCommitHash === revision);
        if (!foundTemplateRevision) {
          const revisionResult = await ROOT_TEMPLATE_REPOSITORY.loadRevision(tplName!, revision);
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

      const payload = templateDtos.map(t => ({
        name: t.config.templateConfig.name,
        description: t.config.templateConfig.description,
        revision: t.currentCommitHash,
      }));

      return payload.length === 1 ? payload[0] : payload;
    })
  );

// program
//   .command("projects")
//   .description("Manage projects")
//   .action(async () => {
//     const projectResults = await PROJECT_REPOSITORY.getProjects();
//     if ("error" in projectResults) {
//       logger.error("Error:", projectResults.error);
//       process.exit(1);
//     }
//     const projects = projectResults.data.map((p) => p.mapToDTO());
//     console.log(JSON.stringify(projects, null, 2));
//   });
//
// program
//   .command("generate")
//   .description("Generate patches")
//   .action(async () => {
//
//   });
//
// program
//   .command("get-project <projectName>")
//   .description("Get a project by name")
//   .action(async (projectName: string) => {
//     const project = await PROJECT_REPOSITORY.findProject(projectName);
//     if ("error" in project) {
//       logger.error("Error:", project.error);
//       process.exit(1);
//     }
//     if (!project.data) {
//       logger.error("Project not found");
//       process.exit(1);
//     }
//     console.log(JSON.stringify(project.data.mapToDTO(), null, 2));
//   });
//
// program
//   .command("precompile-templates")
//   .description("Precompile all templates")
//   .action(async () => {
//     const result = await ROOT_TEMPLATE_REPOSITORY.reloadTemplates();
//     if ("error" in result) {
//       logger.error("Error:", result.error);
//       process.exit(1);
//     }
//     console.log("Templates precompiled successfully");
//   });
//
// program
//   .command("create-project")
//   .description("Create a new project from a template")
//   .action(async () => {
//     const projectName = await input({ message: "Project name:" });
//     const templateName = await input({ message: "Template name:" });
//     const parentDirPath = await input({
//       message: "Parent directory path:",
//     });
//     const settings = await input({
//       message: "User settings (JSON):",
//     });
//
//     const userTemplateSettings: UserTemplateSettings = JSON.parse(settings);
//
//     const template = await ROOT_TEMPLATE_REPOSITORY.findTemplate(templateName);
//     if ("error" in template) {
//       logger.error(template.error);
//       process.exit(1);
//     }
//     if (!template.data) {
//       logger.error("Template not found");
//       process.exit(1);
//     }
//
//     const result = await template.data.instantiateNewProject(
//       userTemplateSettings,
//       parentDirPath,
//       projectName,
//     );
//     if ("error" in result) {
//       logger.error("Failed to create project", result.error);
//       process.exit(1);
//     }
//
//     const reloadResult = await PROJECT_REPOSITORY.reloadProjects();
//     if ("error" in reloadResult) {
//       logger.error("Failed to reload projects", reloadResult.error);
//       process.exit(1);
//     }
//     const newProject = await PROJECT_REPOSITORY.findProject(projectName);
//
//     if ("error" in newProject) {
//       logger.error("Failed to find new project", newProject.error);
//       process.exit(1);
//     }
//     if (!newProject.data) {
//       logger.error("Project creation failed");
//       process.exit(1);
//     }
//
//     console.log("Project created:", newProject.data.mapToDTO());
//   });
//
// program
//   .command("instantiate-template")
//   .description("Instantiate a subtemplate in an existing project")
//   .action(async () => {
//     const rootTemplateName = await input({ message: "Root template name:" });
//     const templateName = await input({ message: "Subtemplate name:" });
//     const parentInstanceId = await input({ message: "Parent instance ID:" });
//     const destinationProjectName = await input({
//       message: "Destination project name:",
//     });
//     const settings = await input({ message: "User settings (JSON):" });
//
//     const userTemplateSettings: UserTemplateSettings = JSON.parse(settings);
//
//     const rootTemplate =
//       await ROOT_TEMPLATE_REPOSITORY.findTemplate(rootTemplateName);
//     if ("error" in rootTemplate) {
//       logger.error(rootTemplate.error);
//       process.exit(1);
//     }
//     if (!rootTemplate.data) {
//       logger.error("Root template not found");
//       process.exit(1);
//     }
//
//     const subTemplate = rootTemplate.data.findSubTemplate(templateName);
//     if (!subTemplate) {
//       logger.error("Subtemplate not found");
//       process.exit(1);
//     }
//
//     const project = await PROJECT_REPOSITORY.findProject(destinationProjectName);
//     if ("error" in project) {
//       logger.error(project.error);
//       process.exit(1);
//     }
//     if (!project.data) {
//       logger.error("Destination project not found");
//       process.exit(1);
//     }
//
//     const result = await subTemplate.templateInExistingProject(
//       userTemplateSettings,
//       project.data,
//       parentInstanceId,
//     );
//     if ("error" in result) {
//       logger.error(result.error);
//       process.exit(1);
//     }
//
//     console.log("Template instantiated with ID:", result.data);
//   });
//
// program.command("instantiate-full-project-from-existing").action(async () => {
//   const existingProjects = await PROJECT_REPOSITORY.getProjects();
//
//   if ("error" in existingProjects) {
//     logger.error(existingProjects.error);
//     process.exit(1);
//   }
//
//   const existingProjectName = await select<string>({
//     choices: existingProjects.map(
//       (p) => p.instantiatedProjectSettings.projectName,
//     ),
//     message: "Existing project name:",
//   });
//   const newProjectName = await input({ message: "New project name:" });
//   const destinationDirPath = await select<string>({
//     choices: PROJECT_SEARCH_PATHS.map((p) => p.path),
//     message: "Destination directory path:",
//   });
//
//   const instantiateResult = await generateProjectFromExistingProject(
//     existingProjectName,
//     path.join(destinationDirPath, newProjectName),
//   );
//
//   if ("error" in instantiateResult) {
//     logger.error(instantiateResult.error);
//     process.exit(1);
//   }
//
//   console.log("Project instantiated successfully:", instantiateResult.data);
// });

program.parseAsync(process.argv);
