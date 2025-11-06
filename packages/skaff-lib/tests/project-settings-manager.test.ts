import { z } from "zod";

import type { TemplateParentReference } from "@timonteutelink/template-types-lib";

import type { Template } from "../src/core/templates/Template";
import { ProjectSettingsManager } from "../src/core/projects/ProjectSettingsManager";

jest.mock("../src/lib/logger", () => ({
  backendLogger: { warn: jest.fn(), info: jest.fn(), error: jest.fn() },
}));

jest.mock("../src/repositories", () => ({
  resolveRootTemplateRepository: jest.fn(),
}));

jest.mock("node:fs/promises", () => ({
  readFile: jest.fn(),
  writeFile: jest.fn(),
  access: jest.fn(),
  readdir: jest.fn(),
  stat: jest.fn(),
}));

const readFileMock = (jest.requireMock(
  "node:fs/promises",
) as typeof import("node:fs/promises")).readFile as jest.Mock;

const resolveRootTemplateRepository = jest.requireMock(
  "../src/repositories",
).resolveRootTemplateRepository as jest.Mock;

interface TemplateStubInit {
  name: string;
  repoUrl?: string;
  branch?: string;
  commitHash?: string;
  possibleParentTemplates?: TemplateParentReference[];
}

class TemplateStub {
  public config: Template["config"];
  public subTemplates: Template["subTemplates"] = {};
  public parentTemplate?: Template;
  public repoUrl?: string;
  public branch?: string;
  public commitHash?: string;
  public possibleParentTemplates: TemplateParentReference[];

  constructor(init: TemplateStubInit) {
    this.config = {
      templateConfig: { name: init.name } as Template["config"]["templateConfig"],
      templateSettingsSchema: z.object({}).passthrough(),
      templateFinalSettingsSchema: z.object({}).passthrough(),
    } as Template["config"];
    this.repoUrl = init.repoUrl;
    this.branch = init.branch;
    this.commitHash = init.commitHash;
    this.possibleParentTemplates = init.possibleParentTemplates ?? [];
  }

  public findSubTemplate(templateName: string): Template | null {
    if (this.config.templateConfig.name === templateName) {
      return this as unknown as Template;
    }
    for (const group of Object.values(this.subTemplates)) {
      for (const child of group) {
        const match = (child as TemplateStub).findSubTemplate(templateName);
        if (match) {
          return match;
        }
      }
    }
    return null;
  }
}

describe("ProjectSettingsManager.load", () => {
  beforeEach(() => {
    jest.resetAllMocks();
  });

  it("attaches detached child templates and fills repo metadata", async () => {
    const rootTemplate = new TemplateStub({
      name: "root",
      repoUrl: "https://example.com/root.git",
      branch: "main",
      commitHash: "root-hash",
    });

    const childTemplate = new TemplateStub({
      name: "child",
      repoUrl: "https://example.com/child.git",
      branch: "develop",
      commitHash: "child-hash",
      possibleParentTemplates: [{ templateName: "root" }],
    });

    const addRemoteRepo = jest.fn().mockResolvedValue({ data: undefined });

    const loadRevision = jest.fn(
      async (templateName: string): Promise<{ data: Template | null }> => ({
        data:
          templateName === "child"
            ? (childTemplate as unknown as Template)
            : (rootTemplate as unknown as Template),
      }),
    );

    const findTemplate = jest.fn().mockResolvedValue({
      data: childTemplate as unknown as Template,
    });

    const attachDetachedChild = jest.fn(
      (parent: Template, child: Template) => {
        const key = child.config.templateConfig.name;
        const existing = parent.subTemplates[key] ?? [];
        parent.subTemplates[key] = [...existing, child];
        child.parentTemplate = parent;
      },
    );

    resolveRootTemplateRepository.mockReturnValue({
      addRemoteRepo,
      loadRevision,
      findTemplate,
      attachDetachedChild,
    });

    const templateSettings = {
      projectRepositoryName: "demo",
      projectName: "demo",
      projectAuthor: "me",
      rootTemplateName: "root",
      instantiatedTemplates: [
        {
          id: "root-instance",
          templateName: "root",
          templateSettings: {},
          templateCommitHash: "root-hash",
          templateRepoUrl: "https://example.com/root.git",
          templateBranch: "main",
        },
        {
          id: "child-instance",
          parentId: "root-instance",
          templateName: "child",
          templateSettings: {},
          templateCommitHash: "child-hash",
          templateRepoUrl: "https://example.com/child.git",
          templateBranch: "develop",
        },
      ],
    } satisfies Parameters<ProjectSettingsManager["writeSettings"]>[0];

    readFileMock.mockResolvedValue(JSON.stringify(templateSettings));

    const manager = new ProjectSettingsManager("/tmp/project");
    const result = await manager.load();

    expect(result).toHaveProperty("data");

    if (!("data" in result)) {
      throw new Error("Expected successful load result");
    }

    const childSettings = result.data.settings.instantiatedTemplates[1]!;
    expect(childSettings.templateRepoUrl).toBe(childTemplate.repoUrl);
    expect(childSettings.templateBranch).toBe(childTemplate.branch);
    expect(childSettings.templateCommitHash).toBe(childTemplate.commitHash);

    expect(addRemoteRepo).toHaveBeenCalledWith(
      "https://example.com/root.git",
      "main",
    );
    expect(addRemoteRepo).toHaveBeenCalledWith(
      "https://example.com/child.git",
      "develop",
    );
    expect(attachDetachedChild).toHaveBeenCalledWith(
      rootTemplate,
      childTemplate,
    );
  });
});
