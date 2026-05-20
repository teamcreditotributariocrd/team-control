import path from "node:path";
import fs from "node:fs";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

/**
 * Resolve o APP_ROOT de forma robusta.
 * Regra: sobe diretórios até encontrar um diretório que possua a pasta "bin".
 * (No seu projeto, bin fica em apps/api/bin)
 */
function findAppRoot(startDir: string) {
    let dir = startDir;

    for (let i = 0; i < 12; i++) {
        if (fs.existsSync(path.join(dir, "package.json")) && fs.existsSync(path.join(dir, "src"))) return dir;
        const parent = path.dirname(dir);
        if (parent === dir) break;
        dir = parent;
    }

    // fallback: se você roda o server com CWD em apps/api, isso resolve:
    if (fs.existsSync(path.join(process.cwd(), "package.json")) && fs.existsSync(path.join(process.cwd(), "src"))) {
        return process.cwd();
    }

    throw new Error(
        `APP_ROOT not found. startDir=${startDir} cwd=${process.cwd()} (expected apps/api package.json and src)`
    );
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// APP_ROOT deve virar: C:\...\team-control\apps\api
export const APP_ROOT = findAppRoot(__dirname);
export const BIN_DIR = path.join(APP_ROOT, "bin");
export const DATA_DIR = path.join(APP_ROOT, "data");
fs.mkdirSync(DATA_DIR, { recursive: true });

function findWhisperExe() {
    const candidates = [
        path.join(BIN_DIR, "whispercpp", "whisper-cli.exe"),
        path.join(BIN_DIR, "whispercpp", "main.exe"),
        path.join(BIN_DIR, "whispercpp", "whisper.exe"),
    ];

    const hit = candidates.find((p) => fs.existsSync(p));
    if (!hit) {
        throw new Error(
            `Whisper exe not found. Tried:\n${candidates.join("\n")}\nAPP_ROOT=${APP_ROOT}\nCWD=${process.cwd()}`
        );
    }
    return hit;
}

export type WhisperRunParams = {
    meetingId: string;
    wavFileName: string; // ex: "audio.wav"
    outId: string;       // ex: "mSLKjZQD"
    language?: string;   // default "pt"
    modelFileName?: string; // default "ggml-small.bin"
};

export async function runWhisper(params: WhisperRunParams) {
    const { meetingId, wavFileName, outId } = params;
    const language = params.language ?? "pt";
    const modelFileName = params.modelFileName ?? "ggml-small.bin";

    const exePath = findWhisperExe();

    // ✅ modelo em apps/api/bin/whispercpp/models/ggml-small.bin
    const modelPath = path.join(BIN_DIR, "whispercpp", "models", modelFileName);

    // ✅ wav em apps/api/data/meetings/<id>/files/<wav>
    const wavPath = path.join(DATA_DIR, "meetings", meetingId, "files", wavFileName);

    // ✅ outPrefix em apps/api/data/meetings/<id>/out/<outId>
    const outPrefix = path.join(DATA_DIR, "meetings", meetingId, "out", outId);

    // Debug (deixe ligado até estabilizar)
    console.log("CWD:", process.cwd());
    console.log("APP_ROOT:", APP_ROOT);
    console.log("exePath:", exePath, "exists?", fs.existsSync(exePath));
    console.log("modelPath:", modelPath, "exists?", fs.existsSync(modelPath));
    console.log("wavPath:", wavPath, "exists?", fs.existsSync(wavPath));
    console.log("outPrefix:", outPrefix);

    // Validações claras (em vez de ENOENT obscuro)
    if (!fs.existsSync(exePath)) throw new Error(`Missing exe: ${exePath}`);
    if (!fs.existsSync(modelPath)) throw new Error(`Missing model: ${modelPath}`);
    if (!fs.existsSync(wavPath)) throw new Error(`Missing wav: ${wavPath}`);

    // Garante diretório de saída
    fs.mkdirSync(path.dirname(outPrefix), { recursive: true });

    const args = [
        "-m", modelPath,
        "-l", language,
        "-f", wavPath,
        "-of", outPrefix,
        "-otxt",
        "-oj",
    ];

    // Importante: cwd na pasta do exe para DLLs (ggml.dll etc.)
    const spawnCwd = path.dirname(exePath);

    return await new Promise<{ code: number; stderr: string }>((resolve, reject) => {
        const p = spawn(exePath, args, { cwd: spawnCwd, windowsHide: true });

        let stderr = "";
        p.stderr.on("data", (d) => (stderr += d.toString()));

        p.on("error", (err) => reject(err));
        p.on("close", (code) => {
            if (code === 0) resolve({ code: 0, stderr });
            else reject(new Error(`whisper exited with code=${code}. stderr=${stderr}`));
        });
    });
}
