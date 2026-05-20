// apps/api/src/services/meetingProcessor.ts
import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import unzipper from "unzipper";
import { nanoid } from "nanoid";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Encontra o root do app (apps/api) subindo diretórios até achar "bin" e "data".
 */
function findAppRoot(startDir: string) {
    let dir = startDir;
    for (let i = 0; i < 12; i++) {
        if (fs.existsSync(path.join(dir, "package.json")) && fs.existsSync(path.join(dir, "src"))) return dir;
        const parent = path.dirname(dir);
        if (parent === dir) break;
        dir = parent;
    }
    if (fs.existsSync(path.join(process.cwd(), "package.json")) && fs.existsSync(path.join(process.cwd(), "src"))) {
        return process.cwd();
    }
    throw new Error(`APP_ROOT não encontrado. start=${startDir} cwd=${process.cwd()}`);
}

const APP_ROOT = findAppRoot(__dirname);
const BIN_DIR = path.join(APP_ROOT, "bin");
const DATA_DIR = path.join(APP_ROOT, "data");
fs.mkdirSync(DATA_DIR, { recursive: true });

const DEFAULT_EXE = path.join(BIN_DIR, "whispercpp", "whisper-cli.exe");
const DEFAULT_MODEL = path.join(BIN_DIR, "whispercpp", "models", "ggml-small.bin");

console.log("CWD:", process.cwd());
console.log("APP_ROOT:", APP_ROOT);
console.log("BIN_DIR:", BIN_DIR, "exists?", fs.existsSync(BIN_DIR));
console.log("DATA_DIR:", DATA_DIR, "exists?", fs.existsSync(DATA_DIR));
console.log("DEFAULT_EXE:", DEFAULT_EXE, "exists?", fs.existsSync(DEFAULT_EXE));
console.log("DEFAULT_MODEL:", DEFAULT_MODEL, "exists?", fs.existsSync(DEFAULT_MODEL));

function isAudioFile(f: string) {
    const ext = path.extname(f).toLowerCase();
    return [".wav", ".flac", ".mp3", ".m4a", ".ogg", ".opus"].includes(ext);
}

function speakerGuessFromFilename(filename: string) {
    const base = path.basename(filename, path.extname(filename));
    const cleaned = base
        .replace(/craig|recording|track|audio/gi, "")
        .replace(/[_\-]+/g, " ")
        .replace(/\s+/g, " ")
        .trim();
    return cleaned.length >= 3 ? cleaned : null;
}

function runWhisperCpp(inputPath: string, outDir: string) {
    const lang = process.env.WHISPERCPP_LANG ?? "pt";
    const exeEnv = process.env.WHISPERCPP_EXE;
    const modelEnv = process.env.WHISPERCPP_MODEL;

    const exe = exeEnv ? (path.isAbsolute(exeEnv) ? exeEnv : path.resolve(APP_ROOT, exeEnv)) : DEFAULT_EXE;
    const model = modelEnv ? (path.isAbsolute(modelEnv) ? modelEnv : path.resolve(APP_ROOT, modelEnv)) : DEFAULT_MODEL;

    if (!fs.existsSync(exe)) throw new Error(`Whisper EXE não encontrado: ${exe}`);
    if (!fs.existsSync(model)) throw new Error(`Modelo não encontrado: ${model}`);
    if (!fs.existsSync(inputPath)) throw new Error(`Áudio não encontrado: ${inputPath}`);

    fs.mkdirSync(outDir, { recursive: true });

    const outBase = path.join(outDir, nanoid(8));
    const args = ["-m", model, "-l", lang, "-f", inputPath, "-of", outBase, "-otxt", "-oj"];

    return new Promise<{ txt: string; json: string }>((resolve, reject) => {
        const p = spawn(exe, args, {
            cwd: path.dirname(exe),
            stdio: ["ignore", "pipe", "pipe"],
            windowsHide: true,
        });

        let stderr = "";
        p.stderr.on("data", (d) => (stderr += d.toString()));
        p.on("error", (err) => reject(err));

        p.on("close", (code) => {
            if (code !== 0) return reject(new Error(`whisper.cpp falhou (${code}): ${stderr.slice(0, 1200)}`));
            resolve({ txt: `${outBase}.txt`, json: `${outBase}.json` });
        });
    });
}

