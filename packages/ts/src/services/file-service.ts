import * as fs from "node:fs/promises";
import { Result } from "../utils/types";

export async function makeDir(path: string): Promise<Result<void>> {
  try {
    await fs.mkdir(path, { recursive: true });
  } catch (error) {
    console.error(`Failed to create directory at ${path}: ${error}`);
    return { error: `Failed to create directory at ${path}: ${error}` };
  }
  return { data: undefined };
}

// TODO: use to see if a project needs to be updated. Will generate a diff from old template to new project. This does require the old template somehow. So maybe we need versioning instead of hash so we can also retrieve old template and new template and we can generate the diff to update. Probably we can make a precommit tool to check which templatedirs have changes and update all those version numbers and version numbers of the parent. Probably when updating we should update entire tree at once. Think about what to allow the user to update. Make sure to enforce 1 commit 1 versionchange. So do not allow unclean git templatesdir. Then instead of saving hash to template we save commitHash. 
//
// TODO so also possible to just force clean git and store commithash of template. Then can easily update all templates at once(not seperately) by just instantiating the project from this commit hash template and the new one and applying the diff. So we do not version any template but we store commit hash of entire template dir so if updated user can run update.
export async function hashFullDir(absoluteDirPath: string): Promise<Result<string>> {



}
