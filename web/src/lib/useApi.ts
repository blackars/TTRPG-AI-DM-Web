"use client";

import { useCallback, useEffect, useState } from "react";
import { api, errorTexto } from "./api";
import { useAppStore } from "./store";

export function useApi<T>(path: string | null, enabled = true) {
  const tick = useAppStore((s) => s.tick);
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const refrescar = useCallback(
    async (silencioso = false) => {
      if (!path || !enabled) return;
      if (!silencioso) setLoading(true);
      try {
        const respuesta = await api.get<T>(path);
        setData(respuesta);
        setError(null);
      } catch (e) {
        setError(errorTexto(e));
      } finally {
        if (!silencioso) setLoading(false);
      }
    },
    [path, enabled],
  );

  useEffect(() => {
    void refrescar();
  }, [refrescar, tick]);

  return { data, setData, error, loading, refrescar };
}

export function useReloj() {
  const [ahora, setAhora] = useState<Date | null>(null);
  useEffect(() => {
    setAhora(new Date());
    const timer = setInterval(() => setAhora(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);
  return ahora;
}