function loadSegments(jsonPath: string) {
    const raw = JSON.parse(fs.readFileSync(jsonPath, "utf-8"));
    const segs = raw.segments ?? raw.transcription ?? [];
    return segs
        .map((s: any) => ({
            start: Number(s.t0 ?? s.start ?? 0),
            end: Number(s.t1 ?? s.end ?? 0),
            text: String(s.text ?? "").trim(),
        }))
        .filter((x: any) => x.text);
}

function fmtTimeSec(sec: number) {
    const s = Math.max(0, Math.floor(sec));
    const mm = String(Math.floor(s / 60)).padStart(2, "0");
    const ss = String(s % 60).padStart(2, "0");
    return `${mm}:${ss}`;
}

export async function extractCraigZip(meeting: any) {
    const filesDir = path.join(meeting.dir, "files");

    await fs.createReadStream(meeting.zipPath).pipe(unzipper.Extract({ path: filesDir })).promise();

    const all: string[] = [];
    const walk = (dir: string) => {
        for (const name of fs.readdirSync(dir)) {
            const p = path.join(dir, name);
            const st = fs.statSync(p);
            if (st.isDirectory()) walk(p);
            else all.push(p);
        }
    };
    walk(filesDir);

    const tracks = all
        .filter(isAudioFile)
        .map((p) => {
            const st = fs.statSync(p);
            const ext = path.extname(p).toLowerCase();
            return {
                id: nanoid(8),
                filename: path.relative(meeting.dir, p).replace(/\\/g, "/"),
                ext,
                size: st.size,
                speakerGuess: speakerGuessFromFilename(p),
                collaboratorUniqueName: null,
                transcriptPath: null,
                _absPath: p,
            };
        });

    if (!tracks.length) throw new Error("Nenhum áudio encontrado no ZIP. Verifique o arquivo do Craig.");
    return tracks;
}

export async function transcribeTracks(meeting: any, tracks: any[]) {
    const outDir = path.join(meeting.dir, "out");
    const diarized: Array<{ t: number; speaker: string; text: string }> = [];
    const updatedTracks = [];

    for (const t of tracks) {
        const abs = t._absPath;
        const { txt, json } = await runWhisperCpp(abs, outDir);

        const segs = loadSegments(json);
        const speaker = t.collaboratorUniqueName ?? t.speakerGuess ?? "Speaker";
        for (const s of segs) diarized.push({ t: s.start, speaker, text: s.text });

        updatedTracks.push({
            ...t,
            transcriptPath: path.relative(meeting.dir, txt).replace(/\\/g, "/"),
            _segmentsJson: path.relative(meeting.dir, json).replace(/\\/g, "/"),
        });
    }

    diarized.sort((a, b) => a.t - b.t);

    const diarizedText = diarized.map((x) => `[${fmtTimeSec(x.t)}] ${x.speaker}: ${x.text}`).join("\n");
    const diarizedPath = path.join(outDir, "diarized.txt");
    fs.writeFileSync(diarizedPath, diarizedText, "utf-8");

    return {
        diarizedTranscriptPath: path.relative(meeting.dir, diarizedPath).replace(/\\/g, "/"),
        tracks: updatedTracks.map(({ _absPath, ...rest }) => rest),
    };
}

/** -------------------- Sugestões / LLM -------------------- **/

function toBRDate(isoOrYmd: string) {
    const ymd = isoOrYmd?.slice?.(0, 10) ?? "";
    const [y, m, d] = ymd.split("-");
    if (!y || !m || !d) return "01/01/1970";
    return `${d}/${m}/${y}`;
}

function tryParseJsonLoose(content: string) {
    try {
        return JSON.parse(content);
    } catch {
        const s = String(content);
        const a = s.indexOf("{");
        const b = s.lastIndexOf("}");
        if (a >= 0 && b > a) {
            try {
                return JSON.parse(s.slice(a, b + 1));
            } catch {
                return null;
            }
        }
        return null;
    }
}

