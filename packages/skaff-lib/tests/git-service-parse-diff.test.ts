import { GitService } from "../src/core/infra/git-service";
import type { CacheService } from "../src/core/infra/cache-service";
import type { NpmService } from "../src/core/infra/npm-service";

describe("GitService.parseGitDiff", () => {
  const cacheService = {} as CacheService;
  const npmService = {} as NpmService;
  const service = new GitService(cacheService, npmService);

  it("captures metadata, renames, and \"no newline\" markers", () => {
    const diff = [
      "diff --git a/src/example.ts b/src/example.ts",
      "index 1234567..7654321 100644",
      "--- a/src/example.ts",
      "+++ b/src/example.ts",
      "@@ -1 +1 @@",
      "-const value = \"old\"",
      "+const value = \"new\"",
      "\\ No newline at end of file",
    ].join("\n");

    const [file] = service.parseGitDiff(diff);

    expect(file.path).toBe("src/example.ts");
    expect(file.oldPath).toBe("src/example.ts");
    expect(file.newPath).toBe("src/example.ts");
    expect(file.metadata).toEqual([
      "index 1234567..7654321 100644",
      "--- a/src/example.ts",
      "+++ b/src/example.ts",
    ]);
    expect(file.hunks[0]?.lines).toContain("\\ No newline at end of file");
  });

  it("tracks added and deleted files plus binary metadata", () => {
    const diff = [
      "diff --git a/new-file.txt b/new-file.txt",
      "new file mode 100644",
      "index 0000000..1111111",
      "--- /dev/null",
      "+++ b/new-file.txt",
      "@@ -0,0 +1,2 @@",
      "+line with trailing space ",
      "+\tline starting with tab",
      "diff --git a/removed.bin b/removed.bin",
      "deleted file mode 100644",
      "Binary files a/removed.bin and b/removed.bin differ",
    ].join("\n");

    const files = service.parseGitDiff(diff);
    expect(files).toHaveLength(2);

    const addedFile = files[0]!;
    expect(addedFile.status).toBe("added");
    expect(addedFile.metadata).toEqual([
      "new file mode 100644",
      "index 0000000..1111111",
      "--- /dev/null",
      "+++ b/new-file.txt",
    ]);

    const deletedFile = files[1]!;
    expect(deletedFile.status).toBe("deleted");
    expect(deletedFile.metadata).toEqual([
      "deleted file mode 100644",
      "Binary files a/removed.bin and b/removed.bin differ",
    ]);
    expect(deletedFile.isBinary).toBe(true);
    expect(deletedFile.hunks).toHaveLength(0);
  });
});
