const mockGenerateNewTemplateDiff = jest.fn();
const mockGenerateModifyTemplateDiff = jest.fn();
const mockGenerateUpdateTemplateDiff = jest.fn();
const mockApplyDiffToProject = jest.fn();

const mockInstantiateProject = jest.fn();
const mockGenerateProjectFromTemplateSettings = jest.fn();

const mockAddAllAndRetrieveDiff = jest.fn();
const mockParseGitDiff = jest.fn();
const mockResetAllChanges = jest.fn();
const mockDeleteRepo = jest.fn();

const mockProjectSettingsSchemaParse = jest.fn();
const mockLogError = jest.fn();

jest.mock("../src/core/diffing/project-diff-service", () => ({
  generateNewTemplateDiff: (...args: unknown[]) =>
    mockGenerateNewTemplateDiff(...args),
  generateModifyTemplateDiff: (...args: unknown[]) =>
    mockGenerateModifyTemplateDiff(...args),
  generateUpdateTemplateDiff: (...args: unknown[]) =>
    mockGenerateUpdateTemplateDiff(...args),
  applyDiffToProject: (...args: unknown[]) => mockApplyDiffToProject(...args),
}));

jest.mock("../src/core/projects/ProjectCreationFacade", () => ({
  instantiateProject: (...args: unknown[]) => mockInstantiateProject(...args),
  generateProjectFromTemplateSettings: (
    ...args: unknown[]
  ) => mockGenerateProjectFromTemplateSettings(...args),
}));

jest.mock("../src/core/infra/git-service", () => ({
  addAllAndRetrieveDiff: (...args: unknown[]) => mockAddAllAndRetrieveDiff(...args),
  parseGitDiff: (...args: unknown[]) => mockParseGitDiff(...args),
  resetAllChanges: (...args: unknown[]) => mockResetAllChanges(...args),
  deleteRepo: (...args: unknown[]) => mockDeleteRepo(...args),
}));

jest.mock("@timonteutelink/template-types-lib", () => {
  const actual = jest.requireActual("@timonteutelink/template-types-lib");
  return {
    ...actual,
    projectSettingsSchema: {
      parse: (...args: unknown[]) => mockProjectSettingsSchemaParse(...args),
    },
  };
});

jest.mock("../src/lib/utils", () => ({
  ...jest.requireActual("../src/lib/utils"),
  logError: (...args: unknown[]) => mockLogError(...args),
}));

