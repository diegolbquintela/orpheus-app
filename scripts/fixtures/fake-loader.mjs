// Test-only loader: `import ... from "playwright"` gets fake-playwright.mjs (records, never launches a browser).
export async function resolve(specifier, context, next) {
  if (specifier === "playwright") return { url: new URL("./fake-playwright.mjs", import.meta.url).href, shortCircuit: true };
  return next(specifier, context);
}
