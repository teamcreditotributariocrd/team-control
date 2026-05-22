type GlpiSession = { session_token: string };

function env(name: string, fallback?: string) {
    const v = process.env[name] ?? fallback;
    if (!v) throw new Error(`Missing env ${name}`);
    return v;
}

function optionalEnv(name: string) {
    const v = process.env[name];
    return v && v.trim() ? v.trim() : "";
}

export type GlpiIncident = {
    id: number;
    title: string;
    type: string | null;
    status: string;
    priority: string | null;
    openedAt: string | null;
    updatedAt: string | null;
    groupTech: string | null;
    techAssignee: string | null;
    requester: string | null;
    requesterName?: string | null;
    category: string | null;
    descriptionHtml: string | null;
    descriptionText: string | null;
    solvedAt: string | null;
    createdAt?: string | null;
    assignee?: string | null;
    group?: string | null;
    url: string;
    source: "GLPI";
};

export type GlpiIncidentsQuery = {
    status?: string;
    search?: string;
    from?: string;
    to?: string;
    limit?: number;
    pageSize?: number;
    maxPages?: number;
};

export type GlpiIncidentsResult = {
    rows: GlpiIncident[];
    total: number;
    scanned: number;
};

type SearchOption = { id: number; name: string; field?: string; datatype?: string };
type TicketSearchOptionsResponse = Record<string, SearchOption>;

function normName(s: string) {
    return String(s ?? "")
        .toLowerCase()
        .normalize("NFD")
        .replace(/\p{Diacritic}/gu, "")
        .replace(/\s+/g, " ")
        .trim();
}

function pickOptionId(opts: TicketSearchOptionsResponse, candidates: string[]) {
    const want = candidates.map(normName);
    for (const key of Object.keys(opts)) {
        const o = opts[key];
        const n = normName(o?.name ?? "");
        if (want.includes(n)) return Number(o.id);
    }
    return null;
}

function toText(v: any): string | null {
    if (v == null) return null;
    if (typeof v === "string") return v.trim() || null;
    if (typeof v === "number") return String(v);
    if (typeof v === "object") {
        if (typeof v?.completename === "string") return v.completename.trim() || null;
        if (typeof v?.name === "string") return v.name.trim() || null;
        if (typeof v?.label === "string") return v.label.trim() || null;
        if (typeof v?.text === "string") return v.text.trim() || null;
    }
    return String(v);
}

function stripHtml(html: string): string {
    return html
        .replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, " ")
        .replace(/<style[\s\S]*?>[\s\S]*?<\/style>/gi, " ")
        .replace(/<\/p>|<\/div>|<br\s*\/?>/gi, "\n")
        .replace(/<[^>]+>/g, " ")
        .replace(/&nbsp;/g, " ")
        .replace(/&amp;/g, "&")
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">")
        .replace(/\s+\n/g, "\n")
        .replace(/\n{3,}/g, "\n\n")
        .replace(/[ \t]{2,}/g, " ")
        .trim();
}

function dateKey(value?: string | null) {
    const raw = String(value ?? "").trim();
    if (!raw) return "";
    if (/^\d{4}-\d{2}-\d{2}/.test(raw)) return raw.slice(0, 10);
    const br = raw.match(/^(\d{2})[/-](\d{2})[/-](\d{4})/);
    if (br) return `${br[3]}-${br[2]}-${br[1]}`;
    const dt = new Date(raw);
    return Number.isNaN(dt.getTime()) ? "" : dt.toISOString().slice(0, 10);
}

function isValidYmd(value?: string) {
    return Boolean(value && /^\d{4}-\d{2}-\d{2}$/.test(value));
}

async function glpiFetchJson(url: string, init?: RequestInit) {
    const res = await fetch(url, init);
    const txt = await res.text();
    let data: any = null;
    try {
        data = JSON.parse(txt);
    } catch {
        data = txt;
    }
    if (!res.ok) {
        throw new Error(
            `GLPI ${res.status}: ${typeof data === "string" ? data : JSON.stringify(data).slice(0, 1200)}`
        );
    }
    return { data, res };
}

