'use server';

import { loadAllTemplateConfigs } from "../../../packages/ts/src/loaders/template-config-loader";

export type Result<T> = { data: T } | { error: string };

export async function runStuff() {
	const result = await loadAllTemplateConfigs("./../../assets/templates/rust");

	console.log(result);

}
