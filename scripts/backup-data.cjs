const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const apiDir = path.join(root, "apps", "api");
const dataDir = path.join(apiDir, "data");
const envFile = path.join(apiDir, ".env");
const backupRoot = path.join(root, "backups");

function stamp() {
  const now = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  return [
    now.getFullYear(),
    pad(now.getMonth() + 1),
    pad(now.getDate()),
    pad(now.getHours()),
    pad(now.getMinutes()),
    pad(now.getSeconds()),
  ].join("");
}

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function copyFilePreservingTree(sourceFile, sourceBase, targetBase) {
  const rel = path.relative(sourceBase, sourceFile);
  const targetFile = path.join(targetBase, rel);
  ensureDir(path.dirname(targetFile));
  fs.copyFileSync(sourceFile, targetFile);
  return rel;
}

function walkJsonFiles(dir) {
  if (!fs.existsSync(dir)) return [];
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walkJsonFiles(full));
    else if (entry.isFile() && entry.name.toLowerCase().endsWith(".json")) out.push(full);
  }
  return out;
}

function main() {
  ensureDir(backupRoot);

  const backupDir = path.join(backupRoot, `ust-data-${stamp()}`);
  const targetDataDir = path.join(backupDir, "apps", "api", "data");
  const targetApiDir = path.join(backupDir, "apps", "api");
  const copied = [];
  const missing = [];

  if (fs.existsSync(dataDir)) {
    for (const file of walkJsonFiles(dataDir)) {
      copied.push(path.join("apps", "api", "data", copyFilePreservingTree(file, dataDir, targetDataDir)));
    }
  } else {
    missing.push(path.relative(root, dataDir));
  }

  if (fs.existsSync(envFile)) {
    ensureDir(targetApiDir);
    fs.copyFileSync(envFile, path.join(targetApiDir, ".env"));
    copied.push(path.join("apps", "api", ".env"));
  } else {
    missing.push(path.relative(root, envFile));
  }

  const manifest = {
    createdAt: new Date().toISOString(),
    sourceRoot: root,
    backupDir,
    copied,
    missing,
    restoreHint: "Pare o PM2, copie apps/api/data e apps/api/.env deste backup para a raiz publicada, depois reinicie o PM2.",
  };

  fs.writeFileSync(path.join(backupDir, "manifest.json"), JSON.stringify(manifest, null, 2), "utf8");

  console.log(`Backup criado em: ${backupDir}`);
  console.log(`Arquivos copiados: ${copied.length}`);
  if (missing.length) console.log(`Itens ausentes: ${missing.join(", ")}`);
}

main();
