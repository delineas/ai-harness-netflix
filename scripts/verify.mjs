// npm run verify: typecheck -> unit tests -> web tests -> build -> e2e.
// Stops at the first failing stage. Test stages also fail if zero tests ran
// or if any test was skipped/todo.
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const tmp = mkdtempSync(join(tmpdir(), "verify-"));
process.on("exit", () => rmSync(tmp, { recursive: true, force: true }));

const run = (cmd, args) =>
  spawnSync(cmd, args, { stdio: "inherit", shell: false }).status === 0;

const plain = (name, script) => ({
  name,
  run: () => run("npm", ["run", "--silent", script]),
});

// Runs vitest with the JSON reporter on top of the normal one and audits the counts.
const vitest = (name, args) => ({
  name,
  run: () => {
    const out = join(tmp, `${name.replace(/\W+/g, "-")}.json`);
    const ok = run("npx", [
      "vitest", "run", ...args,
      "--reporter=default", "--reporter=json", `--outputFile.json=${out}`,
    ]);
    if (!ok) return false;
    let r;
    try {
      r = JSON.parse(readFileSync(out, "utf8"));
    } catch {
      console.error(`verify: no vitest report produced for "${name}"`);
      return false;
    }
    const skipped = (r.numPendingTests ?? 0) + (r.numTodoTests ?? 0);
    if (!r.numTotalTests) {
      console.error(`verify: "${name}" ran 0 tests`);
      return false;
    }
    if (skipped > 0) {
      console.error(`verify: "${name}" has ${skipped} skipped/todo test(s)`);
      return false;
    }
    console.log(`verify: "${name}" ${r.numPassedTests}/${r.numTotalTests} passed, 0 skipped`);
    return true;
  },
});

// Same audit for Playwright (JSON report stats).
const playwright = (name) => ({
  name,
  run: () => {
    const out = join(tmp, "e2e.json");
    const ok =
      spawnSync("npx", ["playwright", "test", "--reporter=list,json"], {
        stdio: "inherit",
        env: { ...process.env, PLAYWRIGHT_JSON_OUTPUT_FILE: out },
      }).status === 0;
    if (!ok) return false;
    let st;
    try {
      st = JSON.parse(readFileSync(out, "utf8")).stats;
    } catch {
      console.error(`verify: no Playwright report produced for "${name}"`);
      return false;
    }
    const total = st.expected + st.unexpected + st.flaky + st.skipped;
    if (!total) {
      console.error(`verify: "${name}" ran 0 tests`);
      return false;
    }
    if (st.skipped > 0 || st.flaky > 0) {
      console.error(`verify: "${name}" has ${st.skipped} skipped / ${st.flaky} flaky test(s)`);
      return false;
    }
    console.log(`verify: "${name}" ${st.expected}/${total} passed, 0 skipped`);
    return true;
  },
});

const stages = [
  plain("typecheck", "typecheck"),
  vitest("unit tests", []),
  vitest("web tests", ["tests/web"]),
  plain("build", "build"),
  playwright("e2e tests"),
];

for (const stage of stages) {
  if (stage.enabled === false) {
    console.log(`\nverify: [skip] ${stage.name} (not configured yet)`);
    continue;
  }
  console.log(`\nverify: [run] ${stage.name}`);
  if (!stage.run()) {
    console.error(`\nverify: FAILED at "${stage.name}"`);
    process.exit(1);
  }
}
console.log("\nverify: OK");
