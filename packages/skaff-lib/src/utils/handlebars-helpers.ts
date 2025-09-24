import Handlebars, { HelperOptions } from "handlebars";

const eqHelper = (a: any, b: any, options?: HelperOptions) => {
  // block form: options.fn is a function
  if (options && typeof options.fn === "function") {
    return a === b ? options.fn(this) : options.inverse(this);
  }
  // inline/subexpression form: just return the boolean
  return a === b;
};


const snakeCaseHelper = (str: string) => {
  return str
    ?.replace("-", "_")
    .replace(/([a-z])([A-Z])/g, "$1_$2")
    .replace(/\s+/g, "_")
    .toLowerCase();
};
function registerAll(handlebarsInstance: typeof Handlebars = Handlebars) {
  handlebarsInstance.registerHelper("eq", eqHelper);

  handlebarsInstance.registerHelper("snakeCase", snakeCaseHelper);
}

export { eqHelper, snakeCaseHelper, registerAll };
