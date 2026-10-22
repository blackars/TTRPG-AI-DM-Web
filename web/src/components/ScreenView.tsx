"use client";

import { ModulePanel } from "@/components/ModulePanel";
import { cn } from "@/lib/format";
import type { Instancia, PantallaData, Slot } from "@/lib/types";

export function ScreenView({
  data,
  badges,
}: {
  data: PantallaData;
  badges?: Record<string, number>;
}) {
  const porSlot = (slot: Slot) =>
    data.instancias
      .filter((i) => i.slot === slot)
      .sort((a: Instancia, b: Instancia) => a.orden - b.orden || a.id - b.id);

  const principal = porSlot("principal");
  const lateral = porSlot("lateral");
  const inferior = porSlot("inferior");

  const render = (lista: Instancia[]) =>
    lista.map((inst) => (
      <ModulePanel
        key={inst.id}
        instancia={inst}
        pantalla={data.pantalla.slug}
        badge={badges?.[inst.module_id]}
      />
    ));

  return (
    <div
      className={cn(
        "grid items-start gap-3",
        Boolean(principal.length && lateral.length) && "xl:grid-cols-[minmax(0,1fr)_360px]",
      )}
    >
      {principal.length ? (
        <div className="min-w-0 space-y-3">{render(principal)}</div>
      ) : null}

      {lateral.length ? (
        <aside className={cn("min-w-0 space-y-3", !principal.length && "xl:max-w-2xl")}>
          {render(lateral)}
        </aside>
      ) : null}

      {inferior.length ? (
        <div className={cn("min-w-0 space-y-3", Boolean(principal.length && lateral.length) && "xl:col-span-2")}>
          {render(inferior)}
        </div>
      ) : null}

      {!principal.length && !lateral.length && !inferior.length ? (
        <div className="rounded-2xl border border-dashed border-line p-10 text-center">
          <p className="text-sm text-slate-400">Esta pantalla está vacía.</p>
          <p className="mt-1 text-xs text-slate-600">
            Abre el editor (🧰) para añadir módulos desde el registro.
          </p>
        </div>
      ) : null}
    </div>
  );
}
