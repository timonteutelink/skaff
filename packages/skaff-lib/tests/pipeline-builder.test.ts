import {
  PipelineBuilder,
  PipelineRunner,
  PipelineStage,
} from "../src/core/generation/pipeline/pipeline-runner";

type TraceContext = string[];

function stage(
  name: string,
  priority = 0,
  key: string = name,
): PipelineStage<TraceContext> {
  return {
    key,
    name,
    priority,
    async run(context) {
      return { data: [...context, name] };
    },
  };
}

describe("PipelineBuilder", () => {
  it("reorders pipelines without mutating the originals", async () => {
    const builder = new PipelineBuilder<TraceContext>([
      stage("first", 0),
      stage("third", 20),
    ]);

    builder.insertBefore("third", stage("second"));
    builder.insertAfter("third", stage("after-third"));
    builder.replace("first", stage("start", 0, "first"));
    builder.remove("after-third");

    const runner = new PipelineRunner(builder.build());
    const result = await runner.run([]);

    expect(result).toEqual({ data: ["start", "second", "third"] });
  });

  it("throws for missing anchors to keep ordering explicit", () => {
    const builder = new PipelineBuilder<TraceContext>([stage("base")]);

    expect(() => builder.insertBefore("missing", stage("before"))).toThrow(
      /not found when inserting before/,
    );
    expect(() => builder.insertAfter("missing", stage("after"))).toThrow(
      /not found when inserting after/,
    );
    expect(() => builder.replace("unknown", stage("replacement", 0, "unknown"))).toThrow(
      /Cannot replace missing stage/,
    );
  });
});
