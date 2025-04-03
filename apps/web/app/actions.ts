'use server';

import { ROOT_TEMPLATE_REGISTRY } from "@repo/ts/services/root-template-registry-service";
import { TemplateDTO } from "@repo/ts/utils/types";

export type Result<T> = { data: T } | { error: string };

export async function runStuff() {
	await ROOT_TEMPLATE_REGISTRY.loadTemplates();
}

export async function retrieveTemplates(): Promise<TemplateDTO[]> {
	await ROOT_TEMPLATE_REGISTRY.loadTemplates();

	const templates = ROOT_TEMPLATE_REGISTRY.templates.map(template => template.mapTemplateToDTO());

	return templates;
}
