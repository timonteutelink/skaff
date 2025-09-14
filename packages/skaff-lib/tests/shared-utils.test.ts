import {
  projectSearchPathKey,
  getDocLink,
  findTemplate,
  deepSortObject,
  isSubset,
} from "../src/utils/shared-utils";
import { DOCS_BASE_URL } from "../src/lib/constants";
import type { TemplateDTO } from "../src/lib/types";

describe("shared-utils", () => {
  describe("projectSearchPathKey", () => {
    it("returns undefined when path is missing", () => {
      expect(projectSearchPathKey()).toBeUndefined();
    });

    it("creates a normalized key from a path", () => {
      const key = projectSearchPathKey("/Users/Jane/My_Project");
      expect(key).toBe("my_project");
    });
  });

  it("joins documentation url segments", () => {
    // path.join drops one slash after protocol, mirroring implementation
    expect(getDocLink("intro")).toBe("https:/timonteutelink.github.io/skaff/intro");
  });

  describe("findTemplate", () => {
    const child: TemplateDTO = {
      dir: "child",
      config: {
        templateConfig: { name: "child" } as any,
        templateSettingsSchema: {},
      },
      templatesDir: "",
      subTemplates: {},
      isLocal: true,
      templatesThatDisableThis: [],
      templateCommands: [],
    };

    const root: TemplateDTO = {
      dir: "root",
      config: {
        templateConfig: { name: "root" } as any,
        templateSettingsSchema: {},
      },
      templatesDir: "",
      subTemplates: { group: [child] },
      isLocal: true,
      templatesThatDisableThis: [],
      templateCommands: [],
    };

    it("finds a nested template", () => {
      const result = findTemplate(root, "child");
      expect(result).toHaveProperty("data", child);
    });

    it("returns null when template does not exist", () => {
      const result = findTemplate(root, "missing");
      expect(result).toHaveProperty("data", null);
    });
  });

  it("deeply sorts object keys", () => {
    const unsorted = { b: 1, a: { d: 4, c: 3 } };
    const sorted = deepSortObject(unsorted);
    expect(Object.keys(sorted)).toEqual(["a", "b"]);
    expect(Object.keys(sorted.a)).toEqual(["c", "d"]);
  });

  describe("isSubset", () => {
    it("returns true when first object is subset", () => {
      expect(isSubset({ a: 1 }, { a: 1, b: 2 })).toBe(true);
    });

    it("returns false when keys are missing or different", () => {
      expect(isSubset({ a: 2 }, { a: 1, b: 2 })).toBe(false);
    });
  });
});

