"use client";

import { useEffect, useRef, useState } from "react";
import { ProjectorStage } from "@/components/ProjectorStage";
import { PRESENTACION_VACIA, type Escena, type PresentacionEscena } from "@/components/SceneBoard";
import { api } from "@/lib/api";
import { cn } from "@/lib/format";
import {
  escucharProyector, leerPantallaCm, leerProyectorLocal, type EstadoProyector,
} from "@/lib/proyector";

interface EstadoApi {
  activa: Escena | null;
  escenas: Escena[];
  grid: { cols: number; rows: number };
}

function desdeApi(res: EstadoApi, previo?: EstadoProyector | null): EstadoProyector {
  const escena = res.activa;
  if (!escena) {
    return {
      escena: null,
      grid: res.grid,
      presentacion: previo?.presentacion ?? PRESENTACION_VACIA,
      pantalla_cm: leerPantallaCm(),
      ts: Date.now(),
    };
  }
  if (previo?.escena && previo.escena.id === escena.id) {
    return {
      ...previo,
      escena: { ...escena, presentacion: previo.presentacion },
      grid: res.grid,
      pantalla_cm: previo.pantalla_cm || leerPantallaCm(),
      ts: Date.now(),
    };
  }
  return {
    escena,
    grid: res.grid,
    presentacion: escena.presentacion ?? PRESENTACION_VACIA,
    pantalla_cm: leerPantallaCm(),
    ts: Date.now(),
  };
}

export default function ProyectorPage() {
  const [estado, setEstado] = useState<EstadoProyector | null>(null);
  const [offline, setOffline] = useState(false);
  const [completa, setCompleta] = useState(false);
  const [controles, setControles] = useState(true);
  const ocultarRef = useRef<number | null>(null);

  useEffect(() => {
    const local = leerProyectorLocal();
    if (local) setEstado(local);

    let vivo = true;
    async function cargar() {
      try {
        const res = await api.get<EstadoApi>("/api/modules/escenarios/state");
        if (!vivo) return;
        setEstado((previo) => (previo ? desdeApi(res, previo) : desdeApi(res)));
        setOffline(false);
      } catch {
        if (vivo) setOffline(true);
      }
    }
    void cargar();
    const timer = window.setInterval(cargar, 3000);
    return () => {
      vivo = false;
      window.clearInterval(timer);
    };
  }, []);

  useEffect(() => {
    const dejarDeEscuchar = escucharProyector((nuevo) => setEstado(nuevo));
    return dejarDeEscuchar;
  }, []);

  useEffect(() => {
    const alCambiar = () => setCompleta(Boolean(document.fullscreenElement));
    document.addEventListener("fullscreenchange", alCambiar);
    return () => document.removeEventListener("fullscreenchange", alCambiar);
  }, []);

  useEffect(() => {
    const titulo = estado?.escena?.nombre
      ? `📺 ${estado.escena.nombre} · TTRPG-Assistant`
      : "Proyector · TTRPG-Assistant";
    document.title = titulo;
  }, [estado?.escena?.nombre]);

  function mostrarControles() {
    setControles(true);
    if (ocultarRef.current !== null) window.clearTimeout(ocultarRef.current);
    ocultarRef.current = window.setTimeout(() => setControles(false), 2600);
  }

  useEffect(() => {
    mostrarControles();
    return () => {
      if (ocultarRef.current !== null) window.clearTimeout(ocultarRef.current);
    };
  }, []);

  async function pantallaCompleta() {
    try {
      if (!document.fullscreenElement) await document.documentElement.requestFullscreen();
      else await document.exitFullscreen();
    } catch {
      /* el navegador decide */
    }
  }

  const escena = estado?.escena ?? null;
  const presentacion: PresentacionEscena = estado?.presentacion ?? PRESENTACION_VACIA;

  return (
    <div
      className="relative h-[100dvh] w-screen overflow-hidden bg-black"
      onMouseMove={mostrarControles}
      onTouchStart={mostrarControles}
    >
      {escena ? (
        <ProjectorStage
          escena={escena}
          presentacion={presentacion}
          grid={estado?.grid ?? { cols: 12, rows: 9 }}
          pantallaCm={estado?.pantalla_cm ?? 0}
          className="h-full w-full"
        />
      ) : (
        <div className="flex h-full flex-col items-center justify-center gap-3 text-center">
          <p className="text-5xl opacity-40">📺</p>
          <p className="font-display text-2xl text-white/75">Sin escena activa</p>
          <p className="max-w-sm text-xs leading-relaxed text-white/35">
            Elige una escena en la sala de proyección y aparecerá aquí al instante.
          </p>
        </div>
      )}

      <div
        className={cn(
          "pointer-events-none absolute inset-x-0 top-0 z-30 flex items-start justify-between gap-3 bg-gradient-to-b from-black/75 to-transparent px-4 py-3 transition-opacity duration-300",
          controles ? "opacity-100" : "opacity-0",
        )}
      >
        <div className="min-w-0">
          <p className="text-[8px] uppercase tracking-[0.3em] text-emerald-300/70">TTRPG-Assistant · proyector</p>
          <h1 className="truncate font-display text-lg leading-tight text-white/90">
            {escena?.nombre ?? "Sin escena activa"}
          </h1>
          {offline ? (
            <span className="mt-1 inline-flex rounded-full border border-amber-400/40 bg-amber-400/10 px-2 py-0.5 text-[9px] uppercase tracking-wider text-amber-300">
              reconectando
            </span>
          ) : null}
        </div>
        <div className={cn("flex shrink-0 gap-1.5", controles ? "pointer-events-auto" : "pointer-events-none")}>
          <button
            type="button"
            onClick={() => void pantallaCompleta()}
            className="rounded-lg border border-white/15 bg-black/50 px-2.5 py-1.5 text-xs text-white/75 backdrop-blur hover:border-emerald-300/60 hover:text-emerald-200"
            title={completa ? "Salir de pantalla completa" : "Pantalla completa"}
          >
            {completa ? "⤡" : "⛶"}
          </button>
          <button
            type="button"
            onClick={() => window.close()}
            className="rounded-lg border border-white/15 bg-black/50 px-2.5 py-1.5 text-xs text-white/60 backdrop-blur hover:border-red-400/60 hover:text-red-300"
            title="Cerrar proyector"
          >
            ✕
          </button>
        </div>
      </div>

      {escena ? (
        <div
          className={cn(
            "pointer-events-none absolute inset-x-0 bottom-0 z-20 flex items-center justify-between px-4 py-2 text-[9px] uppercase tracking-[0.2em] text-white/35 transition-opacity duration-300",
            controles ? "opacity-100" : "opacity-0",
          )}
        >
          <span>{presentacion.grid_visible ? `rejilla ${presentacion.grid_cm.toFixed(1)} cm` : "rejilla oculta"}</span>
          <span>{escena.tokens.length} tokens · mueve el ratón para los controles</span>
        </div>
      ) : null}
    </div>
  );
}
