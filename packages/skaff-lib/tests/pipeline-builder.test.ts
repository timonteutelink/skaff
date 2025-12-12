import {
  PipelineBuilder,
  PipelineRunner,
  PipelineStage,
} from "../src/core/generation/pipeline/pipeline-runner";

type TraceContext = string[];

function stage(name: string): PipelineStage<TraceContext> {
  return {
    name,
    async run(context) {
      return { data: [...context, name] };
    },
  };
}

describe("PipelineBuilder", () => {
  it("reorders pipelines without mutating the originals", async () => {
    const builder = new PipelineBuilder<TraceContext>([
      stage("first"),
      stage("third"),
    ]);

    builder.insertBefore("third", stage("second"));
    builder.insertAfter("third", stage("after-third"));
    builder.replace("first", stage("start"));
    builder.remove("after-third");

    const runner = new PipelineRunner(builder.build());
    const result = await runner.run([]);

    expect(result).toEqual({ data: ["start", "second", "third"] });
  });

  it("falls back to appending stages when anchors are missing", () => {
    const builder = new PipelineBuilder<TraceContext>([stage("base")]);

    builder.insertBefore("missing", stage("before"));
    builder.insertAfter("missing", stage("after"));
    builder.replace("unknown", stage("replacement"));

    expect(builder.build().map((item) => item.name)).toEqual([
      "before",
      "base",
      "after",
      "replacement",
    ]);
  });
});
