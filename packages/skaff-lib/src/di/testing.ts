import type { ServiceContainer } from "./container";

import {
  createDefaultContainer,
  peekSkaffContainer,
  resetSkaffContainer,
  setSkaffContainer,
} from "./container";

/**
 * Creates a fresh test container with all default services registered.
 * Optionally applies overrides for mocking dependencies.
 */
export function createTestContainer(
  registerOverrides?: (container: ServiceContainer) => void,
): ServiceContainer {
  const testContainer = createDefaultContainer();
  registerOverrides?.(testContainer);
  return testContainer;
}

/**
 * Runs a function with an isolated test container, restoring the original
 * container state after the function completes (even if it throws).
 */
export function withTestContainer<T>(
  run: (container: ServiceContainer) => T,
  registerOverrides?: (container: ServiceContainer) => void,
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
