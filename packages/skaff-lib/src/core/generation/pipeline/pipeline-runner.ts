import type { Result } from "../../../lib/types";

export type PipelinePhase = "setup" | "configure" | "run" | "finalize" | "after";

export const DEFAULT_PIPELINE_PHASE_ORDER: PipelinePhase[] = [
  "setup",
  "configure",
  "run",
  "finalize",
  "after",
];

export interface PipelineStage<TContext> {
  readonly key: string;
  readonly name: string;
  readonly phase?: PipelinePhase;
  readonly priority?: number;
  readonly source?: string;
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
  private stages: Map<string, PipelineStage<TContext>>;
  private readonly phaseOrder: PipelinePhase[];

  constructor(stages: PipelineStage<TContext>[], phaseOrder = DEFAULT_PIPELINE_PHASE_ORDER) {
    this.stages = new Map();
    this.phaseOrder = phaseOrder;
    for (const stage of stages) {
      this.registerStage(stage);
    }
  }

  private registerStage(stage: PipelineStage<TContext>): this {
    if (this.stages.has(stage.key)) {
      throw new Error(`Pipeline already contains a stage with key ${stage.key}`);
    }

    const withDefaults = Object.assign(stage, {
      priority: stage.priority ?? 0,
      phase: stage.phase ?? "run",
    });
    this.stages.set(stage.key, withDefaults);
    return this;
  }

  public add(stage: PipelineStage<TContext>): this {
    return this.registerStage(stage);
  }

  public insertBefore(
    targetStageKey: string,
    stage: PipelineStage<TContext>,
  ): this {
    const target = this.stages.get(targetStageKey);
    if (!target) {
      throw new Error(`Stage ${targetStageKey} not found when inserting before`);
    }
    return this.registerStage({
      ...stage,
      priority: (target.priority ?? 0) - 1,
      phase: stage.phase ?? target.phase,
    });
  }

  public insertAfter(
    targetStageKey: string,
    stage: PipelineStage<TContext>,
  ): this {
    const target = this.stages.get(targetStageKey);
    if (!target) {
      throw new Error(`Stage ${targetStageKey} not found when inserting after`);
    }
    return this.registerStage({
      ...stage,
      priority: (target.priority ?? 0) + 1,
      phase: stage.phase ?? target.phase,
    });
  }

  public replace(
    targetStageKey: string,
    stage: PipelineStage<TContext>,
  ): this {
    if (stage.key !== targetStageKey) {
      throw new Error(`Replacement stage key ${stage.key} must match target ${targetStageKey}`);
    }
    if (!this.stages.has(targetStageKey)) {
      throw new Error(`Cannot replace missing stage ${targetStageKey}`);
    }
    const withDefaults = Object.assign(stage, {
      priority: stage.priority ?? 0,
      phase: stage.phase ?? "run",
    });
    this.stages.set(targetStageKey, withDefaults);
    return this;
  }

  public remove(targetStageKey: string): this {
    this.stages.delete(targetStageKey);
    return this;
  }

  public build(): PipelineStage<TContext>[] {
    const phases = new Map(this.phaseOrder.map((phase, index) => [phase, index] as const));
    return Array.from(this.stages.values()).sort((a, b) => {
      const phaseScoreA = phases.get(a.phase ?? "run") ?? this.phaseOrder.length;
      const phaseScoreB = phases.get(b.phase ?? "run") ?? this.phaseOrder.length;
      if (phaseScoreA !== phaseScoreB) return phaseScoreA - phaseScoreB;

      const priorityA = a.priority ?? 0;
      const priorityB = b.priority ?? 0;
      if (priorityA !== priorityB) return priorityA - priorityB;

      return a.key.localeCompare(b.key);
    });
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
