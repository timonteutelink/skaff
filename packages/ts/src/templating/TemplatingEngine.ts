import { TemplateOption } from '../models/template-models';

export function renderTemplate(content: string, context: Record<string, any>): string {
  // Replace occurrences of {{key}} with the corresponding context value.
  return content.replace(/{{\s*(\w+)\s*}}/g, (_, key) => {
    return context[key] !== undefined ? String(context[key]) : '';
  });
}

export function validateContext(
  context: Record<string, any>,
  inputs?: Record<string, TemplateOption>
): void {
  if (!inputs) return;
  for (const key in inputs) {
    if (!(key in context)) {
      throw new Error(`Missing required input: ${key}`);
    }
  }
}

