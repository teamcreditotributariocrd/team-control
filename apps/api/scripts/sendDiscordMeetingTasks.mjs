// apps/api/scripts/sendDiscordMeetingTasks.mjs
//
// Envia as sugestões de tasks de uma reunião para o Discord via webhook,
// no MESMO estilo do sendDiscordDaily.mjs (dotenv + webhook + fetch + content).
//
// Uso:
//   node apps/api/scripts/sendDiscordMeetingTasks.mjs <MEETING_ID>
//   node apps/api/scripts/sendDiscordMeetingTasks.mjs --latest
//
// Requer no apps/api/.env:
//   DISCORD_MEETINGS_WEBHOOK_URL=...   (novo, recomendado)
//   (fallback opcional) DISCORD_WEBHOOK_URL=...  (já existente do canal de UST)
//
//   ALERT_API_BASE=http://localhost:3001
//   ALERT_ADMIN_UNIQUE=FAZENDA\\jbsouza
//   ALERT_ADMIN_ROLE=admin
//
// Opcional (por canal):
//   DISCORD_MEETINGS_WEBHOOK_USERNAME=Team Control
//   DISCORD_MEETINGS_WEBHOOK_AVATAR_URL=
//
// Fallback (global):
//   DISCORD_WEBHOOK_USERNAME=...
//   DISCORD_WEBHOOK_AVATAR_URL=...

import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";

// carrega .env do apps/api/.env mesmo se você rodar de outra pasta
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const envPath = path.resolve(__dirname, "../.env");
dotenv.config({ path: envPath });

// ✅ usa webhook específico de reuniões; fallback para DISCORD_WEBHOOK_URL (UST)
const webhook =
    process.env.DISCORD_MEETINGS_WEBHOOK_URL ||
    process.env.DISCORD_WEBHOOK_URL;

if (!webhook) {
    console.error("Missing DISCORD_MEETINGS_WEBHOOK_URL (or DISCORD_WEBHOOK_URL fallback) (loaded from: " + envPath + ")");
    process.exitCode = 1;
}

const API_BASE = process.env.ALERT_API_BASE ?? "http://localhost:3001";
const adminUser = process.env.ALERT_ADMIN_UNIQUE ?? "FAZENDA\\jbsouza";
const adminRole = process.env.ALERT_ADMIN_ROLE ?? "admin";

// ✅ username/avatar específicos do canal; fallback para globais
const webhookUsername =
    process.env.DISCORD_MEETINGS_WEBHOOK_USERNAME ||
    process.env.DISCORD_WEBHOOK_USERNAME ||
    undefined;

const webhookAvatarUrl =
    process.env.DISCORD_MEETINGS_WEBHOOK_AVATAR_URL ||
    process.env.DISCORD_WEBHOOK_AVATAR_URL ||
    undefined;

// ---------------- utils ----------------
function isoDate(d = new Date()) {
    return d.toISOString().slice(0, 10);
}
function clip(s, n) {
    const x = String(s ?? "");
    return x.length > n ? x.slice(0, n - 1) + "…" : x;
}
function isNonEmptyString(x) {
    return typeof x === "string" && x.trim().length > 0;
}
function pickIconLucide(tema) {
    const t = String(tema ?? "").toLowerCase();
    if (t.includes("homolog")) return "🛡️ lucide:ShieldAlert";
    if (t.includes("parcel")) return "🧾 lucide:Receipt";
    if (t.includes("bi")) return "📊 lucide:BarChart3";
    if (t.includes("alim")) return "🧮 lucide:Calculator";
    if (t.includes("omiss")) return "📦 lucide:Package";
    if (t.includes("pend")) return "🧩 lucide:AlertTriangle";
    if (t.includes("act")) return "🧷 lucide:Link2";
    if (t.includes("icms")) return "💰 lucide:Coins";
    if (t.includes("itcd")) return "💼 lucide:Briefcase";
    if (t.includes("exig")) return "🧱 lucide:LayoutPanelTop";
    if (t.includes("produ")) return "🚀 lucide:Rocket";
    return "📌 lucide:ClipboardList";
}

// Discord hard limit ~2000 chars. Mantém folga.
function splitDiscordMessages(text, limit = 1900) {
    const lines = String(text ?? "").split("\n");
    const out = [];
    let cur = "";
    for (const line of lines) {
        const next = cur ? `${cur}\n${line}` : line;
        if (next.length > limit) {
            if (cur.trim()) out.push(cur.trimEnd());
            cur = line;
        } else {
            cur = next;
        }
    }
    if (cur.trim()) out.push(cur.trimEnd());
    return out;
}

async function postDiscord(content) {
    const body = { content };
    if (webhookUsername) body.username = webhookUsername;
    if (webhookAvatarUrl) body.avatar_url = webhookAvatarUrl;

    const resp = await fetch(webhook, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
    });

    if (!resp.ok) {
        const t = await resp.text().catch(() => "");
        throw new Error(`Discord webhook failed: ${resp.status} ${t.slice(0, 800)}`);
    }
}

async function apiGetJson(url) {
    const res = await fetch(url, {
        headers: {
            "x-user-unique-name": adminUser,
            "x-user-role": adminRole,
        },
    });
    const data = await res.json().catch(() => null);
    if (!res.ok) throw new Error(`API failed ${res.status}: ${JSON.stringify(data).slice(0, 800)}`);
    return data;
}

