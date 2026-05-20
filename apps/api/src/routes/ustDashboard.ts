// apps/api/src/routes/ustDashboard.ts
import type { FastifyInstance } from "fastify";
import { getUser, assertAdmin, assertSelfOrAdmin, normalizeUniqueName } from "../infra/auth.js";
import { getGoalForMonth } from "../store/collaboratorsStore.js";
import { createTfsClient } from "../infra/tfsNtlmClient.js";
import { getWorkItemsBatch, queryIdsByExecucaoRange } from "../services/tfsWorkItems.js";
import { parseAtividadeUST } from "../lib/parseAtividade.js";

function monthRange(month: string) {
    const [y, m] = month.split("-").map(Number);
    const start = new Date(Date.UTC(y, m - 1, 1));
    const end = new Date(Date.UTC(y, m, 1)); // exclusive
    const iso = (d: Date) => d.toISOString().slice(0, 10);
    return { dateFrom: iso(start), dateTo: iso(new Date(end.getTime() - 24 * 3600 * 1000)) };
}

function getMonthWorkingDays(month: string) {
    const [y, m] = month.split("-").map(Number);
    const start = new Date(Date.UTC(y, m - 1, 1));
    const end = new Date(Date.UTC(y, m, 1));
    let wd = 0;
    for (let d = new Date(start); d < end; d.setUTCDate(d.getUTCDate() + 1)) {
        const day = d.getUTCDay();
        if (day !== 0 && day !== 6) wd++;
    }
    return wd;
}

function addMonths(month: string, delta: number) {
    const [y, m] = month.split("-").map(Number);
    const d = new Date(Date.UTC(y, m - 1 + delta, 1));
    return d.toISOString().slice(0, 7);
}

function currentMonth() {
    return new Date().toISOString().slice(0, 7);
}

function getWorkDaysPassedForMonth(month: string, workDaysTotal: number) {
    const today = new Date();
    const monthStart = new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5, 7)) - 1, 1));
    const monthEnd = new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 1));
    const isCurrentMonth = today >= monthStart && today < monthEnd;

    if (!isCurrentMonth) return workDaysTotal;

    let wd = 0;
    const end = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate() + 1));
    for (let d = new Date(monthStart); d < end && d < monthEnd; d.setUTCDate(d.getUTCDate() + 1)) {
        const day = d.getUTCDay();
        if (day !== 0 && day !== 6) wd++;
    }
    return wd;
}

function tfsErrorResponse(e: any) {
    const message = String(e?.message ?? e);
    const statusMatch = message.match(/TFS NTLM \w+ HTTP (\d+)/);
    const tfsStatus = statusMatch ? Number(statusMatch[1]) : null;
    if (tfsStatus === 401 || tfsStatus === 403) {
        return {
            statusCode: 502,
            body: {
                error: "TFS_AUTH_ERROR",
                detail: "O TFS recusou as credenciais NTLM configuradas na API.",
                tfsStatus,
                message,
            },
        };
    }
    if (message.includes("TFS NTLM")) {
        return {
            statusCode: 502,
            body: {
                error: "TFS_ERROR",
                detail: "Falha ao consultar o TFS.",
                tfsStatus,
                message,
            },
        };
    }
    return null;
}

