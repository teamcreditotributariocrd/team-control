// apps/api/src/store/collaboratorsStore.ts
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export type Collaborator = {
    id: string;
    displayName: string;
    uniqueName: string; // FAZENDA\\xxx
    monthlyGoalUst: number;
    monthlyGoalsUst?: Record<string, number>;
    isActive: boolean;
    role: "admin" | "member";
    passwordHash?: string;
};

export type PublicCollaborator = Omit<Collaborator, "passwordHash"> & {
    hasPassword: boolean;
};

export function getGoalForMonth(collaborator: Pick<Collaborator, "monthlyGoalUst" | "monthlyGoalsUst">, month: string) {
    const monthGoal = collaborator.monthlyGoalsUst?.[month];
    return typeof monthGoal === "number" ? monthGoal : collaborator.monthlyGoalUst ?? 0;
}

function normalizeUniqueName(uniqueName: string) {
    const value = String(uniqueName ?? "").trim().toLowerCase();
    return value.includes("\\") ? value.split("\\").pop() || value : value;
}

function ensureDir(p: string) {
    if (!fs.existsSync(p)) fs.mkdirSync(p, { recursive: true });
}

function uid() {
    return Math.random().toString(16).slice(2) + "-" + Date.now().toString(16);
}

function resolveApiDataDir() {
    const __filename = fileURLToPath(import.meta.url);
    const __dirname = path.dirname(__filename);
    return path.resolve(__dirname, "..", "..", "data");
}

export function createCollaboratorsStore(dataDir = resolveApiDataDir()) {
    ensureDir(dataDir);
    const file = path.join(dataDir, "collaborators.json");

    let collaborators: Collaborator[] = [];

    function load() {
        if (fs.existsSync(file)) {
            collaborators = JSON.parse(fs.readFileSync(file, "utf-8"));
            if (mergeDuplicateCollaborators()) persist();
        }
    }
    function persist() {
        fs.writeFileSync(file, JSON.stringify(collaborators, null, 2), "utf-8");
    }

    function toPublic(c: Collaborator): PublicCollaborator {
        const { passwordHash, ...rest } = c;
        return { ...rest, hasPassword: Boolean(passwordHash) };
    }

    function mergeDuplicateCollaborators() {
        const byLogin = new Map<string, Collaborator>();
        let changed = false;

        for (const collaborator of collaborators) {
            const key = normalizeUniqueName(collaborator.uniqueName);
            const existing = byLogin.get(key);
            if (!existing) {
                byLogin.set(key, collaborator);
                continue;
            }

            changed = true;
            existing.displayName = existing.displayName || collaborator.displayName;
            existing.uniqueName = existing.uniqueName || collaborator.uniqueName;
            existing.monthlyGoalUst = collaborator.monthlyGoalUst || existing.monthlyGoalUst;
            existing.monthlyGoalsUst = {
                ...(existing.monthlyGoalsUst ?? {}),
                ...(collaborator.monthlyGoalsUst ?? {}),
            };
            existing.isActive = existing.isActive || collaborator.isActive;
            existing.role = existing.role === "admin" || collaborator.role === "admin" ? "admin" : "member";
            existing.passwordHash = existing.passwordHash || collaborator.passwordHash;
        }

        if (changed) collaborators = Array.from(byLogin.values());
        return changed;
    }

    load();

    // Seed (se vazio)
    if (collaborators.length === 0) {
        collaborators = [
            { id: uid(), displayName: "Hudson de Camargo Barbosa", uniqueName: "FAZENDA\\hbarbosa", monthlyGoalUst: 392, isActive: true, role: "member" },
            { id: uid(), displayName: "Jorge Barbosa de Souza Neto", uniqueName: "FAZENDA\\jbsouza", monthlyGoalUst: 859, isActive: true, role: "admin" },
            { id: uid(), displayName: "Leandro Camargo da Veiga", uniqueName: "FAZENDA\\lcveiga", monthlyGoalUst: 790, isActive: true, role: "member" },
            { id: uid(), displayName: "Luiz Felipe Matias da Silva", uniqueName: "FAZENDA\\lfmsilva", monthlyGoalUst: 543, isActive: true, role: "member" },
            { id: uid(), displayName: "Thiago Moreira Santos", uniqueName: "FAZENDA\\tmsantos", monthlyGoalUst: 452, isActive: true, role: "member" },
            { id: uid(), displayName: "Vinicius Paula Da Costa Souza", uniqueName: "FAZENDA\\vpsouza", monthlyGoalUst: 271, isActive: true, role: "member" },
        ];
        persist();
    }

    return {
        list() {
            return collaborators.slice().sort((a, b) => a.displayName.localeCompare(b.displayName)).map(toPublic);
        },
        getByUniqueName(uniqueName: string) {
            const key = normalizeUniqueName(uniqueName);
            const c = collaborators.find(c => normalizeUniqueName(c.uniqueName) === key) ?? null;
            return c ? toPublic(c) : null;
        },
        getAuthByUniqueName(uniqueName: string) {
            const key = normalizeUniqueName(uniqueName);
            return collaborators.find(c => normalizeUniqueName(c.uniqueName) === key) ?? null;
        },
        hasAdminPassword() {
            return collaborators.some(c => c.isActive && c.role === "admin" && Boolean(c.passwordHash));
        },
        upsert(input: Omit<Collaborator, "id" | "passwordHash"> & { id?: string; passwordHash?: string }) {
            const id = input.id ?? uid();
            const inputLogin = normalizeUniqueName(input.uniqueName);
            const idx = collaborators.findIndex(c => c.id === id || normalizeUniqueName(c.uniqueName) === inputLogin);
            const previous = idx >= 0 ? collaborators[idx] : null;
            const next: Collaborator = {
                ...input,
                id: previous?.id ?? id,
                passwordHash: input.passwordHash ?? previous?.passwordHash,
            };

            if (!next.passwordHash) delete next.passwordHash;

            if (idx >= 0) collaborators[idx] = next;
            else collaborators.push(next);

            mergeDuplicateCollaborators();
            persist();
            return toPublic(next);
        },
        remove(id: string) {
            collaborators = collaborators.filter(c => c.id !== id);
            persist();
        }
    };
}
