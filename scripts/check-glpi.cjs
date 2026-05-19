const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const envFile = path.join(root, "apps", "api", ".env");

function loadEnv(file) {
  if (!fs.existsSync(file)) return;
  const text = fs.readFileSync(file, "utf8");
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const idx = trimmed.indexOf("=");
    if (idx <= 0) continue;
    const key = trimmed.slice(0, idx).trim();
    let value = trimmed.slice(idx + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    process.env[key] = value;
  }
}

function required(name) {
  const value = process.env[name];
  if (!value) throw new Error(`Missing env ${name}`);
  return value;
}

async function requestJson(url, init) {
  const res = await fetch(url, init);
  const raw = await res.text();
  let data = raw;
  try {
    data = raw ? JSON.parse(raw) : null;
  } catch {}
  return { res, data };
}

async function tryInitSession(base, appToken, label, authorization) {
  const { res, data } = await requestJson(`${base}/initSession`, {
    method: "GET",
    headers: { "App-Token": appToken, Authorization: authorization },
  });

  if (!res.ok) {
    const message = typeof data === "string" ? data : JSON.stringify(data);
    return { ok: false, label, status: res.status, message };
  }

  return { ok: Boolean(data?.session_token), label, status: res.status };
}

async function main() {
  loadEnv(envFile);

  const base = required("GLPI_API_BASE").replace(/\/+$/, "");
  const appToken = required("GLPI_APP_TOKEN");
  const userToken = required("GLPI_USER_TOKEN");

  console.log(`GLPI_API_BASE: ${base}`);
  console.log(`GLPI_APP_TOKEN: ${appToken ? "configured" : "missing"}`);
  console.log(`GLPI_USER_TOKEN: ${userToken ? "configured" : "missing"}`);

  const result = await tryInitSession(base, appToken, "user_token", `user_token ${userToken}`);
  if (result.ok) {
    console.log("OK: initSession funcionou com app_token + user_token.");
    return;
  }

  console.log(`FAIL: user_token retornou HTTP ${result.status}: ${String(result.message).slice(0, 300)}`);
  process.exitCode = 1;
}

main().catch((e) => {
  console.error(String(e?.message ?? e));
  process.exitCode = 1;
});