export async function ustDashboardRoutes(app: FastifyInstance, deps: any) {
    // ===========
    // TEAM SUMMARY
    // ===========
    app.get("/api/ust/summary", async (req, reply) => {
        const user = getUser(req);
        const month = String((req.query as any)?.month ?? "").trim();
        if (!/^\d{4}-\d{2}$/.test(month)) return reply.code(400).send({ error: "month must be YYYY-MM" });

        const collabs = deps.collabStore.list().filter((c: any) => c.isActive);
        const visible = user.role === "admin" ? collabs : collabs.filter((c: any) => normalizeUniqueName(c.uniqueName) === normalizeUniqueName(user.uniqueName));

        const { dateFrom, dateTo } = monthRange(month);
        const http = createTfsClient();

        let workItems: any[];
        try {
            const ids = await queryIdsByExecucaoRange(http, deps.project, dateFrom, dateTo, "Done", undefined);
            workItems = await getWorkItemsBatch(http, ids);
        } catch (e: any) {
            const tfsError = tfsErrorResponse(e);
            if (tfsError) return reply.code(tfsError.statusCode).send(tfsError.body);
            throw e;
        }

        const byUser = new Map<string, { totalUst: number; byDay: Record<string, number> }>();

        for (const wi of workItems) {
            const f = wi.fields ?? {};
            const assigned = f["System.AssignedTo"]?.uniqueName ?? "";
            const exec = String(f["Custom.COTIN.DataExecucao"] ?? "").slice(0, 10);
            const raw = f["Custom.COTIN.AtividadeUST"];
            const compTfs = f["Custom.COTIN.ComplexidadeUST"];
            const p = parseAtividadeUST(raw);

            if (!assigned || !exec || typeof p.codigo !== "number") continue;

            const hit = deps.store.lookupUstByCode(p.codigo, typeof compTfs === "string" ? compTfs : null);
            if (!hit || !hit.ok) continue; // âœ… divergÃªncia NÃƒO soma

            const cur = byUser.get(assigned) ?? { totalUst: 0, byDay: {} };
            cur.totalUst += hit.ust;
            cur.byDay[exec] = (cur.byDay[exec] ?? 0) + hit.ust;
            byUser.set(assigned, cur);
        }

        const workDaysTotal = getMonthWorkingDays(month);

        const workDaysPassed = getWorkDaysPassedForMonth(month, workDaysTotal);

        const rows = visible
            .map((c: any) => {
                const agg = byUser.get(c.uniqueName) ?? { totalUst: 0, byDay: {} };
                const goal = getGoalForMonth(c, month);
                const pct = goal > 0 ? (agg.totalUst / goal) * 100 : 0;

                const pace = workDaysPassed > 0 ? agg.totalUst / workDaysPassed : 0;
                const forecast = pace * workDaysTotal;
                const gap = Math.max(0, goal - agg.totalUst);
                const daysLeft = Math.max(0, workDaysTotal - workDaysPassed);
                const neededPerDay = daysLeft > 0 ? gap / daysLeft : gap > 0 ? gap : 0;

                const status =
                    goal === 0 ? "NO_GOAL" : forecast >= goal ? "ON_TRACK" : forecast >= goal * 0.9 ? "AT_RISK" : "OFF_TRACK";

                return {
                    displayName: c.displayName,
                    uniqueName: c.uniqueName,
                    goal,
                    totalUst: Number(agg.totalUst.toFixed(2)),
                    pct: Number(pct.toFixed(1)),
                    pace: Number(pace.toFixed(2)),
                    forecast: Number(forecast.toFixed(0)),
                    gap: Number(gap.toFixed(2)),
                    neededPerDay: Number(neededPerDay.toFixed(2)),
                    status,
                    byDay: agg.byDay,
                };
            })
            .sort((a: any, b: any) => b.pct - a.pct);

        const teamTotal = rows.reduce((s: number, r: any) => s + r.totalUst, 0);
        const teamGoal = rows.reduce((s: number, r: any) => s + r.goal, 0);
        const teamPct = teamGoal > 0 ? (teamTotal / teamGoal) * 100 : 0;
        const teamPace = workDaysPassed > 0 ? teamTotal / workDaysPassed : 0;
        const teamForecast = teamPace * workDaysTotal;

        return reply.send({
            month,
            workDaysTotal,
            workDaysPassed,
            team: {
                totalUst: Number(teamTotal.toFixed(2)),
                goal: teamGoal,
                pct: Number(teamPct.toFixed(1)),
                pace: Number(teamPace.toFixed(2)),
                forecast: Number(teamForecast.toFixed(0)),
            },
            rows,
        });
    });

    // ==========================
    // USER ITEMS (AUDITORIA)
    // ==========================
    app.get("/api/ust/user/:uniqueName/items", async (req, reply) => {
        const user = getUser(req);
        const uniqueName = String((req.params as any).uniqueName);
        const month = String((req.query as any)?.month ?? "").trim();
        if (!/^\d{4}-\d{2}$/.test(month)) return reply.code(400).send({ error: "month must be YYYY-MM" });

        try {
            assertSelfOrAdmin(user, uniqueName);
        } catch (e: any) {
            const error = String(e?.message ?? e);
            return reply.code(error === "UNAUTHORIZED" ? 401 : 403).send({
                error,
                detail: error === "UNAUTHORIZED" ? "Sessao expirada ou token invalido. Faca login novamente." : "Usuario da sessao nao pode consultar este painel.",
                sessionUser: user.uniqueName || null,
                requestedUser: uniqueName,
                sessionRole: user.role,
            });
        }

        const { dateFrom, dateTo } = monthRange(month);
        const http = createTfsClient();

        let workItems: any[];
        try {
            const ids = await queryIdsByExecucaoRange(http, deps.project, dateFrom, dateTo, "Done", undefined);
            workItems = await getWorkItemsBatch(http, ids);
        } catch (e: any) {
            const tfsError = tfsErrorResponse(e);
            if (tfsError) return reply.code(tfsError.statusCode).send(tfsError.body);
            throw e;
        }

        const items: any[] = [];
        const unmapped: any[] = [];
        const byDay: Record<string, number> = {};
        let totalUst = 0;

        const base = String(process.env.TFS_COLLECTION_URL ?? "").replace(/\/+$/, "");
        const project = deps.project;

        const workItemUrl = (id: any) => base && project && id ? `${base}/${project}/_workitems/edit/${id}` : null;
        const issue = (patch: any) => ({
            workItemUrl: workItemUrl(patch.id),
            action:
                patch.reason === "SEM_DATA_EXECUCAO"
                    ? "Informar a Data Execucao no TFS."
                    : patch.reason === "SEM_CODIGO"
                        ? "Informar a Atividade UST com codigo valido."
                        : patch.reason === "CODIGO_FORA_CATALOGO"
                            ? "Conferir codigo da Atividade UST ou importar catalogo atualizado."
                            : patch.reason === "COMPLEXIDADE_DIVERGENTE"
                                ? "Ajustar Complexidade UST para bater com o catalogo."
                                : "Conferir campos UST no TFS.",
            ...patch,
        });

        for (const wi of workItems) {
            const f = wi.fields ?? {};
            const assigned = f["System.AssignedTo"]?.uniqueName ?? "";
            if (normalizeUniqueName(assigned) !== normalizeUniqueName(uniqueName)) continue;

            const id = f["System.Id"];
            const title = f["System.Title"];
            const state = f["System.State"] ?? null;
            const exec = String(f["Custom.COTIN.DataExecucao"] ?? "").slice(0, 10);
            const raw = f["Custom.COTIN.AtividadeUST"];
            const compTfs = f["Custom.COTIN.ComplexidadeUST"] ?? null;

            const p = parseAtividadeUST(raw);
            const code = typeof p.codigo === "number" ? p.codigo : null;

            if (!exec) {
                unmapped.push(issue({ id, title, reason: "SEM_DATA_EXECUCAO", raw }));
                continue;
            }
            if (code == null) {
                const suggestions = deps.store.suggestCatalogForText(`${title ?? ""} ${raw ?? ""}`, 3);
                unmapped.push(issue({ id, title, reason: "SEM_CODIGO", raw, exec, suggestions }));
                continue;
            }

            const hit = deps.store.lookupUstByCode(code, typeof compTfs === "string" ? compTfs : null);
            if (!hit) {
                unmapped.push(issue({ id, title, reason: "CODIGO_FORA_CATALOGO", code, raw, exec, gotComplexidade: compTfs }));
                continue;
            }
            if (!hit.ok) {
                unmapped.push(issue({
                    id,
                    title,
                    reason: hit.reason,
                    code,
                    exec,
                    raw,
                    expectedComplexidade: hit.expectedComplexidade,
                    gotComplexidade: hit.gotComplexidade,
                }));
                continue;
            }

            const ust = hit.ust;
            totalUst += ust;
            byDay[exec] = (byDay[exec] ?? 0) + ust;

            const url = workItemUrl(id);

            items.push({
                id,
                execDate: exec,
                title,
                state,
                assignedTo: assigned,
                code,
                complexidade: compTfs,
                expectedComplexidade: hit.row.complexidade,
                ust,
                workItemUrl: url,
                atividadeRaw: raw,
                catalog: {
                    codigo: hit.row.codigo,
                    grupo: hit.row.grupo,
                    subgrupo: hit.row.subgrupo,
                    atividade: hit.row.atividade,
                    tipo: hit.row.tipo,
                    complexidade: hit.row.complexidade,
                    ust: hit.row.ust,
                },
            });
        }

        items.sort((a, b) => a.execDate.localeCompare(b.execDate) || a.id - b.id);

        return reply.send({
            month,
            uniqueName,
            totalUst: Number(totalUst.toFixed(2)),
            byDay,
            count: items.length,
            unmappedCount: unmapped.length,
            items,
            unmapped,
        });
    });

    // ===============
    // ADMIN AUDIT
    // ===============
    app.get("/api/ust/audit", async (req, reply) => {
        const user = getUser(req);
        try {
            assertAdmin(user);
        } catch {
            return reply.code(403).send({ error: "FORBIDDEN" });
        }

        const month = String((req.query as any)?.month ?? "").trim();
        if (!/^\d{4}-\d{2}$/.test(month)) return reply.code(400).send({ error: "month must be YYYY-MM" });

        const collaborators = deps.collabStore.list().filter((c: any) => c.isActive);
        const byUser = new Map<string, {
            totalUst: number;
            mappedCount: number;
            unmappedCount: number;
            issues: Record<string, number>;
        }>();

        for (const c of collaborators) {
            byUser.set(c.uniqueName, { totalUst: 0, mappedCount: 0, unmappedCount: 0, issues: {} });
        }

        const { dateFrom, dateTo } = monthRange(month);
        const http = createTfsClient();
        let workItems: any[];
        try {
            const ids = await queryIdsByExecucaoRange(http, deps.project, dateFrom, dateTo, "Done", undefined);
            workItems = await getWorkItemsBatch(http, ids);
        } catch (e: any) {
            const tfsError = tfsErrorResponse(e);
            if (tfsError) return reply.code(tfsError.statusCode).send(tfsError.body);
            throw e;
        }

        function addIssue(uniqueName: string, reason: string) {
            const cur = byUser.get(uniqueName);
            if (!cur) return;
            cur.unmappedCount++;
            cur.issues[reason] = (cur.issues[reason] ?? 0) + 1;
        }

        for (const wi of workItems) {
            const f = wi.fields ?? {};
            const assigned = f["System.AssignedTo"]?.uniqueName ?? "";
            const cur = byUser.get(assigned);
            if (!cur) continue;

            const exec = String(f["Custom.COTIN.DataExecucao"] ?? "").slice(0, 10);
            const raw = f["Custom.COTIN.AtividadeUST"];
            const compTfs = f["Custom.COTIN.ComplexidadeUST"] ?? null;
            const p = parseAtividadeUST(raw);
            const code = typeof p.codigo === "number" ? p.codigo : null;

            if (!exec) {
                addIssue(assigned, "SEM_DATA_EXECUCAO");
                continue;
            }
            if (code == null) {
                addIssue(assigned, "SEM_CODIGO");
                continue;
            }

            const hit = deps.store.lookupUstByCode(code, typeof compTfs === "string" ? compTfs : null);
            if (!hit) {
                addIssue(assigned, "CODIGO_FORA_CATALOGO");
                continue;
            }
            if (!hit.ok) {
                addIssue(assigned, hit.reason);
                continue;
            }

            cur.mappedCount++;
            cur.totalUst += hit.ust;
        }

        const rows = collaborators.map((c: any) => {
            const agg = byUser.get(c.uniqueName) ?? { totalUst: 0, mappedCount: 0, unmappedCount: 0, issues: {} };
            const goal = getGoalForMonth(c, month);
            const pct = goal > 0 ? (agg.totalUst / goal) * 100 : 0;
            const flags = [
                !c.hasPassword ? "SEM_SENHA" : null,
                goal <= 0 ? "SEM_META_MENSAL" : null,
                agg.totalUst <= 0 ? "SEM_UST_CONTABILIZADA" : null,
                agg.unmappedCount > 0 ? "COM_INCONSISTENCIAS" : null,
            ].filter(Boolean);

            return {
                displayName: c.displayName,
                uniqueName: c.uniqueName,
                role: c.role,
                hasPassword: c.hasPassword,
                goal,
                totalUst: Number(agg.totalUst.toFixed(2)),
                pct: Number(pct.toFixed(1)),
                mappedCount: agg.mappedCount,
                unmappedCount: agg.unmappedCount,
                issues: agg.issues,
                flags,
            };
        }).sort((a: any, b: any) => b.flags.length - a.flags.length || b.unmappedCount - a.unmappedCount || a.displayName.localeCompare(b.displayName));

        return reply.send({
            month,
            totals: {
                collaborators: rows.length,
                withoutPassword: rows.filter((r: any) => !r.hasPassword).length,
                withoutGoal: rows.filter((r: any) => r.goal <= 0).length,
                withoutUst: rows.filter((r: any) => r.totalUst <= 0).length,
                unmappedCount: rows.reduce((sum: number, r: any) => sum + r.unmappedCount, 0),
            },
            rows,
        });
    });

    // =====================
    // TEAM MONTHLY HISTORY
    // =====================
    app.get("/api/ust/team/history", async (req, reply) => {
        const user = getUser(req);
        try {
            assertAdmin(user);
        } catch {
            return reply.code(403).send({ error: "FORBIDDEN" });
        }

        const monthsRaw = Number((req.query as any)?.months ?? 3);
        const months = Math.min(Math.max(Number.isFinite(monthsRaw) ? monthsRaw : 3, 1), 12);
        const endMonth = String((req.query as any)?.endMonth ?? currentMonth()).trim();

        if (!/^\d{4}-\d{2}$/.test(endMonth)) return reply.code(400).send({ error: "endMonth must be YYYY-MM" });

        const collaborators = deps.collabStore.list().filter((c: any) => c.isActive);
        const monthList = Array.from({ length: months }, (_, idx) => addMonths(endMonth, idx - months + 1));
        const firstRange = monthRange(monthList[0]);
        const lastRange = monthRange(monthList[monthList.length - 1]);

        const byUserMonth = new Map<string, Map<string, { totalUst: number; mappedCount: number; unmappedCount: number }>>();
        for (const c of collaborators) {
            const byMonth = new Map<string, { totalUst: number; mappedCount: number; unmappedCount: number }>();
            for (const month of monthList) byMonth.set(month, { totalUst: 0, mappedCount: 0, unmappedCount: 0 });
            byUserMonth.set(c.uniqueName, byMonth);
        }

        const http = createTfsClient();
        const ids = await queryIdsByExecucaoRange(http, deps.project, firstRange.dateFrom, lastRange.dateTo, "Done", undefined);
        const workItems = await getWorkItemsBatch(http, ids);

        for (const wi of workItems) {
            const f = wi.fields ?? {};
            const assigned = f["System.AssignedTo"]?.uniqueName ?? "";
            const exec = String(f["Custom.COTIN.DataExecucao"] ?? "").slice(0, 10);
            const month = exec.slice(0, 7);
            const agg = byUserMonth.get(assigned)?.get(month);
            if (!agg) continue;

            const raw = f["Custom.COTIN.AtividadeUST"];
            const compTfs = f["Custom.COTIN.ComplexidadeUST"] ?? null;
            const p = parseAtividadeUST(raw);
            const code = typeof p.codigo === "number" ? p.codigo : null;

            if (!exec || code == null) {
                agg.unmappedCount++;
                continue;
            }

            const hit = deps.store.lookupUstByCode(code, typeof compTfs === "string" ? compTfs : null);
            if (!hit || !hit.ok) {
                agg.unmappedCount++;
                continue;
            }

            agg.mappedCount++;
            agg.totalUst += hit.ust;
        }

        const monthsRows = monthList.map((month) => {
            const goal = collaborators.reduce((sum: number, c: any) => sum + getGoalForMonth(c, month), 0);
            const totalUst = collaborators.reduce((sum: number, c: any) => sum + (byUserMonth.get(c.uniqueName)?.get(month)?.totalUst ?? 0), 0);
            const unmappedCount = collaborators.reduce((sum: number, c: any) => sum + (byUserMonth.get(c.uniqueName)?.get(month)?.unmappedCount ?? 0), 0);
            const pct = goal > 0 ? (totalUst / goal) * 100 : 0;
            const workDaysTotal = getMonthWorkingDays(month);
            const workDaysPassed = getWorkDaysPassedForMonth(month, workDaysTotal);
            const pace = workDaysPassed > 0 ? totalUst / workDaysPassed : 0;
            const forecast = pace * workDaysTotal;
            const status = goal === 0 ? "NO_GOAL" : forecast >= goal ? "ON_TRACK" : forecast >= goal * 0.9 ? "AT_RISK" : "OFF_TRACK";

            return {
                month,
                goal,
                totalUst: Number(totalUst.toFixed(2)),
                pct: Number(pct.toFixed(1)),
                pace: Number(pace.toFixed(2)),
                forecast: Number(forecast.toFixed(0)),
                unmappedCount,
                status,
            };
        });

        const currentMonthRow = monthList[monthList.length - 1];
        const previousMonthRow = monthList[monthList.length - 2] ?? currentMonthRow;
        const collaboratorsRows = collaborators.map((c: any) => {
            const current = byUserMonth.get(c.uniqueName)?.get(currentMonthRow) ?? { totalUst: 0, mappedCount: 0, unmappedCount: 0 };
            const previous = byUserMonth.get(c.uniqueName)?.get(previousMonthRow) ?? { totalUst: 0, mappedCount: 0, unmappedCount: 0 };
            const goal = getGoalForMonth(c, currentMonthRow);
            const pct = goal > 0 ? (current.totalUst / goal) * 100 : 0;
            const delta = current.totalUst - previous.totalUst;

            return {
                displayName: c.displayName,
                uniqueName: c.uniqueName,
                goal,
                currentUst: Number(current.totalUst.toFixed(2)),
                previousUst: Number(previous.totalUst.toFixed(2)),
                delta: Number(delta.toFixed(2)),
                pct: Number(pct.toFixed(1)),
                mappedCount: current.mappedCount,
                unmappedCount: current.unmappedCount,
            };
        }).sort((a: any, b: any) => b.currentUst - a.currentUst);

        return reply.send({
            months,
            endMonth,
            rows: monthsRows,
            collaborators: collaboratorsRows,
        });
    });

    // ==========================
    // USER MONTHLY HISTORY
    // ==========================
    app.get("/api/ust/user/:uniqueName/history", async (req, reply) => {
        const user = getUser(req);
        const uniqueName = String((req.params as any).uniqueName);
        const monthsRaw = Number((req.query as any)?.months ?? 3);
        const months = Math.min(Math.max(Number.isFinite(monthsRaw) ? monthsRaw : 3, 1), 12);
        const endMonth = String((req.query as any)?.endMonth ?? currentMonth()).trim();

        if (!/^\d{4}-\d{2}$/.test(endMonth)) return reply.code(400).send({ error: "endMonth must be YYYY-MM" });

        try {
            assertSelfOrAdmin(user, uniqueName);
        } catch (e: any) {
            const error = String(e?.message ?? e);
            return reply.code(error === "UNAUTHORIZED" ? 401 : 403).send({
                error,
                detail: error === "UNAUTHORIZED" ? "Sessao expirada ou token invalido. Faca login novamente." : "Usuario da sessao nao pode consultar este historico.",
                sessionUser: user.uniqueName || null,
                requestedUser: uniqueName,
                sessionRole: user.role,
            });
        }

        const collaborator = deps.collabStore.getByUniqueName(uniqueName);
        if (!collaborator) return reply.code(404).send({ error: "COLLABORATOR_NOT_FOUND" });

        const monthList = Array.from({ length: months }, (_, idx) => addMonths(endMonth, idx - months + 1));
        const firstRange = monthRange(monthList[0]);
        const lastRange = monthRange(monthList[monthList.length - 1]);

        const http = createTfsClient();
        let workItems: any[];
        try {
            const ids = await queryIdsByExecucaoRange(http, deps.project, firstRange.dateFrom, lastRange.dateTo, "Done", undefined);
            workItems = await getWorkItemsBatch(http, ids);
        } catch (e: any) {
            const tfsError = tfsErrorResponse(e);
            if (tfsError) return reply.code(tfsError.statusCode).send(tfsError.body);
            throw e;
        }

        const byMonth = new Map<string, { totalUst: number; count: number; unmappedCount: number; byDay: Record<string, number> }>();
        for (const month of monthList) byMonth.set(month, { totalUst: 0, count: 0, unmappedCount: 0, byDay: {} });

        for (const wi of workItems) {
            const f = wi.fields ?? {};
            const assigned = f["System.AssignedTo"]?.uniqueName ?? "";
            if (normalizeUniqueName(assigned) !== normalizeUniqueName(uniqueName)) continue;

            const exec = String(f["Custom.COTIN.DataExecucao"] ?? "").slice(0, 10);
            const month = exec.slice(0, 7);
            const agg = byMonth.get(month);
            if (!agg) continue;

            const raw = f["Custom.COTIN.AtividadeUST"];
            const compTfs = f["Custom.COTIN.ComplexidadeUST"] ?? null;
            const p = parseAtividadeUST(raw);
            const code = typeof p.codigo === "number" ? p.codigo : null;

            if (!exec || code == null) {
                agg.unmappedCount++;
                continue;
            }

            const hit = deps.store.lookupUstByCode(code, typeof compTfs === "string" ? compTfs : null);
            if (!hit || !hit.ok) {
                agg.unmappedCount++;
                continue;
            }

            agg.count++;
            agg.totalUst += hit.ust;
            agg.byDay[exec] = (agg.byDay[exec] ?? 0) + hit.ust;
        }

        const rows = monthList.map((month) => {
            const agg = byMonth.get(month)!;
            const goal = getGoalForMonth(collaborator, month);
            const pct = goal > 0 ? (agg.totalUst / goal) * 100 : 0;
            const workDaysTotal = getMonthWorkingDays(month);
            const workDaysPassed = getWorkDaysPassedForMonth(month, workDaysTotal);
            const pace = workDaysPassed > 0 ? agg.totalUst / workDaysPassed : 0;
            const forecast = pace * workDaysTotal;
            const status =
                goal === 0 ? "NO_GOAL" : forecast >= goal ? "ON_TRACK" : forecast >= goal * 0.9 ? "AT_RISK" : "OFF_TRACK";

            return {
                month,
                goal,
                totalUst: Number(agg.totalUst.toFixed(2)),
                pct: Number(pct.toFixed(1)),
                pace: Number(pace.toFixed(2)),
                forecast: Number(forecast.toFixed(0)),
                count: agg.count,
                unmappedCount: agg.unmappedCount,
                status,
                byDay: agg.byDay,
            };
        });

        return reply.send({
            uniqueName,
            displayName: collaborator.displayName,
            months,
            endMonth,
            rows,
        });
    });
}


