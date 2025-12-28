/**
 * React stub for plugin sandboxing in the web environment.
 *
 * Plugins that ship UI stages can import React when they are evaluated in the
 * sandbox. This stub keeps the code loading while preventing any real DOM or
 * browser access.
 */
export const REACT_SANDBOX_STUB = Object.freeze({
  // Return null (frozen primitive) instead of creating elements
  createElement: Object.freeze(() => null),

  // Use a frozen symbol
  Fragment: Object.freeze(Symbol.for("react.fragment")),

  // Return frozen tuple with no-op setter
  useState: Object.freeze(() => Object.freeze([null, Object.freeze(() => {})])),

  // No-op effect
  useEffect: Object.freeze(() => {}),

  // Return the callback as-is (it's already from sandboxed code)
  useCallback: Object.freeze((fn: unknown) => fn),

  // Execute and return result (no memoization in stub)
  useMemo: Object.freeze((fn: () => unknown) =>
    typeof fn === "function" ? fn() : null,
  ),

  // Return frozen ref object
  useRef: Object.freeze(() => Object.freeze({ current: null })),

  // Additional commonly used hooks as no-ops
  useContext: Object.freeze(() => null),
  useReducer: Object.freeze(() =>
    Object.freeze([null, Object.freeze(() => {})]),
  ),
  useLayoutEffect: Object.freeze(() => {}),
  useImperativeHandle: Object.freeze(() => {}),
  useDebugValue: Object.freeze(() => {}),
  useDeferredValue: Object.freeze((value: unknown) => value),
  useTransition: Object.freeze(() =>
    Object.freeze([false, Object.freeze(() => {})]),
  ),
  useId: Object.freeze(() => "sandbox-id"),
  useSyncExternalStore: Object.freeze(() => null),
  useInsertionEffect: Object.freeze(() => {}),
});

export const REACT_JSX_RUNTIME_SANDBOX_STUB = Object.freeze({
  Fragment: "sandbox-fragment",
  jsx: Object.freeze(() => null),
  jsxs: Object.freeze(() => null),
});
