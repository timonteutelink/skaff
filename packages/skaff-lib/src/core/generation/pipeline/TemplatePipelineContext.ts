import { FinalTemplateSettings } from "@timonteutelink/template-types-lib";

import { Result } from "../../../lib/types";
import { Template } from "../../../models/template";

export interface TemplatePipelineState {
  template: Template;
  finalSettings: FinalTemplateSettings;
  parentInstanceId?: string;
}

function noCurrentTemplateError(): Result<never> {
  return { error: "No template is currently being generated." };
}

/**
 * Tracks which template is currently being processed by the generation pipeline.
 *
 * The template generator is a multi-stage pipeline that renders files, runs
 * side-effects, and updates project settings. This context object keeps the
 * active template, its resolved settings, and the relationship to its parent so
 * downstream stages (rendering, side effects, path resolution) can make
 * consistent decisions without re-parsing input.
 */
export class TemplatePipelineContext {
  private readonly rootTemplate: Template;
  private currentState?: TemplatePipelineState;

  constructor(rootTemplate: Template) {
    this.rootTemplate = rootTemplate.findRootTemplate();
  }

  public getRootTemplate(): Template {
    return this.rootTemplate;
  }

  public setCurrentState(state: TemplatePipelineState): void {
    this.currentState = state;
  }

  public clearCurrentState(): void {
    this.currentState = undefined;
  }

  private requireState(): Result<TemplatePipelineState> {
    if (!this.currentState) {
      return noCurrentTemplateError();
    }

    return { data: this.currentState };
  }

  public getCurrentTemplate(): Result<Template> {
    const stateResult = this.requireState();

    if ("error" in stateResult) {
      return stateResult;
    }

    return { data: stateResult.data.template };
  }

  public getFinalSettings(): Result<FinalTemplateSettings> {
    const stateResult = this.requireState();

    if ("error" in stateResult) {
      return stateResult;
    }

    return { data: stateResult.data.finalSettings };
  }

  public getParentInstanceId(): Result<string | undefined> {
    const stateResult = this.requireState();

    if ("error" in stateResult) {
      return stateResult;
    }

    return { data: stateResult.data.parentInstanceId };
  }

  public getState(): Result<TemplatePipelineState> {
    return this.requireState();
  }
}
