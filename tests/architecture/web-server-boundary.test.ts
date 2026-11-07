import { readdirSync, readFileSync } from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";
import { describe, expect, it } from "vitest";

const root = resolve(import.meta.dirname, "../..");
const webDir = join(root, "web");
const serverDir = join(root, "server");

function sourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    if (e.name === "node_modules" || e.name === "dist") continue;
    const p = join(dir, e.name);
    if (e.isDirectory()) out.push(...sourceFiles(p));
    else if (/\.(ts|tsx|mts|cts|js|jsx|mjs|cjs|vue|svelte)$/.test(e.name)) out.push(p);
  }
  return out;
}

// import x from "a" | import "a" | export ... from "a" | import("a") | require("a")
const SPECIFIER =
  /(?:\bfrom\s*|\bimport\s*\(?\s*|\brequire\s*\(\s*)["']([^"']+)["']/g;

function offenders() {
  const found: string[] = [];
  for (const file of sourceFiles(webDir)) {
    const text = readFileSync(file, "utf8");
    for (const m of text.matchAll(SPECIFIER)) {
      const spec = m[1];
      const target = spec.startsWith(".") ? resolve(dirname(file), spec) : resolve(root, spec);
      const inServer = target === serverDir || target.startsWith(serverDir + sep);
      if (inServer) {
        found.push(`${relative(root, file)} imports "${spec}"`);
      }
    }
  }
  return found;
}

describe("architecture: web/ must not import from server/", () => {
  it("scans some web files (guard against a vacuous pass)", () => {
    expect(sourceFiles(webDir).length).toBeGreaterThan(0);
  });

  it("has no import from server/", () => {
    const bad = offenders();
    expect(bad, `Forbidden web -> server imports:\n  ${bad.join("\n  ")}`).toEqual([]);
  });
});
