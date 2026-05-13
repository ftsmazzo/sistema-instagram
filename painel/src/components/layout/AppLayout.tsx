import { useEffect, useState } from "react";
import { Link, Outlet, useLocation, useNavigate } from "react-router-dom";
import { navGroups, itemsByGroup } from "../../config/navigation";
import { clearAuthToken, getAuthToken } from "../../api/client";

export function AppLayout() {
  const loc = useLocation();
  const navigate = useNavigate();
  const [hasToken, setHasToken] = useState(() => Boolean(getAuthToken()));
  useEffect(() => {
    const sync = () => setHasToken(Boolean(getAuthToken()));
    window.addEventListener("mv-auth-changed", sync);
    return () => window.removeEventListener("mv-auth-changed", sync);
  }, []);

  const isActive = (path: string) => {
    if (path === "/") return loc.pathname === "/";
    return loc.pathname === path || loc.pathname.startsWith(`${path}/`);
  };

  return (
    <div className="min-h-screen flex bg-slate-50 font-sans text-slate-900">
      <aside className="flex w-64 shrink-0 flex-col border-r border-slate-200 bg-white text-slate-700 shadow-sm z-10 relative">
        <div className="border-b border-slate-100 px-6 py-6">
          <Link to="/" className="flex items-center gap-2">
            <div className="h-8 w-8 rounded-lg bg-indigo-600 flex items-center justify-center text-white font-bold shadow-md shadow-indigo-600/20">F</div>
            <span className="font-display text-lg font-bold tracking-tight text-slate-900">Fabria IA</span>
          </Link>
          <p className="mt-1.5 text-[10px] font-semibold uppercase tracking-widest text-slate-400 pl-10">Agente Instagram</p>
          <div className="mt-6">
            {hasToken ? (
              <button
                type="button"
                onClick={() => {
                  clearAuthToken();
                  navigate("/login", { replace: true });
                }}
                className="w-full rounded-md px-3 py-2 text-left text-sm font-medium text-slate-500 transition-colors hover:bg-slate-50 hover:text-slate-900 flex items-center justify-between"
              >
                Sair da conta
                <svg className="w-4 h-4 opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"></path></svg>
              </button>
            ) : (
              <Link
                to="/login"
                className="w-full rounded-md bg-indigo-50 px-3 py-2 text-left text-sm font-medium text-indigo-700 transition-colors hover:bg-indigo-100 block text-center"
              >
                Fazer login
              </Link>
            )}
          </div>
        </div>
        <nav className="flex flex-1 flex-col gap-8 overflow-y-auto px-4 py-6">
          {navGroups.map((group) => {
            const items = itemsByGroup(group.id);
            if (items.length === 0) return null;
            return (
              <div key={group.id}>
                <p className="mb-3 px-3 text-[11px] font-bold uppercase tracking-wider text-slate-400">{group.label}</p>
                <ul className="space-y-1">
                  {items.map(({ path, label }) => {
                    const active = isActive(path);
                    return (
                      <li key={path}>
                        <Link
                          to={path}
                          className={`flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-all duration-200 ${
                            active
                              ? "bg-indigo-50 text-indigo-700"
                              : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
                          }`}
                        >
                          <div className={`w-1.5 h-1.5 rounded-full ${active ? 'bg-indigo-600' : 'bg-transparent'}`}></div>
                          {label}
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              </div>
            );
          })}
        </nav>
        <div className="border-t border-slate-100 bg-slate-50/50 p-4">
           <div className="rounded-lg bg-white border border-slate-200 p-3 shadow-sm">
             <p className="text-xs font-semibold text-slate-800">Pronto para uso comercial.</p>
             <p className="text-[11px] text-slate-500 mt-1 leading-tight">O sistema agora roda no backend de forma autônoma.</p>
           </div>
        </div>
      </aside>
      <main className="min-h-0 min-w-0 flex-1 overflow-x-auto">
        <Outlet />
      </main>
    </div>
  );
}
