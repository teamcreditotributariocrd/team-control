// apps/api/src/infra/auth.ts
import crypto from "node:crypto";
import type { FastifyRequest } from "fastify";

export type Role = "admin" | "member";

export type SessionUser = {
    uniqueName: string;
    role: Role;
};

type TokenPayload = SessionUser & {
    exp: number;
};

const tokenTtlSeconds = 12 * 60 * 60;

function base64UrlEncode(input: Buffer | string) {
    return Buffer.from(input).toString("base64url");
}

function base64UrlDecode(input: string) {
    return Buffer.from(input, "base64url").toString("utf-8");
}

function authSecret() {
    const secret = process.env.TEAM_CONTROL_AUTH_SECRET ?? process.env.UST_AUTH_SECRET;
    if (!secret || secret.length < 24) {
        throw new Error("TEAM_CONTROL_AUTH_SECRET must be set with at least 24 characters");
    }
    return secret;
}

function sign(data: string) {
    return crypto.createHmac("sha256", authSecret()).update(data).digest("base64url");
}

function safeEqual(a: string, b: string) {
    const ab = Buffer.from(a);
    const bb = Buffer.from(b);
    return ab.length === bb.length && crypto.timingSafeEqual(ab, bb);
}

export function createSessionToken(user: SessionUser) {
    const header = base64UrlEncode(JSON.stringify({ alg: "HS256", typ: "JWT" }));
    const payload = base64UrlEncode(JSON.stringify({
        uniqueName: user.uniqueName,
        role: user.role,
        exp: Math.floor(Date.now() / 1000) + tokenTtlSeconds,
    } satisfies TokenPayload));
    const data = `${header}.${payload}`;
    return `${data}.${sign(data)}`;
}

export function verifySessionToken(token: string): SessionUser | null {
    const parts = token.split(".");
    if (parts.length !== 3) return null;

    const [header, payload, signature] = parts;
    const expected = sign(`${header}.${payload}`);
    if (!safeEqual(signature, expected)) return null;

    let parsed: TokenPayload;
    try {
        parsed = JSON.parse(base64UrlDecode(payload));
    } catch {
        return null;
    }

    if (!parsed.uniqueName || (parsed.role !== "admin" && parsed.role !== "member")) return null;
    if (!parsed.exp || parsed.exp < Math.floor(Date.now() / 1000)) return null;

    return { uniqueName: parsed.uniqueName, role: parsed.role };
}

export function hashPassword(password: string) {
    const salt = crypto.randomBytes(16).toString("base64url");
    const params = { n: 16384, r: 8, p: 1, keylen: 64 };
    const hash = crypto.scryptSync(password, salt, params.keylen, { N: params.n, r: params.r, p: params.p }).toString("base64url");
    return `scrypt$${params.n}$${params.r}$${params.p}$${salt}$${hash}`;
}

export function verifyPassword(password: string, storedHash: string) {
    const [scheme, nRaw, rRaw, pRaw, salt, expectedHash] = storedHash.split("$");
    if (scheme !== "scrypt" || !salt || !expectedHash) return false;

    const n = Number(nRaw);
    const r = Number(rRaw);
    const p = Number(pRaw);
    if (!Number.isFinite(n) || !Number.isFinite(r) || !Number.isFinite(p)) return false;

    const actualHash = crypto.scryptSync(password, salt, 64, { N: n, r, p }).toString("base64url");
    return safeEqual(actualHash, expectedHash);
}

export function getUser(req: FastifyRequest): SessionUser {
    const authHeader = String(req.headers.authorization ?? "");
    const token = authHeader.toLowerCase().startsWith("bearer ") ? authHeader.slice(7).trim() : "";
    const user = token ? verifySessionToken(token) : null;

    return user ?? { uniqueName: "", role: "member" };
}

export function assertAdmin(user: SessionUser) {
    if (!user.uniqueName) throw new Error("UNAUTHORIZED");
    if (user.role !== "admin") throw new Error("FORBIDDEN");
}

export function normalizeUniqueName(uniqueName: string) {
    const value = String(uniqueName ?? "").trim().toLowerCase();
    return value.includes("\\") ? value.split("\\").pop() || value : value;
}

export function assertSelfOrAdmin(user: SessionUser, uniqueName: string) {
    if (!user.uniqueName) throw new Error("UNAUTHORIZED");
    if (user.role === "admin") return;
    if (normalizeUniqueName(user.uniqueName) !== normalizeUniqueName(uniqueName)) throw new Error("FORBIDDEN");
}
