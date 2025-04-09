'use server';

import { ROOT_TEMPLATE_REGISTRY } from "@repo/ts/services/root-template-registry-service";
import { PROJECT_REGISTRY } from "@repo/ts/services/project-registry-service";
import { ProjectDTO, Result, TemplateDTO } from "@repo/ts/utils/types";
import { PROJECT_SEARCH_PATHS } from "@repo/ts/utils/env";
import { UserTemplateSettings } from "@timonteutelink/template-types-lib";


export async function retrieveProjectSearchPaths(): Promise<string[]> {
	return PROJECT_SEARCH_PATHS;
}

export async function retrieveTemplates(): Promise<TemplateDTO[]> {
	await ROOT_TEMPLATE_REGISTRY.getTemplates();

	const templates = ROOT_TEMPLATE_REGISTRY.templates.map(template => template.mapToDTO());

	return templates;
}

export async function retrieveTemplate(templateName: string): Promise<TemplateDTO | null> {
	const template = await ROOT_TEMPLATE_REGISTRY.findTemplate(templateName);

	if ('error' in template) {
		console.error(template.error);
		return null;
	}

	return template.data.mapToDTO();
}

export async function reloadProjects(): Promise<void> {
	await PROJECT_REGISTRY.reloadProjects();
}

export async function retrieveProjects(): Promise<ProjectDTO[]> {
	await PROJECT_REGISTRY.getProjects();

	const projects = PROJECT_REGISTRY.projects.map(project => project.mapToDTO());

	return projects;
}

export async function retrieveProject(projectName: string): Promise<ProjectDTO | null> {
	const project = await PROJECT_REGISTRY.findProject(projectName);

	if (project) {
		return project.mapToDTO();
	}

	return null;
}

export async function createNewProject(
	projectName: string,
	templateName: string,
	parentDirPath: string,
	userTemplateSettings: UserTemplateSettings
): Promise<Result<ProjectDTO>> {
	const template = await ROOT_TEMPLATE_REGISTRY.findTemplate(templateName);

	if ('error' in template) {
		return { error: template.error };
	}

	const instatiationResult = await template.data.instantiateNewProject(userTemplateSettings, parentDirPath, projectName);

	if ('error' in instatiationResult) {
		return { error: "Failed to create project" };
	}

	await PROJECT_REGISTRY.reloadProjects();

	const project = await PROJECT_REGISTRY.findProject(projectName);

	if (!project) {
		return { error: "Failed to create project" };
	}

	return { data: project.mapToDTO() };
}

export async function instantiateTemplate(
	rootTemplateName: string,
	templateName: string,
	parentInstanceId: string,
	destinationProjectName: string,
	userTemplateSettings: UserTemplateSettings
): Promise<Result<string>> {
	const rootTemplate = await ROOT_TEMPLATE_REGISTRY.findTemplate(rootTemplateName);

	if ('error' in rootTemplate) {
		return { error: rootTemplate.error };
	}

	const template = rootTemplate.data.findSubTemplate(templateName);

	if (!template) {
		return { error: "Template not found" };
	}

	const destinationProject = await PROJECT_REGISTRY.findProject(destinationProjectName);

	if (!destinationProject) {
		return { error: "Destination project not found" };
	}

	const instatiationResult = await template.templateInExistingProject(userTemplateSettings, destinationProject, parentInstanceId);

	if ('error' in instatiationResult) {
		return { error: "Failed to instantiate template" };
	}

	return { data: instatiationResult.data };
}
