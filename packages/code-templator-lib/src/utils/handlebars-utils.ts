import { Template } from "../models/template";


export async function checkMissingSettings(template: Template) {
  const helpers = template.config.handlebarHelpers;



}

export async function checkMissingPartials(template: Template) {
  const partials = await template.findAllPartials();

  if ("error" in partials) {
    throw new Error(partials.error);
  }

  //TODO: Check handlebars if every used partial exists. Every helper exists and every final setting is in zod.


}
