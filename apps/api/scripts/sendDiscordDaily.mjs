// apps/api/scripts/sendDiscordDaily.mjs
import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";

// carrega .env do apps/api/.env mesmo se você rodar de outra pasta
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const envPath = path.resolve(__dirname, "../.env");
dotenv.config({ path: envPath });

const webhook = process.env.DISCORD_WEBHOOK_URL;
if (!webhook) {
    console.error("Missing DISCORD_WEBHOOK_URL (loaded from: " + envPath + ")");
    process.exitCode = 1;
}

const API_BASE = process.env.ALERT_API_BASE ?? "http://localhost:3001";
const adminUser = process.env.ALERT_ADMIN_UNIQUE ?? "FAZENDA\\jbsouza";
const adminRole = process.env.ALERT_ADMIN_ROLE ?? "admin";

function isoMonth(d = new Date()) {
    return d.toISOString().slice(0, 7);
}
function isoDate(d = new Date()) {
    return d.toISOString().slice(0, 10);
}
function clamp(n, a, b) {
    return Math.max(a, Math.min(b, n));
}
function fmtPct(x) {
    const n = Number(x);
    if (!Number.isFinite(n)) return "—";
    return `${n.toFixed(1)}%`;
}
function fmtPctFixedWidth(x) {
    const n = Number(x);
    if (!Number.isFinite(n)) return "  —  ";
    // Ex: " 12.3" -> " 12.3%"
    const s = n.toFixed(1).padStart(5, " ");
    return `${s}%`;
}
function statusTag(status) {
    // tag premium (sem “bullet”)
    if (status === "ON_TRACK") return "ON";
    if (status === "AT_RISK") return "RISK";
    if (status === "OFF_TRACK") return "OFF";
    return "—";
}
function statusBadge(status) {
    // "coloridos" premium via emoji quadrado discreto
    if (status === "ON_TRACK") return "🟩";
    if (status === "AT_RISK") return "🟨";
    if (status === "OFF_TRACK") return "🟥";
    return "⬜";
}
function progressBar(pct, width = 14) {
    const n = Number(pct);
    if (!Number.isFinite(n)) return "░".repeat(width);
    const filled = Math.round(clamp(n, 0, 100) / 100 * width);
    return "█".repeat(filled) + "░".repeat(width - filled);
}
function firstName(displayName) {
    const s = String(displayName ?? "").trim();
    if (!s) return "—";
    return s.split(/\s+/)[0];
}

const month = isoMonth();
const today = isoDate();

const summaryRes = await fetch(`${API_BASE}/api/ust/summary?month=${month}`, {
    headers: {
        "x-user-unique-name": adminUser,
        "x-user-role": adminRole,
    },
});

const summary = await summaryRes.json();
if (!summaryRes.ok) {
    console.error("Failed /api/ust/summary:", summary);
    process.exitCode = 1;
}

const rows = summary.rows ?? [];
const teamPct = fmtPct(summary?.team?.pct);

// ✅ ordenar por % (ranking). Se você não quiser ranking, comente o sort.
const sorted = rows
    .slice()
    .sort((a, b) => Number(b.pct ?? 0) - Number(a.pct ?? 0));

// // ✅ sem ranking (ordem de cadastro)
// const sorted = rows.slice();

const nameWidth = 12; // ajustável
const header = `STATUS  %     PROGRESSO         NOME`;
const tableLines = sorted.map((r) => {
    const pct = r.pct;
    const bar = progressBar(pct, 14);
    const tag = statusTag(r.status);
    const badge = statusBadge(r.status);
    const pctTxt = fmtPctFixedWidth(pct);
    const name = firstName(r.displayName).padEnd(nameWidth, " ").slice(0, nameWidth);

    // Ex: 🟩 ON   45.2%  ██████░░░░░░░░  Jorge
    return `${badge} ${tag.padEnd(4, " ")} ${pctTxt}  ${bar}  ${name}`;
});

const content =
    `**UST • Daily Progress Report**
> **Data:** ${today}  •  **Mês:** ${month}  •  **Progresso do time:** **${teamPct}**

\`\`\`
${header}
${tableLines.join("\n")}
\`\`\`

_Nota de privacidade: este canal exibe somente **percentual** por colaborador. Metas e valores absolutos são privados._`;

const resp = await fetch(webhook, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ content }),
});

if (!resp.ok) {
    const t = await resp.text().catch(() => "");
    console.error("Discord webhook failed:", resp.status, t.slice(0, 800));
    process.exitCode = 1;
}

console.log("Discord daily sent:", today);