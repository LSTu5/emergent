import { gzip as gzipCallback, gunzipSync } from "node:zlib";
import { promisify } from "node:util";
const gzip = promisify(gzipCallback);
import { mkdir, readFile, writeFile, rename } from "node:fs/promises";
const URI = "http://127.0.0.1:4322",
  DB = "emergent-pier39";
let token = "";
export async function initializeStorage() {
  await mkdir(".local", { recursive: true });
  await mkdir(".data", { recursive: true });
  try {
    token = JSON.parse(await readFile(".local/db-token.json", "utf8")).token;
  } catch {
    const r = await fetch(`${URI}/v1/identity`, { method: "POST" });
    if (!r.ok) throw Error("Cannot create local database identity");
    const auth = (await r.json()) as { token: string };
    token = auth.token;
    await writeFile(".local/db-token.json", JSON.stringify(auth), {
      mode: 0o600,
    });
  }
  await call("claim_operator", []);
}
async function call(reducer: string, args: unknown[]) {
  const r = await fetch(`${URI}/v1/database/${DB}/call/${reducer}`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${token}`,
      "content-type": "application/json",
    },
    body: JSON.stringify(args),
  });
  if (!r.ok)
    throw Error(`Database ${reducer}: ${(await r.text()).slice(0, 180)}`);
}
export async function save(key: string, kind: string, body: unknown) {
  if (!/^[a-zA-Z0-9-]+$/.test(key)) throw Error("Invalid record key");
  const json = JSON.stringify(body);
  let stored = json;
  if (json.length > 512_000) {
    const packed = await gzip(json, { level: 1 });
    if (packed.length < 280_000)
      stored = JSON.stringify({
        encoding: "emergent-gzip-v1",
        payload: packed.toString("base64"),
      });
    else {
      // SpacetimeDB's HTTP reducer body is bounded. Keep a durable run index in
      // the database and atomically checkpoint the full state beside its replay.
      const path = `record-${key}.json.gz`;
      await writeFile(`.data/${path}.tmp`, packed);
      await rename(`.data/${path}.tmp`, `.data/${path}`);
      const value = body as any;
      stored = JSON.stringify({
        encoding: "emergent-file-v1",
        path,
        summary:
          kind === "run"
            ? {
                id: key,
                status: value.status,
                config: value.config,
                layoutId: value.layout.id,
                metrics: value.metrics,
                time: value.time,
                model: value.model,
              }
            : { id: key, kind },
      });
    }
  }
  await call("save_record", [key, kind, stored]);
}
export async function list<T>(kind: string): Promise<T[]> {
  if (!/^[a-z]+$/.test(kind)) throw Error("Invalid record type");
  const r = await fetch(`${URI}/v1/database/${DB}/sql`, {
    method: "POST",
    headers: { authorization: `Bearer ${token}`, "content-type": "text/plain" },
    body: `SELECT body FROM record WHERE kind = '${kind}'`,
  });
  if (!r.ok) throw Error("Database read failed");
  const data = (await r.json()) as { rows: string[][] }[];
  return Promise.all(
    (data[0]?.rows ?? []).map(async (row) => {
      const value = JSON.parse(row[0]);
      if (value?.encoding === "emergent-gzip-v1")
        return JSON.parse(
          gunzipSync(Buffer.from(value.payload, "base64")).toString(),
        );
      if (value?.encoding === "emergent-file-v1") {
        if (!/^record-[a-zA-Z0-9-]+\.json\.gz$/.test(value.path))
          throw Error("Invalid state checkpoint reference");
        return JSON.parse(
          gunzipSync(await readFile(`.data/${value.path}`)).toString(),
        );
      }
      return value;
    }),
  );
}
export async function saveReplay(id: string, body: unknown) {
  await writeFile(
    `.data/${id}.tmp`,
    await gzip(JSON.stringify(body), { level: 1 }),
  );
  await rename(`.data/${id}.tmp`, `.data/${id}.json.gz`);
}
export async function loadReplay(id: string) {
  if (!/^[a-zA-Z0-9-]+$/.test(id)) throw Error("Invalid run ID");
  try {
    return JSON.parse(
      gunzipSync(await readFile(`.data/${id}.json.gz`)).toString(),
    );
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code !== "ENOENT") throw e;
  }
  return JSON.parse(await readFile(`.data/${id}.json`, "utf8"));
}
