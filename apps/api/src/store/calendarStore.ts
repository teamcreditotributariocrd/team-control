import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export type CalendarEventType = "HOLIDAY" | "VACATION" | "RECESS" | "MEETING";

export type CalendarEvent = {
    id: string;
    title: string;
    type: CalendarEventType;
    startDate: string;
    endDate: string;
    person: string | null;
    notes: string | null;
    createdBy: string;
    createdAt: string;
    updatedAt: string;
};

export type CalendarEventDraft = Pick<CalendarEvent, "title" | "type" | "startDate" | "endDate" | "person" | "notes">;

function resolveApiDataDir() {
    const __filename = fileURLToPath(import.meta.url);
    const __dirname = path.dirname(__filename);
    return path.resolve(__dirname, "..", "..", "data");
}

function ensureDir(p: string) {
    if (!fs.existsSync(p)) fs.mkdirSync(p, { recursive: true });
}

function uid() {
    return Math.random().toString(16).slice(2) + "-" + Date.now().toString(16);
}

function overlaps(event: CalendarEvent, from?: string, to?: string) {
    if (from && event.endDate < from) return false;
    if (to && event.startDate > to) return false;
    return true;
}

export function createCalendarStore(dataDir = resolveApiDataDir()) {
    ensureDir(dataDir);
    const file = path.join(dataDir, "calendarEvents.json");
    let events: CalendarEvent[] = [];

    function persist() {
        fs.writeFileSync(file, JSON.stringify(events, null, 2), "utf-8");
    }

    function load() {
        if (!fs.existsSync(file)) {
            persist();
            return;
        }
        const parsed = JSON.parse(fs.readFileSync(file, "utf-8"));
        events = Array.isArray(parsed) ? parsed : [];
    }

    function sort(rows: CalendarEvent[]) {
        return rows.slice().sort((a, b) => a.startDate.localeCompare(b.startDate) || a.title.localeCompare(b.title));
    }

    load();

    return {
        list(q: { from?: string; to?: string } = {}) {
            return sort(events.filter((event) => overlaps(event, q.from, q.to)));
        },
        upsert(input: CalendarEventDraft & { id?: string }, uniqueName: string) {
            const now = new Date().toISOString();
            const idx = input.id ? events.findIndex((event) => event.id === input.id) : -1;
            const previous = idx >= 0 ? events[idx] : null;
            const next: CalendarEvent = {
                id: previous?.id ?? uid(),
                title: input.title,
                type: input.type,
                startDate: input.startDate,
                endDate: input.endDate,
                person: input.person,
                notes: input.notes,
                createdBy: previous?.createdBy ?? uniqueName,
                createdAt: previous?.createdAt ?? now,
                updatedAt: now,
            };

            if (idx >= 0) events[idx] = next;
            else events.push(next);
            persist();
            return next;
        },
        remove(id: string) {
            const before = events.length;
            events = events.filter((event) => event.id !== id);
            if (events.length !== before) persist();
            return events.length !== before;
        },
    };
}
