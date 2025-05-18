import { getConfig } from "../../lib";
import { projectSearchPathKey } from "../../utils/shared-utils";

export async function getSearchPaths(): Promise<
  { id: string; path: string }[]
> {
  const config = await getConfig();
  return config.PROJECT_SEARCH_PATHS.map((dir) => ({
    id: projectSearchPathKey(dir)!,
    path: dir,
  }));
}
