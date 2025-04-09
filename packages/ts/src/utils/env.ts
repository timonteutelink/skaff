import path from "node:path";

const HOME = process.env.HOME || process.env.USERPROFILE || "";
const splitReplaceHome = (input: string) => input.split(path.delimiter).map(e => {
  if (e.startsWith("~")) {
    return e.replace("~", HOME);
  }
  return e;
});

export const TEMPLATE_PATHS: string[] = !process.env.TEMPLATE_PATHS ? ["./assets/templates"] : splitReplaceHome(process.env.TEMPLATE_PATHS);
export const PROJECT_SEARCH_PATHS: string[] = !process.env.PROJECT_SEARCH_PATHS ? [`${HOME}/projects`] : splitReplaceHome(process.env.PROJECT_SEARCH_PATHS);
