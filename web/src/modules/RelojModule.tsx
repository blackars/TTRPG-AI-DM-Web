"use client";

import { useEffect, useState } from "react";
import { fechaLarga } from "@/lib/format";
import { useReloj } from "@/lib/useApi";
import type { ModuleProps } from "./types";

function dos(n: number) {
  return String(n).padStart(2, "0");
}

export function RelojModule(_props: ModuleProps) {
  const ahora = useReloj();
  const [inicio] = useState(() => Date.now());
  const [transcurrido, setTranscurrido] = useState(0);

  useEffect(() => {
    const t = setInterval(() => setTranscurrido(Math.floor((Date.now() - inicio) / 1000)), 1000);
    return () => clearInterval(t);
  }, [inicio]);

  const horas = Math.floor(transcurrido / 3600);
  const minutos = Math.floor((transcurrido % 3600) / 60);
  const segundos = transcurrido % 60;

  return (
    <div className="flex items-center justify-between gap-4">
      <div>
        <p className="font-display text-3xl tracking-tight text-slate-100">
          {ahora ? `${dos(ahora.getHours())}:${dos(ahora.getMinutes())}` : "--:--"}
          <span className="ml-1 text-lg text-gold/80">{ahora ? dos(ahora.getSeconds()) : "--"}</span>
        </p>
        <p className="mt-1 text-[11px] capitalize text-slate-500">
          {ahora ? fechaLarga(ahora) : "Cargando fecha…"}
        </p>
      </div>
      <div className="rounded-xl border border-line bg-white/[0.03] px-3 py-2 text-right">
        <p className="text-[9px] uppercase tracking-widest text-slate-500">Sesión</p>
        <p className="font-mono text-sm text-gold">
          {dos(horas)}:{dos(minutos)}:{dos(segundos)}
        </p>
      </div>
    </div>
  );
}
