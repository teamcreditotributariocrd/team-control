// apps/api/scripts/sendDiscordDaily.mjs
import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";

// carrega .env do apps/api/.env mesmo se você rodar de outra pasta
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const envPath = path.resolve(__dirname, "../.env");
dotenv.config({ path: envPath });

const webhook = process.env.SLACK_WEBHOOK_URL;
if (!webhook) {
    console.error("Missing SLACK_WEBHOOK_URL (loaded from: " + envPath + ")");
    process.exit(1);
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
function statusBadge(status) {
    if (status === "ON_TRACK") return "🟩";
    if (status === "AT_RISK") return "🟨";
    if (status === "OFF_TRACK") return "🟥";
    return "⬜";
}
function statusLabel(status) {
    if (status === "ON_TRACK") return "No ritmo";
    if (status === "AT_RISK") return "Atenção";
    if (status === "OFF_TRACK") return "Abaixo do ritmo";
    if (status === "NO_GOAL") return "Sem meta";
    return "Sem status";
}
function progressBar(pct, width = 10) {
    const n = Number(pct);
    if (!Number.isFinite(n)) return "▱".repeat(width);
    const filled = Math.round(clamp(n, 0, 100) / 100 * width);
    return "▰".repeat(filled) + "▱".repeat(width - filled);
}
const month = isoMonth();
const today = isoDate();

const summaryRes = await fetch(`${API_BASE}/api/ust/summary?month=${month}`, {
    headers: {
        ...(process.env.INTERNAL_ALERT_TOKEN ? { "x-internal-alert-token": process.env.INTERNAL_ALERT_TOKEN } : {}),
        "x-user-unique-name": adminUser,
        "x-user-role": adminRole,
    },
});

const summary = await summaryRes.json();
if (!summaryRes.ok) {
    console.error("Failed /api/ust/summary:", summary);
    process.exitCode = 1;
}

const rows = (summary.rows ?? []).filter(
    (row) => String(row.uniqueName ?? "").trim().toLowerCase() !== "fazenda\\lcveiga",
);
const teamPct = fmtPct(summary?.team?.pct);

// ✅ ordenar por % (ranking). Se você não quiser ranking, comente o sort.
const sorted = rows
    .slice()
    .sort((a, b) => Number(b.pct ?? 0) - Number(a.pct ?? 0));
const statusCounts = sorted.reduce((counts, row) => {
    counts[row.status] = (counts[row.status] ?? 0) + 1;
    return counts;
}, {});

const blocks = [
    {
        type: "header",
        text: { type: "plain_text", text: "Relatório diário de UST", emoji: true },
    },
    {
        type: "context",
        elements: [{ type: "mrkdwn", text: `TEAM CONTROL   /   ${today}   /   ${month}` }],
    },
    { type: "divider" },
    {
        type: "section",
        fields: [
            {
                type: "mrkdwn",
                text: `*ATINGIMENTO DO TIME*\n${statusBadge(summary?.team?.status)}  *${teamPct}*\n\`${progressBar(summary?.team?.pct)}\``,
            },
            {
                type: "mrkdwn",
                text: `*STATUS DA EQUIPE*\n🟩 ${statusCounts.ON_TRACK ?? 0} no ritmo   ·   🟨 ${statusCounts.AT_RISK ?? 0} atenção   ·   🟥 ${statusCounts.OFF_TRACK ?? 0} abaixo`,
            },
        ],
    },
    { type: "divider" },
    {
        type: "section",
        text: { type: "mrkdwn", text: `*DESEMPENHO INDIVIDUAL*     _${sorted.length} integrantes_` },
    },
];

if (sorted.length === 0) {
    blocks.push({
        type: "section",
        text: { type: "mrkdwn", text: "Nenhum colaborador ativo encontrado para este período." },
    });
} else {
    for (const [index, row] of sorted.entries()) {
        const name = String(row.displayName ?? "Colaborador").trim() || "Colaborador";
        blocks.push({
            type: "section",
            fields: [
                {
                    type: "mrkdwn",
                    text: `*${String(index + 1).padStart(2, "0")}  ${name}*\n${statusBadge(row.status)}  ${statusLabel(row.status)}`,
                },
                {
                    type: "mrkdwn",
                    text: `*${fmtPct(row.pct)}*\n\`${progressBar(row.pct)}\` da meta`,
                },
            ],
        });
    }
}

blocks.push(
    { type: "divider" },
    {
        type: "context",
        elements: [{
            type: "mrkdwn",
            text: "Percentuais individuais em relação à meta mensal  ·  Metas e valores absolutos são privados",
        }],
    },
);

const fallbackText = `Resumo diário de UST · ${today} · Progresso do time: ${teamPct}`;

const resp = await fetch(webhook, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text: fallbackText, blocks }),
});

if (!resp.ok) {
    const t = await resp.text().catch(() => "");
    console.error("Slack webhook failed:", resp.status, t.slice(0, 800));
    process.exitCode = 1;
}

console.log("Slack daily report sent:", today);