const ALLOWED_THEMES = [
    "PPD",
    "Parcelamento",
    "ALIM",
    "ACT",
    "NOTCRD",
    "Omissos",
    "Pendências",
    "Denúncia Espontânea",
    "ICMS",
    "ITCD",
    "BI",
    "Homologação",
    "Produção",
    "Exigibilidade",
    "Geral",
] as const;

const ALLOWED_TIPO = [
    "Reunião/Alinhamento",
    "Ajuste de Regra",
    "Ajuste de Tela",
    "Ajuste de Integração",
    "Correção de Bug",
    "Análise",
    "Evolução",
] as const;

function sanitizeThemes(arr: any): string[] {
    const a = Array.isArray(arr) ? arr.map(String) : [];
    const out = a.filter((x) => (ALLOWED_THEMES as readonly string[]).includes(x));
    return out.length ? out.slice(0, 3) : ["Geral"];
}

function sanitizeTipo(x: any): string {
    const s = String(x ?? "");
    return (ALLOWED_TIPO as readonly string[]).includes(s) ? s : "Análise";
}

function buildTitleByTheme(tema: string, execDateBR: string) {
    if (tema === "Homologação") return `CRD/Homologação: corrigir acesso/erro e validar ficha de cobrança — ${execDateBR}`;
    if (tema === "Parcelamento") return `PPD/Parcelamento: bloquear criação em fim de semana e ajustar protocolo (MVC→PVA/PVAD) — ${execDateBR}`;
    if (tema === "BI") return `CRD/BI: ajustar consultas do painel (parcelado x não parcelado; pago/vencido) — ${execDateBR}`;
    if (tema === "ALIM") return `CRD/ALIM: revisar baixa/abatimento e validar regra “quitado” — ${execDateBR}`;
    if (tema === "Omissos") return `CRD/Omissos: revisar carga inicial, evitar duplicidade e alinhar comunicação — ${execDateBR}`;
    if (tema === "ACT") return `CRD/ACT: validar cenário de parcelamento e tratar incidente relacionado — ${execDateBR}`;
    if (tema === "Pendências") return `CRD/Pendências: revisar nova pendência/publicação e impactos — ${execDateBR}`;
    if (tema === "ICMS") return `CRD/ICMS: investigar parcelamentos em fim de semana (caso pontual) — ${execDateBR}`;
    if (tema === "Exigibilidade") return `CRD/Exigibilidade: finalizar análise e ajustes na tela Controle de Suspensão — ${execDateBR}`;
    if (tema === "Produção") return `CRD/Produção: alinhar publicação/migração e responsabilidades — ${execDateBR}`;
    return `CRD/${tema}: tratar item identificado na reunião — ${execDateBR}`;
}

function buildStepsByTheme(tema: string): string[] {
    const passosPorTema: Record<string, string[]> = {
        Homologação: [
            "Identificar causa do erro de acesso (permissão/app/banco).",
            "Validar funcionamento da ficha de cobrança em homologação.",
            "Registrar evidência (print/log) e propor correção.",
        ],
        Parcelamento: [
            "Reproduzir cenários de parcelamento em fim de semana.",
            "Implementar validação de dia útil/feriado municipal.",
            "Garantir data de protocolização correta no fluxo MVC→PVA/PVAD.",
            "Testar em homologação e registrar evidência.",
        ],
        BI: [
            "Revisar consultas/indicadores (pago, não pago, vencido).",
            "Separar “parcelado” x “não parcelado” nos dados do painel.",
            "Validar com equipe BI e documentar query final.",
        ],
        ALIM: [
            "Revisar batimento/baixa (casos em pendência).",
            "Validar regra de “quitado” x necessidade de baixa.",
            "Gerar lista de casos e comunicar o time envolvido.",
        ],
        Omissos: [
            "Revisar carga inicial e chave para evitar duplicidade.",
            "Confirmar impacto em omissos/cargas futuras.",
            "Padronizar comunicação antes de executar batimentos em produção.",
        ],
        ACT: [
            "Mapear cenário do incidente de parcelamento ACT.",
            "Validar regra/fluxo e registrar evidência do teste.",
        ],
        Pendências: [
            "Revisar a nova pendência e validar publicação/visibilidade.",
            "Checar impactos em notificações/rotinas relacionadas.",
        ],
        ICMS: [
            "Analisar os casos de ICMS em fim de semana (se é instabilidade).",
            "Tentar reproduzir e validar ausência de reincidência.",
        ],
        Exigibilidade: [
            "Finalizar análise e ajustes na tela Controle de Exigibilidade.",
            "Validar cenários ponta a ponta.",
        ],
        Produção: [
            "Alinhar processo de ida para produção e responsabilidades.",
            "Registrar decisões e próximos passos.",
        ],
    };

    return passosPorTema[tema] ?? ["Detalhar o que foi solicitado na reunião.", "Executar análise/ajuste e validar com o time."];
}

