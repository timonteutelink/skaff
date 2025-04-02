import path from "node:path";

export const TEMPLATE_SEARCH_PATHS: string[] = process.env.TEMPLATE_SEARCH_PATHS ? process.env.TEMPLATE_SEARCH_PATHS.split(path.delimiter) : ["./assets/templates"];
