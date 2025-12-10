import type { Result } from "../../../lib/types";

export interface PipelineStage<TContext> {
  readonly name: string;
  run(context: TContext): Promise<Result<TContext>>;
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
