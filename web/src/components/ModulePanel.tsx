"use client";

import { useEffect, useState } from "react";
import { Badge, Spinner } from "@/components/ui";
import { api, errorTexto } from "@/lib/api";
import { cn } from "@/lib/format";
import { useAppStore } from "@/lib/store";
import { getModule } from "@/modules/registry";
import type { Instancia } from "@/lib/types";

export function ModulePanel({
  instancia,
  pantalla,
  badge,
}: {
  instancia: Instancia;
  pantalla: string;
  badge?: number;
}) {
  const def = getModule(instancia.module_id);
  const [collapsed, setCollapsed] = useState(instancia.collapsed);
  const [guardando, setGuardando] = useState(false);
  const bump = useAppStore((s) => s.bump);
  const notify = useAppStore((s) => s.notify);
  const setPanel = useAppStore((s) => s.setPanel);

  useEffect(() => {
    setCollapsed(instancia.collapsed);
  }, [instancia.collapsed]);

  if (!def) {
    return (
      <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-xs text-red-200">
        Módulo desconocido en el layout: <code>{instancia.module_id}</code>
      </div>
    );
  }

  const Component = def.Component;

  async function alternar() {
    const nuevo = !collapsed;
    setCollapsed(nuevo);
    setGuardando(true);
    try {
      await api.patch(
        `/api/screens/${instancia.screen_id}/instances/${instancia.id}`,
        { collapsed: nuevo },
      );
      bump();
    } catch (e) {
      setCollapsed(!nuevo);
      notify(errorTexto(e), "error");
    } finally {
      setGuardando(false);
    }
  }

  return (
    <section
      className={cn(
        "rounded-2xl border border-line bg-panel/90 shadow-panel transition-colors",
        instancia.slot === "principal" && "border-line/90",
      )}
      data-module={def.id}
    >
      <header className="flex items-center gap-2 border-b border-line/70 px-3 py-2">
        <span className="text-base leading-none" title={def.descripcion}>{def.icono}</span>
        <h2 className="min-w-0 flex-1 truncate text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-300">
          {def.nombre}
        </h2>
        {typeof badge === "number" && badge > 0 ? (
          <Badge color={def.id === "asistente" ? "violet" : "slate"}>{badge}</Badge>
        ) : null}
        <button
          type="button"
          onClick={() => setPanel("editor", true)}
          className="rounded px-1 text-[10px] text-slate-600 hover:text-gold"
          title="Editar esta pantalla"
        >
          ✎
        </button>
        <button
          type="button"
          onClick={() => void alternar()}
          className="flex h-5 w-5 items-center justify-center rounded text-[10px] text-slate-500 hover:bg-white/5 hover:text-slate-200"
          title={collapsed ? "Expandir módulo" : "Colapsar módulo"}
          aria-expanded={!collapsed}
        >
          {guardando ? <Spinner className="h-2.5 w-2.5" /> : collapsed ? "▸" : "▾"}
        </button>
      </header>
      {!collapsed ? (
        <div className="p-3">
          <Component instancia={instancia} pantalla={pantalla} />
        </div>
      ) : (
        <div className="px-3 py-1.5 text-[10px] italic text-slate-600">{def.descripcion}</div>
      )}
    </section>
  );
}
