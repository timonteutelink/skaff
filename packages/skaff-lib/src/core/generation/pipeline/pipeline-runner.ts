import type { Result } from "../../../lib/types";

export interface PipelineStage<TContext> {
  readonly name: string;
  run(context: TContext): Promise<Result<TContext>>;
}

/**
 * Utility for composing and rearranging pipeline stage sequences.
 *
 * Plugins can use the builder to inject, replace, or remove stages without
 * mutating the original definitions, ensuring custom pipelines remain
 * predictable and easy to reason about.
 */
export class PipelineBuilder<TContext> {
  private stages: PipelineStage<TContext>[];

  constructor(stages: PipelineStage<TContext>[]) {
    this.stages = [...stages];
  }

  public add(stage: PipelineStage<TContext>): this {
    this.stages.push(stage);
    return this;
  }

  public insertBefore(
    targetStageName: string,
    stage: PipelineStage<TContext>,
  ): this {
    const index = this.stages.findIndex((item) => item.name === targetStageName);
    if (index === -1) {
      this.stages.unshift(stage);
      return this;
    }

    this.stages.splice(index, 0, stage);
    return this;
  }

  public insertAfter(
    targetStageName: string,
    stage: PipelineStage<TContext>,
  ): this {
    const index = this.stages.findIndex((item) => item.name === targetStageName);
    if (index === -1) {
      this.stages.push(stage);
      return this;
    }

    this.stages.splice(index + 1, 0, stage);
    return this;
  }

  public replace(
    targetStageName: string,
    stage: PipelineStage<TContext>,
  ): this {
    const index = this.stages.findIndex((item) => item.name === targetStageName);
    if (index === -1) {
      this.stages.push(stage);
      return this;
    }

    this.stages.splice(index, 1, stage);
    return this;
  }

  public remove(targetStageName: string): this {
    this.stages = this.stages.filter((item) => item.name !== targetStageName);
    return this;
  }

  public build(): PipelineStage<TContext>[] {
    return [...this.stages];
  }
}

/**
 * Executes a sequence of pipeline stages while threading context between them.
 *
 * The runner enforces stage ordering and short-circuits on the first failure
 * so callers can rely on a single, linear control flow for template
 * generation.
 */
export class PipelineRunner<TContext> {
  constructor(private readonly stages: PipelineStage<TContext>[]) { }

  public async run(context: TContext): Promise<Result<TContext>> {
    let currentContext = context;

    for (const stage of this.stages) {
      const result = await stage.run(currentContext);
      if ("error" in result) {
        return result;
      }
      currentContext = result.data;
    }

    return { data: currentContext };
  }
}