describe("instantiate actions", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("prepareUpdateDiff", () => {
    it("returns diff result when service succeeds", async () => {
      const project = { id: "project" } as any;
      const diffResult = { diff: "value" };
      mockGenerateUpdateTemplateDiff.mockResolvedValue({ data: diffResult });

      const { prepareUpdateDiff } = await import(
        "../src/actions/instantiate/prepare-update-diff"
      );

      const result = await prepareUpdateDiff(project, "hash");

      expect(mockGenerateUpdateTemplateDiff).toHaveBeenCalledWith(
        project,
        "hash",
      );
      expect(result).toEqual({ data: diffResult });
    });

    it("propagates errors from service", async () => {
      mockGenerateUpdateTemplateDiff.mockResolvedValue({ error: "boom" });
      const { prepareUpdateDiff } = await import(
        "../src/actions/instantiate/prepare-update-diff"
      );

      const result = await prepareUpdateDiff({} as any, "hash");

      expect(result).toEqual({ error: "boom" });
    });
  });

  describe("prepareModificationDiff", () => {
    it("wires parameters correctly and returns data", async () => {
      const userSettings = { feature: true } as any;
      const project = { name: "proj" } as any;
      const diffResult = { diff: "mod" };
      mockGenerateModifyTemplateDiff.mockResolvedValue({ data: diffResult });

      const { prepareModificationDiff } = await import(
        "../src/actions/instantiate/prepare-modification-diff"
      );

      const result = await prepareModificationDiff(
        userSettings,
        project,
        "template-instance",
      );

      expect(mockGenerateModifyTemplateDiff).toHaveBeenCalledWith(
        userSettings,
        project,
        "template-instance",
      );
      expect(result).toEqual({ data: diffResult });
    });

    it("returns service error", async () => {
      mockGenerateModifyTemplateDiff.mockResolvedValue({ error: "fail" });
      const { prepareModificationDiff } = await import(
        "../src/actions/instantiate/prepare-modification-diff"
      );

      const result = await prepareModificationDiff({} as any, {} as any, "id");

      expect(result).toEqual({ error: "fail" });
    });
  });

  describe("prepareInstantiationDiff", () => {
    it("delegates to diff service", async () => {
      const diffResult = { diff: "inst" };
      mockGenerateNewTemplateDiff.mockResolvedValue({ data: diffResult });
      const project = { path: "proj" } as any;
      const settings = { value: 1 } as any;

      const { prepareInstantiationDiff } = await import(
        "../src/actions/instantiate/prepare-instantiation-diff"
      );

      const result = await prepareInstantiationDiff(
        "root",
        "template",
        "parent",
        project,
        settings,
      );

      expect(mockGenerateNewTemplateDiff).toHaveBeenCalledWith(
        "root",
        "template",
        "parent",
        project,
        settings,
      );
      expect(result).toEqual({ data: diffResult });
    });

    it("propagates errors from diff service", async () => {
      mockGenerateNewTemplateDiff.mockResolvedValue({ error: "missing" });
      const { prepareInstantiationDiff } = await import(
        "../src/actions/instantiate/prepare-instantiation-diff"
      );

      const result = await prepareInstantiationDiff(
        "root",
        "template",
        "parent",
        {} as any,
        {} as any,
      );

      expect(result).toEqual({ error: "missing" });
    });
  });

  describe("generateNewProject", () => {
    it("calls instantiateProject with expected arguments", async () => {
      const creationResult = { projectPath: "path" };
      mockInstantiateProject.mockResolvedValue({ data: creationResult });

      const { generateNewProject } = await import(
        "../src/actions/instantiate/generate-new-project"
      );

      const userSettings = { answer: 42 } as any;
      const options = { skipInstall: true } as any;

      const result = await generateNewProject(
        "project-name",
        "template-name",
        "/tmp",
        userSettings,
        options,
      );

      expect(mockInstantiateProject).toHaveBeenCalledWith(
        "template-name",
        "/tmp",
        "project-name",
        userSettings,
        options,
      );
      expect(result).toEqual({ data: creationResult });
    });

    it("returns instantiate error", async () => {
      mockInstantiateProject.mockResolvedValue({ error: "fail" });
      const { generateNewProject } = await import(
        "../src/actions/instantiate/generate-new-project"
      );

      const result = await generateNewProject(
        "project-name",
        "template-name",
        "/tmp",
        {} as any,
      );

      expect(result).toEqual({ error: "fail" });
    });
  });

  describe("generateNewProjectFromExisting", () => {
    it("creates new settings and delegates to facade", async () => {
      const creationResult = { projectPath: "new" };
      mockGenerateProjectFromTemplateSettings.mockResolvedValue({
        data: creationResult,
      });

      const { generateNewProjectFromExisting } = await import(
        "../src/actions/instantiate/generate-new-project-from-existing"
      );

      const originalProjectName = "old-project";
      const project = {
        instantiatedProjectSettings: {
          projectName: originalProjectName,
          rootTemplateName: "root",
          instantiatedTemplates: [],
        },
      } as any;

      const result = await generateNewProjectFromExisting(
        project,
        "/dest",
        "new-project",
        { dryRun: true } as any,
      );

      const [newSettings, destinationPath, options] =
        mockGenerateProjectFromTemplateSettings.mock.calls[0];

      expect(newSettings).toEqual({
        projectName: "new-project",
        rootTemplateName: "root",
        instantiatedTemplates: [],
      });
      expect(destinationPath).toContain("/dest");
      expect(options).toEqual({ dryRun: true });
      expect(project.instantiatedProjectSettings.projectName).toBe(
        originalProjectName,
      );
      expect(result).toEqual({ data: creationResult });
    });

    it("returns facade error", async () => {
      mockGenerateProjectFromTemplateSettings.mockResolvedValue({
        error: "boom",
      });
      const { generateNewProjectFromExisting } = await import(
        "../src/actions/instantiate/generate-new-project-from-existing"
      );

      const project = {
        instantiatedProjectSettings: {
          projectName: "old",
          rootTemplateName: "root",
          instantiatedTemplates: [],
        },
      } as any;

      const result = await generateNewProjectFromExisting(
        project,
        "/dest",
        "new",
      );

      expect(result).toEqual({ error: "boom" });
    });
  });

  describe("generateNewProjectFromSettings", () => {
    it("parses settings and delegates to facade", async () => {
      const creationResult = { projectPath: "generated" };
      mockProjectSettingsSchemaParse.mockReturnValue({
        projectName: "old",
        rootTemplateName: "root",
        instantiatedTemplates: [],
      });
      mockGenerateProjectFromTemplateSettings.mockResolvedValue({
        data: creationResult,
      });

      const { generateNewProjectFromSettings } = await import(
        "../src/actions/instantiate/generate-new-project-from-settings"
      );

      const result = await generateNewProjectFromSettings(
        JSON.stringify({ any: "thing" }),
        "/dir",
        "project",
        { verbose: true } as any,
      );

      expect(mockProjectSettingsSchemaParse).toHaveBeenCalled();
      expect(mockGenerateProjectFromTemplateSettings).toHaveBeenCalledWith(
        {
          projectName: "project",
          rootTemplateName: "root",
          instantiatedTemplates: [],
        },
        expect.stringContaining("/dir"),
        { verbose: true },
      );
      expect(result).toEqual({ data: creationResult });
    });

    it("returns parse error and logs it", async () => {
      const parseError = new Error("invalid");
      mockProjectSettingsSchemaParse.mockImplementation(() => {
        throw parseError;
      });

      const { generateNewProjectFromSettings } = await import(
        "../src/actions/instantiate/generate-new-project-from-settings"
      );

      const result = await generateNewProjectFromSettings(
        JSON.stringify({ foo: "bar" }),
        "/dir",
        "project",
      );

      expect(mockLogError).toHaveBeenCalledWith({
        error: parseError,
        shortMessage: "Failed to parse project settings.",
      });
      expect(result).toEqual({ error: "Failed to parse project settings." });
    });
  });

  describe("applyDiff", () => {
    it("returns parsed diff when successful", async () => {
      const diffResult = { files: [] };
      mockApplyDiffToProject.mockResolvedValue({ data: diffResult });

      const { applyDiff } = await import(
        "../src/actions/instantiate/apply-diff"
      );

      const project = { absoluteRootDir: "/repo" } as any;
      const result = await applyDiff(project, "hash");

      expect(mockApplyDiffToProject).toHaveBeenCalledWith(project, "hash");
      expect(result).toEqual({ data: diffResult });
    });

    it("propagates diff application errors", async () => {
      mockApplyDiffToProject.mockResolvedValue({ error: "oops" });
      const { applyDiff } = await import(
        "../src/actions/instantiate/apply-diff"
      );

      const result = await applyDiff({} as any, "hash");

      expect(result).toEqual({ error: "oops" });
    });
  });

  describe("addAllAndDiff", () => {
    it("returns parsed diff when git add succeeds", async () => {
      mockAddAllAndRetrieveDiff.mockResolvedValue({ data: "raw-diff" });
      mockParseGitDiff.mockReturnValue([{ path: "file" }]);

      const { addAllAndDiff } = await import(
        "../src/actions/instantiate/add-all-and-diff"
      );

      const project = { absoluteRootDir: "/repo" } as any;
      const result = await addAllAndDiff(project);

      expect(mockAddAllAndRetrieveDiff).toHaveBeenCalledWith("/repo");
      expect(mockParseGitDiff).toHaveBeenCalledWith("raw-diff");
      expect(result).toEqual({ data: [{ path: "file" }] });
    });

    it("returns error when git add fails", async () => {
      mockAddAllAndRetrieveDiff.mockResolvedValue({ error: "git-fail" });
      const { addAllAndDiff } = await import(
        "../src/actions/instantiate/add-all-and-diff"
      );

      const result = await addAllAndDiff({ absoluteRootDir: "/repo" } as any);

      expect(result).toEqual({ error: "git-fail" });
    });
  });

  describe("restoreAllChanges", () => {
    it("resets changes via git service", async () => {
      mockResetAllChanges.mockResolvedValue({ data: undefined });
      const { restoreAllChanges } = await import(
        "../src/actions/instantiate/restore-all-changes"
      );

      const result = await restoreAllChanges({ absoluteRootDir: "/repo" } as any);

      expect(mockResetAllChanges).toHaveBeenCalledWith("/repo");
      expect(result).toEqual({ data: undefined });
    });

    it("propagates git reset errors", async () => {
      mockResetAllChanges.mockResolvedValue({ error: "git-reset" });
      const { restoreAllChanges } = await import(
        "../src/actions/instantiate/restore-all-changes"
      );

      const result = await restoreAllChanges({ absoluteRootDir: "/repo" } as any);

      expect(result).toEqual({ error: "git-reset" });
    });
  });

  describe("deleteProject", () => {
    it("removes repository through git service", async () => {
      mockDeleteRepo.mockResolvedValue({ data: undefined });
      const { deleteProject } = await import(
        "../src/actions/instantiate/delete-project"
      );

      const result = await deleteProject({ absoluteRootDir: "/repo" } as any);

      expect(mockDeleteRepo).toHaveBeenCalledWith("/repo");
      expect(result).toEqual({ data: undefined });
    });

    it("propagates deletion errors", async () => {
      mockDeleteRepo.mockResolvedValue({ error: "rm-fail" });
      const { deleteProject } = await import(
        "../src/actions/instantiate/delete-project"
      );

      const result = await deleteProject({ absoluteRootDir: "/repo" } as any);

      expect(result).toEqual({ error: "rm-fail" });
    });
  });
});
