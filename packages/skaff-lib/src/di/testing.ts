import type { DependencyContainer } from "tsyringe";

import {
  createDefaultContainer,
  peekSkaffContainer,
  resetSkaffContainer,
  setSkaffContainer,
} from "./container";

export function createTestContainer(
  registerOverrides?: (container: DependencyContainer) => void,
): DependencyContainer {
  const testContainer = createDefaultContainer();
  registerOverrides?.(testContainer);
  return testContainer;
}

export function withTestContainer<T>(
  run: (container: DependencyContainer) => T,
  registerOverrides?: (container: DependencyContainer) => void,
): T {
  const previousContainer = peekSkaffContainer();
  const testContainer = createTestContainer(registerOverrides);
  setSkaffContainer(testContainer);

  try {
    return run(testContainer);
  } finally {
    if (previousContainer) {
      setSkaffContainer(previousContainer);
    } else {
      resetSkaffContainer();
    }
  }
}
