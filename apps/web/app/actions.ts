'use server';

import { ROOT_TEMPLATE_REGISTRY } from "@repo/ts/services/root-template-registry-service";

export type Result<T> = { data: T } | { error: string };

export async function runStuff() {
	await ROOT_TEMPLATE_REGISTRY.loadTemplates();

	console.log(ROOT_TEMPLATE_REGISTRY.templates[0]);
}
