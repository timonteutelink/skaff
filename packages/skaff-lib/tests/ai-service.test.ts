import type { AiAutoAgent } from "@timonteutelink/template-types-lib";

jest.mock(
  "ai",
  () => ({
    generateText: jest.fn(async () => ({ text: "" })),
  }),
  { virtual: true },
);

jest.mock(
  "@inquirer/prompts",
  () => ({
    confirm: jest.fn(),
    input: jest.fn(),
  }),
  { virtual: true },
);

jest.mock("../src/services/ai-model-service", () => ({
  resolveLanguageModel: jest.fn(),
  resolveModelChoice: jest.fn(() => undefined),
}));

import { generateAiResults } from "../src/services/ai-service";
import type { Template } from "../src/models/template";

describe("executeSteps", () => {
  it("ignores unrelated aiResults keys when determining completion", async () => {
    const runStep = jest.fn(async () => "generated value");

    const template = {
      config: {
        aiGeneration: {
          steps: [
            {
              type: "auto",
              resultKey: "generated",
              run: runStep,
            },
          ],
        },
        buildAutoAgent: async () =>
          ({
            run: async () => "unused",
          } satisfies AiAutoAgent),
      },
    } as unknown as Template;

    const result = await generateAiResults(
      template,
      { aiResults: { unrelated: "seed" } } as any,
      undefined,
      process.cwd(),
    );

    expect(runStep).toHaveBeenCalledTimes(1);
    if ("error" in result) {
      throw new Error(result.error);
    }

    expect(result.data.generated).toBe("generated value");
    expect(result.data.unrelated).toBe("seed");
  });
});
