import { useEffect, useState } from "react";
import type { Role } from "../types";

export function useSession() {
    const [uniqueName, setUniqueName] = useState<string>(() => localStorage.getItem("ust.user") ?? "");
    const [role, setRole] = useState<Role>(() => ((localStorage.getItem("ust.role") as Role) ?? "member"));
    const [token, setToken] = useState<string>(() => localStorage.getItem("ust.token") ?? "");

    function setSession(u: string, r: Role, t: string) {
        setUniqueName(u);
        setRole(r);
        setToken(t);
        localStorage.setItem("ust.user", u);
        localStorage.setItem("ust.role", r);
        localStorage.setItem("ust.token", t);
    }

    function logout() {
        setUniqueName("");
        setRole("member");
        setToken("");
        localStorage.removeItem("ust.user");
        localStorage.removeItem("ust.role");
        localStorage.removeItem("ust.token");
    }

    useEffect(() => {
        window.addEventListener("ust:session-expired", logout);
        return () => window.removeEventListener("ust:session-expired", logout);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    return { uniqueName, role, token, setSession, logout };
}
