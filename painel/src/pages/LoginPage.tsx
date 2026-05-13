import { useState, useEffect } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { api, clearAuthToken, getAuthToken, setAuthToken, type AuthStatus } from "../api/client";

export function LoginPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const from = (location.state as { from?: string } | null)?.from;
  const [status, setStatus] = useState<AuthStatus | null>(null);
  const [mode, setMode] = useState<"login" | "register">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [organizationName, setOrganizationName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    api
      .getAuthStatus()
      .then((s) => {
        setStatus(s);
        if (s.allowRegister && !s.hasUsers) setMode("register");
      })
      .catch(() => setStatus({ database: false, hasUsers: false, allowRegister: false }));
  }, []);

  useEffect(() => {
    if (status?.database === false && mode === "register") setMode("login");
  }, [status?.database, mode]);

  useEffect(() => {
    if (!getAuthToken()) return;
    api
      .getMe()
      .then(() => {
        const dest = from && from !== "/login" ? from : "/";
        navigate(dest, { replace: true });
      })
      .catch(() => clearAuthToken());
  }, [from, navigate]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const dest = from && from !== "/login" ? from : "/";
      if (mode === "register") {
        const r = await api.register(email.trim(), password, organizationName.trim() || "Minha empresa");
        setAuthToken(r.token);
        navigate(dest, { replace: true });
      } else {
        const r = await api.login(email.trim(), password);
        setAuthToken(r.token);
        navigate(dest, { replace: true });
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha na autenticação");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden bg-slate-900 px-4 py-12 sm:px-6">
      <div
        className="pointer-events-none absolute inset-0 opacity-40"
        style={{
          background:
            "radial-gradient(ellipse 80% 50% at 50% -20%, rgb(99 102 241 / 0.35), transparent), radial-gradient(ellipse 60% 40% at 100% 0%, rgb(45 212 191 / 0.12), transparent)",
        }}
        aria-hidden
      />
      <div className="relative w-full max-w-md">
        <div className="mb-8 text-center">
          <p className="font-display text-2xl font-semibold tracking-tight text-white">Máquina de vendas</p>
          <p className="mt-1 text-sm text-slate-400">FabriaIA · Acesso ao painel</p>
        </div>

        <div className="rounded-2xl border border-white/10 bg-white/95 p-8 shadow-lift backdrop-blur-sm">
          {status === null && (
            <p className="mb-6 text-center text-sm text-slate-500">Carregando opções de acesso…</p>
          )}

          {status?.database === false && (
            <div className="alert-error mb-6">
              <p className="font-semibold text-red-900">Erro Crítico: Banco de Dados não configurado</p>
              <p className="mt-1 text-sm text-red-800">
                A plataforma exige um banco de dados PostgreSQL para funcionar. Configure a variável de ambiente{" "}
                <code className="rounded bg-red-100 px-1 font-mono text-xs">DATABASE_URL</code> no servidor backend e reinicie.
              </p>
            </div>
          )}

          {error && <div className="alert-error mb-6">{error}</div>}

          {status?.database === true && (
            <div className="mb-6 flex rounded-xl bg-slate-100/90 p-1">
              <button
                type="button"
                onClick={() => setMode("login")}
                className={`flex-1 rounded-lg py-2.5 text-sm font-semibold transition-all ${
                  mode === "login" ? "bg-white text-slate-900 shadow-sm" : "text-slate-600 hover:text-slate-900"
                }`}
              >
                Já tenho conta
              </button>
              <button
                type="button"
                onClick={() => setMode("register")}
                className={`flex-1 rounded-lg py-2.5 text-sm font-semibold transition-all ${
                  mode === "register" ? "bg-white text-slate-900 shadow-sm" : "text-slate-600 hover:text-slate-900"
                }`}
              >
                Nova conta
              </button>
            </div>
          )}

          {status?.database === true && mode === "register" && !status.allowRegister && (
            <div className="alert-warn mb-6 text-sm">
              Cadastro público está desligado neste servidor (já existe pelo menos um usuário). Para permitir novos workspaces,
              defina <code className="rounded bg-amber-100/80 px-1 text-xs">ALLOW_OPEN_REGISTER=true</code> nas variáveis de ambiente
              da API e reinicie o serviço.
            </div>
          )}

          <form onSubmit={handleSubmit} className={`space-y-5 ${status === null ? "pointer-events-none opacity-50" : ""}`}>
            {mode === "register" && (
              <div>
                <label className="label-field">Nome da empresa / workspace</label>
                <input
                  type="text"
                  value={organizationName}
                  onChange={(e) => setOrganizationName(e.target.value)}
                  className="input-field"
                  placeholder="Ex.: Imobiliária Silva"
                  autoComplete="organization"
                />
              </div>
            )}
            <div>
              <label className="label-field">E-mail</label>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="input-field"
                autoComplete="email"
              />
            </div>
            <div>
              <label className="label-field">Senha</label>
              <input
                type="password"
                required
                minLength={mode === "register" ? 8 : undefined}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="input-field"
                autoComplete={mode === "register" ? "new-password" : "current-password"}
              />
              {mode === "register" && <p className="mt-1.5 text-xs text-slate-500">Mínimo 8 caracteres.</p>}
            </div>
            <button
              type="submit"
              disabled={
                loading ||
                status?.database === false ||
                (mode === "register" && status?.database === true && !status.allowRegister)
              }
              className="btn-primary mt-2 w-full py-3"
            >
              {loading ? "Aguarde…" : mode === "register" ? "Criar conta e entrar" : "Entrar"}
            </button>
          </form>


        </div>
      </div>
    </div>
  );
}
