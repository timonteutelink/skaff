'use server';

import { Template } from "../../../packages/ts/src/models/template-models";

export type Result<T> = { data: T } | { error: string };

export async function runStuff() {
	// const result = await loadAllTemplateConfigs("./../../assets/templates/rust");
	const loadedTemplate = await Template.create("./../../assets/templates/rust");

	console.log(loadedTemplate);
}
