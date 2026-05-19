import type { Role } from "../types";

export type Session = { uniqueName: string; role: Role; token: string };

export function authHeaders(session: Session): HeadersInit {
    return session.token ? { Authorization: `Bearer ${session.token}` } : {};
}

function expireSession() {
    localStorage.removeItem("ust.user");
    localStorage.removeItem("ust.role");
    localStorage.removeItem("ust.token");
    window.dispatchEvent(new Event("ust:session-expired"));
}

async function parseResponse(res: Response) {
    const raw = await res.text();
    let data: any = null;
    try { data = raw ? JSON.parse(raw) : null; } catch { }
    return { raw, data };
}

export async function apiGet<T>(url: string, session: Session): Promise<T> {
    const res = await fetch(url, {
        headers: authHeaders(session),
    });

    const { raw, data } = await parseResponse(res);
    if (!res.ok) {
        if (res.status === 401 || data?.error === "UNAUTHORIZED") expireSession();
        const detail = data?.detail ? ` - ${data.detail}` : "";
        const who = data?.sessionUser || data?.requestedUser ? ` (${data?.sessionUser ?? "-"} -> ${data?.requestedUser ?? "-"})` : "";
        throw new Error(`${data?.error ?? data?.message ?? raw ?? `HTTP ${res.status}`}${detail}${who}`);
    }
    return data as T;
}

export async function apiSend<T>(url: string, method: string, body: any, session: Session): Promise<T> {
    const res = await fetch(url, {
        method,
        headers: {
            "Content-Type": "application/json",
            ...authHeaders(session),
        },
        body: JSON.stringify(body),
    });

    const { raw, data } = await parseResponse(res);
    if (!res.ok) {
        if (res.status === 401 || data?.error === "UNAUTHORIZED") expireSession();
        const detail = data?.detail ? ` - ${data.detail}` : "";
        const who = data?.sessionUser || data?.requestedUser ? ` (${data?.sessionUser ?? "-"} -> ${data?.requestedUser ?? "-"})` : "";
        throw new Error(`${data?.error ?? data?.message ?? raw ?? `HTTP ${res.status}`}${detail}${who}`);
    }
    return data as T;
}
