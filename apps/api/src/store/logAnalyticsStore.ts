import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export type LogParser = "CREDTRIB_BAIXA_AUTOMATICA";

export type LogSource = {
    id: string;
    name: string;
    system: string;
    description: string;
    path: string;
    filePrefix: string;
    parser: LogParser;
    createdAt: string;
    updatedAt: string;
};

export type LogSourceDraft = Pick<LogSource, "name" | "system" | "description" | "path" | "filePrefix" | "parser">;

const PILOT_SOURCE: LogSourceDraft = {
    name: "Baixa automatica",
    system: "CREDTRIB",
    description: "Execucoes do servico de baixa automatica de DAEMS.",
    path: "\\\\s481.ms\\SERVICOS\\CRDDIA\\CREDTRIBBaixaAutomatica\\logs",
    filePrefix: "CREDTRIBBaixaAutomatica.exe",
    parser: "CREDTRIB_BAIXA_AUTOMATICA",
};

function resolveApiDataDir() {
    const __filename = fileURLToPath(import.meta.url);
    const __dirname = path.dirname(__filename);
    return path.resolve(__dirname, "..", "..", "data");
}

function ensureDir(p: string) {
    if (!fs.existsSync(p)) fs.mkdirSync(p, { recursive: true });
}

function uid() {
    return Math.random().toString(16).slice(2) + "-" + Date.now().toString(16);
}

export function createLogAnalyticsStore(dataDir = resolveApiDataDir()) {
    ensureDir(dataDir);
    const file = path.join(dataDir, "logAnalyticsSources.json");
    let sources: LogSource[] = [];

    function persist() {
        fs.writeFileSync(file, JSON.stringify(sources, null, 2), "utf-8");
    }

    function source(draft: LogSourceDraft): LogSource {
        const now = new Date().toISOString();
        return { id: uid(), ...draft, createdAt: now, updatedAt: now };
    }

    function load() {
        if (fs.existsSync(file)) {
            const parsed = JSON.parse(fs.readFileSync(file, "utf-8"));
            sources = Array.isArray(parsed) ? parsed : [];
            return;
        }
        sources = [source(PILOT_SOURCE)];
        persist();
    }

    load();

    return {
        list() {
            return sources.slice().sort((a, b) => a.system.localeCompare(b.system) || a.name.localeCompare(b.name));
        },
        get(id: string) {
            return sources.find((item) => item.id === id) ?? null;
        },
        upsert(input: LogSourceDraft & { id?: string }) {
            const idx = input.id ? sources.findIndex((item) => item.id === input.id) : -1;
            const previous = idx >= 0 ? sources[idx] : null;
            const next: LogSource = previous
                ? { ...previous, ...input, id: previous.id, createdAt: previous.createdAt, updatedAt: new Date().toISOString() }
                : source(input);
            if (idx >= 0) sources[idx] = next;
            else sources.push(next);
            persist();
            return next;
        },
        remove(id: string) {
            const before = sources.length;
            sources = sources.filter((item) => item.id !== id);
            if (sources.length !== before) persist();
            return sources.length !== before;
        },
    };
}