function parseContentRange(value: string | null) {
    const m = String(value ?? "").match(/(\d+)\s*-\s*(\d+)\s*\/\s*(\d+)/);
    if (!m) return null;
    return {
        start: Number(m[1]),
        end: Number(m[2]),
        total: Number(m[3]),
    };
}

async function mapLimit<T, R>(
    items: T[],
    limit: number,
    fn: (item: T, idx: number) => Promise<R>
): Promise<R[]> {
    const out: R[] = new Array(items.length);
    let i = 0;
    const workers = new Array(Math.min(limit, items.length)).fill(0).map(async () => {
        while (true) {
            const idx = i++;
            if (idx >= items.length) break;
            out[idx] = await fn(items[idx], idx);
        }
    });
    await Promise.all(workers);
    return out;
}

export function createGlpiClient() {
    const base = env("GLPI_API_BASE", "https://suporte.ms.gov.br/apirest.php").replace(/\/+$/, "");
    const appToken = env("GLPI_APP_TOKEN");
    const userToken = env("GLPI_USER_TOKEN");
    const frontBase = base.replace(/\/(?:apirest\.php|api\.php\/v1)$/i, "");

    let cachedOpts: { at: number; opts: TicketSearchOptionsResponse } | null = null;
    const cachedUserNames = new Map<number, Promise<string | null>>();

    async function initSession(): Promise<string> {
        try {
            const { data } = await glpiFetchJson(`${base}/initSession`, {
                method: "GET",
                headers: { "App-Token": appToken, Authorization: `user_token ${userToken}` },
            });
            if (!data?.session_token) throw new Error("GLPI: missing session_token");
            return data.session_token;
        } catch (e: any) {
            const detail = String(e?.message ?? e);
            if (detail.includes("ERROR_GLPI_LOGIN_USER_TOKEN") || detail.includes("ERROR_GLPI_LOGIN")) {
                throw new Error(`GLPI_AUTH_ERROR: GLPI_USER_TOKEN invalido. Detalhe: ${detail}`);
            }
            throw e;
        }
    }

    async function killSession(sessionToken: string) {
        try {
            await glpiFetchJson(`${base}/killSession`, {
                method: "GET",
                headers: { "App-Token": appToken, "Session-Token": sessionToken },
            });
        } catch { }
    }

    async function getTicketSearchOptions(sessionToken: string) {
        const now = Date.now();
        if (cachedOpts && now - cachedOpts.at < 60_000) return cachedOpts.opts;

        const { data } = await glpiFetchJson(`${base}/listSearchOptions/Ticket`, {
            method: "GET",
            headers: { "App-Token": appToken, "Session-Token": sessionToken },
        });

        cachedOpts = { at: now, opts: data as TicketSearchOptionsResponse };
        return cachedOpts.opts;
    }

    function mapStatus(x: any): string {
        if (typeof x === "string") {
            const up = normName(x).toUpperCase();
            if (up.includes("NOV")) return "NEW";
            if (up.includes("ATRIB")) return "ASSIGNED";
            if (up.includes("PLANEJ")) return "PLANNED";
            if (up.includes("APROV")) return "WAITING_APPROVAL";
            if (up.includes("PEND")) return "PENDING";
            if (up.includes("RESOL")) return "SOLVED";
            if (up.includes("FECH")) return "CLOSED";
            return up;
        }
        const n = Number(x);
        if (n === 1) return "NEW";
        if (n === 2) return "ASSIGNED";
        if (n === 3) return "PLANNED";
        if (n === 4) return "PENDING";
        if (n === 5) return "SOLVED";
        if (n === 6) return "CLOSED";
        return String(x ?? "-");
    }

    function mapType(x: any): string | null {
        const n = Number(x);
        if (Number.isFinite(n)) {
            if (n === 1) return "INCIDENT";
            if (n === 2) return "REQUEST";
        }
        const s = toText(x);
        if (!s) return null;
        const up = normName(s).toUpperCase();
        if (up.includes("REQUIS")) return "REQUEST";
        if (up.includes("INCIDENT")) return "INCIDENT";
        return s;
    }

    function mapPriority(x: any): string | null {
        if (x == null) return null;
        if (typeof x === "string") return x.trim() || null;
        const n = Number(x);
        if (!Number.isFinite(n)) return String(x);
        if (n === 1) return "Muito baixa";
        if (n === 2) return "Baixa";
        if (n === 3) return "Media";
        if (n === 4) return "Alta";
        if (n === 5) return "Muito alta";
        if (n === 6) return "Critica";
        return String(n);
    }

    function buildTicketUrl(id: number | string) {
        return `${frontBase}/front/ticket.form.php?id=${encodeURIComponent(String(id))}`;
    }

    async function getTicketById(sessionToken: string, id: number) {
        const { data } = await glpiFetchJson(`${base}/Ticket/${id}?expand_dropdowns=true`, {
            method: "GET",
            headers: { "App-Token": appToken, "Session-Token": sessionToken },
        });
        return data;
    }

    async function getTicketUsers(sessionToken: string, ticketId: number) {
        const { data } = await glpiFetchJson(
            `${base}/Ticket/${ticketId}/Ticket_User?range=0-999&expand_dropdowns=true`,
            { method: "GET", headers: { "App-Token": appToken, "Session-Token": sessionToken } }
        );
        return data;
    }

    async function getTicketGroups(sessionToken: string, ticketId: number) {
        const { data } = await glpiFetchJson(
            `${base}/Ticket/${ticketId}/Group_Ticket?range=0-999&expand_dropdowns=true`,
            { method: "GET", headers: { "App-Token": appToken, "Session-Token": sessionToken } }
        );
        return data;
    }

    async function getUserById(sessionToken: string, userId: number) {
        const { data } = await glpiFetchJson(`${base}/User/${userId}`, {
            method: "GET",
            headers: { "App-Token": appToken, "Session-Token": sessionToken },
        });
        return data;
    }

    function actorUserId(actor: any): number | null {
        const direct = Number(actor?.users_id);
        if (Number.isFinite(direct)) return direct;

        const userLink = Array.isArray(actor?.links)
            ? actor.links.find((link: any) => String(link?.rel ?? "").toLowerCase() === "user")
            : null;
        const match = String(userLink?.href ?? "").match(/\/User\/(\d+)(?:\D|$)/i);
        const linked = Number(match?.[1]);
        return Number.isFinite(linked) ? linked : null;
    }

    function userDisplayName(user: any): string | null {
        const first = toText(user?.firstname);
        const last = toText(user?.realname);
        const full = [first, last].filter(Boolean).join(" ").trim();
        return full || toText(user?.completename) || toText(user?.name) || null;
    }

    function getUserDisplayName(sessionToken: string, userId: number) {
        if (!cachedUserNames.has(userId)) {
            cachedUserNames.set(userId, getUserById(sessionToken, userId)
                .then(userDisplayName)
                .catch(() => null));
        }
        return cachedUserNames.get(userId)!;
    }

    function pickAssigneesFromActors(actorsUsers: any, actorsGroups: any) {
        const usersArr: any[] = Array.isArray(actorsUsers)
            ? actorsUsers
            : Array.isArray(actorsUsers?.data)
                ? actorsUsers.data
                : [];
        const groupsArr: any[] = Array.isArray(actorsGroups)
            ? actorsGroups
            : Array.isArray(actorsGroups?.data)
                ? actorsGroups.data
                : [];

        const techUser = usersArr.find((u) => Number(u?.type) === 2) ?? null;
        const reqUser = usersArr.find((u) => Number(u?.type) === 1) ?? null;
        const techGroup = groupsArr.find((g) => Number(g?.type) === 2) ?? null;

        const techAssignee =
            toText(techUser?.users_id) ||
            toText(techUser?.user) ||
            toText(techUser?.name) ||
            null;

        const requester =
            toText(reqUser?.users_id) || toText(reqUser?.user) || toText(reqUser?.name) || null;

        const groupTech =
            toText(techGroup?.groups_id) ||
            toText(techGroup?.group) ||
            toText(techGroup?.completename) ||
            toText(techGroup?.name) ||
            null;

        return {
            techAssignee,
            groupTech,
            requester,
            requesterUserId: actorUserId(reqUser),
        };
    }

    async function searchTicketIds(sessionToken: string, pageSize: number, maxPages: number): Promise<number[]> {
        const opts = await getTicketSearchOptions(sessionToken);
        const idId = pickOptionId(opts, ["id"]);
        const idName = pickOptionId(opts, ["name", "titulo", "subject"]);

        const forced = [idId, idName].filter((x) => Number.isFinite(x as any)) as number[];
        const paramsBase = new URLSearchParams();
        forced.forEach((fid, i) => paramsBase.set(`forcedisplay[${i}]`, String(fid)));

        const ids: number[] = [];
        let total: number | null = null;
        let start = 0;

        for (let page = 0; page < maxPages; page++) {
            if (total != null && start >= total) break;
            const end = total == null
                ? start + pageSize - 1
                : Math.min(start + pageSize - 1, total - 1);
            const params = new URLSearchParams(paramsBase.toString());
            params.set("range", `${start}-${end}`);

            const { data, res } = await glpiFetchJson(`${base}/search/Ticket?${params.toString()}`, {
                method: "GET",
                headers: { "App-Token": appToken, "Session-Token": sessionToken },
            });

            total = Number(data?.totalcount ?? parseContentRange(res.headers.get("Content-Range"))?.total ?? total);
            const rows: any[] = Array.isArray(data?.data) ? data.data : [];
            if (!rows.length) break;

            const pageIds = rows
                .map((r) => {
                    const v = (idId != null ? r?.[String(idId)] : null) ?? r?.["2"] ?? r?.id ?? null;
                    const n = Number(v);
                    return Number.isFinite(n) ? n : NaN;
                })
                .filter((n) => Number.isFinite(n));

            ids.push(...pageIds);
            start = end + 1;
            if (res.status !== 206 || (total != null && start >= total)) break;
        }

        const seen = new Set<number>();
        const uniq: number[] = [];
        for (const id of ids) {
            if (!seen.has(id)) {
                seen.add(id);
                uniq.push(id);
            }
        }
        return uniq;
    }

    function postFilter(rows: GlpiIncident[], q: GlpiIncidentsQuery) {
        const wantOpen = String(q.status ?? "").toUpperCase() === "OPEN";
        const wantStatus = String(q.status ?? "").toUpperCase();
        const searchTxt = String(q.search ?? "").trim().toLowerCase();
        const from = isValidYmd(q.from) ? q.from! : "";
        const to = isValidYmd(q.to) ? q.to! : "";

        return rows.filter((r) => {
            if (!r?.id || !r?.title) return false;

            const incidentDate = dateKey(r.openedAt || r.updatedAt);
            if (from && (!incidentDate || incidentDate < from)) return false;
            if (to && (!incidentDate || incidentDate > to)) return false;

            if (wantOpen) {
                const s = String(r.status ?? "").toUpperCase();
                if (s === "SOLVED" || s === "CLOSED") return false;
            } else if (wantStatus && wantStatus !== "ALL") {
                const s = String(r.status ?? "").toUpperCase();
                if (s !== wantStatus) return false;
            }

            if (searchTxt) {
                const hay = `${r.id} ${r.title} ${r.requester ?? ""} ${r.groupTech ?? ""} ${r.techAssignee ?? ""} ${r.descriptionText ?? ""}`.toLowerCase();
                if (!hay.includes(searchTxt)) return false;
            }

            return true;
        });
    }

    async function buildIncident(sessionToken: string, ticketId: number): Promise<GlpiIncident> {
        const t = await getTicketById(sessionToken, ticketId);

        let actorsUsers: any = null;
        let actorsGroups: any = null;
        try { actorsUsers = await getTicketUsers(sessionToken, ticketId); } catch { }
        try { actorsGroups = await getTicketGroups(sessionToken, ticketId); } catch { }

        const assign = pickAssigneesFromActors(actorsUsers, actorsGroups);
        const title = toText(t?.name) ?? toText(t?.title) ?? "-";
        const status = mapStatus(t?.status);
        const type = mapType(t?.type);
        const priority = mapPriority(t?.priority);

        const openedAt = toText(t?.date) || toText(t?.date_creation) || toText(t?.date_open) || null;
        const updatedAt = toText(t?.date_mod) || toText(t?.date_modif) || toText(t?.last_update) || null;
        const solvedAt = toText(t?.solvedate) || toText(t?.date_solved) || null;
        const descriptionHtml = toText(t?.content) ?? toText(t?.description) ?? null;
        const descriptionText = descriptionHtml ? stripHtml(descriptionHtml) : null;
        const category = toText(t?.itilcategories_id) || toText(t?.itilcategories) || toText(t?.category) || null;
        const requester = assign.requester || toText(t?.users_id_recipient) || toText(t?.users_id_requester) || null;
        let requesterName: string | null = null;
        if (assign.requesterUserId != null) {
            requesterName = await getUserDisplayName(sessionToken, assign.requesterUserId);
        }
        const groupTech = assign.groupTech || toText(t?.groups_id_tech) || toText(t?.groups_id_assign) || null;
        const techAssignee = assign.techAssignee || toText(t?.users_id_tech) || null;

        return {
            id: ticketId,
            title,
            type,
            status,
            priority,
            openedAt,
            updatedAt,
            groupTech,
            techAssignee,
            requester,
            requesterName,
            category,
            descriptionHtml,
            descriptionText,
            solvedAt,
            createdAt: openedAt,
            assignee: techAssignee,
            group: groupTech,
            url: buildTicketUrl(ticketId),
            source: "GLPI",
        };
    }

    async function listTickets(q: GlpiIncidentsQuery): Promise<GlpiIncidentsResult> {
        const sessionToken = await initSession();
        try {
            const pageSize = Math.max(50, Math.min(Number(q.pageSize ?? 200), 200));
            const maxPages = Math.max(1, Math.min(Number(q.maxPages ?? 20), 500));
            const requestedLimit = Number(q.limit ?? 0);
            const ids = await searchTicketIds(sessionToken, pageSize, maxPages);
            const hardLimit = Number.isFinite(requestedLimit) && requestedLimit > 0
                ? Math.min(requestedLimit, 50000)
                : ids.length;
            const limitedIds = ids.slice(0, hardLimit);
            const detailed = await mapLimit(limitedIds, 10, async (id) => buildIncident(sessionToken, id));
            const filtered = postFilter(detailed, q);
            return { rows: filtered, total: filtered.length, scanned: detailed.length };
        } finally {
            await killSession(sessionToken);
        }
    }

    async function getTicketDetails(id: number): Promise<GlpiIncident> {
        const sessionToken = await initSession();
        try {
            return await buildIncident(sessionToken, id);
        } finally {
            await killSession(sessionToken);
        }
    }

    async function searchTickets(q: GlpiIncidentsQuery): Promise<GlpiIncidentsResult> {
        return listTickets(q);
    }

    return { searchTickets, listTickets, getTicketDetails };
}
