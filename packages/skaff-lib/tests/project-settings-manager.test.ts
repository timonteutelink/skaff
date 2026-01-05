import * as fs from "node:fs/promises";
import path from "node:path";
import { z } from "zod";

import type { TemplateParentReference } from "@timonteutelink/template-types-lib";

import type { Template } from "../src/core/templates/Template";
import { createTestContainer } from "../src/di/testing";
import { RootTemplateRepositoryToken } from "../src/di/tokens";
import {
  peekSkaffContainer,
  resetSkaffContainer,
  setSkaffContainer,
} from "../src/di/container";
import { backendLogger } from "../src/lib/logger";
import { createTempDir } from "./lib";

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
  let ProjectSettingsManager: typeof import("../src/core/projects/ProjectSettingsManager").ProjectSettingsManager;

  beforeEach(() => {
    jest.resetAllMocks();
    jest
      .spyOn(backendLogger, "warn")
      .mockImplementation(() => backendLogger);
    jest
      .spyOn(backendLogger, "info")
      .mockImplementation(() => backendLogger);
    jest
      .spyOn(backendLogger, "error")
      .mockImplementation(() => backendLogger);
    ProjectSettingsManager =
      require("../src/core/projects/ProjectSettingsManager").ProjectSettingsManager;
  });

  afterEach(() => {
    jest.restoreAllMocks();
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

    const addRemoteRepo = jest
      .fn()
      .mockResolvedValue({ data: { alreadyExisted: false } });

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

    const templateSettings = {
      projectRepositoryName: "demo",
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

    const { root } = await createTempDir("skaff-project-settings-");
    const projectDir = path.join(root, "project");
    await fs.mkdir(projectDir, { recursive: true });
    await fs.writeFile(
      path.join(projectDir, "templateSettings.json"),
      JSON.stringify(templateSettings),
      "utf-8",
    );

    const previousContainer = peekSkaffContainer();
    const testContainer = createTestContainer((container) => {
      container.registerInstance(RootTemplateRepositoryToken, {
        addRemoteRepo,
        loadRevision,
        findTemplate,
        attachDetachedChild,
      });
    });
    setSkaffContainer(testContainer);

    let result: Awaited<ReturnType<ProjectSettingsManager["load"]>>;
    try {
      const manager = new ProjectSettingsManager(projectDir);
      result = await manager.load();
    } finally {
      if (previousContainer) {
        setSkaffContainer(previousContainer);
      } else {
        resetSkaffContainer();
      }
    }

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
