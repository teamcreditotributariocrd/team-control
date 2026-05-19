// apps/api/src/routes/meetings.ts
import type { FastifyInstance } from "fastify";
import fs from "node:fs";
import path from "node:path";
import { getUser, assertAdmin } from "../infra/auth.js";
import { extractCraigZip, transcribeTracks, extractSuggestions } from "../services/meetingProcessor.js";

function q(req: any, key: string) {
    return (req.query as any)?.[key];
}

function extOf(name: string) {
    return String(path.extname(name || "")).toLowerCase();
}
function isZipFile(name: string) {
    return extOf(name) === ".zip";
}
function isAudioFile(name: string) {
    const ext = extOf(name);
    return [".wav", ".flac", ".mp3", ".m4a", ".ogg", ".opus"].includes(ext);
}

export async function meetingsRoutes(app: FastifyInstance, deps: any) {
    // LIST
    app.get("/api/meetings", async (req, reply) => {
        const user = getUser(req);
        if (user.role !== "admin") return reply.send([]);

        const rows = deps.meetingStore.list({
            status: q(req, "status") || undefined,
            from: q(req, "from") || undefined,
            to: q(req, "to") || undefined,
            search: q(req, "search") || undefined,
        });

        return reply.send(
            rows.map((m: any) => ({
                id: m.id,
                execDate: m.execDate ?? (m.createdAt ? String(m.createdAt).slice(0, 10) : null),
                title: m.title,
                status: m.status,
                error: m.error ?? null,
                errorStage: m.errorStage ?? null,
                createdAt: m.createdAt,
            }))
        );
    });

    // CREATE + UPLOAD (ZIP OU AUDIO)
    app.post("/api/meetings/upload", async (req, reply) => {
        const user = getUser(req);
        try {
            assertAdmin(user);
        } catch {
            return reply.code(403).send({ error: "FORBIDDEN" });
        }

        const title = String((req.query as any)?.title ?? "Reunião").trim() || "Reunião";
        const execDate = (req.query as any)?.execDate ? String((req.query as any)?.execDate) : undefined;

        const m = deps.meetingStore.create(title, execDate);

        const mp = await (req as any).file();
        if (!mp) return reply.code(400).send({ error: "file is required" });

        const filename = String(mp.filename ?? "upload");
        const buf = await mp.toBuffer();

        // ZIP (multi-track)
        if (isZipFile(filename)) {
            fs.writeFileSync(m.zipPath, buf);
            deps.meetingStore.update(m.id, {
                status: "UPLOADED",
                error: null,
                errorStage: null,
                errorDetails: null,
                tracks: [], // garante que process vai extrair do zip
            });
            return reply.send({ ok: true, meetingId: m.id, inputKind: "ZIP" });
        }

        // AUDIO (single-track)
        if (isAudioFile(filename)) {
            const filesDir = path.join(m.dir, "files");
            const ext = extOf(filename) || ".wav";
            const audioName = `audio${ext}`;
            const audioAbs = path.join(filesDir, audioName);

            fs.writeFileSync(audioAbs, buf);

            const track = {
                id: "single",
                filename: `files/${audioName}`,
                ext,
                size: buf.length,
                speakerGuess: "Single",
                collaboratorUniqueName: null,
                transcriptPath: null,
                _absPath: audioAbs,
            };

            deps.meetingStore.update(m.id, {
                status: "UPLOADED",
                error: null,
                errorStage: null,
                errorDetails: null,
                tracks: [track], // ✅ já pronto, sem zip
            });

            return reply.send({ ok: true, meetingId: m.id, inputKind: "AUDIO" });
        }

        return reply.code(400).send({ error: `Unsupported file type: ${filename}` });
    });

    // PROCESS
    app.post("/api/meetings/:id/process", async (req, reply) => {
        const user = getUser(req);
        try {
            assertAdmin(user);
        } catch {
            return reply.code(403).send({ error: "FORBIDDEN" });
        }

        const id = String((req.params as any).id);
        const m0 = deps.meetingStore.get(id);
        if (!m0) return reply.code(404).send({ error: "not found" });

        if (m0.status === "TRANSCRIBING" || m0.status === "EXTRACTING") {
            return reply.send({ ok: true, meetingId: id, status: m0.status, alreadyRunning: true });
        }

        deps.meetingStore.update(id, { status: "EXTRACTED", error: null, errorStage: null, errorDetails: null });

        setImmediate(async () => {
            try {
                // 1) tracks: se já tem track (single audio), não extrai zip
                let tracks: any[] = [];
                try {
                    const m = deps.meetingStore.get(id);

                    if (m.tracks && Array.isArray(m.tracks) && m.tracks.length > 0) {
                        tracks = m.tracks;
                        deps.meetingStore.update(id, { status: "TRANSCRIBING", error: null, errorStage: null, errorDetails: null });
                    } else {
                        tracks = await extractCraigZip(m);
                        deps.meetingStore.update(id, { tracks, status: "TRANSCRIBING", error: null, errorStage: null, errorDetails: null });
                    }
                } catch (e: any) {
                    deps.meetingStore.setError(id, e, "EXTRACT_OR_LOAD_TRACKS");
                    return;
                }

                // 2) transcribe
                let result: any;
                try {
                    const m = deps.meetingStore.get(id);
                    result = await transcribeTracks(m, tracks);
                    deps.meetingStore.update(id, {
                        status: "TRANSCRIBED",
                        tracks: result.tracks,
                        diarizedTranscriptPath: result.diarizedTranscriptPath,
                        error: null,
                        errorStage: null,
                        errorDetails: null,
                    });
                } catch (e: any) {
                    deps.meetingStore.setError(id, e, "TRANSCRIBE");
                    return;
                }

                // 3) suggestions
                deps.meetingStore.update(id, { status: "EXTRACTING" });

                try {
                    const m = deps.meetingStore.get(id);
                    const diarizedAbs = path.join(m.dir, result.diarizedTranscriptPath);
                    const diarizedText = fs.readFileSync(diarizedAbs, "utf-8");

                    const collaborators = deps.collabStore.list().filter((c: any) => c.isActive);
                    const catPage = deps.store.getCatalogPage({ offset: 0, limit: 120 });
                    const catSample = catPage.rows;

                    const out = await extractSuggestions(m, diarizedText, collaborators, catSample);
                    const outPath = path.join(m.dir, "out", "suggestions.json");
                    fs.writeFileSync(outPath, JSON.stringify(out, null, 2), "utf-8");

                    deps.meetingStore.update(id, {
                        status: "READY",
                        suggestionsPath: path.relative(m.dir, outPath).replace(/\\/g, "/"),
                        error: null,
                        errorStage: null,
                        errorDetails: null,
                    });
                } catch (e: any) {
                    deps.meetingStore.setError(id, e, "LLM_OR_SAVE");
                    return;
                }
            } catch (e: any) {
                deps.meetingStore.setError(id, e, "UNKNOWN");
            }
        });

        return reply.send({ ok: true, meetingId: id, status: "STARTED" });
    });

    // STATUS (poll)
    app.get("/api/meetings/:id/status", async (req, reply) => {
        const user = getUser(req);
        try {
            assertAdmin(user);
        } catch {
            return reply.code(403).send({ error: "FORBIDDEN" });
        }

        const id = String((req.params as any).id);
        const m = deps.meetingStore.get(id);
        if (!m) return reply.code(404).send({ error: "not found" });

        return reply.send({
            id: m.id,
            status: m.status,
            error: m.error,
            errorStage: m.errorStage ?? null,
        });
    });

    // DETAIL
    app.get("/api/meetings/:id", async (req, reply) => {
        const user = getUser(req);
        try {
            assertAdmin(user);
        } catch {
            return reply.code(403).send({ error: "FORBIDDEN" });
        }

        const id = String((req.params as any).id);
        const m = deps.meetingStore.get(id);
        if (!m) return reply.code(404).send({ error: "not found" });

        const readIf = (rel: string | null) => {
            if (!rel) return null;
            const abs = path.join(m.dir, rel);
            if (!fs.existsSync(abs)) return null;
            return fs.readFileSync(abs, "utf-8");
        };

        const diarized = readIf(m.diarizedTranscriptPath);
        const suggestions = m.suggestionsPath
            ? JSON.parse(fs.readFileSync(path.join(m.dir, m.suggestionsPath), "utf-8"))
            : null;

        return reply.send({ meeting: m, diarized, suggestions });
    });

    // DELETE single (opcional deleteFiles)
    app.delete("/api/meetings/:id", async (req, reply) => {
        const user = getUser(req);
        try {
            assertAdmin(user);
        } catch {
            return reply.code(403).send({ error: "FORBIDDEN" });
        }

        const id = String((req.params as any).id);
        const deleteFiles = String((req.query as any)?.deleteFiles ?? "false").toLowerCase() === "true";
        return reply.send(deps.meetingStore.delete(id, { deleteFiles }));
    });

    // CLEAR bulk
    app.delete("/api/meetings/clear", async (req, reply) => {
        const user = getUser(req);
        try {
            assertAdmin(user);
        } catch {
            return reply.code(403).send({ error: "FORBIDDEN" });
        }

        const status = (req.query as any)?.status ? String((req.query as any)?.status) : undefined;
        const before = (req.query as any)?.before ? String((req.query as any)?.before) : undefined;
        const deleteFiles = String((req.query as any)?.deleteFiles ?? "false").toLowerCase() === "true";

        return reply.send(deps.meetingStore.clear({ status, before, deleteFiles }));
    });
}