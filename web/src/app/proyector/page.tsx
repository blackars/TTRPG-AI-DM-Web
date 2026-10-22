"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { SceneBoard, type Escena } from "@/components/SceneBoard";
import { api } from "@/lib/api";
import { fechaLarga } from "@/lib/format";
import { useReloj } from "@/lib/useApi";

interface EstadoProyector {
  activa: Escena | null;
  grid: { cols: number; rows: number };
}

export default function ProyectorPage() {
  const [estado, setEstado] = useState<EstadoProyector | null>(null);
  const [offline, setOffline] = useState(false);
  const ahora = useReloj();

  useEffect(() => {
    let vivo = true;
    async function cargar() {
      try {
        const res = await api.get<EstadoProyector>("/api/modules/escenarios/state");
        if (!vivo) return;
        setEstado(res);
        setOffline(false);
      } catch {
        if (vivo) setOffline(true);
      }
    }
    void cargar();
    const timer = window.setInterval(cargar, 5000);
    return () => {
      vivo = false;
      window.clearInterval(timer);
    };
  }, []);

  useEffect(() => {
    document.title = estado?.activa ? `📺 ${estado.activa.nombre} · TTRPG-Assistant` : "Proyector · TTRPG-Assistant";
  }, [estado?.activa?.nombre]);

  async function pantallaCompleta() {
    try {
      if (!document.fullscreenElement) await document.documentElement.requestFullscreen();
      else await document.exitFullscreen();
    } catch {
      /* el navegador decide */
    }
  }

  const escena = estado?.activa ?? null;

  return (
    <div className="relative flex min-h-screen flex-col overflow-hidden bg-[#05060a]">
      <div className="pointer-events-none absolute inset-0 vignette" />

      <header className="relative z-10 flex items-center justify-between gap-3 px-4 py-3">
        <div className="flex items-center gap-3">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg border border-gold/40 bg-gold/10 font-display text-gold">
            T
          </span>
          <div>
            <p className="text-[8px] uppercase tracking-[0.3em] text-gold/70">TTRPG-Assistant · proyector</p>
            <h1 className="font-display text-lg leading-tight text-white">
              {escena?.nombre ?? "Sin escena activa"}
            </h1>
          </div>
          {offline ? (
            <span className="rounded-full border border-red-500/40 bg-red-500/10 px-2 py-0.5 text-[9px] uppercase tracking-wider text-red-300">
              reconectando
            </span>
          ) : null}
        </div>

        <div className="flex items-center gap-3">
          <div className="hidden text-right sm:block">
            <p className="font-mono text-lg leading-tight text-white">
              {ahora ? ahora.toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" }) : "--:--"}
            </p>
            <p className="text-[9px] text-white/40">{ahora ? fechaLarga(ahora) : ""}</p>
          </div>
          <button
            type="button"
            onClick={() => void pantallaCompleta()}
            className="rounded-lg border border-white/15 bg-black/40 px-2.5 py-1.5 text-xs text-white/70 backdrop-blur hover:border-gold/50 hover:text-gold"
            title="Pantalla completa"
          >
            ⛶
          </button>
          <Link
            href="/pantalla/mesa"
            className="rounded-lg border border-white/15 bg-black/40 px-2.5 py-1.5 text-xs text-white/70 backdrop-blur hover:border-gold/50 hover:text-gold"
          >
            ← Mesa
          </Link>
        </div>
      </header>

      <main className="relative z-10 flex flex-1 items-center justify-center px-3 pb-4">
        {escena && estado ? (
          <div
            className="w-full"
            style={{ maxWidth: "min(100%, calc((100vh - 110px) * 1.3333))" }}
          >
            <SceneBoard
              escena={escena}
              grid={estado.grid}
              readonly
              className="rounded-2xl border-white/10 shadow-[0_30px_120px_rgba(0,0,0,0.8)]"
            />
            <div className="mt-2 flex items-center justify-between px-1 text-[9px] uppercase tracking-[0.2em] text-white/35">
              <span>{escena.descripcion || "Escena activa"}</span>
              <span>{escena.tokens.length} tokens</span>
            </div>
          </div>
        ) : (
          <div className="rounded-2xl border border-white/10 bg-white/[0.03] px-8 py-12 text-center">
            <p className="text-4xl">📺</p>
            <p className="mt-3 font-display text-2xl text-white/80">No hay escena activa</p>
            <p className="mt-1 max-w-sm text-xs leading-relaxed text-white/40">
              Activa una escena desde la mesa y aparecerá aquí automáticamente en menos de 5 segundos.
            </p>
          </div>
        )}
      </main>

      <footer className="relative z-10 px-4 py-2 text-center text-[8px] uppercase tracking-[0.25em] text-white/20">
        Vista de jugadores · sin paneles del DM · actualización automática
      </footer>
    </div>
  );
}
