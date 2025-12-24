import Handlebars, { HelperDelegate, TemplateDelegate } from "handlebars";

import { registerAll as registerDefaultHelpers } from "../../utils/handlebars-helpers";

export class HandlebarsEnvironment {
  private readonly instance: typeof Handlebars;

  constructor(
    handlebarsInstance: typeof Handlebars = Handlebars.create(),
  ) {
    this.instance = handlebarsInstance;
    registerDefaultHelpers(this.instance);
  }

  public registerHelpers(helpers: Record<string, HelperDelegate>): void {
    for (const [name, helper] of Object.entries(helpers)) {
      this.instance.registerHelper(name, helper);
    }
  }

  public unregisterHelpers(helperNames: Iterable<string>): void {
    for (const name of helperNames) {
      this.instance.unregisterHelper(name);
    }
  }

  public registerPartials(partials: Record<string, string>): void {
    for (const [name, template] of Object.entries(partials)) {
      this.instance.registerPartial(name, template);
    }
  }

  public unregisterPartials(partialNames: Iterable<string>): void {
    for (const name of partialNames) {
      this.instance.unregisterPartial(name);
    }
  }

  public compile(template: string): TemplateDelegate<unknown> {
    return this.instance.compile(template, { strict: true });
  }
}
