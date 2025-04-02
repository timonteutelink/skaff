#!/usr/bin/env node
import { loadTemplateConfig } from "@repo/ts/loaders/template-config-loader";

loadTemplateConfig("../../assets/templates/rust").then((result) => {
	console.log(result);
});
