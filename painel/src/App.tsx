import { Navigate, Route, Routes, Link } from "react-router-dom";
import { AppLayout } from "./components/layout/AppLayout";
import { RequireSession } from "./components/auth/RequireSession";
import { HomePage } from "./pages/HomePage";
import { AdminPage } from "./pages/AdminPage";
import { PerfilPage } from "./pages/PerfilPage";
import { WhatsAppPage } from "./pages/WhatsAppPage";
import { Postador } from "./pages/Postador";
import { CronogramaPage } from "./pages/CronogramaPage";
import { InstagramPage } from "./pages/InstagramPage";
import { OperacaoPage } from "./pages/OperacaoPage";
import { LoginPage } from "./pages/LoginPage";

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route element={<RequireSession />}>
        <Route element={<AppLayout />}>
          <Route path="/" element={<HomePage />} />
          <Route path="/operacao" element={<OperacaoPage />} />
          <Route path="/instagram" element={<InstagramPage />} />
          <Route path="/whatsapp" element={<WhatsAppPage />} />
          <Route path="/postador" element={<Postador />} />
          <Route path="/agenda" element={<CronogramaPage />} />
          <Route path="/empresa" element={<AdminPage />} />
          <Route path="/conta" element={<PerfilPage />} />
          {/* Redirects legados */}
          <Route path="/admin" element={<Navigate to="/empresa" replace />} />
          <Route path="/perfil" element={<Navigate to="/conta" replace />} />
          <Route path="/cronograma" element={<Navigate to="/agenda" replace />} />
          <Route path="/postagens" element={<Navigate to="/instagram" replace />} />
          <Route path="/agentes" element={<Navigate to="/instagram?tab=agente" replace />} />
          <Route
            path="*"
            element={
              <div className="mx-auto max-w-lg px-6 py-16 text-center page-enter">
                <h1 className="font-display text-2xl font-bold text-slate-900">Página não encontrada</h1>
                <p className="mt-2 text-sm text-slate-600">
                  Use o menu lateral ou volte ao{" "}
                  <Link to="/" className="font-semibold text-brand-600 hover:underline">
                    início
                  </Link>
                  .
                </p>
              </div>
            }
          />
        </Route>
      </Route>
    </Routes>
  );
}
