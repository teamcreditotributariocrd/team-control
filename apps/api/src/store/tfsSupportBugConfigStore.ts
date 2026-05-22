import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { DEFAULT_SUPPORT_BUG_ITERATION_PATH, SUPPORT_BUG_AREA_PATH } from "../services/tfsBugCreator.js";

export type TfsSupportBugConfig = {
    areaPath: string;
    iterationPath: string;
    updatedAt: string | null;
};

const DEFAULT_CONFIG: TfsSupportBugConfig = {
    areaPath: SUPPORT_BUG_AREA_PATH,
    iterationPath: DEFAULT_SUPPORT_BUG_ITERATION_PATH,
    updatedAt: null,
};

function resolveApiDataDir() {
    const __filename = fileURLToPath(import.meta.url);
    const __dirname = path.dirname(__filename);
    return path.resolve(__dirname, "..", "..", "data");
}

function ensureDir(p: string) {
    if (!fs.existsSync(p)) fs.mkdirSync(p, { recursive: true });
}

function cleanIterationPath(value: unknown) {
    return String(value ?? "").trim().slice(0, 255);
}

export function createTfsSupportBugConfigStore(dataDir = resolveApiDataDir()) {
    ensureDir(dataDir);
    const file = path.join(dataDir, "tfsSupportBugConfig.json");
    let config: TfsSupportBugConfig = { ...DEFAULT_CONFIG };

    function persist() {
        fs.writeFileSync(file, JSON.stringify(config, null, 2), "utf-8");
    }

    function load() {
        if (!fs.existsSync(file)) {
            persist();
            return;
        }

        const parsed = JSON.parse(fs.readFileSync(file, "utf-8"));
        config = {
            ...DEFAULT_CONFIG,
            iterationPath: cleanIterationPath(parsed?.iterationPath) || DEFAULT_CONFIG.iterationPath,
            updatedAt: parsed?.updatedAt ?? null,
        };
    }

    load();

    return {
        get() {
            return { ...config };
        },
        update(iterationPath: string) {
            config = {
                ...config,
                iterationPath: cleanIterationPath(iterationPath) || config.iterationPath,
                updatedAt: new Date().toISOString(),
            };
            persist();
            return this.get();
        },
    };
}
