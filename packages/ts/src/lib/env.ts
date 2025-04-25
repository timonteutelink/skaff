import path from "node:path";

const HOME = process.env.HOME || process.env.USERPROFILE || "";
const replaceHome = (input: string) => {
  if (input.startsWith("~")) {
    return input.replace("~", HOME);
  }
  return input;
};
const splitReplaceHome = (input: string) =>
  input.split(path.delimiter).map(replaceHome);

export const TEMPLATE_DIR_PATHS: string[] = !process.env.TEMPLATE_DIR_PATHS
  ? ["./assets/example-templates-dir/"]
  : splitReplaceHome(process.env.TEMPLATE_DIR_PATHS);

export const PROJECT_SEARCH_PATHS: { id: string; path: string }[] = (
  !process.env.PROJECT_SEARCH_PATHS
    ? [`${HOME}/projects`]
    : splitReplaceHome(process.env.PROJECT_SEARCH_PATHS)
).map((path, index) => ({ id: `project-path-${index}`, path }));

export const GENERATE_DIFF_SCRIPT_PATH = replaceHome(
  process.env.GENERATE_DIFF_SCRIPT_PATH ||
    "./../../scripts/generate-diff-patch.sh",
);
