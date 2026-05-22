import React from "react";
import { Link, useLocation } from "react-router-dom";
import { BarChart3, BookOpen, CalendarClock, CalendarDays, ClipboardCheck, ClipboardList, LayoutDashboard, LogOut, ScrollText, Settings, Ticket, UserRound } from "lucide-react";
import { cls } from "../lib/utils";
import type { Session } from "../lib/api";

function isActiveRoute(to: string, pathname: string) {
    const exact = new Set(["/me", "/dashboard", "/settings", "/catalog", "/meetings", "/calendar", "/log-analytics"]);
    if (exact.has(to)) return pathname === to;
    return pathname === to || pathname.startsWith(to + "/");
}

export default function Layout({
    session,
    onLogout,
    children,
}: {
    session: Session;
    onLogout: () => void;
    children: React.ReactNode;
}) {
    const loc = useLocation();
    const nav = [
        { to: "/me", label: "Meu painel", icon: UserRound, show: true },
        { to: "/dashboard", label: "Dashboard do time", icon: BarChart3, show: session.role === "admin" },
        { to: "/audit", label: "Auditoria", icon: ClipboardCheck, show: session.role === "admin" },
        { to: "/settings", label: "Configuracoes", icon: Settings, show: session.role === "admin" },
        { to: "/catalog", label: "Catalogo", icon: BookOpen, show: true },
        { to: "/calendar", label: "Calendario", icon: CalendarDays, show: true },
        { to: "/log-analytics", label: "Log Analytics", icon: ScrollText, show: true },
        { to: "/meetings", label: "Reunioes", icon: CalendarClock, show: session.role === "admin" },
        { to: "/incidents", label: "Incidentes", icon: Ticket, show: true },
        { to: "/requisitions", label: "Requisicoes", icon: ClipboardList, show: true },
    ].filter((n) => n.show);

    return (
        <div className="app">
            <aside className="sidebar">
                <div className="brand">
                    <div className="dot">
                        <LayoutDashboard size={16} />
                    </div>
                    <div>
                        <div className="brandTitle">Team Control</div>
                        <div className="brandSub">COTIN / TFS</div>
                    </div>
                </div>

                <nav className="nav">
                    {nav.map((n) => {
                        const Icon = n.icon;
                        return (
                            <Link key={n.to} to={n.to} className={cls("navItem", isActiveRoute(n.to, loc.pathname) && "active")}>
                                <Icon size={18} />
                                <span>{n.label}</span>
                            </Link>
                        );
                    })}
                </nav>

                <div className="sideFooter">
                    <div className="muted small">Sessao</div>
                    <div className="small mono">{session.uniqueName || "-"}</div>
                    <div className="sessionRole">{session.role.toUpperCase()}</div>

                    <button className="btn ghost logoutBtn" onClick={onLogout}>
                        <LogOut size={16} />
                        <span>Sair</span>
                    </button>
                </div>
            </aside>

            <main className="main">
                <header className="topbar">
                    <div>
                        <div className="topTitle">Team Control</div>
                        <div className="topSubtitle">Gestao operacional, metas e auditoria TFS</div>
                    </div>
                    <div className="topRight">
                        <span className="pill">{new Date().toISOString().slice(0, 10)}</span>
                    </div>
                </header>

                <div className="content">{children}</div>
            </main>
        </div>
    );
}
