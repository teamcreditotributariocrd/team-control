import React, { useState } from "react";
import { LockKeyhole, LogIn, ShieldCheck, User, UserPlus } from "lucide-react";
import type { Role } from "../types";

type Props = {
    setSession: (uniqueName: string, role: Role, token: string) => void;
};

export default function LoginGate({ setSession }: Props) {
    const [mode, setMode] = useState<"login" | "register">("login");
    const [displayName, setDisplayName] = useState("");
    const [uniqueName, setUniqueName] = useState("FAZENDA\\");
    const [password, setPassword] = useState("");
    const [err, setErr] = useState("");
    const [loading, setLoading] = useState(false);

    const isRegister = mode === "register";

    async function submit() {
        const login = uniqueName.trim();
        const name = displayName.trim();

        if (!login || !password) return;
        if (isRegister && !name) {
            setErr("Informe o nome para criar o acesso.");
            return;
        }
        if (isRegister && password.length < 6) {
            setErr("A senha precisa ter pelo menos 6 caracteres.");
            return;
        }

        setLoading(true);
        setErr("");

        try {
            const res = await fetch(isRegister ? "/api/auth/register" : "/api/auth/login", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(
                    isRegister
                        ? { displayName: name, uniqueName: login, password }
                        : { uniqueName: login, password }
                ),
            });

            const data = await res.json();
            if (!res.ok) {
                const message =
                    data?.error === "PASSWORD_NOT_CONFIGURED"
                        ? "Este usuario ainda nao tem senha. Use Criar acesso ou peca ao admin para cadastrar uma senha."
                        : data?.error === "USER_ALREADY_HAS_ACCESS"
                            ? "Este usuario ja possui acesso. Entre com usuario e senha."
                            : data?.error === "ADMIN_MUST_USE_LOGIN_BOOTSTRAP"
                                ? "Admin inicial deve entrar pela aba Entrar para definir a primeira senha."
                                : data?.error === "INVALID_CREDENTIALS"
                                    ? "Usuario ou senha invalidos."
                                    : "Nao foi possivel concluir a operacao.";
                throw new Error(message);
            }

            setSession(data.uniqueName, data.role, data.token);
        } catch (e: any) {
            setErr(String(e?.message ?? e));
        } finally {
            setLoading(false);
        }
    }

    return (
        <div className="login">
            <div className="loginCard premiumLoginCard">
                <div className="loginMark">
                    <div className="loginMarkIcon">
                        <ShieldCheck size={22} strokeWidth={2.4} />
                    </div>
                    <div>
                        <div className="loginBrand">UST Control</div>
                        <div className="loginCaption">COTIN / TFS</div>
                    </div>
                </div>

                <div className="loginTitle">{isRegister ? "Criar acesso" : "Entrar"}</div>
                <div className="muted">Informe seu usuario e senha.</div>

                {err && <div className="alert" style={{ marginTop: 12 }}>{err}</div>}

                <div className="loginSwitch">
                    <button className={mode === "login" ? "active" : ""} onClick={() => setMode("login")} disabled={loading}>
                        <LogIn size={16} />
                        Entrar
                    </button>
                    <button className={mode === "register" ? "active" : ""} onClick={() => setMode("register")} disabled={loading}>
                        <UserPlus size={16} />
                        Criar acesso
                    </button>
                </div>

                {isRegister && (
                    <div className="loginField">
                        <label className="label">Nome</label>
                        <div className="loginInputWrap">
                            <User size={18} />
                            <input
                                className="input loginInput"
                                value={displayName}
                                onChange={(e) => setDisplayName(e.target.value)}
                                placeholder="Nome completo"
                            />
                        </div>
                    </div>
                )}

                <div className="loginField">
                    <label className="label">Usuario</label>
                    <div className="loginInputWrap">
                        <User size={18} />
                        <input
                            className="input loginInput"
                            value={uniqueName}
                            onChange={(e) => setUniqueName(e.target.value)}
                            placeholder="FAZENDA\\usuario"
                            autoComplete="username"
                        />
                    </div>
                </div>

                <div className="loginField">
                    <label className="label">Senha</label>
                    <div className="loginInputWrap">
                        <LockKeyhole size={18} />
                        <input
                            className="input loginInput"
                            type="password"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            placeholder={isRegister ? "Minimo 6 caracteres" : ""}
                            autoComplete={isRegister ? "new-password" : "current-password"}
                            onKeyDown={(e) => {
                                if (e.key === "Enter") submit();
                            }}
                        />
                    </div>
                </div>

                <div className="loginActions">
                    <button className="btn primary loginSubmit" disabled={!uniqueName.trim() || !password || loading} onClick={submit}>
                        {isRegister ? <UserPlus size={18} /> : <LogIn size={18} />}
                        <span>{loading ? "Aguarde..." : isRegister ? "Criar e entrar" : "Entrar"}</span>
                    </button>
                </div>
            </div>
        </div>
    );
}
