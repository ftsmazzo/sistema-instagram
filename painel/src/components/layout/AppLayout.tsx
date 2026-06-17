import { useEffect, useState } from "react";
import { Link, Outlet, useLocation, useNavigate } from "react-router-dom";
import { BRAND } from "../../config/brand";
import { getPageTitle, isNavItemActive, itemsByGroup, navGroups } from "../../config/navigation";
import { clearAuthToken, getAuthToken } from "../../api/client";

function NavIcon({ name }: { name: string }) {
  const cls = "h-[18px] w-[18px] shrink-0 opacity-80";
  switch (name) {
    case "Início":
      return (
        <svg className={cls} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
        </svg>
      );
    case "Operação":
      return (
        <svg className={cls} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
        </svg>
      );
    case "Instagram":
      return (
        <svg className={cls} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
        </svg>
      );
    case "WhatsApp":
      return (
        <svg className={cls} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
        </svg>
      );
    case "Criar post":
      return (
        <svg className={cls} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
        </svg>
      );
    case "Agenda":
      return (
        <svg className={cls} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
        </svg>
      );
    case "Empresa":
      return (
        <svg className={cls} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
        </svg>
      );
    case "Conta":
      return (
        <svg className={cls} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
        </svg>
      );
    default:
      return <span className="h-1.5 w-1.5 rounded-full bg-current" />;
  }
}

function SidebarNav({ onNavigate }: { onNavigate?: () => void }) {
  const loc = useLocation();
  return (
    <nav className="flex flex-1 flex-col gap-6 overflow-y-auto px-3 py-4">
      {navGroups.map((group) => {
        const items = itemsByGroup(group.id);
        if (items.length === 0) return null;
        return (
          <div key={group.id}>
            <p className="mb-2 px-3 text-[10px] font-bold uppercase tracking-wider text-slate-400">{group.label}</p>
            <ul className="space-y-0.5">
              {items.map((item) => {
                const active = isNavItemActive(loc.pathname, item);
                return (
                  <li key={item.path}>
                    <Link
                      to={item.path}
                      onClick={onNavigate}
                      className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-all ${
                        active ? "nav-item-active" : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
                      }`}
                    >
                      <NavIcon name={item.label} />
                      {item.label}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        );
      })}
    </nav>
  );
}

export function AppLayout() {
  const loc = useLocation();
  const navigate = useNavigate();
  const [mobileOpen, setMobileOpen] = useState(false);
  const pageTitle = getPageTitle(loc.pathname);

  useEffect(() => {
    setMobileOpen(false);
  }, [loc.pathname]);

  const logout = () => {
    clearAuthToken();
    navigate("/login", { replace: true });
  };

  return (
    <div className="flex min-h-screen bg-surface">
      {/* Desktop sidebar */}
      <aside className="hidden lg:flex w-[240px] shrink-0 flex-col border-r border-slate-200/80 bg-white">
        <div className="border-b border-slate-100 px-5 py-5">
          <Link to="/" className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-brand-600 to-emerald-600 text-sm font-bold text-white shadow-md shadow-brand-600/30">
              {BRAND.name.charAt(0)}
            </div>
            <div>
              <span className="font-display text-base font-bold text-slate-900">{BRAND.name}</span>
              <p className="text-[10px] font-medium text-slate-400">{BRAND.parent}</p>
            </div>
          </Link>
        </div>
        <SidebarNav />
        <div className="border-t border-slate-100 p-4">
          <button type="button" onClick={logout} className="btn-ghost w-full justify-start text-slate-500">
            Sair da conta
          </button>
        </div>
      </aside>

      {/* Mobile drawer */}
      {mobileOpen ? (
        <button
          type="button"
          className="fixed inset-0 z-40 bg-slate-900/40 backdrop-blur-sm lg:hidden"
          aria-label="Fechar menu"
          onClick={() => setMobileOpen(false)}
        />
      ) : null}
      <aside
        className={`fixed inset-y-0 left-0 z-50 flex w-[min(280px,85vw)] flex-col border-r border-slate-200 bg-white shadow-xl transition-transform duration-300 lg:hidden ${
          mobileOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
          <Link to="/" className="font-display font-bold text-slate-900" onClick={() => setMobileOpen(false)}>
            {BRAND.name}
          </Link>
          <button type="button" className="btn-ghost p-2" onClick={() => setMobileOpen(false)} aria-label="Fechar">
            ✕
          </button>
        </div>
        <SidebarNav onNavigate={() => setMobileOpen(false)} />
        <div className="border-t border-slate-100 p-4">
          <button type="button" onClick={logout} className="btn-secondary w-full">
            Sair
          </button>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex h-14 shrink-0 items-center gap-4 border-b border-slate-200/80 bg-white/90 px-4 backdrop-blur-md sm:px-6 lg:px-8">
          <button
            type="button"
            className="btn-ghost p-2 lg:hidden"
            aria-label="Abrir menu"
            onClick={() => setMobileOpen(true)}
          >
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </button>
          <div className="min-w-0 flex-1">
            <p className="truncate font-display text-sm font-semibold text-slate-900 sm:text-base">{pageTitle}</p>
          </div>
          <Link
            to="/conta"
            className="flex h-9 w-9 items-center justify-center rounded-full bg-brand-50 text-brand-700 ring-2 ring-brand-100 transition hover:bg-brand-100"
            title="Conta"
          >
            <span className="text-xs font-bold">{getAuthToken() ? "EU" : "?"}</span>
          </Link>
        </header>

        <main className="min-h-0 flex-1 overflow-x-auto">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
