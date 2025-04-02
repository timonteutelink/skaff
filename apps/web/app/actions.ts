'use server';

import { loadTemplateConfig } from "../../../packages/ts/src/loaders/template-config-loader";

export type Result<T> = { data: T } | { error: string };

export async function runStuff() {
	const result = await loadTemplateConfig("./../../assets/templates/rust");

	console.log(result);

}
