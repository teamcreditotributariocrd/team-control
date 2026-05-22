import React, { useEffect, useMemo, useState } from "react";
import { CalendarDays, ChevronLeft, ChevronRight, Clock3, Pencil, Plus, Trash2, UsersRound } from "lucide-react";
import { apiGet, apiSend, type Session } from "../lib/api";
import type { CalendarEvent, CalendarEventType } from "../types";

type EventDraft = {
    id?: string;
    title: string;
    type: CalendarEventType;
    startDate: string;
    endDate: string;
    person: string;
    notes: string;
};

const typeMeta: Record<CalendarEventType, { label: string; tone: string }> = {
    HOLIDAY: { label: "Feriado", tone: "#39E58C" },
    VACATION: { label: "Ferias", tone: "#6EE7FF" },
    RECESS: { label: "Recesso", tone: "#FFD166" },
    MEETING: { label: "Reuniao", tone: "#C4B5FD" },
};

const weekDays = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sab"];

export default function CalendarPage({ session }: { session: Session }) {
    const today = localYmd(new Date());
    const [month, setMonth] = useState(() => today.slice(0, 7));
    const [events, setEvents] = useState<CalendarEvent[]>([]);
    const [draft, setDraft] = useState<EventDraft>(() => emptyDraft(today));
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [err, setErr] = useState("");

    const range = useMemo(() => monthRange(month), [month]);
    const days = useMemo(() => calendarDays(range.start), [range.start]);

    async function load(active = () => true) {
        setLoading(true);
        setErr("");
        try {
            const rows = await apiGet<CalendarEvent[]>(`/api/calendar/events?from=${range.gridStart}&to=${range.gridEnd}`, session);
            if (active()) setEvents(Array.isArray(rows) ? rows : []);
        } catch (e: any) {
            if (active()) setErr(String(e?.message ?? e));
        } finally {
            if (active()) setLoading(false);
        }
    }

    useEffect(() => {
        let active = true;
        load(() => active);
        return () => {
            active = false;
        };
    }, [month, session]);

    async function save() {
        setSaving(true);
        setErr("");
        try {
            const saved = await apiSend<CalendarEvent>("/api/calendar/events", "POST", {
                ...draft,
                person: draft.person.trim() || null,
                notes: draft.notes.trim() || null,
            }, session);
            setEvents((current) => upsertEvent(current, saved));
            setDraft(emptyDraft(saved.startDate));
        } catch (e: any) {
            setErr(String(e?.message ?? e));
        } finally {
            setSaving(false);
        }
    }

    async function remove() {
        if (!draft.id) return;
        setSaving(true);
        setErr("");
        try {
            await apiSend(`/api/calendar/events/${draft.id}`, "DELETE", {}, session);
            setEvents((current) => current.filter((event) => event.id !== draft.id));
            setDraft(emptyDraft(draft.startDate));
        } catch (e: any) {
            setErr(String(e?.message ?? e));
        } finally {
            setSaving(false);
        }
    }

    const upcoming = useMemo(() => events
        .filter((event) => event.endDate >= today)
        .sort(compareEvents)
        .slice(0, 8), [events, today]);

    return (
        <div>
            <div className="pageHeader">
                <div>
                    <div className="h1">Calendario</div>
                    <div className="muted">Feriados, ferias do time, recessos e reunioes.</div>
                </div>
                <div className="pageHeaderRight">
                    <button className="btn ghost" onClick={() => setMonth(moveMonth(month, -1))} aria-label="Mes anterior">
                        <ChevronLeft size={16} />
                    </button>
                    <div className="pill" style={{ minWidth: 170, justifyContent: "center" }}>
                        <CalendarDays size={15} />
                        {monthLabel(range.start)}
                    </div>
                    <button className="btn ghost" onClick={() => setMonth(moveMonth(month, 1))} aria-label="Proximo mes">
                        <ChevronRight size={16} />
                    </button>
                    <button className="btn primary" onClick={() => setDraft(emptyDraft(today))}>
                        <Plus size={16} />
                        Novo evento
                    </button>
                </div>
            </div>

            {err ? <div className="alert">{err}</div> : null}

            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 420px), 1fr))", gap: 14, alignItems: "start" }}>
                <section className="card" style={{ minWidth: 0 }}>
                    {loading ? <div className="muted">Carregando calendario...</div> : null}
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(7, minmax(0, 1fr))", gap: 1, border: "1px solid rgba(255,255,255,.08)", borderRadius: 8, overflow: "hidden", background: "rgba(255,255,255,.08)" }}>
                        {weekDays.map((day) => (
                            <div key={day} className="muted small strong" style={{ padding: "10px 8px", background: "rgba(11,18,32,.96)", textAlign: "center" }}>
                                {day}
                            </div>
                        ))}
                        {days.map((day) => {
                            const dayEvents = eventsForDay(events, day);
                            const inMonth = day.slice(0, 7) === month;
                            const isToday = day === today;
                            return (
                                <button
                                    key={day}
                                    type="button"
                                    onClick={() => setDraft(emptyDraft(day))}
                                    style={{
                                        minHeight: 132,
                                        padding: 8,
                                        border: 0,
                                        background: inMonth ? "rgba(7,11,20,.96)" : "rgba(7,11,20,.72)",
                                        color: "inherit",
                                        cursor: "pointer",
                                        textAlign: "left",
                                        display: "grid",
                                        alignContent: "start",
                                        gap: 6,
                                    }}
                                >
                                    <span
                                        className={isToday ? "pill small" : "small"}
                                        style={isToday ? { width: "fit-content", borderColor: "rgba(110,231,255,.4)" } : { opacity: inMonth ? 1 : .5 }}
                                    >
                                        {Number(day.slice(-2))}
                                    </span>
                                    {dayEvents.slice(0, 3).map((event) => (
                                        <span
                                            key={`${day}-${event.id}`}
                                            onClick={(click) => {
                                                click.stopPropagation();
                                                setDraft(fromEvent(event));
                                            }}
                                            title={`${typeMeta[event.type].label}: ${event.title}`}
                                            style={{
                                                display: "block",
                                                padding: "5px 7px",
                                                borderRadius: 7,
                                                border: `1px solid ${typeMeta[event.type].tone}66`,
                                                background: `${typeMeta[event.type].tone}18`,
                                                color: "inherit",
                                                overflow: "hidden",
                                                whiteSpace: "nowrap",
                                                textOverflow: "ellipsis",
                                            }}
                                        >
                                            {event.title}
                                        </span>
                                    ))}
                                    {dayEvents.length > 3 ? <span className="muted small">+{dayEvents.length - 3} evento(s)</span> : null}
                                </button>
                            );
                        })}
                    </div>
                </section>

                <aside style={{ display: "grid", gap: 14 }}>
                    <section className="card">
                        <div className="pageHeader" style={{ marginBottom: 12 }}>
                            <div>
                                <div className="cardTitle" style={{ marginBottom: 4 }}>{draft.id ? "Editar evento" : "Novo evento"}</div>
                                <div className="muted small">Calendario compartilhado do time.</div>
                            </div>
                            {draft.id ? <Pencil size={18} /> : <Plus size={18} />}
                        </div>

                        <div className="label">Titulo</div>
                        <input className="input" value={draft.title} onChange={(e) => setDraft((current) => ({ ...current, title: e.target.value }))} />

                        <div className="row2" style={{ marginTop: 10 }}>
                            <div>
                                <div className="label">Tipo</div>
                                <select className="input" value={draft.type} onChange={(e) => setDraft((current) => ({ ...current, type: e.target.value as CalendarEventType }))}>
                                    {Object.entries(typeMeta).map(([value, meta]) => <option key={value} value={value}>{meta.label}</option>)}
                                </select>
                            </div>
                            <div>
                                <div className="label">Pessoa / time</div>
                                <input className="input" value={draft.person} onChange={(e) => setDraft((current) => ({ ...current, person: e.target.value }))} placeholder="Opcional" />
                            </div>
                        </div>

                        <div className="row2" style={{ marginTop: 10 }}>
                            <div>
                                <div className="label">Inicio</div>
                                <input className="input" type="date" value={draft.startDate} onChange={(e) => setDraft((current) => ({ ...current, startDate: e.target.value, endDate: current.endDate < e.target.value ? e.target.value : current.endDate }))} />
                            </div>
                            <div>
                                <div className="label">Fim</div>
                                <input className="input" type="date" min={draft.startDate} value={draft.endDate} onChange={(e) => setDraft((current) => ({ ...current, endDate: e.target.value }))} />
                            </div>
                        </div>

                        <div className="label" style={{ marginTop: 10 }}>Observacoes</div>
                        <textarea className="input" rows={4} value={draft.notes} onChange={(e) => setDraft((current) => ({ ...current, notes: e.target.value }))} />

                        <div style={{ display: "flex", justifyContent: "space-between", gap: 8, flexWrap: "wrap", marginTop: 12 }}>
                            {draft.id ? (
                                <button className="btn danger" onClick={remove} disabled={saving}>
                                    <Trash2 size={15} />
                                    Remover
                                </button>
                            ) : <span />}
                            <button className="btn primary" onClick={save} disabled={saving || !draft.title.trim() || !draft.startDate || !draft.endDate}>
                                {saving ? "Salvando..." : draft.id ? "Salvar evento" : "Adicionar evento"}
                            </button>
                        </div>
                    </section>

                    <section className="card">
                        <div className="cardTitle">Proximos eventos</div>
                        <div style={{ display: "grid", gap: 8 }}>
                            {upcoming.map((event) => (
                                <button
                                    key={`upcoming-${event.id}`}
                                    type="button"
                                    onClick={() => setDraft(fromEvent(event))}
                                    style={{
                                        padding: 10,
                                        borderRadius: 8,
                                        border: `1px solid ${typeMeta[event.type].tone}55`,
                                        background: `${typeMeta[event.type].tone}12`,
                                        color: "inherit",
                                        cursor: "pointer",
                                        textAlign: "left",
                                    }}
                                >
                                    <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
                                        <span className="strong">{event.title}</span>
                                        <span className="pill small">{typeMeta[event.type].label}</span>
                                    </div>
                                    <div className="muted small" style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 5 }}>
                                        <span><Clock3 size={12} /> {periodLabel(event)}</span>
                                        {event.person ? <span><UsersRound size={12} /> {event.person}</span> : null}
                                    </div>
                                </button>
                            ))}
                            {!upcoming.length ? <div className="muted small">Nenhum evento futuro registrado.</div> : null}
                        </div>
                    </section>
                </aside>
            </div>
        </div>
    );
}

