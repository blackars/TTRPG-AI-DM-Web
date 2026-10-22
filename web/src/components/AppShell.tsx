"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { OverlayDock } from "@/components/OverlayDock";
import { api } from "@/lib/api";
import { audioEngine, type Sonido } from "@/lib/audio";
import { cn } from "@/lib/format";
import { useAppStore } from "@/lib/store";
import { useApi } from "@/lib/useApi";
import type { Pantalla, PantallaData } from "@/lib/types";

interface EstadoAudio {
  activa: { id: number; nombre: string; playlist: number[] } | null;
  sonidos: Sonido[];
}

function useLocalAudio() {
  const audioMuted = useAppStore((s) => s.audioMuted);
  const setAudioMuted = useAppStore((s) => s.setAudioMuted);
  const masterVolume = useAppStore((s) => s.masterVolume);
  const setMasterVolume = useAppStore((s) => s.setMasterVolume);
  const audioReady = useAppStore((s) => s.audioReady);
  const setAudioReady = useAppStore((s) => s.setAudioReady);

  useEffect(() => {
    const volumen = Number(window.localStorage.getItem("ttrpg_volumen") ?? "0.75");
    const mute = window.localStorage.getItem("ttrpg_mute") === "1";
    const v = Number.isFinite(volumen) ? Math.max(0, Math.min(1, volumen)) : 0.75;
    setMasterVolume(v);
    setAudioMuted(mute);
    audioEngine.setVolumenMaestro(v);
    audioEngine.setMuted(mute);
  }, [setMasterVolume, setAudioMuted]);

  return { audioMuted, setAudioMuted, masterVolume, setMasterVolume, audioReady, setAudioReady };
}

