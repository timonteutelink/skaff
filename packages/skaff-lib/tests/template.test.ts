import path from "node:path";

import z from "zod";

jest.mock("../src/core/infra/cache-service", () => ({
  CacheService: {
    getCacheDirPath: () => "/repo/cache",
  },
  resolveCacheService: () => ({
    getCacheDir: () => ({ data: "/repo/cache" }),
  }),
}));

jest.mock("../src/lib/logger", () => ({
  backendLogger: {
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
  },
}));

jest.mock("../src/core/generation/template-generator-service", () => ({
  TemplateGeneratorService: class {},
  resolveTemplateGeneratorService: () => ({
    createSession: () => ({
      addNewTemplate: () => ({ data: {} }),
      instantiateTemplateInProject: () => ({ data: { targetPath: "" } }),
      addNewProject: () => ({ data: {} }),
      instantiateNewProject: () => ({ data: "" }),
    }),
  }),
}));

jest.mock("../src/core/projects/ProjectCreationManager", () => ({
  resolveProjectCreationManager: () => ({
    parseCreationResult: async (path: string) => ({ data: path }),
  }),
}));

jest.mock("../src/core/infra/git-service", () => ({
  resolveGitService: () => ({
    isGitRepoClean: async () => ({ data: true }),
    getCommitHash: async () => ({ data: "" }),
  }),
}));

jest.mock("../src/models/project", () => ({
  Project: class {
    absoluteRootDir = "/repo";
    instantiatedProjectSettings = { instantiatedTemplates: [] };
  },
}));

import { Template } from "../src/core/templates/Template";
import type { GenericTemplateConfigModule } from "../src/lib/types";

describe("Template.mapToDTO", () => {
  const baseDir = "/repo/templates";

  function createConfig(
    schema: z.ZodObject<any>,
    name: string,
  ): GenericTemplateConfigModule {
    return {
      templateConfig: {
        name,
        author: "Test Author",
        specVersion: "1.0.0",
      },
      templateSettingsSchema: schema,
      templateFinalSettingsSchema: schema,
      mapFinalSettings: ({ templateSettings }) => templateSettings,
    } as GenericTemplateConfigModule;
  }

  function createTemplate(
    schema: z.ZodObject<any>,
    name: string,
  ): Template {
    return new Template({
      config: createConfig(schema, name),
      absoluteBaseDir: baseDir,
      absoluteDir: path.join(baseDir, name),
      absoluteFilesDir: path.join(baseDir, name, "files"),
    });
  }

    it("serializes the templateSettingsSchema via z.toJSONSchema", () => {
    const schema = z.object({ foo: z.string() });
    const template = createTemplate(schema, "root-template");

    const dto = template.mapToDTO();

    expect(dto.config.templateSettingsSchema).toEqual(
      z.toJSONSchema(schema),
    );
  });

    it("serializes nested template schemas independently", () => {
    const rootSchema = z.object({ foo: z.string() });
    const childSchema = z.object({ bar: z.number() });

    const rootTemplate = createTemplate(rootSchema, "root-template");
    const childTemplate = createTemplate(childSchema, "child-template");
    childTemplate.parentTemplate = rootTemplate;

    rootTemplate.subTemplates.group = [childTemplate];

    const dto = rootTemplate.mapToDTO();

    expect(dto.subTemplates.group[0]?.config.templateSettingsSchema).toEqual(
      z.toJSONSchema(childSchema),
    );
    expect(dto.config.templateSettingsSchema).toEqual(
      z.toJSONSchema(rootSchema),
    );
  });
});