/**
 * Heurístico CRD: alto recall e já “TFS-ready” (sem 'encaminhar ação').
 */
function heuristicCRD(diarizedText: string, execDateBR: string) {
    const lines = diarizedText
        .split("\n")
        .map((l) => l.trim())
        .filter((l) => l.length >= 12)
        .filter((l) => !/\[MÚSICA DE FUNDO\]/i.test(l));

    const topics: Array<{ tema: string; rx: RegExp; tipo?: any; artefato?: string }> = [
        { tema: "Homologação", rx: /\b(homologa|homologação|acesso|não consigo abrir|erro gen(e|é)rico|permiss(a|ã)o|banco|ficha de cobrança)\b/i, tipo: "Análise", artefato: "Homologação + integração com banco / permissões" },
        { tema: "Parcelamento", rx: /\b(parcelam|parcela|vencimento|dia útil|fim de semana|sábado|domingo|PVA|PVAD|MVC|protocoliza|DETTIME)\b/i, tipo: "Ajuste de Regra", artefato: "Validação de dia útil / feriado municipal (PVA/PVAD)" },
        { tema: "ALIM", rx: /\b(ALIM|alim|batimento|baixa)\b/i, tipo: "Análise", artefato: "Rotina/fluxo ALIM" },
        { tema: "ACT", rx: /\b(ACT|acter)\b/i, tipo: "Análise", artefato: "Parcelamento ACT" },
        { tema: "Omissos", rx: /\b(omissos|EFD|carga inicial|carga|duplicidade)\b/i, tipo: "Ajuste de Integração", artefato: "Carga/rotinas de omissos" },
        { tema: "Pendências", rx: /\b(pend(e|ê)ncia|pendências)\b/i, tipo: "Análise", artefato: "Pendências CRD" },
        { tema: "BI", rx: /\b(BI|painel|consulta|indicador|valor pago|valor não pago|valor vencido)\b/i, tipo: "Análise", artefato: "Consultas/indicadores do Painel BI" },
        { tema: "ICMS", rx: /\b(ICMS|CMS)\b/i, tipo: "Análise", artefato: "Impactos ICMS" },
        { tema: "ITCD", rx: /\b(ITCD)\b/i, tipo: "Análise", artefato: "Impactos ITCD" },
        { tema: "Exigibilidade", rx: /\b(exigibilidade|suspens[aã]o|controle exigibilidade)\b/i, tipo: "Ajuste de Tela", artefato: "Tela Controle de Suspensão de Exigibilidade" },
        { tema: "Produção", rx: /\b(produção|subir|publicar|migrar|deploy)\b/i, tipo: "Análise", artefato: "Processo de publicação / migração" },
    ];

    const evidByTema = new Map<string, string[]>();
    for (const l of lines) {
        for (const t of topics) {
            if (t.rx.test(l)) {
                const arr = evidByTema.get(t.tema) ?? [];
                if (arr.length < 3) arr.push(l.slice(0, 200));
                evidByTema.set(t.tema, arr);
            }
        }
    }

    const tasks: any[] = [];
    for (const t of topics) {
        const evid = evidByTema.get(t.tema);
        if (!evid || evid.length === 0) continue;

        const titulo = buildTitleByTheme(t.tema, execDateBR);
        const tipoTrabalho = sanitizeTipo(t.tipo ?? "Análise");
        const artefato = t.artefato ?? null;

        const passos = buildStepsByTheme(t.tema);

        const descricao = `Contexto:
- ${t.tema} citado na reunião (evidências abaixo).

O que fazer:
${passos.map((p) => `- ${p}`).join("\n")}

Critério de aceite:
- Evidência de validação (teste/query/log/print) anexada.
- Atualização registrada (homologação/produção conforme citado).`;

        tasks.push({
            titulo,
            descricao,
            dataExecucao: execDateBR,
            sistema: "CRD",
            temas: t.tema === "Parcelamento" ? ["PPD", "Parcelamento"] : [t.tema],
            artefato,
            tipoTrabalho,
            atividadeUst: null,
            complexidadeUst: null,
            confianca: 0.45,
            justificativa: "Gerado por heurística orientada a templates (alto recall).",
            evidencias: evid,
        });
    }

    // prioridade de exibição
    const order = ["Homologação", "Parcelamento", "BI", "ALIM", "Exigibilidade", "Omissos", "ACT", "Pendências", "ICMS", "ITCD", "Produção"];
    tasks.sort((a, b) => order.indexOf(a.temas?.[0] ?? "Z") - order.indexOf(b.temas?.[0] ?? "Z"));

    return { mode: "heuristic", summary: { highlights: [], decisions: [], blockers: [] }, tasks: tasks.slice(0, 12) };
}

