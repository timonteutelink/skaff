import path from "node:path";

const HOME = process.env.HOME || process.env.USERPROFILE || "";
const splitReplaceHome = (input: string) => input.split(path.delimiter).map(e => {
  if (e.startsWith("~")) {
    return e.replace("~", HOME);
  }
  return e;
});

export const TEMPLATE_DIR_PATHS: string[] = !process.env.TEMPLATE_DIR_PATHS ? ["./assets/example-templates-dir/"] : splitReplaceHome(process.env.TEMPLATE_DIR_PATHS);
export const PROJECT_SEARCH_PATHS: string[] = !process.env.PROJECT_SEARCH_PATHS ? [`${HOME}/projects`] : splitReplaceHome(process.env.PROJECT_SEARCH_PATHS);
