import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export type DiscordDailySchedule = {
    enabled: boolean;
    times: string[];
    lastRunAt: string | null;
    lastRunStatus: "OK" | "ERROR" | null;
    lastRunMessage: string | null;
};

const DEFAULT_SCHEDULE: DiscordDailySchedule = {
    enabled: true,
    times: ["09:00", "15:00"],
    lastRunAt: null,
    lastRunStatus: null,
    lastRunMessage: null,
};

function resolveApiDataDir() {
    const __filename = fileURLToPath(import.meta.url);
    const __dirname = path.dirname(__filename);
    return path.resolve(__dirname, "..", "..", "data");
}

function ensureDir(p: string) {
    if (!fs.existsSync(p)) fs.mkdirSync(p, { recursive: true });
}

function cleanTimes(times: unknown) {
    const arr = Array.isArray(times) ? times : [];
    return Array.from(new Set(
        arr
            .map((x) => String(x ?? "").trim())
            .filter((x) => /^\d{2}:\d{2}$/.test(x))
            .filter((x) => {
                const [hh, mm] = x.split(":").map(Number);
                return hh >= 0 && hh <= 23 && mm >= 0 && mm <= 59;
            })
    )).sort();
}

export function createAlertScheduleStore(dataDir = resolveApiDataDir()) {
    ensureDir(dataDir);
    const file = path.join(dataDir, "discordDailySchedule.json");
    let schedule: DiscordDailySchedule = { ...DEFAULT_SCHEDULE };

    function persist() {
        fs.writeFileSync(file, JSON.stringify(schedule, null, 2), "utf-8");
    }

    function load() {
        if (!fs.existsSync(file)) {
            persist();
            return;
        }
        const parsed = JSON.parse(fs.readFileSync(file, "utf-8"));
        schedule = {
            ...DEFAULT_SCHEDULE,
            ...parsed,
            enabled: Boolean(parsed?.enabled),
            times: cleanTimes(parsed?.times).length ? cleanTimes(parsed?.times) : DEFAULT_SCHEDULE.times,
        };
    }

    load();

    return {
        get() {
            return { ...schedule, times: [...schedule.times] };
        },
        update(patch: Partial<DiscordDailySchedule>) {
            const times = patch.times === undefined ? schedule.times : cleanTimes(patch.times);
            schedule = {
                ...schedule,
                enabled: patch.enabled === undefined ? schedule.enabled : Boolean(patch.enabled),
                times: times.length ? times : schedule.times,
            };
            persist();
            return this.get();
        },
        recordRun(status: "OK" | "ERROR", message: string) {
            schedule = {
                ...schedule,
                lastRunAt: new Date().toISOString(),
                lastRunStatus: status,
                lastRunMessage: message.slice(0, 1200),
            };
            persist();
            return this.get();
        },
    };
}
