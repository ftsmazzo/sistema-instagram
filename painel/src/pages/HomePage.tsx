import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { api } from "../api/client";
import { BRAND } from "../config/brand";

const funnelSteps = [
  { step: "1", title: "Comentário", desc: "Resposta pública inteligente no post" },
  { step: "2", title: "Direct", desc: "Conversa privada e qualificação" },
  { step: "3", title: "WhatsApp", desc: "Handoff e fechamento com contexto" },
];

const quickLinks = [
  {
    to: "/admin",
    title: "Administração",
    desc: "Conta Instagram, perfil da empresa, prompts e critérios de qualificação.",
    accent: "from-amber-500 to-orange-600",
  },
  {
    to: "/whatsapp",
    title: "WhatsApp & leads",
    desc: "Conexão Evolution, agente comercial e leads capturados pelo funil.",
    accent: "from-emerald-500 to-teal-600",
  },
];

export function HomePage() {
  const [apiStatus, setApiStatus] = useState<"checking" | "ok" | "error">("checking");

  useEffect(() => {
    api
      .getHealth()
      .then(() => setApiStatus("ok"))
      .catch(() => setApiStatus("error"));
  }, []);

  return (
    <div className="mx-auto max-w-5xl px-6 py-10 sm:px-10 lg:px-12 lg:py-12 page-enter">
      <section className="relative overflow-hidden rounded-2xl border border-indigo-100 bg-gradient-to-br from-indigo-600 via-indigo-700 to-violet-800 px-6 py-10 text-white shadow-lg sm:px-10 sm:py-12">
        <div
          className="pointer-events-none absolute -right-16 -top-16 h-64 w-64 rounded-full bg-white/10 blur-3xl"
          aria-hidden
        />
        <div className="relative">
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-indigo-200">{BRAND.parent}</p>
          <h1 className="font-display mt-2 text-4xl font-bold tracking-tight sm:text-5xl">{BRAND.name}</h1>
          <p className="mt-2 text-lg font-medium text-indigo-100">{BRAND.tagline}</p>
          <p className="mt-6 max-w-2xl text-base leading-relaxed text-indigo-50/95 sm:text-lg">{BRAND.headline}.</p>
          <p className="mt-3 max-w-2xl text-sm leading-relaxed text-indigo-100/80">{BRAND.description}</p>
        </div>
      </section>

      <div className="mt-6 flex flex-wrap items-center gap-3">
        <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">Status da API</span>
        {apiStatus === "checking" && <span className="text-sm text-slate-500">Verificando…</span>}
        {apiStatus === "ok" && (
          <span className="inline-flex items-center gap-2 rounded-full bg-emerald-50 px-3 py-1 text-sm font-medium text-emerald-800">
            <span className="h-2 w-2 rounded-full bg-emerald-500" aria-hidden />
            Conectada
          </span>
        )}
        {apiStatus === "error" && (
          <span className="inline-flex items-center rounded-full bg-red-50 px-3 py-1 text-sm font-medium text-red-700">
            Indisponível — confira se a API está no ar
          </span>
        )}
      </div>

      <section className="mt-10">
        <p className="mb-4 text-sm font-semibold uppercase tracking-wider text-slate-500">Como funciona</p>
        <ol className="grid gap-4 sm:grid-cols-3">
          {funnelSteps.map(({ step, title, desc }) => (
            <li key={step} className="card flex flex-col gap-2 border-slate-200/80">
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-50 text-sm font-bold text-indigo-700">
                {step}
              </span>
              <span className="font-display text-lg font-semibold text-slate-900">{title}</span>
              <span className="text-sm leading-relaxed text-slate-600">{desc}</span>
            </li>
          ))}
        </ol>
      </section>

      <section className="mt-10">
        <p className="mb-4 text-sm font-semibold uppercase tracking-wider text-slate-500">Comece por aqui</p>
        <ul className="grid gap-4 sm:grid-cols-2">
          {quickLinks.map(({ to, title, desc, accent }) => (
            <li key={to}>
              <Link to={to} className="group card flex h-full flex-col transition-shadow hover:shadow-md">
                <div
                  className={`mb-4 h-1 w-12 rounded-full bg-gradient-to-r ${accent} transition-transform group-hover:scale-x-110`}
                  aria-hidden
                />
                <span className="font-display text-lg font-semibold text-slate-900 group-hover:text-indigo-700">{title}</span>
                <span className="mt-1.5 flex-1 text-sm leading-relaxed text-slate-600">{desc}</span>
                <span className="mt-4 inline-flex items-center text-sm font-semibold text-indigo-600">
                  Abrir
                  <span className="ml-1 transition-transform group-hover:translate-x-0.5" aria-hidden>
                    →
                  </span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </section>

      <p className="mt-10 text-center text-xs text-slate-400">
        Publique no Instagram como sempre — em breve, sync automático dos posts para contexto dos agentes.
      </p>
    </div>
  );
}
