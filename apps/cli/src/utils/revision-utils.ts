import { resolveGitService } from "@timonteutelink/skaff-lib";

const gitService = resolveGitService();

export async function resolveRevision(repoUrl: string, branchOrHash: string): Promise<string> {
  if (/^[0-9a-f]{40}$/i.test(branchOrHash)) return branchOrHash;
  const res = await gitService.getRemoteCommitHash(repoUrl, branchOrHash);
  if ('error' in res) throw new Error(res.error);
  return res.data;
}
