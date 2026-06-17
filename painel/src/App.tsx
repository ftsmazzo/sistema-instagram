import { Routes, Route } from "react-router-dom";
import { AppLayout } from "./components/layout/AppLayout";
import { RequireSession } from "./components/auth/RequireSession";
import { HomePage } from "./pages/HomePage";
import { AdminPage } from "./pages/AdminPage";
import { PerfilPage } from "./pages/PerfilPage";
import { WhatsAppPage } from "./pages/WhatsAppPage";
import { Postador } from "./pages/Postador";
import { CronogramaPage } from "./pages/CronogramaPage";
import { PostagensPage } from "./pages/PostagensPage";
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
          <Route path="/perfil" element={<PerfilPage />} />
          <Route path="/whatsapp" element={<WhatsAppPage />} />
        </Route>
      </Route>
    </Routes>
  );
}
