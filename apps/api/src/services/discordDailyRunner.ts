import { spawn } from "node:child_process";
import path from "node:path";

export function runDiscordDailyScript(apiRoot: string) {
    const scriptPath = path.join(apiRoot, "scripts", "sendDiscordDaily.mjs");
    const port = process.env.PORT ?? "3001";
    const env = {
        ...process.env,
        ALERT_API_BASE: process.env.ALERT_API_BASE ?? `http://127.0.0.1:${port}`,
    };

    return new Promise<{ ok: boolean; message: string }>((resolve) => {
        const child = spawn(process.execPath, [scriptPath], {
            cwd: apiRoot,
            env,
            windowsHide: true,
        });

        let stdout = "";
        let stderr = "";
        child.stdout.on("data", (d) => (stdout += d.toString()));
        child.stderr.on("data", (d) => (stderr += d.toString()));
        child.on("error", (err) => resolve({ ok: false, message: err.message }));
        child.on("close", (code) => {
            const message = [stdout.trim(), stderr.trim()].filter(Boolean).join("\n").slice(0, 1200);
            resolve({ ok: code === 0, message: message || `script exited with code ${code}` });
        });
    });
}

export function startDiscordDailyScheduler(args: {
    apiRoot: string;
    store: ReturnType<typeof import("../store/alertScheduleStore.js").createAlertScheduleStore>;
    logger: { info: (data: any, msg?: string) => void; error: (data: any, msg?: string) => void };
}) {
    const running = new Set<string>();
    const completed = new Set<string>();

    async function tick() {
        const schedule = args.store.get();
        if (!schedule.enabled) return;

        const now = new Date();
        const hh = String(now.getHours()).padStart(2, "0");
        const mm = String(now.getMinutes()).padStart(2, "0");
        const time = `${hh}:${mm}`;
        if (!schedule.times.includes(time)) return;

        const day = now.toISOString().slice(0, 10);
        const key = `${day}-${time}`;
        if (running.has(key) || completed.has(key)) return;
        running.add(key);

        args.logger.info({ time }, "running scheduled Discord daily report");
        const result = await runDiscordDailyScript(args.apiRoot);
        running.delete(key);
        completed.add(key);
        args.store.recordRun(result.ok ? "OK" : "ERROR", result.message);

        if (result.ok) args.logger.info({ time, message: result.message }, "Discord daily report sent");
        else args.logger.error({ time, message: result.message }, "Discord daily report failed");
    }

    const interval = setInterval(() => {
        tick().catch((err) => {
            const message = String(err?.message ?? err);
            args.store.recordRun("ERROR", message);
            args.logger.error({ err: message }, "Discord daily scheduler tick failed");
        });
    }, 30_000);

    void tick();
    return () => clearInterval(interval);
}
