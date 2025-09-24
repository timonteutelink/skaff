import { FinalTemplateSettings } from "@timonteutelink/template-types-lib";
import { Result } from "../../lib/types";
import { Template } from "../../models/template";

export interface GenerationState {
  template: Template;
  finalSettings: FinalTemplateSettings;
  parentInstanceId?: string;
}

function noCurrentTemplateError(): Result<never> {
  return { error: "No template is currently being generated." };
}

export class GenerationContext {
  private readonly rootTemplate: Template;
  private currentState?: GenerationState;

  constructor(rootTemplate: Template) {
    this.rootTemplate = rootTemplate.findRootTemplate();
  }

  public getRootTemplate(): Template {
    return this.rootTemplate;
  }

  public setCurrentState(state: GenerationState): void {
    this.currentState = state;
  }

  public clearCurrentState(): void {
    this.currentState = undefined;
  }

  private requireState(): Result<GenerationState> {
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

  public getState(): Result<GenerationState> {
    return this.requireState();
  }
}
