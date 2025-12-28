import { withTestContainer } from "../src/di/testing";

const mockPlanner = {
  generateNewTemplateDiff: jest.fn(),
  generateModifyTemplateDiff: jest.fn(),
  generateUpdateTemplateDiff: jest.fn(),
  applyDiffToProject: jest.fn(),
};

const mockInstantiateProject = jest.fn();
const mockGenerateProjectFromTemplateSettings = jest.fn();
const mockProjectCreationManager = {
  instantiateProject: (...args: unknown[]) => mockInstantiateProject(...args),
  generateFromTemplateSettings: (
    ...args: unknown[]
  ) => mockGenerateProjectFromTemplateSettings(...args),
};

const mockGitService = {
  addAllAndRetrieveDiff: jest.fn(),
  parseGitDiff: jest.fn(),
  resetAllChanges: jest.fn(),
  deleteRepo: jest.fn(),
};

const mockProjectSettingsSchemaParse = jest.fn();
const mockLogError = jest.fn();

jest.mock("../src/core/diffing/ProjectDiffPlanner", () => ({
  resolveProjectDiffPlanner: jest.fn(() => mockPlanner),
}));

jest.mock("../src/core/projects/ProjectCreationManager", () => ({
  resolveProjectCreationManager: jest.fn(() => mockProjectCreationManager),
}));

