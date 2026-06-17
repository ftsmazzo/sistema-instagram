import { useState, useEffect } from "react";
import { useNavigate, useLocation, Link } from "react-router-dom";
import { api, clearAuthToken, getAuthToken, setAuthToken, type AuthStatus } from "../api/client";
import { BRAND } from "../config/brand";

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
    <div className="flex min-h-screen">
      {/* Painel de marca */}
      <div className="relative hidden w-[44%] max-w-xl flex-col justify-between overflow-hidden bg-gradient-to-br from-brand-800 via-brand-700 to-emerald-800 p-10 text-white lg:flex xl:max-w-2xl xl:p-14">
        <div
          className="pointer-events-none absolute inset-0 opacity-30"
          style={{
            background:
              "radial-gradient(circle at 20% 80%, rgba(255,255,255,0.15), transparent 50%), radial-gradient(circle at 80% 20%, rgba(52,211,153,0.2), transparent 40%)",
          }}
          aria-hidden
        />
        <div className="relative">
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-brand-200">{BRAND.parent}</p>
          <h1 className="font-display mt-4 text-4xl font-bold tracking-tight xl:text-5xl">{BRAND.name}</h1>
          <p className="mt-3 text-lg font-medium text-brand-100">{BRAND.tagline}</p>
        </div>
        <div className="relative space-y-6">
          <p className="text-2xl font-semibold leading-snug text-white/95">{BRAND.headline}.</p>
          <p className="max-w-md text-sm leading-relaxed text-brand-100/90">{BRAND.description}</p>
          <ul className="space-y-3 text-sm text-brand-50/90">
            <li className="flex items-center gap-2">
              <span className="flex h-6 w-6 items-center justify-center rounded-full bg-white/15 text-xs">1</span>
              Comentário inteligente no post
            </li>
            <li className="flex items-center gap-2">
              <span className="flex h-6 w-6 items-center justify-center rounded-full bg-white/15 text-xs">2</span>
              Direct qualifica e captura WhatsApp
            </li>
            <li className="flex items-center gap-2">
              <span className="flex h-6 w-6 items-center justify-center rounded-full bg-white/15 text-xs">3</span>
              CRM fecha a venda 24/7
            </li>
          </ul>
        </div>
        <p className="relative text-xs text-brand-200/80">© {new Date().getFullYear()} {BRAND.parent}</p>
      </div>

      {/* Formulário */}
      <div className="flex flex-1 flex-col items-center justify-center px-4 py-12 sm:px-8">
        <div className="mb-8 w-full max-w-md text-center lg:hidden">
          <p className="font-display text-2xl font-bold text-slate-900">{BRAND.name}</p>
          <p className="mt-1 text-sm text-slate-500">{BRAND.tagline}</p>
        </div>

        <div className="w-full max-w-md">
          <div className="card !p-8">
            <h2 className="font-display text-xl font-bold text-slate-900">
              {mode === "register" ? "Criar workspace" : "Entrar na plataforma"}
            </h2>
            <p className="mt-1 text-sm text-slate-500">
              {mode === "register"
                ? "Configure sua empresa e comece a converter leads."
                : "Acesse sua operação comercial no Instagram."}
            </p>

            {status === null && (
              <p className="mt-6 text-center text-sm text-slate-500">Carregando opções de acesso…</p>
            )}

            {status?.database === false && (
              <div className="alert-error mt-6">
                <p className="font-semibold">Banco de dados não configurado</p>
                <p className="mt-1 text-sm opacity-90">
                  Configure <code className="rounded bg-red-100 px-1 text-xs">DATABASE_URL</code> na API e reinicie.
                </p>
              </div>
            )}

            {error && <div className="alert-error mt-6">{error}</div>}

            {status?.database === true && (
              <div className="mt-6 flex rounded-xl bg-slate-100 p-1">
                <button
                  type="button"
                  onClick={() => setMode("login")}
                  className={`flex-1 rounded-lg py-2.5 text-sm font-semibold transition-all ${
                    mode === "login" ? "bg-white text-slate-900 shadow-sm" : "text-slate-600"
                  }`}
                >
                  Já tenho conta
                </button>
                <button
                  type="button"
                  onClick={() => setMode("register")}
                  className={`flex-1 rounded-lg py-2.5 text-sm font-semibold transition-all ${
                    mode === "register" ? "bg-white text-slate-900 shadow-sm" : "text-slate-600"
                  }`}
                >
                  Nova conta
                </button>
              </div>
            )}

            {status?.database === true && mode === "register" && !status.allowRegister && (
              <div className="alert-warn mt-6 text-sm">
                Cadastro público desligado. Defina{" "}
                <code className="rounded bg-amber-100/80 px-1 text-xs">ALLOW_OPEN_REGISTER=true</code> na API.
              </div>
            )}

            <form
              onSubmit={handleSubmit}
              className={`mt-6 space-y-4 ${status === null ? "pointer-events-none opacity-50" : ""}`}
            >
              {mode === "register" && (
                <div>
                  <label className="label-field">Nome da empresa</label>
                  <input
                    type="text"
                    value={organizationName}
                    onChange={(e) => setOrganizationName(e.target.value)}
                    className="input-field"
                    placeholder="Ex.: Barbearia Silva"
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
                {mode === "register" && <p className="mt-1 text-xs text-slate-500">Mínimo 8 caracteres.</p>}
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

          <p className="mt-6 text-center text-xs text-slate-400">
            Produto comercial da{" "}
            <Link to="/" className="text-brand-600 hover:underline">
              {BRAND.parent}
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
