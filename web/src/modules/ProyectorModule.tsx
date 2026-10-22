"use client";

import Link from "next/link";
import { useState } from "react";
import { SceneBoard } from "@/components/SceneBoard";
import { Badge, Button, Empty, ErrorBox } from "@/components/ui";
import { api, errorTexto } from "@/lib/api";
import { useAppStore } from "@/lib/store";
import { useApi } from "@/lib/useApi";
import type { EscenariosData } from "./EscenarioModule";
import type { ModuleProps } from "./types";

/**
 * Proyector: vista limpia de la escena activa para un segundo monitor.
 * El tablero real vive en `/proyector`; este módulo es el control de sala.
 */
export function ProyectorModule(_props: ModuleProps) {
  const { data, setData, error } = useApi<EscenariosData>("/api/modules/escenarios/state");
  const [abriendo, setAbriendo] = useState(false);
  const [errorLocal, setErrorLocal] = useState<string | null>(null);
  const bump = useAppStore((s) => s.bump);
  const notify = useAppStore((s) => s.notify);

  async function activar(id: number, nombre: string) {
    setAbriendo(true);
    setErrorLocal(null);
    try {
      const res = await api.post<EscenariosData>("/api/modules/escenarios/action", {
        action: "activar",
        id,
      });
      setData(res);
      bump();
      notify(`Proyector en vivo: ${nombre}`);
    } catch (e) {
      setErrorLocal(errorTexto(e));
    } finally {
      setAbriendo(false);
    }
  }

  function abrirVentana() {
    window.open("/proyector", "ttrpg-proyector", "popup=yes,width=1280,height=800");
    notify("Proyector abierto en una ventana aparte");
  }

  async function pantallaCompleta() {
    try {
      if (!document.fullscreenElement) await document.documentElement.requestFullscreen();
      else await document.exitFullscreen();
    } catch {
      notify("El navegador no permite pantalla completa aquí", "error");
    }
  }

  if (error) return <ErrorBox>{error}</ErrorBox>;
  if (!data) return <div className="h-64 animate-pulse rounded-xl bg-white/5" />;

  const activa = data.activa;
  if (!activa) {
    return (
      <Empty
        icon="📺"
        title="Sin escena que proyectar"
        action={
          <Link href="/pantalla/escenas">
            <Button size="sm" variant="primary">Elegir escena</Button>
          </Link>
        }
      >
        Activa una escena y el proyector la mostrará a pantalla completa en el segundo monitor.
      </Empty>
    );
  }

  return (
    <div className="space-y-3">
      {errorLocal ? <ErrorBox>{errorLocal}</ErrorBox> : null}

      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-[9px] uppercase tracking-[0.25em] text-slate-500">Señal de salida</p>
          <div className="flex items-center gap-2">
            <h3 className="font-display text-xl text-slate-100">{activa.nombre}</h3>
            <Badge color="gold">EN VIVO</Badge>
          </div>
        </div>
        <div className="flex flex-wrap gap-1.5">
          <Button size="sm" variant="secondary" onClick={abrirVentana}>🪟 Abrir ventana</Button>
          <Button size="sm" variant="primary" onClick={() => void pantallaCompleta()}>⛶ Pantalla completa</Button>
        </div>
      </div>

      <div className="overflow-hidden rounded-xl border border-line">
        <SceneBoard escena={activa} grid={data.grid} readonly className="rounded-none border-0" />
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 text-[10px] text-slate-500">
        <p>
          La ventana del proyector se actualiza sola cada 5 s y no muestra paneles del DM.
        </p>
        <span className="font-mono">{activa.tokens.length} tokens · {activa.playlist.length} pistas</span>
      </div>

      <div className="rounded-xl border border-line bg-white/[0.02] p-3">
        <p className="mb-2 text-[9px] uppercase tracking-[0.25em] text-slate-500">
          Cambiar la escena en directo
        </p>
        <div className="flex flex-wrap gap-1.5">
          {data.escenas.map((escena) => (
            <Button
              key={escena.id}
              size="xs"
              variant={escena.activo ? "primary" : "secondary"}
              loading={abriendo}
              onClick={() => {
                if (escena.activo) return;
                void activar(escena.id, escena.nombre);
              }}
            >
              {escena.activo ? "● " : ""}{escena.nombre}
            </Button>
          ))}
        </div>
      </div>
    </div>
  );
}