function emptyDraft(day: string): EventDraft {
    return {
        title: "",
        type: "VACATION",
        startDate: day,
        endDate: day,
        person: "",
        notes: "",
    };
}

function fromEvent(event: CalendarEvent): EventDraft {
    return {
        id: event.id,
        title: event.title,
        type: event.type,
        startDate: event.startDate,
        endDate: event.endDate,
        person: event.person ?? "",
        notes: event.notes ?? "",
    };
}

function ymd(date: Date) {
    return date.toISOString().slice(0, 10);
}

function localYmd(date: Date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
}

function monthRange(month: string) {
    const start = new Date(`${month}-01T12:00:00Z`);
    const gridStart = new Date(start);
    gridStart.setUTCDate(gridStart.getUTCDate() - gridStart.getUTCDay());
    const gridEnd = new Date(gridStart);
    gridEnd.setUTCDate(gridEnd.getUTCDate() + 41);
    return { start, gridStart: ymd(gridStart), gridEnd: ymd(gridEnd) };
}

function calendarDays(start: Date) {
    return Array.from({ length: 42 }, (_, index) => {
        const day = new Date(start);
        day.setUTCDate(day.getUTCDate() - day.getUTCDay() + index);
        return ymd(day);
    });
}

function moveMonth(month: string, delta: number) {
    const start = new Date(`${month}-01T12:00:00Z`);
    start.setUTCMonth(start.getUTCMonth() + delta);
    return ymd(start).slice(0, 7);
}

function monthLabel(date: Date) {
    return date.toLocaleDateString("pt-BR", { month: "long", year: "numeric", timeZone: "UTC" });
}

function eventsForDay(events: CalendarEvent[], day: string) {
    return events.filter((event) => event.startDate <= day && event.endDate >= day).sort(compareEvents);
}

function upsertEvent(events: CalendarEvent[], saved: CalendarEvent) {
    const found = events.some((event) => event.id === saved.id);
    const next = found ? events.map((event) => event.id === saved.id ? saved : event) : [...events, saved];
    return next.sort(compareEvents);
}

function compareEvents(a: CalendarEvent, b: CalendarEvent) {
    return a.startDate.localeCompare(b.startDate) || a.endDate.localeCompare(b.endDate) || a.title.localeCompare(b.title);
}

function periodLabel(event: CalendarEvent) {
    return event.startDate === event.endDate ? brDate(event.startDate) : `${brDate(event.startDate)} a ${brDate(event.endDate)}`;
}

function brDate(value: string) {
    const [year, month, day] = value.split("-");
    return `${day}/${month}/${year}`;
}
