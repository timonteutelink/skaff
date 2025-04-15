import { generateProjectFromTemplateSettings } from "@repo/ts/models/project-models";
import { PROJECT_REGISTRY } from "@repo/ts/services/project-registry-service";
import { ROOT_TEMPLATE_REGISTRY } from "@repo/ts/services/root-template-registry-service";
import { PROJECT_SEARCH_PATHS } from "@repo/ts/utils/env";
import { UserTemplateSettings } from "@timonteutelink/template-types-lib";
import { Command } from "commander";
import inquirer from "inquirer";

const program = new Command();

program
  .name("project-cli")
  .description("CLI to manage projects and templates")
  .version("1.0.0");

program
  .command("list-templates")
  .description("List all templates")
  .action(async () => {
    await ROOT_TEMPLATE_REGISTRY.getTemplates();
    const templates = ROOT_TEMPLATE_REGISTRY.templates.map((t) => t.mapToDTO());
    console.log(JSON.stringify(templates, null, 2));
  });

program
  .command("get-template <templateName>")
  .description("Get a single template by name")
  .action(async (templateName: string) => {
    const result = await ROOT_TEMPLATE_REGISTRY.findTemplate(templateName);
    if ("error" in result) {
      console.error("Error:", result.error);
      process.exit(1);
    }
    console.log(JSON.stringify(result.data.mapToDTO(), null, 2));
  });

program
  .command("list-projects")
  .description("List all projects")
  .action(async () => {
    await PROJECT_REGISTRY.getProjects();
    const projects = PROJECT_REGISTRY.projects.map((p) => p.mapToDTO());
    console.log(JSON.stringify(projects, null, 2));
  });

program
  .command("get-project <projectName>")
  .description("Get a project by name")
  .action(async (projectName: string) => {
    const project = await PROJECT_REGISTRY.findProject(projectName);
    if (!project) {
      console.error("Project not found");
      process.exit(1);
    }
    console.log(JSON.stringify(project.mapToDTO(), null, 2));
  });

program
  .command("precompile-templates")
  .description("Precompile all templates")
  .action(async () => {
    await ROOT_TEMPLATE_REGISTRY.reloadTemplates();
    console.log("Templates precompiled successfully");
  });

program
  .command("create-project")
  .description("Create a new project from a template")
  .action(async () => {
    const answers = await inquirer.prompt([
      { name: "projectName", message: "Project name:" },
      { name: "templateName", message: "Template name:" },
      { name: "parentDirPath", message: "Parent directory path:" },
      { name: "settings", message: "User settings (JSON):" },
    ]);

    const userTemplateSettings: UserTemplateSettings = JSON.parse(
      answers.settings,
    );

    const template = await ROOT_TEMPLATE_REGISTRY.findTemplate(
      answers.templateName,
    );
    if ("error" in template) {
      console.error(template.error);
      process.exit(1);
    }

    const result = await template.data.instantiateNewProject(
      userTemplateSettings,
      answers.parentDirPath,
      answers.projectName,
    );
    if ("error" in result) {
      console.error("Failed to create project");
      process.exit(1);
    }

    await PROJECT_REGISTRY.reloadProjects();
    const newProject = await PROJECT_REGISTRY.findProject(answers.projectName);

    if (!newProject) {
      console.error("Project creation failed");
      process.exit(1);
    }

    console.log("Project created:", newProject.mapToDTO());
  });

program
  .command("instantiate-template")
  .description("Instantiate a subtemplate in an existing project")
  .action(async () => {
    const answers = await inquirer.prompt([
      { name: "rootTemplateName", message: "Root template name:" },
      { name: "templateName", message: "Subtemplate name:" },
      { name: "parentInstanceId", message: "Parent instance ID:" },
      { name: "destinationProjectName", message: "Destination project name:" },
      { name: "settings", message: "User settings (JSON):" },
    ]);

    const userTemplateSettings: UserTemplateSettings = JSON.parse(
      answers.settings,
    );

    const rootTemplate = await ROOT_TEMPLATE_REGISTRY.findTemplate(
      answers.rootTemplateName,
    );
    if ("error" in rootTemplate) {
      console.error(rootTemplate.error);
      process.exit(1);
    }

    const subTemplate = rootTemplate.data.findSubTemplate(answers.templateName);
    if (!subTemplate) {
      console.error("Subtemplate not found");
      process.exit(1);
    }

    const project = await PROJECT_REGISTRY.findProject(
      answers.destinationProjectName,
    );
    if (!project) {
      console.error("Destination project not found");
      process.exit(1);
    }

    const result = await subTemplate.templateInExistingProject(
      userTemplateSettings,
      project,
      answers.parentInstanceId,
    );
    if ("error" in result) {
      console.error(result.error);
      process.exit(1);
    }

    console.log("Template instantiated with ID:", result.data);
  });

program.command("instantiate-full-project-from-existing").action(async () => {
  const existingProjects = await PROJECT_REGISTRY.getProjects();
  const answers = await inquirer.prompt([
    { name: "existingProjectName", message: "Project name:", choices: existingProjects.map((p) => p.instantiatedProjectSettings.projectName) },
    { name: "newProjectName", message: "New project name:" },
    { name: "destinationDirPath", message: "Destination directory pathId:", choices: PROJECT_SEARCH_PATHS.map((p) => p.path) },
  ]);

  const instantiateResult = await generateProjectFromTemplateSettings(answers.existingProjectName, answers.newProjectName, answers.destinationDirPath);

  if ("error" in instantiateResult) {
    console.error(instantiateResult.error);
    process.exit(1);
  }

  console.log("Project instantiated successfully:", instantiateResult.data);
});

program.parseAsync(process.argv);
