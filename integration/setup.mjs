import { execFileSync } from "node:child_process";
import { mkdirSync, existsSync } from "node:fs";
import { resolve } from "node:path";
const root = resolve(import.meta.dirname, "..");
process.chdir(root);
if (process.platform !== "darwin" || process.arch !== "arm64")
  throw Error("The included Laya setup targets Apple Silicon macOS.");
mkdirSync(".local/bin", { recursive: true });
mkdirSync("work", { recursive: true });
const run = (cmd, args, env = {}) =>
  execFileSync(cmd, args, {
    stdio: "inherit",
    env: { ...process.env, ...env },
  });
if (!existsSync(".local/bin/spacetimedb-cli")) {
  run("curl", [
    "-Lf",
    "https://spacetimedb-client-binaries.s3.amazonaws.com/refs/tags/v2.10.2/spacetime-aarch64-apple-darwin.tar.gz",
    "-o",
    "work/spacetime.tar.gz",
  ]);
  run("tar", ["-xzf", "work/spacetime.tar.gz", "-C", ".local/bin"]);
}
if (!existsSync(".local/bin/uv")) {
  run("curl", [
    "-LsSf",
    "https://astral.sh/uv/install.sh",
    "-o",
    "work/install-uv.sh",
  ]);
  run("sh", ["work/install-uv.sh"], {
    UV_INSTALL_DIR: `${root}/.local/bin`,
    UV_NO_MODIFY_PATH: "1",
  });
}
if (!existsSync(".venv/bin/python"))
  run(".local/bin/uv", ["venv", "--python", "3.12", ".venv"]);
run(".local/bin/uv", [
  "pip",
  "install",
  "--python",
  ".venv/bin/python",
  "-r",
  "intelligence/local/requirements.txt",
]);
console.log("Local dependencies installed. Run npm run dev.");
