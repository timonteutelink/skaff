/**
 * Simple Dependency Injection Container
 *
 * This is a lightweight DI container that replaces tsyringe to enable
 * compatibility with SES (Secure ECMAScript) lockdown. tsyringe requires
 * reflect-metadata which conflicts with SES's intrinsic freezing.
 *
 * Features:
 * - Factory-based registration (no decorators needed)
 * - Lazy singleton instantiation
 * - Child containers for testing isolation
 * - Type-safe token-based resolution
 */

/**
 * A typed injection token for service resolution.
 */
export type InjectionToken<T> = symbol & { __type?: T };

/**
 * Factory function that creates a service instance.
 * Receives the container for resolving dependencies.
 */
export type ServiceFactory<T> = (container: ServiceContainer) => T;

/**
 * Registration entry in the container.
 */
interface Registration<T> {
  factory: ServiceFactory<T>;
  instance?: T;
}

/**
 * Simple service container with lazy singleton semantics.
 */
export class ServiceContainer {
  private registrations = new Map<symbol, Registration<unknown>>();
  private parent: ServiceContainer | null = null;

  /**
   * Creates a new container, optionally with a parent for hierarchical resolution.
   */
  constructor(parent?: ServiceContainer) {
    this.parent = parent ?? null;
  }

  /**
   * Registers a service factory for the given token.
   * The factory will be called lazily on first resolve.
   */
  register<T>(token: InjectionToken<T>, factory: ServiceFactory<T>): void {
    this.registrations.set(token, {
      factory: factory as ServiceFactory<unknown>,
    });
  }

  /**
   * Registers a pre-created instance for the given token.
   */
  registerInstance<T>(token: InjectionToken<T>, instance: T): void {
    this.registrations.set(token, {
      factory: () => instance,
      instance,
    });
  }

  /**
   * Resolves a service by token. Creates the instance if not yet created.
   * Throws if the token is not registered.
   */
  resolve<T>(token: InjectionToken<T>): T {
    const registration = this.registrations.get(token) as
      | Registration<T>
      | undefined;

    if (registration) {
      if (registration.instance === undefined) {
        registration.instance = registration.factory(this);
      }
      return registration.instance;
    }

    // Check parent container
    if (this.parent) {
      return this.parent.resolve(token);
    }

    const tokenName = token.description ?? token.toString();
    throw new Error(`No registration found for token: ${tokenName}`);
  }

  /**
   * Checks if a token is registered in this container or its parent.
   */
  has(token: symbol): boolean {
    if (this.registrations.has(token)) {
      return true;
    }
    return this.parent?.has(token) ?? false;
  }

  /**
   * Creates a child container that inherits registrations from this container.
   * Registrations in the child override parent registrations.
   */
  createChild(): ServiceContainer {
    return new ServiceContainer(this);
  }

  /**
   * Clears all registrations and cached instances.
   */
  clear(): void {
    this.registrations.clear();
  }
}

// --- Global Container Management ---

let rootContainer: ServiceContainer | null = null;

/**
 * Creates a new container with all default services registered.
 */
export function createDefaultContainer(): ServiceContainer {
  // Import here to avoid circular dependency issues
  const { registerDefaultServices } = require("./register");
  const container = new ServiceContainer();
  registerDefaultServices(container);
  return container;
}

/**
 * Sets the global skaff container instance.
 */
export function setSkaffContainer(container: ServiceContainer): void {
  rootContainer = container;
}

/**
 * Gets the global skaff container, creating it if necessary.
 */
export function getSkaffContainer(): ServiceContainer {
  if (!rootContainer) {
    rootContainer = createDefaultContainer();
  }
  return rootContainer;
}

/**
 * Returns the current container without creating one if it doesn't exist.
 */
export function peekSkaffContainer(): ServiceContainer | null {
  return rootContainer;
}

/**
 * Resets the global container to null.
 */
export function resetSkaffContainer(): void {
  rootContainer = null;
}
