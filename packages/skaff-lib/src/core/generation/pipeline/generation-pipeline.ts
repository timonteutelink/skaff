import type { Result } from "../../../lib/types";

export interface TemplateGenerationStage<TContext> {
  readonly name: string;
  run(context: TContext): Promise<Result<TContext>>;
}

export class TemplateGenerationPipeline<TContext> {
  constructor(private readonly stages: TemplateGenerationStage<TContext>[]) { }

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
