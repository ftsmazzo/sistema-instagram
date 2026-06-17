import { useEffect, useState } from "react";
import { api, clearAuthToken, getAuthToken, type Config } from "../api/client";

export function useWorkspaceConfig() {
  const [config, setConfig] = useState<Config | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [useWorkspace, setUseWorkspace] = useState(false);
  const [needLogin, setNeedLogin] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const status = await api.getAuthStatus();
        if (cancelled) return;
        if (status.authMode === "workspace" && status.hasUsers) {
          const token = getAuthToken();
          if (!token) {
            setNeedLogin(true);
            setUseWorkspace(true);
            setConfig(null);
            return;
          }
          try {
            const data = await api.getMeWorkspace();
            if (cancelled) return;
            setConfig(data);
            setUseWorkspace(true);
            setNeedLogin(false);
          } catch {
            clearAuthToken();
            setNeedLogin(true);
            setConfig(null);
            setUseWorkspace(true);
          }
        } else {
          const data = await api.getConfig();
          if (cancelled) return;
          setConfig(data);
          setUseWorkspace(false);
          setNeedLogin(false);
        }
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Erro ao carregar");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return { config, setConfig, loading, error, setError, useWorkspace, needLogin };
}