export function AppShell({
  slug,
  pantalla,
  badges,
  children,
}: {
  slug: string;
  pantalla?: PantallaData;
  badges?: Record<string, number>;
  children: ReactNode;
}) {
  const { data: pantallas } = useApi<Pantalla[]>("/api/screens");
  const apiOnline = useAppStore((s) => s.apiOnline);
  const setApiOnline = useAppStore((s) => s.setApiOnline);
  const toast = useAppStore((s) => s.toast);
  const openPanels = useAppStore((s) => s.openPanels);
  const setPanel = useAppStore((s) => s.setPanel);
  const bump = useAppStore((s) => s.bump);
  const notify = useAppStore((s) => s.notify);
  const { audioMuted, setAudioMuted, audioReady, setAudioReady, masterVolume, setMasterVolume } = useLocalAudio();
  const [pistas, setPistas] = useState<Sonido[]>([]);
  const [escenaAudio, setEscenaAudio] = useState<string | null>(null);
  const latestRef = useRef<number | null>(null);

  const playlistKey = pistas.map((p) => p.id).join(",");

  // Salud de la API
  useEffect(() => {
    let vivo = true;
    async function ping() {
      try {
        await api.get("/health");
        if (vivo) setApiOnline(true);
      } catch {
        if (vivo) setApiOnline(false);
      }
    }
    void ping();
    const timer = window.setInterval(ping, 15000);
    return () => {
      vivo = false;
      window.clearInterval(timer);
    };
  }, [setApiOnline]);

  // Playlist de la escena activa (polling suave e independiente del render)
  useEffect(() => {
    let vivo = true;
    async function cargar() {
      try {
        const estado = await api.get<EstadoAudio>("/api/modules/escenarios/state");
        if (!vivo) return;
        const ids = new Set(estado.activa?.playlist ?? []);
        const seleccion = (estado.sonidos ?? []).filter((s) => ids.has(s.id));
        setPistas(seleccion);
        setEscenaAudio(estado.activa ? `${estado.activa.id}:${estado.activa.nombre}` : null);
      } catch {
        /* la música no bloquea la mesa */
      }
    }
    void cargar();
    const timer = window.setInterval(cargar, 7000);
    return () => {
      vivo = false;
      window.clearInterval(timer);
    };
  }, []);

  useEffect(() => {
    audioEngine.setEscena(pistas);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playlistKey, audioReady]);

  // Bus de eventos: cualquier módulo que cambie despierta al resto
  useEffect(() => {
    let vivo = true;
    async function paso() {
      try {
        if (latestRef.current === null) {
          const inicial = await api.get<{ latest: number }>("/api/events/latest");
          if (vivo) latestRef.current = inicial.latest;
          return;
        }
        const res = await api.get<{ latest: number; events: unknown[] }>(
          `/api/events?since=${latestRef.current}`,
        );
        if (!vivo) return;
        if (res.events.length) {
          latestRef.current = res.latest;
          bump();
        } else {
          latestRef.current = res.latest;
        }
      } catch {
        /* el polling se reintenta solo */
      }
    }
    void paso();
    const timer = window.setInterval(paso, 4000);
    return () => {
      vivo = false;
      window.clearInterval(timer);
    };
  }, [bump]);

  // Atajos de teclado: A asistente, S sonido, E editor
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      if (
        e.metaKey || e.ctrlKey || e.altKey ||
        el?.tagName === "INPUT" || el?.tagName === "TEXTAREA" ||
        el?.tagName === "SELECT" || el?.isContentEditable
      ) {
        return;
      }
      const mapa: Record<string, string> = { a: "asistente", s: "sonido", e: "editor" };
      const id = mapa[e.key.toLowerCase()];
      if (!id) return;
      e.preventDefault();
      const abrir = !openPanels[id];
      ["asistente", "sonido", "editor"].forEach((k) => setPanel(k, k === id ? abrir : false));
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [openPanels, setPanel]);

  async function alternarAudio() {
    if (!audioReady) {
      const listo = await audioEngine.init();
      if (!listo) {
        notify("El navegador bloqueó el audio; prueba a pulsar de nuevo", "error");
        return;
      }
      setAudioReady(true);
      setAudioMuted(false);
      audioEngine.setMuted(false);
      audioEngine.setVolumenMaestro(masterVolume);
      window.localStorage.setItem("ttrpg_mute", "0");
      audioEngine.setEscena(pistas);
      notify(escenaAudio ? `Audio de escena activo · ${escenaAudio.split(":")[1]}` : "Audio activo");
      return;
    }
    const nuevo = !audioMuted;
    setAudioMuted(nuevo);
    audioEngine.setMuted(nuevo);
    window.localStorage.setItem("ttrpg_mute", nuevo ? "1" : "0");
    notify(nuevo ? "Audio silenciado" : "Audio activo");
  }

  const activa = pantallas?.find((p) => p.slug === slug);

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-20 border-b border-line/80 bg-ink/85 backdrop-blur-md">
        <div className="mx-auto flex h-14 w-full max-w-[1500px] items-center gap-2 px-3 lg:px-5">
          <Link href="/pantalla/mesa" className="group flex shrink-0 items-center gap-2">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg border border-gold/40 bg-gold/10 font-display text-lg text-gold shadow-glow">
              T
            </span>
            <span className="hidden leading-tight sm:block">
              <span className="block font-display text-sm text-slate-100 group-hover:text-gold">TTRPG-Assistant</span>
              <span className="block text-[8px] uppercase tracking-[0.22em] text-slate-600">mesa modular</span>
            </span>
          </Link>

          <nav className="flex min-w-0 flex-1 items-center gap-0.5 overflow-x-auto px-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {(pantallas ?? []).map((p) => (
              <Link
                key={p.id}
                href={`/pantalla/${p.slug}`}
                className={cn(
                  "shrink-0 rounded-lg px-2 py-1 text-[11px] transition-colors",
                  p.slug === slug
                    ? "bg-gold/15 text-gold"
                    : "text-slate-400 hover:bg-white/5 hover:text-slate-100",
                )}
              >
                {p.nombre}
              </Link>
            ))}
          </nav>

          <div className="flex shrink-0 items-center gap-1.5">
            <span
              className={cn(
                "hidden items-center gap-1.5 rounded-full border px-2 py-1 text-[9px] uppercase tracking-wider sm:flex",
                apiOnline === false
                  ? "border-red-500/40 bg-red-500/10 text-red-300"
                  : "border-emerald-500/30 bg-emerald-500/10 text-emerald-300",
              )}
              title={apiOnline === false ? "La API del puerto 8100 no responde" : "API local conectada"}
            >
              <span className={cn("h-1.5 w-1.5 rounded-full", apiOnline === false ? "bg-red-400" : "bg-emerald-400 animate-pulseSoft")} />
              API 8100
            </span>
            <button
              type="button"
              onClick={() => void alternarAudio()}
              className={cn(
                "flex h-8 items-center gap-1.5 rounded-lg border px-2 text-[10px] transition-colors",
                !audioReady
                  ? "border-line text-slate-400 hover:border-gold/40 hover:text-gold"
                  : audioMuted
                    ? "border-red-500/40 bg-red-500/10 text-red-300"
                    : "border-teal-500/40 bg-teal-500/10 text-teal-200",
              )}
              title={!audioReady ? "Activar audio de escena" : audioMuted ? "Quitar silencio" : "Silenciar"}
            >
              <span>{!audioReady ? "🔈" : audioMuted ? "🔇" : "🔊"}</span>
              <span className="hidden md:inline">{!audioReady ? "Activar audio" : audioMuted ? "Silenciado" : "Audio"}</span>
            </button>
            <input
              type="range"
              min={0}
              max={1}
              step={0.01}
              value={masterVolume}
              onChange={(e) => {
                const v = Number(e.target.value);
                setMasterVolume(v);
                audioEngine.setVolumenMaestro(v);
                window.localStorage.setItem("ttrpg_volumen", String(v));
              }}
              className="hidden h-1 w-16 accent-[#f5b544] md:block"
              aria-label="Volumen maestro"
              title={`Volumen ${Math.round(masterVolume * 100)}%`}
            />
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-[1500px] px-3 pb-28 pt-4 lg:px-5">
        {activa ? (
          <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
            <div>
              <p className="text-[9px] uppercase tracking-[0.28em] text-slate-600">Pantalla activa</p>
              <h1 className="font-display text-2xl leading-tight text-slate-100">{activa.nombre}</h1>
            </div>
            <div className="flex items-center gap-2 text-[9px] uppercase tracking-wider text-slate-600">
              <span>{pantalla?.instancias.length ?? 0} módulos</span>
              <span className="hidden sm:inline">·</span>
              <span className="hidden sm:inline">A asistente · S sonido · E editor</span>
              <Link
                href="/proyector"
                target="_blank"
                className="rounded border border-line px-1.5 py-0.5 text-slate-400 hover:border-gold/40 hover:text-gold"
              >
                📺 Proyector
              </Link>
            </div>
          </div>
        ) : null}

        {children}
      </main>

      <footer className="border-t border-line/60 px-3 py-3 text-center text-[9px] uppercase tracking-[0.18em] text-slate-700">
        TTRPG-Assistant · FastAPI :8100 · Next.js :3010 · datos en SQLite
      </footer>

      {pantalla ? <OverlayDock data={pantalla} badges={badges} /> : null}

      {toast ? (
        <div className="pointer-events-none fixed left-1/2 top-16 z-[90] -translate-x-1/2">
          <div
            key={toast.id}
            className={cn(
              "animate-pop rounded-xl border px-4 py-2 text-xs shadow-panel backdrop-blur",
              toast.tipo === "error"
                ? "border-red-500/40 bg-red-950/90 text-red-200"
                : "border-gold/40 bg-[#171208]/95 text-gold",
            )}
          >
            {toast.texto}
          </div>
        </div>
      ) : null}
    </div>
  );
}
