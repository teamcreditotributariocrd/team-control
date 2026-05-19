import type { FastifyInstance } from "fastify";
import { runWhisper } from "../services/whisperRunner.js";

export async function transcribeRoutes(app: FastifyInstance) {
    app.post("/api/transcribe", async (req, reply) => {
        try {
            const body = req.body as any;

            const meetingId = body.meetingId;
            const wavFileName = body.wavFileName; // ex: "arquivo.wav"
            const outId = body.outId ?? "out";

            await runWhisper({ meetingId, wavFileName, outId, language: "pt", modelFileName: "ggml-small.bin" });

            return reply.send({ ok: true });
        } catch (err: any) {
            return reply.code(500).send({ ok: false, message: err?.message ?? String(err) });
        }
    });
}