import { spawn } from "node:child_process";
import { existsSync, mkdirSync, appendFileSync } from "node:fs";
import { resolve } from "node:path";
const root = resolve(import.meta.dirname, "..");
process.chdir(root);
mkdirSync(".local", { recursive: true });
const env = {
  ...process.env,
  PATH: `${root}/node_modules/node/bin:${root}/.local/bin:${process.env.PATH}`,
  HF_HOME: `${root}/.local/huggingface`,
};
const children = [];
function launch(command, args) {
  const p = spawn(command, args, {
    cwd: root,
    env,
    stdio: ["ignore", "pipe", "pipe"],
  });
  children.push(p);
  p.stdout.on("data", (b) => {
    process.stdout.write(b);
    appendFileSync(".local/services.log", b);
  });
  p.stderr.on("data", (b) => {
    process.stderr.write(b);
    appendFileSync(".local/services.log", b);
  });
  p.on("error", (e) => {
    console.error(e.message);
    stop();
  });
  return p;
}
async function ready(url, timeout = 120000) {
  const until = Date.now() + timeout;
  while (Date.now() < until) {
    try {
      const r = await fetch(url, { signal: AbortSignal.timeout(1000) });
      if (r.ok) return true;
    } catch {}
    await new Promise((r) => setTimeout(r, 500));
  }
  return false;
}
async function run(command, args) {
  const p = launch(command, args);
  await new Promise((r, j) =>
    p.on("exit", (code) =>
      code === 0 ? r() : j(Error(`${command} failed (${code})`)),
    ),
  );
}
function stop() {
  for (const p of children) p.kill("SIGTERM");
  setTimeout(() => process.exit(), 1000).unref();
}
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
try {
  const cli = resolve(".local/bin/spacetimedb-cli");
  if (!existsSync(cli))
    throw Error("Run npm run setup:local to install local dependencies.");
  if (!(await ready("http://127.0.0.1:4322/v1/ping", 1200)))
    launch(cli, [
      "--root-dir",
      `${root}/.local/spacetime`,
      "start",
      "--listen-addr",
      "127.0.0.1:4322",
    ]);
  if (!(await ready("http://127.0.0.1:4322/v1/ping", 30000)))
    throw Error("Local database did not start");
  await run(cli, [
    "--root-dir",
    `${root}/.local/spacetime`,
    "publish",
    "emergent-pier39",
    "--server",
    "http://127.0.0.1:4322",
    "--module-path",
    "engine/module",
    "--yes",
    "--no-config",
  ]);
  if (!(await ready("http://127.0.0.1:4318/health", 1200))) {
    if (existsSync(".venv/bin/python"))
      launch(".venv/bin/python", ["intelligence/local/server.py"]);
    else console.warn("Local model missing; run npm run setup:local.");
  }
  if (!(await ready("http://127.0.0.1:4321/api/health", 1200)))
    launch("node", ["--import", "tsx", "engine/src/server.ts"]);
  if (!(await ready("http://127.0.0.1:4321/api/health", 30000)))
    throw Error("Simulation engine did not start");
  if (!(await ready("http://127.0.0.1:4320", 1200)))
    launch("node", [
      "node_modules/vite/bin/vite.js",
      "--host",
      "127.0.0.1",
      "--port",
      "4320",
    ]);
  console.log(
    "\nPIER 39 workspace: http://127.0.0.1:4320/\nLocal AI may take a moment to load; its readiness is visible in the interface.",
  );
} catch (e) {
  console.error(e.message);
  stop();
  process.exitCode = 1;
}
