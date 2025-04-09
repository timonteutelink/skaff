import { ROOT_TEMPLATE_REGISTRY } from "@repo/ts/services/root-template-registry-service";
import path from "node:path";

process.chdir(path.join(process.cwd(), "..", ".."));

ROOT_TEMPLATE_REGISTRY.getTemplates().then((templates) => {
	console.log("Templates loaded:", templates);
});
