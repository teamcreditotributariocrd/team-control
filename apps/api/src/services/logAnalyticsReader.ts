import fs from "node:fs";
import path from "node:path";
import type { LogSource } from "../store/logAnalyticsStore.js";

export type BaixaExecution = {
    file: string;
    startedAt: string;
    finishedAt: string | null;
    durationSeconds: number | null;
    emittedProcessed: number;
    updatedToPaid: number;
    paidProcessed: number;
    loweredSuccess: number;
    errorsFound: number;
};

type LogError = {
    at: string;
    file: string;
    message: string;
    signature: string;
};

function asDateKey(raw: string) {
    const m = raw.match(/^(\d{2})\/(\d{2})\/(\d{4}) (\d{2}:\d{2}:\d{2})$/);
    return m ? `${m[3]}-${m[2]}-${m[1]}T${m[4]}` : raw;
}

function asNumber(raw: string) {
    const value = Number(String(raw).replace(/[^\d-]/g, ""));
    return Number.isFinite(value) ? value : 0;
}

function durationSeconds(raw: string) {
    const m = raw.match(/(\d{2}):(\d{2}):(\d{2})/);
    return m ? Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3]) : null;
}

function signature(message: string) {
    return message
        .replace(/\bDAEMS?\s+\d+/gi, "DAEMS")
        .replace(/R\$\s*[\d.,]+/g, "R$")
        .replace(/\b\d{6,}\b/g, "#")
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, 240);
}

function metric(line: string, label: string) {
    const match = line.match(new RegExp(`${label}:\\s*(.+)$`, "i"));
    return match ? asNumber(match[1]) : null;
}

function parseBaixaFile(file: string, content: string) {
    const executions: BaixaExecution[] = [];
    const errors: LogError[] = [];
    let current: BaixaExecution | null = null;

    for (const rawLine of content.split(/\r?\n/)) {
        const parsed = rawLine.match(/^"([^"]+)"(.*)$/);
        if (!parsed) continue;
        const at = asDateKey(parsed[1]);
        const line = parsed[2].trim();

        if (line.includes("INICIANDO") && line.includes("BAIXA")) {
            current = {
                file,
                startedAt: at,
                finishedAt: null,
                durationSeconds: null,
                emittedProcessed: 0,
                updatedToPaid: 0,
                paidProcessed: 0,
                loweredSuccess: 0,
                errorsFound: 0,
            };
            continue;
        }

        if (!current) continue;

        if (line.startsWith("[ERRO")) {
            errors.push({ at, file, message: line, signature: signature(line) });
        }

        const duration = line.match(/Dura.+?o Total:\s*(.+)$/i);
        if (duration) current.durationSeconds = durationSeconds(duration[1]);

        const emitted = metric(line, "Processados \\(Emitidos\\)");
        if (emitted !== null) current.emittedProcessed = emitted;
        const updated = metric(line, "Atualizados para Pago");
        if (updated !== null) current.updatedToPaid = updated;
        const paid = metric(line, "Processados \\(Pagos\\)");
        if (paid !== null) current.paidProcessed = paid;
        const lowered = metric(line, "Baixados com Sucesso");
        if (lowered !== null) current.loweredSuccess = lowered;
        const foundErrors = metric(line, "Erros Encontrados");
        if (foundErrors !== null) current.errorsFound = foundErrors;

        if (line.includes("FIM DA")) {
            current.finishedAt = at;
            executions.push(current);
            current = null;
        }
    }

    return { executions, errors };
}

function logDate(name: string, prefix: string) {
    const escaped = prefix.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const match = name.match(new RegExp(`^${escaped}\\.(\\d{8})\\.log$`, "i"));
    return match ? `${match[1].slice(0, 4)}-${match[1].slice(4, 6)}-${match[1].slice(6, 8)}` : null;
}

function groupErrors(errors: LogError[]) {
    const map = new Map<string, { signature: string; count: number; lastAt: string; samples: string[] }>();
    for (const error of errors) {
        const item = map.get(error.signature) ?? { signature: error.signature, count: 0, lastAt: error.at, samples: [] };
        item.count += 1;
        if (error.at > item.lastAt) item.lastAt = error.at;
        if (item.samples.length < 3 && !item.samples.includes(error.message)) item.samples.push(error.message);
        map.set(error.signature, item);
    }
    return Array.from(map.values()).sort((a, b) => b.count - a.count || b.lastAt.localeCompare(a.lastAt)).slice(0, 10);
}

export async function analyzeLogSource(source: LogSource, days = 14) {
    if (source.parser !== "CREDTRIB_BAIXA_AUTOMATICA") throw new Error(`Parser nao suportado: ${source.parser}`);
    const maxDays = Math.max(1, Math.min(Number(days) || 14, 31));
    const entries = await fs.promises.readdir(source.path, { withFileTypes: true });
    const files = entries
        .filter((entry) => entry.isFile())
        .map((entry) => ({ name: entry.name, date: logDate(entry.name, source.filePrefix) }))
        .filter((entry): entry is { name: string; date: string } => Boolean(entry.date))
        .sort((a, b) => b.date.localeCompare(a.date))
        .slice(0, maxDays);

    const executions: BaixaExecution[] = [];
    const errors: LogError[] = [];
    for (const file of files) {
        const content = await fs.promises.readFile(path.join(source.path, file.name), "utf-8");
        const parsed = parseBaixaFile(file.name, content);
        executions.push(...parsed.executions);
        errors.push(...parsed.errors);
    }

    executions.sort((a, b) => b.startedAt.localeCompare(a.startedAt));
    const durationRows = executions.filter((run) => run.durationSeconds !== null);
    const byDay = new Map<string, { day: string; executions: number; errors: number; loweredSuccess: number; averageDurationSeconds: number }>();
    for (const run of executions) {
        const day = run.startedAt.slice(0, 10);
        const row = byDay.get(day) ?? { day, executions: 0, errors: 0, loweredSuccess: 0, averageDurationSeconds: 0 };
        row.executions += 1;
        row.errors += run.errorsFound;
        row.loweredSuccess += run.loweredSuccess;
        row.averageDurationSeconds += run.durationSeconds ?? 0;
        byDay.set(day, row);
    }

    return {
        source,
        files: files.map((file) => file.name),
        kpis: {
            executions: executions.length,
            runsWithErrors: executions.filter((run) => run.errorsFound > 0).length,
            errorsFound: executions.reduce((sum, run) => sum + run.errorsFound, 0),
            loweredSuccess: executions.reduce((sum, run) => sum + run.loweredSuccess, 0),
            updatedToPaid: executions.reduce((sum, run) => sum + run.updatedToPaid, 0),
            averageDurationSeconds: durationRows.length
                ? Math.round(durationRows.reduce((sum, run) => sum + (run.durationSeconds ?? 0), 0) / durationRows.length)
                : 0,
            lastRunAt: executions[0]?.startedAt ?? null,
        },
        executions: executions.slice(0, 120),
        daily: Array.from(byDay.values())
            .map((day) => ({ ...day, averageDurationSeconds: day.executions ? Math.round(day.averageDurationSeconds / day.executions) : 0 }))
            .sort((a, b) => b.day.localeCompare(a.day)),
        errorPatterns: groupErrors(errors),
        recentErrors: errors.sort((a, b) => b.at.localeCompare(a.at)).slice(0, 30),
    };
}
