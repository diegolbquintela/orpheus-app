// jsdom globals for the click-level component tests (*.dom.test.tsx, run by scripts/run-dom-tests.mjs).
// Imported first by each DOM test so React DOM sees a browser-like environment when it loads.
import { JSDOM } from "jsdom";

const dom = new JSDOM("<!doctype html><html><body></body></html>", { url: "http://localhost/dashboard", pretendToBeVisual: true });
const g = globalThis as Record<string, unknown>;
for (const key of ["window", "document", "navigator", "HTMLElement", "HTMLButtonElement", "Node", "Event", "MouseEvent", "getComputedStyle", "requestAnimationFrame", "cancelAnimationFrame"])
  if (!(key in g) || key === "window" || key === "document") g[key] = (dom.window as unknown as Record<string, unknown>)[key];
Object.defineProperty(g, "navigator", { value: dom.window.navigator, configurable: true });
g.ResizeObserver = class {
  observe() {}
  unobserve() {}
  disconnect() {}
};
g.IS_REACT_ACT_ENVIRONMENT = true;
export { dom };
