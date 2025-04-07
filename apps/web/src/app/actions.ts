'use server';

import { ROOT_TEMPLATE_REGISTRY } from "@repo/ts/services/root-template-registry-service";
import { PROJECT_REGISTRY } from "@repo/ts/services/project-registry-service";
import { ProjectDTO, TemplateDTO } from "@repo/ts/utils/types";
import { PROJECT_SEARCH_PATHS } from "@repo/ts/utils/env";
import { UserTemplateSettings } from "@timonteutelink/template-types-lib";

export type Result<T> = { data: T } | { error: string };

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

	if (template) {
		return template.mapToDTO();
	}

	return null;
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
	console.log("Creating project:", { name: projectName, template: templateName, parentDirPath, settings: JSON.stringify(userTemplateSettings) });
	// const template = await ROOT_TEMPLATE_REGISTRY.findTemplate(templateName);
	//
	// if (!template) {
	// 	return { error: "Template not found" };
	// }
	//
	// const project = await template.instantiate(
	//
	return { error: "Failed to create project" };
}
