"use client";

import { useEffect, useRef, useState } from "react";
import { api, errorTexto } from "@/lib/api";
import { horaCorta } from "@/lib/format";
import { useAppStore } from "@/lib/store";
import { useApi } from "@/lib/useApi";
import { Button, ErrorBox, Textarea } from "@/components/ui";
import type { ModuleProps } from "./types";

interface NotasEstado {
  texto: string;
  ts: string | null;
}

export function NotasModule(_props: ModuleProps) {
  const { data, error, refrescar } = useApi<NotasEstado>("/api/modules/notas/state");
  const [texto, setTexto] = useState("");
  const [dirty, setDirty] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [errorLocal, setErrorLocal] = useState<string | null>(null);
  const dirtyRef = useRef(false);
  const notify = useAppStore((s) => s.notify);
  const bump = useAppStore((s) => s.bump);

  useEffect(() => {
    if (data && !dirtyRef.current) {
      setTexto(data.texto);
    }
  }, [data]);

  useEffect(() => {
    dirtyRef.current = dirty;
  }, [dirty]);

  async function guardar() {
    setGuardando(true);
    setErrorLocal(null);
    try {
      await api.post("/api/modules/notas/action", { action: "guardar", texto });
      setDirty(false);
      dirtyRef.current = false;
      await refrescar(true);
      bump();
      notify("Notas guardadas. La IA ya las ve.");
    } catch (e) {
      setErrorLocal(errorTexto(e));
    } finally {
      setGuardando(false);
    }
  }

  return (
    <div className="space-y-2">
      {error ? <ErrorBox>{error}</ErrorBox> : null}
      {errorLocal ? <ErrorBox>{errorLocal}</ErrorBox> : null}
      <Textarea
        value={texto}
        onChange={(e) => {
          setTexto(e.target.value);
          setDirty(true);
        }}
        onBlur={() => {
          if (dirty && !guardando) void guardar();
        }}
        placeholder="Secretos, pistas, decisiones pendientes…"
        className="min-h-[120px] font-mono text-[12px]"
      />
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-[10px] text-slate-500">
          {dirty ? "Cambios sin guardar" : data?.ts ? `Guardado ${horaCorta(data.ts)}` : "Sin guardar"}
          {" · "}
          {texto.trim() ? `${texto.trim().split(/\s+/).length} palabras` : "vacío"}
        </p>
        <Button size="sm" variant="secondary" loading={guardando} onClick={() => void guardar()}>
          Guardar notas
        </Button>
      </div>
    </div>
  );
}
