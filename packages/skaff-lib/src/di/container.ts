import { container as globalContainer } from "tsyringe";
import type { DependencyContainer } from "tsyringe";

import { registerDefaultServices } from "./register";

let rootContainer: DependencyContainer | null = null;

export function createDefaultContainer(): DependencyContainer {
  const child = globalContainer.createChildContainer();
  registerDefaultServices(child);
  return child;
}

export function setSkaffContainer(container: DependencyContainer): void {
  rootContainer = container;
}

export function getSkaffContainer(): DependencyContainer {
  if (!rootContainer) {
    rootContainer = createDefaultContainer();
  }

  return rootContainer;
}

export function peekSkaffContainer(): DependencyContainer | null {
  return rootContainer;
}

export function resetSkaffContainer(): void {
  rootContainer = null;
}