/**
 * Enrich por task: "strict rewriter" (SEM inventar), com fallback duro se não retornar JSON.
 * Observação: NÃO manda catálogo para phi3:mini (evita ele se perder). Mapeamento UST fica para um modelo maior no futuro.
 */
async function enrichSingleTaskWithOllama(args: {
    baseUrl: string;
    model: string;
    execDateBR: string;
    task: any;
}) {
    const { baseUrl, model, execDateBR, task } = args;

    const system = `Você é analista técnico (COTIN) e Scrum Master do CRD.

OBJETIVO:
Reescrever UMA task para ficar pronta para lançamento no TFS, SEM generalidades.

REGRAS (HARD):
- NÃO criar nova task.
- NÃO fundir com outras tasks.
- NÃO mudar dataExecucao: deve ser ${execDateBR}.
- NÃO inventar evidências: use exatamente as evidencias recebidas (pode truncar para <=200 chars).
- PROIBIDO usar frases genéricas como: "analisar e encaminhar ação", "detalhar a necessidade", "propor ajuste/ação".
  Você DEVE escrever ações concretas com verbos e objeto.
- tipoTrabalho deve ser um destes:
${ALLOWED_TIPO.join(" | ")}
- temas devem ser subconjunto destes:
${ALLOWED_THEMES.join(", ")}

SAÍDA: JSON válido (sem markdown) com este schema:
{
  "titulo": string,
  "descricao": string,
  "dataExecucao": "DD/MM/AAAA",
  "sistema": "CRD",
  "temas": string[],
  "artefato": string|null,
  "tipoTrabalho": string,
  "atividadeUst": null,
  "complexidadeUst": null,
  "confianca": number,
  "justificativa": string,
  "evidencias": string[]
}`;

    const user = `TASK (entrada):
${JSON.stringify(task, null, 2)}

INSTRUÇÕES:
- Reescreva "titulo" e "descricao" de forma específica e executável.
- Mantenha "evidencias" e "dataExecucao".
- Ajuste "temas", "artefato" e "tipoTrabalho" se necessário, mas sem inventar.
- "descricao" deve ter:
  Contexto (1-2 linhas),
  O que fazer (3-6 bullets específicos),
  Critério de aceite (2-4 bullets objetivos).`;

    const res = await fetch(`${baseUrl}/api/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            model,
            stream: false,
            format: "json",
            messages: [
                { role: "system", content: system },
                { role: "user", content: user },
            ],
            options: {
                temperature: 0.05,
                num_ctx: 768,
                num_predict: 520,
                num_batch: 64,
            },
        }),
    });

    const raw = await res.text();
    if (!res.ok) return { ok: false as const, err: raw.slice(0, 800) };

    const data = JSON.parse(raw);
    const content = String(data?.message?.content ?? "").trim();
    if (!content) return { ok: false as const, err: "LLM retornou content vazio" };

    // fallback duro: se não começa com "{", rejeita
    if (!content.startsWith("{")) return { ok: false as const, err: `LLM retornou não-JSON: ${content.slice(0, 200)}` };

    const parsed = tryParseJsonLoose(content);
    if (!parsed || typeof parsed !== "object") return { ok: false as const, err: content.slice(0, 900) };

    const out: any = parsed;

    // aplica regras de segurança
    out.dataExecucao = execDateBR;
    out.sistema = "CRD";
    out.temas = sanitizeThemes(out.temas ?? task.temas);
    out.tipoTrabalho = sanitizeTipo(out.tipoTrabalho ?? task.tipoTrabalho);
    out.artefato = out.artefato ?? task.artefato ?? null;

    // evidências NÃO mudam
    out.evidencias = (Array.isArray(task.evidencias) ? task.evidencias : [])
        .slice(0, 3)
        .map((x: any) => String(x).slice(0, 200));

    // sem UST por enquanto (evita delírio do modelo)
    out.atividadeUst = null;
    out.complexidadeUst = null;

    if (!Number.isFinite(out.confianca)) out.confianca = 0.6;
    if (!out.justificativa) out.justificativa = "Refinado pelo LLM (strict rewriter).";

    if (!out.titulo || !out.descricao) return { ok: false as const, err: "LLM retornou task incompleta (titulo/descricao vazios)" };

    // bloqueia frases proibidas
    const bad = /(analisar e encaminhar ação|detalhar a necessidade|propor ajuste\/ação)/i;
    if (bad.test(String(out.titulo)) || bad.test(String(out.descricao))) {
        return { ok: false as const, err: "LLM usou frase genérica proibida; fallback heurístico." };
    }

    return { ok: true as const, task: out };
}

export async function extractSuggestions(meeting: any, diarizedText: string, collaborators: any[], catalogSample: any[]) {
    const execDateBR = meeting?.execDate
        ? toBRDate(String(meeting.execDate))
        : meeting?.createdAt
            ? toBRDate(String(meeting.createdAt))
            : toBRDate(new Date().toISOString());

    // baseline: alto recall e já específico (sem "encaminhar ação")
    const baseline = heuristicCRD(diarizedText, execDateBR);

    const provider = (process.env.LLM_PROVIDER ?? "").toLowerCase();
    if (provider !== "ollama") return baseline;

    const baseUrl = process.env.OLLAMA_URL ?? "http://localhost:11434";
    const model = process.env.OLLAMA_MODEL ?? "phi3:mini";

    console.log("[LLM] provider=", provider, "model=", model, "url=", baseUrl);
    console.log("[LLM] baseline tasks=", baseline.tasks?.length ?? 0);

    const refined: any[] = [];
    const errors: string[] = [];

    for (const t of baseline.tasks) {
        try {
            const r = await enrichSingleTaskWithOllama({ baseUrl, model, execDateBR, task: t });
            if (r.ok) refined.push(r.task);
            else {
                refined.push(t);
                errors.push(String(r.err ?? "erro desconhecido").slice(0, 220));
            }
        } catch (e: any) {
            refined.push(t);
            errors.push(String(e?.message ?? e).slice(0, 220));
        }
    }

    return {
        mode: "ollama",
        summary: baseline.summary,
        tasks: refined.slice(0, 12),
        gaps: [],
        ...(errors.length ? { llmError: `Algumas tasks não foram refinadas: ${errors.slice(0, 4).join(" | ")}`, llmModel: model } : {}),
    };
}
