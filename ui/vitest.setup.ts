import { beforeEach } from "vitest";

/** React 19 `act()` reads this global; jsdom does not set it on its own. */
function markReactActEnvironment() {
  Object.defineProperty(globalThis, "IS_REACT_ACT_ENVIRONMENT", {
    configurable: true,
    writable: true,
    value: true,
  });
}

markReactActEnvironment();
beforeEach(markReactActEnvironment);
