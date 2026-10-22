"use client";

import Link from "next/link";
import { api } from "@/lib/api";
import { horaCorta } from "@/lib/format";
import { useApi } from "@/lib/useApi";
import { Badge, Empty, ErrorBox } from "@/components/ui";
import type { Tirada } from "@/lib/types";
import type { ModuleProps } from "./types";

interface Mix {
  ruleset_nombre: string;
  activos: string[];
  texto: string;
}

interface EstadoData {
  escena: { id: number; nombre: string; tokens: number } | null;
  mix: Mix;
  personajes: number;
  criaturas: number;
  items: number;
  ultima_tirada: Tirada | null;
  total_tiradas: number;
  npcs: number;
  sonidos: number;
}

export function EstadoModule(_props: ModuleProps) {
  const { data, error } = useApi<EstadoData>("/api/modules/estado/state");

  if (error) return <ErrorBox>{error}</ErrorBox>;
  if (!data) {
    return (
      <div className="grid grid-cols-2 gap-2">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="h-14 animate-pulse rounded-lg bg-white/5" />
        ))}
      </div>
    );
  }

  const metricas = [
    { label: "Personajes", valor: data.personajes, icono: "🧙" },
    { label: "Criaturas", valor: data.criaturas, icono: "🐺" },
    { label: "Items", valor: data.items, icono: "🎒" },
    { label: "Tiradas", valor: data.total_tiradas, icono: "🎲" },
    { label: "NPCs", valor: data.npcs, icono: "💬" },
    { label: "Sonidos", valor: data.sonidos, icono: "🔊" },
  ];

  return (
    <div className="space-y-3">
      <div className="rounded-xl border border-gold/20 bg-gradient-to-br from-gold/[0.08] to-transparent p-3">
        <p className="text-[9px] uppercase tracking-[0.2em] text-gold/70">Escena activa</p>
        <div className="mt-1 flex items-start justify-between gap-2">
          <p className="font-display text-lg leading-tight text-slate-100">
            {data.escena?.nombre ?? "Sin escena"}
          </p>
          <Badge color="gold">{data.escena?.tokens ?? 0} tokens</Badge>
        </div>
        <div className="mt-2 flex flex-wrap gap-1">
          {data.mix.activos.length ? (
            data.mix.activos.map((r) => (
              <Badge key={r} color="violet">{r}</Badge>
            ))
          ) : (
            <Badge color="red">sin reglas</Badge>
          )}
        </div>
        <p className="mt-2 text-[10px] leading-relaxed text-slate-500">{data.mix.texto}</p>
      </div>

      <div className="grid grid-cols-3 gap-1.5">
        {metricas.map((m) => (
          <div key={m.label} className="rounded-lg border border-line bg-white/[0.02] px-2 py-1.5">
            <p className="text-[9px] uppercase tracking-wide text-slate-500">{m.icono} {m.label}</p>
            <p className="font-mono text-lg leading-tight text-slate-200">{m.valor}</p>
          </div>
        ))}
      </div>

      <div className="rounded-xl border border-line bg-white/[0.02] p-3">
        <div className="flex items-center justify-between">
          <p className="text-[9px] uppercase tracking-[0.2em] text-slate-500">Última tirada</p>
          <Link href="/pantalla/reglas" className="text-[10px] text-gold/80 hover:text-gold">
            Reglas →
          </Link>
        </div>
        {data.ultima_tirada ? (
          <div className="mt-1 flex items-baseline justify-between gap-2">
            <div>
              <p className="font-mono text-sm text-slate-200">
                {data.ultima_tirada.expr} <span className="text-gold">= {data.ultima_tirada.total}</span>
              </p>
              <p className="truncate text-[10px] text-slate-500">
                {data.ultima_tirada.razon || "sin razón"} · {horaCorta(data.ultima_tirada.ts)}
              </p>
            </div>
            <span className="text-2xl">🎲</span>
          </div>
        ) : (
          <Empty icon="🎲" title="Aún no hay tiradas">
            <span className="text-[10px]">Tira un dado para empezar el registro.</span>
          </Empty>
        )}
      </div>

      <div className="flex gap-2">
        <Link href="/pantalla/inventario" className="flex-1">
          <div className="rounded-lg border border-line bg-white/[0.02] px-2 py-1.5 text-center text-[10px] text-slate-400 hover:border-gold/40 hover:text-gold">
            🎒 Inventario
          </div>
        </Link>
        <Link href="/pantalla/escenas" className="flex-1">
          <div className="rounded-lg border border-line bg-white/[0.02] px-2 py-1.5 text-center text-[10px] text-slate-400 hover:border-gold/40 hover:text-gold">
            🎭 Escenas
          </div>
        </Link>
      </div>
    </div>
  );
}
