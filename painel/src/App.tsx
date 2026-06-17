import { Routes, Route, Link } from "react-router-dom";
import { AppLayout } from "./components/layout/AppLayout";
import { RequireSession } from "./components/auth/RequireSession";
import { HomePage } from "./pages/HomePage";
import { AdminPage } from "./pages/AdminPage";
import { PerfilPage } from "./pages/PerfilPage";
import { WhatsAppPage } from "./pages/WhatsAppPage";
import { Postador } from "./pages/Postador";
import { CronogramaPage } from "./pages/CronogramaPage";
import { AgentesInstagramPage } from "./pages/AgentesInstagramPage";
import { PostagensPage } from "./pages/PostagensPage";
import { OperacaoPage } from "./pages/OperacaoPage";
import { LoginPage } from "./pages/LoginPage";

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      {/* Sessão antes do layout: evita sidebar/início sem autenticação (modo workspace). */}
      <Route element={<RequireSession />}>
        <Route element={<AppLayout />}>
          <Route path="/" element={<HomePage />} />
          <Route path="/admin" element={<AdminPage />} />
          <Route path="/postador" element={<Postador />} />
          <Route path="/cronograma" element={<CronogramaPage />} />
          <Route path="/postagens" element={<PostagensPage />} />
          <Route path="/agentes" element={<AgentesInstagramPage />} />
          <Route path="/perfil" element={<PerfilPage />} />
          <Route path="/whatsapp" element={<WhatsAppPage />} />
          <Route path="/operacao" element={<OperacaoPage />} />
          <Route path="*" element={
            <div className="mx-auto max-w-lg px-6 py-16 text-center">
              <h1 className="text-2xl font-bold text-slate-900">Página não encontrada</h1>
              <p className="mt-2 text-sm text-slate-600">
                Esta rota não existe no painel. Use o menu lateral ou volte ao{" "}
                <Link to="/" className="text-indigo-600 font-semibold hover:underline">início</Link>.
              </p>
              <p className="mt-4 text-xs text-slate-500">
                Operação fica em <strong>/operacao</strong> no app do <strong>painel</strong>, não na URL da API.
              </p>
            </div>
          } />
        </Route>
      </Route>
    </Routes>
  );
}
