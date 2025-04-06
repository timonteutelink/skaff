import path from "node:path";

export const TEMPLATE_PATHS: string[] = process.env.TEMPLATE_PATHS ? process.env.TEMPLATE_PATHS.split(path.delimiter) : ["./assets/templates"];
export const PROJECT_SEARCH_PATHS: string[] = process.env.PROJECT_SEARCH_PATHS ? process.env.PROJECT_SEARCH_PATHS.split(path.delimiter) : ["~/projects"];
