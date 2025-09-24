import { Template } from "./Template";

export class TemplateRegistry {
  private rootTemplates: Template[] = [];
  private rootTemplatesByName: Map<string, Template[]> = new Map();

  public reset(): void {
    this.rootTemplates = [];
    this.rootTemplatesByName.clear();
  }

  public registerRoot(template: Template): void {
    this.rootTemplates.push(template);
    const name = template.config.templateConfig.name;
    const existing = this.rootTemplatesByName.get(name) ?? [];
    existing.push(template);
    this.rootTemplatesByName.set(name, existing);
  }

  public getAllRootTemplates(): Template[] {
    return [...this.rootTemplates];
  }

  public findRootTemplate(templateName: string): Template | null {
    const candidates = this.rootTemplatesByName.get(templateName);
    if (!candidates || !candidates.length) {
      return null;
    }

    const local = candidates.find((template) => template.isLocal);
    return local ?? candidates[0] ?? null;
  }

  public findAllRevisions(templateName: string): Template[] | null {
    const candidates = this.rootTemplatesByName.get(templateName);
    if (!candidates || !candidates.length) {
      return null;
    }
    return [...candidates];
  }
}