jest.mock("../src/core/infra/git-service", () => ({
  resolveGitService: jest.fn(() => mockGitService),
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

jest.mock("../src/lib/logger", () => ({
  backendLogger: {
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
    trace: jest.fn(),
  },
}));

describe("actions wiring", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    for (const key of Object.keys(mockPlanner) as Array<
      keyof typeof mockPlanner
    >) {
      mockPlanner[key].mockReset();
    }
    for (const key of Object.keys(mockGitService) as Array<
      keyof typeof mockGitService
    >) {
      mockGitService[key].mockReset();
    }
  });

  describe("prepareUpdateDiff", () => {
    it("returns diff result when service succeeds", async () => {
      const project = { id: "project" } as any;
      const diffResult = { diff: "value" };
      mockPlanner.generateUpdateTemplateDiff.mockResolvedValue({
        data: diffResult,
      });

      const { prepareUpdateDiff } = await import(
        "../src/actions/instantiate/prepare-update-diff"
      );

      const result = await withTestContainer(() =>
        prepareUpdateDiff(project, "hash"),
      );

      expect(mockPlanner.generateUpdateTemplateDiff).toHaveBeenCalledWith(
        project,
        "hash",
        undefined,
      );
      expect(result).toEqual({ data: diffResult });
    });

    it("propagates errors from service", async () => {
      mockPlanner.generateUpdateTemplateDiff.mockResolvedValue({
        error: "boom",
      });
      const { prepareUpdateDiff } = await import(
        "../src/actions/instantiate/prepare-update-diff"
      );

      const result = await withTestContainer(() =>
        prepareUpdateDiff({} as any, "hash"),
      );

      expect(result).toEqual({ error: "boom" });
    });
  });

  describe("prepareModificationDiff", () => {
    it("wires parameters correctly and returns data", async () => {
      const userSettings = { feature: true } as any;
      const project = { name: "proj" } as any;
      const diffResult = { diff: "mod" };
      mockPlanner.generateModifyTemplateDiff.mockResolvedValue({
        data: diffResult,
      });

      const { prepareModificationDiff } = await import(
        "../src/actions/instantiate/prepare-modification-diff"
      );

      const result = await withTestContainer(() =>
        prepareModificationDiff(userSettings, project, "template-instance"),
      );

      expect(mockPlanner.generateModifyTemplateDiff).toHaveBeenCalledWith(
        userSettings,
        project,
        "template-instance",
      );
      expect(result).toEqual({ data: diffResult });
    });

    it("returns service error", async () => {
      mockPlanner.generateModifyTemplateDiff.mockResolvedValue({
        error: "fail",
      });
      const { prepareModificationDiff } = await import(
        "../src/actions/instantiate/prepare-modification-diff"
      );

      const result = await withTestContainer(() =>
        prepareModificationDiff({} as any, {} as any, "id"),
      );

      expect(result).toEqual({ error: "fail" });
    });
  });

  describe("prepareInstantiationDiff", () => {
    it("delegates to diff service", async () => {
      const diffResult = { diff: "inst" };
      mockPlanner.generateNewTemplateDiff.mockResolvedValue({
        data: diffResult,
      });
      const project = { path: "proj" } as any;
      const settings = { value: 1 } as any;

      const { prepareInstantiationDiff } = await import(
        "../src/actions/instantiate/prepare-instantiation-diff"
      );

      const result = await withTestContainer(() =>
        prepareInstantiationDiff(
          "root",
          "template",
          "parent",
          project,
          settings,
        ),
      );

      expect(mockPlanner.generateNewTemplateDiff).toHaveBeenCalledWith(
        "template",
        "parent",
        settings,
        project,
      );
      expect(result).toEqual({ data: diffResult });
    });

    it("propagates errors from diff service", async () => {
      mockPlanner.generateNewTemplateDiff.mockResolvedValue({
        error: "missing",
      });
      const { prepareInstantiationDiff } = await import(
        "../src/actions/instantiate/prepare-instantiation-diff"
      );

      const result = await withTestContainer(() =>
        prepareInstantiationDiff("root", "template", "parent", {} as any, {} as any),
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

      const result = await withTestContainer(() =>
        generateNewProject(
          "project-name",
          "template-name",
          "/tmp",
          userSettings,
          options,
        ),
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

      const result = await withTestContainer(() =>
        generateNewProject("project-name", "template-name", "/tmp", {} as any),
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

      const originalProjectRepositoryName = "old-project";
      const project = {
        instantiatedProjectSettings: {
          projectRepositoryName: originalProjectRepositoryName,
          rootTemplateName: "root",
          instantiatedTemplates: [],
        },
      } as any;

      const result = await withTestContainer(() =>
        generateNewProjectFromExisting(
          project,
          "/dest",
          "new-project",
          { dryRun: true } as any,
        ),
      );

      const [newSettings, destinationPath, options] =
        mockGenerateProjectFromTemplateSettings.mock.calls[0];

      expect(newSettings).toEqual({
        projectRepositoryName: "new-project",
        rootTemplateName: "root",
        instantiatedTemplates: [],
      });
      expect(destinationPath).toContain("/dest");
      expect(options).toEqual({ dryRun: true });
      expect(project.instantiatedProjectSettings.projectRepositoryName).toBe(
        originalProjectRepositoryName,
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
          projectRepositoryName: "old",
          rootTemplateName: "root",
          instantiatedTemplates: [],
        },
      } as any;

      const result = await withTestContainer(() =>
        generateNewProjectFromExisting(project, "/dest", "new"),
      );

      expect(result).toEqual({ error: "boom" });
    });
  });

  describe("generateNewProjectFromSettings", () => {
    it("parses settings and delegates to facade", async () => {
      const creationResult = { projectPath: "generated" };
      mockProjectSettingsSchemaParse.mockReturnValue({
        projectRepositoryName: "old",
        rootTemplateName: "root",
        instantiatedTemplates: [],
      });
      mockGenerateProjectFromTemplateSettings.mockResolvedValue({
        data: creationResult,
      });

      const { generateNewProjectFromSettings } = await import(
        "../src/actions/instantiate/generate-new-project-from-settings"
      );

      const result = await withTestContainer(() =>
        generateNewProjectFromSettings(
          JSON.stringify({ any: "thing" }),
          "/dir",
          "project",
          { verbose: true } as any,
        ),
      );

      expect(mockProjectSettingsSchemaParse).toHaveBeenCalled();
      expect(mockGenerateProjectFromTemplateSettings).toHaveBeenCalledWith({
        projectRepositoryName: "project",
        rootTemplateName: "root",
        instantiatedTemplates: [],
      }, expect.any(String), { verbose: true });
      expect(result).toEqual({ data: creationResult });
    });

    it("returns parse error", async () => {
      mockProjectSettingsSchemaParse.mockImplementation(() => {
        throw new Error("invalid");
      });
      const { generateNewProjectFromSettings } = await import(
        "../src/actions/instantiate/generate-new-project-from-settings"
      );

      const result = await withTestContainer(() =>
        generateNewProjectFromSettings("{}", "/dir", "project"),
      );

      expect(result).toEqual({
        error: expect.stringContaining("Failed to parse project settings"),
      });
      expect(mockLogError).toHaveBeenCalled();
    });
  });

  describe("addAllAndDiff", () => {
    it("delegates to git service and returns parsed diff", async () => {
      const project = {
        absoluteRootDir: "/tmp/project",
      } as any;
      mockGitService.addAllAndRetrieveDiff.mockResolvedValue({ data: "diff" });
      mockGitService.parseGitDiff.mockReturnValue("parsed");

      const { addAllAndDiff } = await import(
        "../src/actions/instantiate/add-all-and-diff"
      );

      const result = await withTestContainer(() => addAllAndDiff(project));

      expect(mockGitService.addAllAndRetrieveDiff).toHaveBeenCalledWith(
        project.absoluteRootDir,
      );
      expect(mockGitService.parseGitDiff).toHaveBeenCalledWith("diff");
      expect(result).toEqual({ data: "parsed" });
    });

    it("propagates git errors", async () => {
      mockGitService.addAllAndRetrieveDiff.mockResolvedValue({ error: "fail" });
      const { addAllAndDiff } = await import(
        "../src/actions/instantiate/add-all-and-diff"
      );

      const result = await withTestContainer(() =>
        addAllAndDiff({ absoluteRootDir: "/tmp" } as any, "msg"),
      );

      expect(result).toEqual({ error: "fail" });
    });
  });

  describe("restoreAllChanges", () => {
    it("invokes git reset", async () => {
      mockGitService.resetAllChanges.mockResolvedValue({ data: undefined });
      const project = { absoluteRootDir: "/tmp" } as any;
      const { restoreAllChanges } = await import(
        "../src/actions/instantiate/restore-all-changes"
      );

      const result = await withTestContainer(() => restoreAllChanges(project));

      expect(mockGitService.resetAllChanges).toHaveBeenCalledWith(
        project.absoluteRootDir,
      );
      expect(result).toEqual({ data: undefined });
    });
  });

  describe("deleteProject", () => {
    it("removes repository via git service", async () => {
      mockGitService.deleteRepo.mockResolvedValue({ data: undefined });
      const project = { absoluteRootDir: "/tmp" } as any;
      const { deleteProject } = await import(
        "../src/actions/instantiate/delete-project"
      );

      const result = await withTestContainer(() => deleteProject(project));

      expect(mockGitService.deleteRepo).toHaveBeenCalledWith(
        project.absoluteRootDir,
      );
      expect(result).toEqual({ data: undefined });
    });
  });
});
