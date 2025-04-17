import { PROJECT_REGISTRY } from "@repo/ts/services/project-registry-service";
import { ROOT_TEMPLATE_REGISTRY } from "@repo/ts/services/root-template-registry-service";
import { PROJECT_SEARCH_PATHS } from "@repo/ts/utils/env";
import { UserTemplateSettings } from "@timonteutelink/template-types-lib";
import { Command } from "commander";
import { input, select } from '@inquirer/prompts';
import { generateProjectFromExistingProject, generateProjectFromTemplateSettings } from "@repo/ts/services/project-service";
import path from "node:path";

const program = new Command();

program
  .name("project-cli")
  .description("CLI to manage projects and templates")
  .version("1.0.0");

program
  .command("list-templates")
  .description("List all templates")
  .action(async () => {
    const templateResults = await ROOT_TEMPLATE_REGISTRY.getTemplates();
    if ("error" in templateResults) {
      console.error("Error:", templateResults.error);
      process.exit(1);
    }
    const templates = templateResults.data.map((t) => t.mapToDTO());
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
    if (!result.data) {
      console.error("Template not found");
      process.exit(1);
    }
    console.log(JSON.stringify(result.data.mapToDTO(), null, 2));
  });

program
  .command("list-projects")
  .description("List all projects")
  .action(async () => {
    const projectResults = await PROJECT_REGISTRY.getProjects();
    if ("error" in projectResults) {
      console.error("Error:", projectResults.error);
      process.exit(1);
    }
    const projects = projectResults.data.map((p) => p.mapToDTO());
    console.log(JSON.stringify(projects, null, 2));
  });

program
  .command("get-project <projectName>")
  .description("Get a project by name")
  .action(async (projectName: string) => {
    const project = await PROJECT_REGISTRY.findProject(projectName);
    if ("error" in project) {
      console.error("Error:", project.error);
      process.exit(1);
    }
    if (!project.data) {
      console.error("Project not found");
      process.exit(1);
    }
    console.log(JSON.stringify(project.data.mapToDTO(), null, 2));
  });

program
  .command("precompile-templates")
  .description("Precompile all templates")
  .action(async () => {
    const result = await ROOT_TEMPLATE_REGISTRY.reloadTemplates();
    if ("error" in result) {
      console.error("Error:", result.error);
      process.exit(1);
    }
    console.log("Templates precompiled successfully");
  });

program
  .command("create-project")
  .description("Create a new project from a template")
  .action(async () => {
    const projectName = await input({ message: "Project name:" });
    const templateName = await input({ message: "Template name:" });
    const parentDirPath = await input({
      message: "Parent directory path:",
    });
    const settings = await input({
      message: "User settings (JSON):",
    });

    const userTemplateSettings: UserTemplateSettings = JSON.parse(
      settings,
    );

    const template = await ROOT_TEMPLATE_REGISTRY.findTemplate(
      templateName,
    );
    if ("error" in template) {
      console.error(template.error);
      process.exit(1);
    }
    if (!template.data) {
      console.error("Template not found");
      process.exit(1);
    }

    const result = await template.data.instantiateNewProject(
      userTemplateSettings,
      parentDirPath,
      projectName,
    );
    if ("error" in result) {
      console.error("Failed to create project", result.error);
      process.exit(1);
    }

    const reloadResult = await PROJECT_REGISTRY.reloadProjects();
    if ("error" in reloadResult) {
      console.error("Failed to reload projects", reloadResult.error);
      process.exit(1);
    }
    const newProject = await PROJECT_REGISTRY.findProject(projectName);

    if ("error" in newProject) {
      console.error("Failed to find new project", newProject.error);
      process.exit(1);
    }
    if (!newProject.data) {
      console.error("Project creation failed");
      process.exit(1);
    }

    console.log("Project created:", newProject.data.mapToDTO());
  });

program
  .command("instantiate-template")
  .description("Instantiate a subtemplate in an existing project")
  .action(async () => {
    const rootTemplateName = await input({ message: "Root template name:" });
    const templateName = await input({ message: "Subtemplate name:" });
    const parentInstanceId = await input({ message: "Parent instance ID:" });
    const destinationProjectName = await input({ message: "Destination project name:" });
    const settings = await input({ message: "User settings (JSON):" });

    const userTemplateSettings: UserTemplateSettings = JSON.parse(
      settings,
    );

    const rootTemplate = await ROOT_TEMPLATE_REGISTRY.findTemplate(
      rootTemplateName,
    );
    if ("error" in rootTemplate) {
      console.error(rootTemplate.error);
      process.exit(1);
    }
    if (!rootTemplate.data) {
      console.error("Root template not found");
      process.exit(1);
    }

    const subTemplate = rootTemplate.data.findSubTemplate(templateName);
    if (!subTemplate) {
      console.error("Subtemplate not found");
      process.exit(1);
    }

    const project = await PROJECT_REGISTRY.findProject(
      destinationProjectName,
    );
    if ("error" in project) {
      console.error(project.error);
      process.exit(1);
    }
    if (!project.data) {
      console.error("Destination project not found");
      process.exit(1);
    }

    const result = await subTemplate.templateInExistingProject(
      userTemplateSettings,
      project.data,
      parentInstanceId,
    );
    if ("error" in result) {
      console.error(result.error);
      process.exit(1);
    }

    console.log("Template instantiated with ID:", result.data);
  });

program.command("instantiate-full-project-from-existing").action(async () => {
  const existingProjects = await PROJECT_REGISTRY.getProjects();

  if ('error' in existingProjects) {
    console.error(existingProjects.error);
    process.exit(1);
  }

  const existingProjectName = await select<string>({ choices: existingProjects.map((p) => p.instantiatedProjectSettings.projectName), message: "Existing project name:" });
  const newProjectName = await input({ message: "New project name:" });
  const destinationDirPath = await select<string>({ choices: PROJECT_SEARCH_PATHS.map((p) => p.path), message: "Destination directory path:" });

  const instantiateResult = await generateProjectFromExistingProject(existingProjectName, path.join(destinationDirPath, newProjectName));

  if ("error" in instantiateResult) {
    console.error(instantiateResult.error);
    process.exit(1);
  }

  console.log("Project instantiated successfully:", instantiateResult.data);
});

program.parseAsync(process.argv);