// ---------------- load meeting ----------------
const args = process.argv.slice(2);
const wantLatest = args.includes("--latest");
const meetingIdArg = args.find((a) => a && !a.startsWith("--"));

let meetingId = meetingIdArg;

if (wantLatest || !meetingId) {
    const list = await apiGetJson(`${API_BASE}/api/meetings`);
    const first = Array.isArray(list) ? list[0] : null;
    if (!first?.id) {
        console.error("No meetings found to send.");
        process.exitCode = 1;
    }
    meetingId = first.id;
}

const detail = await apiGetJson(`${API_BASE}/api/meetings/${encodeURIComponent(meetingId)}`);
const meeting = detail?.meeting ?? {};
const suggestions = detail?.suggestions ?? {};

const tasks =
    Array.isArray(suggestions.tasks) ? suggestions.tasks :
        Array.isArray(suggestions.suggestions) ? suggestions.suggestions :
            Array.isArray(suggestions.items) ? suggestions.items :
                [];

const title = meeting?.title ?? "Reunião";
const execDate = meeting?.execDate
    ? String(meeting.execDate).slice(0, 10)
    : meeting?.createdAt
        ? String(meeting.createdAt).slice(0, 10)
        : isoDate();

const status = meeting?.status ?? "—";
const errorStage = meeting?.errorStage ? String(meeting.errorStage) : null;
const error = meeting?.error ? String(meeting.error) : null;

// ---------------- format message ----------------
const header =
    `**CRD • Sugestões de Tasks (Meeting)**\n` +
    `> **Título:** ${clip(title, 120)}\n` +
    `> **Data Execução:** ${execDate}  •  **MeetingId:** ${meetingId}\n` +
    `> **Status:** ${status}${errorStage ? `  •  **ErroStage:** ${clip(errorStage, 40)}` : ""}\n` +
    (error ? `> **Erro:** ${clip(error, 180)}\n` : "") +
    `\n` +
    `_Campos “UST/Complexidade/Responsável/Link TFS” ficam como **preencher** (sugestão de task)._`;

function formatTask(t, idx) {
    const temas = Array.isArray(t.temas) && t.temas.length ? t.temas : ["Geral"];
    const primaryTema = temas[0] ?? "Geral";
    const icon = pickIconLucide(primaryTema);

    const artefato = isNonEmptyString(t.artefato) ? String(t.artefato) : "—";
    const tipo = isNonEmptyString(t.tipoTrabalho) ? String(t.tipoTrabalho) : "—";
    const evid = Array.isArray(t.evidencias) ? t.evidencias : Array.isArray(t.evidences) ? t.evidences : [];
    const evidLines = evid.slice(0, 3).map((e) => `- ${clip(e, 180)}`);

    const desc = isNonEmptyString(t.descricao) ? t.descricao : isNonEmptyString(t.description) ? t.description : "";
    const descBlock = clip(desc, 1200);

    return (
        `### ${icon} — Task ${String(idx).padStart(2, "0")}\n` +
        `**🏷️ lucide:Tag — Título:** ${clip(t.titulo ?? t.title ?? `Task ${idx}`, 160)}\n` +
        `**🗓️ lucide:Calendar — Data Execução:** ${t.dataExecucao ?? t.dueDate ?? execDate}\n` +
        `**🧩 lucide:Layers — Tema(s):** ${temas.join(", ")}\n` +
        `**🧱 lucide:Box — Artefato:** ${clip(artefato, 140)}\n` +
        `**🧭 lucide:Workflow — Tipo de trabalho:** ${tipo}\n\n` +
        `**📝 lucide:AlignLeft — Descrição (colar no TFS):**\n` +
        "```text\n" +
        `${descBlock}\n` +
        "```\n" +
        `**📏 lucide:Calculator — UST (preencher):**\n` +
        `• Atividade UST: <preencher>\n` +
        `• Complexidade UST: <preencher>\n` +
        `• UST total: <preencher>\n` +
        `**👤 lucide:User — Responsável:** <preencher>\n` +
        `**🔗 lucide:Link — Work Item:** <colar URL do TFS após criar>\n` +
        `**🧾 lucide:Quote — Evidências:**\n` +
        (evidLines.length ? `${evidLines.join("\n")}\n` : `- <não informado>\n`)
    );
}

let body = "";
if (!tasks.length) {
    body =
        `⚠️ lucide:AlertTriangle Nenhuma task encontrada em suggestions para este meeting.\n` +
        `Dica: verifique se o processamento gerou suggestions.json e se ele contém "tasks".`;
} else {
    const blocks = tasks.map((t, i) => formatTask(t, i + 1)).join("\n");
    body = blocks;
}

// 1) manda header
try {
    await postDiscord(header);

    // 2) manda body quebrando em várias mensagens se precisar
    const parts = splitDiscordMessages(body, 1900);
    for (const p of parts) {
        await postDiscord(p);
    }

    console.log("Discord meeting tasks sent:", meetingId, "tasks:", tasks.length);
} catch (e) {
    console.error(String(e?.message ?? e));
    process.exitCode = 1;
}
