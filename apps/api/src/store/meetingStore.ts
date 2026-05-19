// apps/api/src/store/meetingStore.ts
import fs from "node:fs";
import path from "node:path";
import { nanoid } from "nanoid";
import { fileURLToPath } from "node:url";

export type MeetingStatus =
    | "UPLOADED"
    | "EXTRACTED"
    | "TRANSCRIBING"
    | "TRANSCRIBED"
    | "EXTRACTING"
    | "READY"
    | "ERROR";

export type MeetingTrack = {
    id: string;
    filename: string;
    ext: string;
    size: number;
    speakerGuess: string | null;
    collaboratorUniqueName: string | null;
    transcriptPath: string | null;
};

export type Meeting = {
    id: string;
    createdAt: string;
    execDate: string; // YYYY-MM-DD
    title: string;
    status: MeetingStatus;

    error: string | null;
    errorStage: string | null;
    errorDetails: string | null;

    zipPath: string;
    dir: string;
    tracks: MeetingTrack[];
    diarizedTranscriptPath: string | null;
    suggestionsPath: string | null;
};

function ensureDir(p: string) {
    if (!fs.existsSync(p)) fs.mkdirSync(p, { recursive: true });
}

function resolveApiRoot() {
    const __filename = fileURLToPath(import.meta.url);
    const __dirname = path.dirname(__filename);
    // __dirname = apps/api/src/store  -> apps/api
    return path.resolve(__dirname, "..", "..");
}

function ymdFromIso(iso: string) {
    return iso.slice(0, 10);
}

export function createMeetingStore(baseDir?: string) {
    const apiRoot = resolveApiRoot();
    const finalBaseDir = baseDir ?? path.join(apiRoot, "data", "meetings");
    ensureDir(finalBaseDir);

    const indexFile = path.join(finalBaseDir, "_index.json");
    let index: Record<string, Meeting> = {};

    if (fs.existsSync(indexFile)) {
        index = JSON.parse(fs.readFileSync(indexFile, "utf-8"));
    }

    function persist() {
        fs.writeFileSync(indexFile, JSON.stringify(index, null, 2), "utf-8");
    }

    function safeRmDir(dir: string) {
        if (dir && fs.existsSync(dir)) fs.rmSync(dir, { recursive: true, force: true });
    }

    return {
        baseDir: finalBaseDir,
        indexFile,

        create(title: string, execDate?: string) {
            const id = nanoid(10);
            const dir = path.join(finalBaseDir, id);
            ensureDir(dir);
            ensureDir(path.join(dir, "files"));
            ensureDir(path.join(dir, "out"));

            const nowIso = new Date().toISOString();

            const m: Meeting = {
                id,
                createdAt: nowIso,
                execDate: execDate ?? ymdFromIso(nowIso),
                title,
                status: "UPLOADED",
                error: null,
                errorStage: null,
                errorDetails: null,
                zipPath: path.join(dir, "raw.zip"),
                dir,
                tracks: [],
                diarizedTranscriptPath: null,
                suggestionsPath: null,
            };

            index[id] = m;
            persist();
            return m;
        },

        get(id: string) {
            return index[id] ?? null;
        },

        list(opts?: { status?: MeetingStatus; from?: string; to?: string; search?: string }) {
            let arr = Object.values(index);

            if (opts?.status) arr = arr.filter((x) => x.status === opts.status);
            if (opts?.from) arr = arr.filter((x) => x.execDate >= opts.from!);
            if (opts?.to) arr = arr.filter((x) => x.execDate <= opts.to!);

            if (opts?.search) {
                const s = opts.search.toLowerCase();
                arr = arr.filter((x) => (x.title ?? "").toLowerCase().includes(s));
            }

            return arr.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
        },

        update(id: string, patch: Partial<Meeting>) {
            const cur = index[id];
            if (!cur) throw new Error("Meeting not found");
            index[id] = { ...cur, ...patch };
            persist();
            return index[id];
        },

        setError(id: string, err: unknown, stage: string) {
            const cur = index[id];
            if (!cur) throw new Error("Meeting not found");

            const message =
                err instanceof Error ? err.message : typeof err === "string" ? err : "Unknown error";

            const details = err instanceof Error ? (err.stack ?? null) : null;

            index[id] = {
                ...cur,
                status: "ERROR",
                error: message,
                errorStage: stage,
                errorDetails: details,
            };
            persist();
            return index[id];
        },

        updateTrack(meetingId: string, trackId: string, patch: Partial<MeetingTrack>) {
            const m = index[meetingId];
            if (!m) throw new Error("Meeting not found");
            const tracks = m.tracks.map((t) => (t.id === trackId ? { ...t, ...patch } : t));
            index[meetingId] = { ...m, tracks };
            persist();
            return index[meetingId];
        },

        delete(id: string, opts?: { deleteFiles?: boolean }) {
            const cur = index[id];
            if (!cur) return { ok: true, deleted: false };
            if (opts?.deleteFiles) safeRmDir(cur.dir);
            delete index[id];
            persist();
            return { ok: true, deleted: true };
        },

        clear(opts?: { before?: string; status?: MeetingStatus; deleteFiles?: boolean }) {
            const ids = Object.values(index)
                .filter((m) => {
                    if (opts?.status && m.status !== opts.status) return false;
                    if (opts?.before && !(m.execDate < opts.before)) return false;
                    return true;
                })
                .map((m) => m.id);

            for (const id of ids) {
                const cur = index[id];
                if (opts?.deleteFiles && cur?.dir) safeRmDir(cur.dir);
                delete index[id];
            }
            persist();
            return { ok: true, deletedCount: ids.length, ids };
        },

        persist,
    };
}