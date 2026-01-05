import { afterEach } from "@jest/globals";

const activeCleanups = new Set<() => Promise<void>>();
let cleanupInitialized = false;

export function initializeTestCleanup(): void {
  if (cleanupInitialized) {
    return;
  }
  cleanupInitialized = true;

  afterEach(async () => {
    const cleanups = Array.from(activeCleanups).reverse();
    activeCleanups.clear();
    for (const cleanup of cleanups) {
      await cleanup();
    }
  });
}

export function registerCleanup(fn: () => Promise<void>): () => Promise<void> {
  let active = true;
  const wrapped = async () => {
    if (!active) {
      return;
    }
    active = false;
    await fn();
  };
  activeCleanups.add(wrapped);
  return wrapped;
}
