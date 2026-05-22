export type Role = "admin" | "member";

export type Collaborator = {
    id: string;
    displayName: string;
    uniqueName: string;
    monthlyGoalUst: number;
    monthlyGoalsUst?: Record<string, number>;
    isActive: boolean;
    role: Role;
    hasPassword?: boolean;
};

export type TeamRow = {
    displayName: string;
    uniqueName: string;
    goal: number;
    totalUst: number;
    pct: number;
    pace: number;
    forecast: number;
    gap: number;
    neededPerDay: number;
    status: "NO_GOAL" | "ON_TRACK" | "AT_RISK" | "OFF_TRACK";
    byDay: Record<string, number>;
};

export type TeamSummary = {
    month: string;
    workDaysTotal: number;
    workDaysPassed: number;
    team: { totalUst: number; goal: number; pct: number; pace: number; forecast: number };
    rows: TeamRow[];
};

export type UserItemsResponse = {
    month: string;
    uniqueName: string;
    totalUst: number;
    byDay: Record<string, number>;
    count: number;
    unmappedCount: number;
    items: Array<{
        id: number;
        execDate: string;
        title: string;
        state: string | null;
        code: number;
        complexidade: string | null;
        expectedComplexidade: string;
        ust: number;
        workItemUrl: string | null;
        atividadeRaw: string;
        catalog?: CatalogRow;
    }>;
    unmapped: Array<{
        id: number;
        title: string;
        reason: string;
        raw?: string;
        exec?: string;
        code?: number;
        gotComplexidade?: string | null;
        expectedComplexidade?: string | null;
        action?: string;
        workItemUrl?: string | null;
        suggestions?: Array<CatalogRow & { score: number; matchedTerms: string[] }>;
    }>;
};

export type UserHistoryResponse = {
    uniqueName: string;
    displayName: string;
    months: number;
    endMonth: string;
    rows: Array<{
        month: string;
        goal: number;
        totalUst: number;
        pct: number;
        pace: number;
        forecast: number;
        count: number;
        unmappedCount: number;
        status: "NO_GOAL" | "ON_TRACK" | "AT_RISK" | "OFF_TRACK";
        byDay: Record<string, number>;
    }>;
};

export type AuditResponse = {
    month: string;
    totals: {
        collaborators: number;
        withoutPassword: number;
        withoutGoal: number;
        withoutUst: number;
        unmappedCount: number;
    };
    rows: Array<{
        displayName: string;
        uniqueName: string;
        role: Role;
        hasPassword: boolean;
        goal: number;
        totalUst: number;
        pct: number;
        mappedCount: number;
        unmappedCount: number;
        issues: Record<string, number>;
        flags: string[];
    }>;
};

export type TeamHistoryResponse = {
    months: number;
    endMonth: string;
    rows: Array<{
        month: string;
        goal: number;
        totalUst: number;
        pct: number;
        pace: number;
        forecast: number;
        unmappedCount: number;
        status: "NO_GOAL" | "ON_TRACK" | "AT_RISK" | "OFF_TRACK";
    }>;
    collaborators: Array<{
        displayName: string;
        uniqueName: string;
        goal: number;
        currentUst: number;
        previousUst: number;
        delta: number;
        pct: number;
        mappedCount: number;
        unmappedCount: number;
    }>;
};

export type CatalogRow = {
    codigo: number;
    grupo: string;
    subgrupo: string;
    atividade: string;
    tipo: string;
    complexidade: string;
    ust: number;
};

export type CatalogPageResponse = { total: number; offset: number; limit: number; rows: CatalogRow[] };

export type FavoriteCatalogResponse = { uniqueName: string; codes: number[]; rows: CatalogRow[] };

export type DiscordDailySchedule = {
    enabled: boolean;
    times: string[];
    lastRunAt: string | null;
    lastRunStatus: "OK" | "ERROR" | null;
    lastRunMessage: string | null;
};

export type TfsSupportBugConfig = {
    areaPath: string;
    iterationPath: string;
    updatedAt: string | null;
};

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

export type LogParser = "CREDTRIB_BAIXA_AUTOMATICA" | "CREDTRIB_ATUALIZAR_LOCAL_CONTENCIOSO";

export type LogSource = {
    id: string;
    name: string;
    system: string;
    description: string;
    path: string;
    filePrefix: string;
    parser: LogParser;
    createdAt: string;
    updatedAt: string;
};

export type LogAnalyticsAnalysis = {
    source: LogSource;
    files: string[];
    kpis: {
        executions: number;
        runsWithErrors: number;
        errorsFound: number;
        loweredSuccess: number;
        updatedToPaid: number;
        averageDurationSeconds: number;
        lastRunAt: string | null;
    };
    executions: Array<{
        file: string;
        startedAt: string;
        finishedAt: string | null;
        durationSeconds: number | null;
        emittedProcessed: number;
        updatedToPaid: number;
        paidProcessed: number;
        loweredSuccess: number;
        errorsFound: number;
        consultedInstallments?: number;
        consultedProcesses?: number;
        updatedInstallments?: number;
        updatedProcesses?: number;
        installmentDurationSeconds?: number | null;
        processDurationSeconds?: number | null;
    }>;
    daily: Array<{
        day: string;
        executions: number;
        errors: number;
        loweredSuccess: number;
        averageDurationSeconds: number;
    }>;
    errorPatterns: Array<{
        signature: string;
        count: number;
        lastAt: string;
        samples: string[];
    }>;
    recentErrors: Array<{
        at: string;
        file: string;
        message: string;
        signature: string;
    }>;
};
