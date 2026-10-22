"use client";

import { useEffect } from "react";
import { getModule, OVERLAY_MODULES } from "@/modules/registry";
import { cn } from "@/lib/format";
import { useAppStore } from "@/lib/store";
import type { PantallaData } from "@/lib/types";

export function OverlayDock({ data, badges }: { data: PantallaData; badges?: Record<string, number> }) {
  const openPanels = useAppStore((s) => s.openPanels);
  const setPanel = useAppStore((s) => s.setPanel);
  const togglePanel = useAppStore((s) => s.togglePanel);

  const overlays = data.instancias
    .filter((i) => i.slot === "overlay")
    .sort((a, b) => a.orden - b.orden || a.id - b.id)
    .map((inst) => ({ inst, def: getModule(inst.module_id) }))
    .filter((x): x is { inst: (typeof data.instancias)[number]; def: NonNullable<ReturnType<typeof getModule>> } =>
      Boolean(x.def),
    );

  const lista = overlays.length
    ? overlays
    : OVERLAY_MODULES.map((def) => ({
        def,
        inst: {
          id: -1, screen_id: data.pantalla.id, module_id: def.id, slot: "overlay" as const,
          orden: 0, props: {}, collapsed: false, ts: "",
        },
      }));

  const abierto = lista.find(({ def }) => openPanels[def.id]);
  const Componente = abierto?.def.Component;

  useEffect(() => {
    if (!abierto) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setPanel(abierto.def.id, false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [abierto, setPanel]);

  function alternar(id: string) {
    const abrir = !openPanels[id];
    Object.keys(openPanels).forEach((k) => setPanel(k, k === id ? abrir : false));
    if (!(id in openPanels)) {
      togglePanel(id);
    }
  }

  return (
    <>
      {abierto && Componente ? (
        <div className="fixed inset-y-0 right-0 z-40 flex">
          <div
            className="absolute inset-0 -left-[100vw] bg-black/30 backdrop-blur-[1px] lg:hidden"
            onClick={() => setPanel(abierto.def.id, false)}
          />
          <aside className="relative z-10 flex h-full w-[min(100vw,470px)] flex-col border-l border-line bg-panel shadow-[-20px_0_60px_rgba(0,0,0,0.55)]">
            <header className="flex items-start gap-2 border-b border-line px-3 py-2.5">
              <span className="text-xl">{abierto.def.icono}</span>
              <div className="min-w-0 flex-1">
                <h2 className="font-display text-lg leading-tight text-slate-100">{abierto.def.nombre}</h2>
                <p className="line-clamp-1 text-[10px] text-slate-500">{abierto.def.descripcion}</p>
              </div>
              <button
                type="button"
                onClick={() => setPanel(abierto.def.id, false)}
                className="rounded-lg px-2 py-1 text-slate-400 hover:bg-white/5 hover:text-white"
                aria-label="Cerrar panel"
              >
                ✕
              </button>
            </header>
            <div className={cn("min-h-0 flex-1 p-3", abierto.def.id === "asistente" && "flex flex-col")}>
              <Componente instancia={abierto.inst} pantalla={data.pantalla.slug} />
            </div>
          </aside>
        </div>
      ) : null}

      <div className="fixed bottom-4 right-4 z-30 flex flex-col items-end gap-1.5">
        {lista.map(({ def, inst }) => {
          const activo = Boolean(openPanels[def.id]);
          const badge = badges?.[def.id] ?? 0;
          return (
            <button
              key={def.id}
              type="button"
              onClick={() => alternar(def.id)}
              title={def.descripcion}
              className={cn(
                "group flex h-10 items-center gap-2 rounded-full border px-3 text-xs shadow-panel backdrop-blur transition-all",
                activo
                  ? "border-gold/60 bg-gold/20 text-gold"
                  : "border-line bg-panel/90 text-slate-300 hover:border-gold/40 hover:text-gold",
              )}
            >
              <span className="text-base leading-none">{def.icono}</span>
              <span className="hidden sm:inline">{def.nombre}</span>
              {badge > 0 ? (
                <span className="rounded-full bg-white/10 px-1.5 py-0.5 font-mono text-[9px] text-slate-300">
                  {badge}
                </span>
              ) : null}
              <span className="sr-only">{inst.module_id}</span>
            </button>
          );
        })}
      </div>
    </>
  );
}
