import { useEffect, useState } from "react";
import { Navigate, Outlet, useLocation } from "react-router-dom";
import { api, getAuthToken, clearAuthToken } from "../../api/client";

export function RequireSession() {
  const [checking, setChecking] = useState(true);
  const [isValid, setIsValid] = useState(false);
  const location = useLocation();

  useEffect(() => {
    let cancelled = false;

    const token = getAuthToken();
    if (!token) {
      setIsValid(false);
      setChecking(false);
      return;
    }

    api
      .getMe()
      .then(() => {
        if (!cancelled) {
          setIsValid(true);
          setChecking(false);
        }
      })
      .catch(() => {
        clearAuthToken();
        if (!cancelled) {
          setIsValid(false);
          setChecking(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  if (checking) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-slate-100 px-4">
        <div className="h-9 w-9 animate-spin rounded-full border-2 border-indigo-200 border-t-indigo-600" aria-hidden />
        <p className="mt-4 text-sm text-slate-600">Verificando sessão…</p>
      </div>
    );
  }

  return isValid ? <Outlet /> : <Navigate to="/login" state={{ from: location.pathname }} replace />;
}
