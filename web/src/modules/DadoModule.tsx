"use client";

import { useEffect, useState } from "react";
import { DiceStage3D } from "@/components/DiceStage3D";
import { Badge, Button, ErrorBox, Field, Input } from "@/components/ui";
import { api, errorTexto } from "@/lib/api";
import { cn, horaCorta } from "@/lib/format";
import { useAppStore } from "@/lib/store";
import { useApi } from "@/lib/useApi";
import type { Tirada } from "@/lib/types";
import type { ModuleProps } from "./types";

interface DadoData {
  tipos: Array<{ id: string; caras: number; nombre: string }>;
  historial: Tirada[];
  total: number;
}

const COLORES: Record<string, string> = {
  d4: "#f87171",
  d6: "#f5b544",
  d8: "#5eead4",
  d10: "#fb923c",
  d12: "#a78bfa",
  d20: "#c084fc",
  d100: "#93c5fd",
  dF: "#34d399",
};

function forma(tipo: string): number {
  switch (tipo) {
    case "d4": return 3;
    case "d6": return 4;
    case "d8": return 4;
    case "d10": return 6;
    case "d12": return 5;
    case "d20": return 6;
    default: return 6;
  }
}

function puntos(n: number, radio = 43, rotacion = -Math.PI / 2): string {
  return Array.from({ length: n }, (_, i) => {
    const ang = rotacion + (i * 2 * Math.PI) / n;
    return `${50 + radio * Math.cos(ang)},${50 + radio * Math.sin(ang)}`;
  }).join(" ");
}

function Dado2D({
  tipo,
  rolling,
  total,
}: {
  tipo: string;
  rolling: boolean;
  total: number | null;
}) {
  const [ruleta, setRuleta] = useState(1);
  const color = COLORES[tipo] || "#f5b544";

  useEffect(() => {
    if (!rolling) return;
    const max = tipo === "d100" ? 100 : tipo === "dF" ? 1 : Number(tipo.replace(/\D/g, "")) || 20;
    const timer = setInterval(() => {
      setRuleta(Math.floor(Math.random() * max) + 1);
    }, 65);
    return () => clearInterval(timer);
  }, [rolling, tipo]);

  const valor = rolling ? (tipo === "dF" ? (ruleta % 3) - 1 : ruleta) : total;
  const esCuadrado = tipo === "d6";
  const esCirculo = tipo === "d100";
  const gradId = `grad-${tipo.replace(/\W/g, "")}`;

  return (
    <div className="relative flex h-[210px] items-center justify-center overflow-hidden rounded-xl border border-line bg-[radial-gradient(circle_at_50%_35%,rgba(245,181,68,0.10),transparent_60%)]">
      <svg
        viewBox="0 0 100 100"
        className={cn("h-[170px] w-[170px] drop-shadow-[0_18px_28px_rgba(0,0,0,0.55)]", rolling && "animate-spinDie")}
        aria-label={`Dado ${tipo}`}
      >
        <defs>
          <linearGradient id={gradId} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity="0.98" />
            <stop offset="100%" stopColor={color} stopOpacity="0.55" />
          </linearGradient>
        </defs>
        {esCirculo ? (
          <circle cx="50" cy="50" r="44" fill={`url(#${gradId})`} stroke="#080a0f" strokeWidth="3" />
        ) : esCuadrado ? (
          <rect x="8" y="8" width="84" height="84" rx="14" fill={`url(#${gradId})`} stroke="#080a0f" strokeWidth="3" />
        ) : (
          <polygon points={puntos(forma(tipo))} fill={`url(#${gradId})`} stroke="#080a0f" strokeWidth="3" />
        )}
        <text
          x="50"
          y="50"
          textAnchor="middle"
          dominantBaseline="central"
          fontFamily="Georgia, serif"
          fontWeight="700"
          fontSize={String(valor ?? "").length > 2 ? 20 : 28}
          fill="#080a0f"
        >
          {valor ?? "?"}
        </text>
      </svg>
      <span className="absolute bottom-2 left-3 text-[9px] uppercase tracking-[0.25em] text-slate-500">
        SVG · {tipo}
      </span>
    </div>
  );
}

export function DadoModule(_props: ModuleProps) {
  const { data, setData, error, refrescar } = useApi<DadoData>("/api/modules/dado/state");
  const [tipo, setTipo] = useState("d20");
  const [cantidad, setCantidad] = useState(1);
  const [mod, setMod] = useState(0);
  const [razon, setRazon] = useState("");
  const [modo, setModo] = useState<"2d" | "3d">("3d");
  const [rolling, setRolling] = useState(false);
  const [resultado, setResultado] = useState<Tirada | null>(null);
  const [errorLocal, setErrorLocal] = useState<string | null>(null);
  const notify = useAppStore((s) => s.notify);
  const bump = useAppStore((s) => s.bump);

  useEffect(() => {
    const guardado = window.localStorage.getItem("ttrpg_modo_dado");
    if (guardado === "2d" || guardado === "3d") setModo(guardado);
  }, []);

  useEffect(() => {
    window.localStorage.setItem("ttrpg_modo_dado", modo);
  }, [modo]);

  const expr = `${cantidad}${tipo}${mod > 0 ? `+${mod}` : mod < 0 ? mod : ""}`.replace(/^1(d)/, "$1");

  async function tirar() {
    if (rolling) return;
    setRolling(true);
    setResultado(null);
    setErrorLocal(null);
    const inicio = Date.now();
    try {
      const res = await api.post<{ tirada: Tirada; historial: Tirada[] }>(
        "/api/modules/dado/action",
        { action: "tirar", expr, razon: razon || "Tirada libre" },
      );
      const espera = Math.max(0, 1050 - (Date.now() - inicio));
      await new Promise((r) => setTimeout(r, espera));
      setResultado(res.tirada);
      setData((prev) => (prev ? { ...prev, historial: res.historial, total: prev.total + 1 } : prev));
      bump();
      notify(`Tirada ${res.tirada.expr} = ${res.tirada.total}`);
    } catch (e) {
      setErrorLocal(errorTexto(e));
      setRolling(false);
    } finally {
      setRolling(false);
    }
  }

  function repetir(exprHist: string) {
    const m = /^(\d*)d(\d+|F)([+-]\d+)?$/i.exec(exprHist);
    if (!m) return;
    setCantidad(Math.max(1, Math.min(20, Number(m[1] || 1))));
    setTipo(m[2].toUpperCase() === "F" ? "dF" : `d${m[2]}`);
    setMod(Number(m[3] || 0));
    setResultado(null);
  }

  const tipos = data?.tipos ?? [
    { id: "d4", caras: 4, nombre: "d4" },
    { id: "d6", caras: 6, nombre: "d6" },
    { id: "d8", caras: 8, nombre: "d8" },
    { id: "d10", caras: 10, nombre: "d10" },
    { id: "d12", caras: 12, nombre: "d12" },
    { id: "d20", caras: 20, nombre: "d20" },
    { id: "d100", caras: 100, nombre: "d100" },
    { id: "dF", caras: 3, nombre: "dF" },
  ];

  return (
    <div className="space-y-3">
      {error ? <ErrorBox>{error}</ErrorBox> : null}
      {errorLocal ? <ErrorBox>{errorLocal}</ErrorBox> : null}

      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap gap-1">
          {tipos.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setTipo(t.id)}
              className={cn(
                "h-8 min-w-9 rounded-lg border px-2 font-mono text-xs transition-all",
                tipo === t.id
                  ? "border-gold/70 bg-gold/15 text-gold shadow-[0_0_18px_rgba(245,181,68,0.15)]"
                  : "border-line bg-white/[0.02] text-slate-400 hover:border-slate-500 hover:text-slate-200",
              )}
            >
              {t.nombre}
            </button>
          ))}
        </div>
        <div className="flex overflow-hidden rounded-lg border border-line">
          {(["2d", "3d"] as const).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => setModo(m)}
              className={cn(
                "px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider transition-colors",
                modo === m ? "bg-gold/15 text-gold" : "bg-transparent text-slate-500 hover:text-slate-300",
              )}
            >
              {m}
            </button>
          ))}
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-[1.05fr_0.95fr]">
        <div className="space-y-2">
          {modo === "3d" ? (
            <DiceStage3D tipo={tipo} rolling={rolling} total={resultado?.total ?? null} color={COLORES[tipo]} />
          ) : (
            <Dado2D tipo={tipo} rolling={rolling} total={resultado?.total ?? null} />
          )}
          <div className="grid grid-cols-2 gap-2">
            <Field label="N dados">
              <div className="flex items-center gap-1">
                <Button size="sm" variant="subtle" onClick={() => setCantidad((c) => Math.max(1, c - 1))}>−</Button>
                <Input
                  type="number"
                  min={1}
                  max={20}
                  value={cantidad}
                  onChange={(e) => setCantidad(Math.max(1, Math.min(20, Number(e.target.value) || 1)))}
                  className="text-center font-mono"
                />
                <Button size="sm" variant="subtle" onClick={() => setCantidad((c) => Math.min(20, c + 1))}>+</Button>
              </div>
            </Field>
            <Field label="Modificador">
              <div className="flex items-center gap-1">
                <Button size="sm" variant="subtle" onClick={() => setMod((m) => m - 1)}>−</Button>
                <Input
                  type="number"
                  value={mod}
                  onChange={(e) => setMod(Number(e.target.value) || 0)}
                  className="text-center font-mono"
                />
                <Button size="sm" variant="subtle" onClick={() => setMod((m) => m + 1)}>+</Button>
              </div>
            </Field>
          </div>
        </div>

        <div className="flex flex-col gap-2">
          <div className="rounded-xl border border-line bg-white/[0.02] p-3">
            <p className="text-[9px] uppercase tracking-[0.22em] text-slate-500">Expresión</p>
            <p className="font-mono text-lg text-slate-100">{expr}</p>
            <div className="mt-2 flex items-baseline justify-between gap-2">
              <span className="text-[10px] uppercase tracking-widest text-slate-500">Total</span>
              <span className="font-display text-4xl leading-none text-gold">
                {rolling ? "…" : resultado?.total ?? "—"}
              </span>
            </div>
            {resultado && resultado.tiradas.length ? (
              <div className="mt-2 flex flex-wrap gap-1">
                {resultado.tiradas.map((t, i) => (
                  <span
                    key={`${t}-${i}`}
                    className="rounded-md border border-line bg-ink px-1.5 py-0.5 font-mono text-[11px] text-slate-300"
                  >
                    {t}
                  </span>
                ))}
                {resultado.mod !== 0 ? (
                  <span className="rounded-md border border-gold/30 bg-gold/10 px-1.5 py-0.5 font-mono text-[11px] text-gold">
                    {resultado.mod > 0 ? "+" : ""}{resultado.mod}
                  </span>
                ) : null}
              </div>
            ) : null}
          </div>

          <Input
            placeholder="¿Por qué se tira? (opcional)"
            value={razon}
            onChange={(e) => setRazon(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") void tirar();
            }}
          />
          <Button variant="primary" onClick={() => void tirar()} loading={rolling} className="w-full">
            🎲 Tirar {expr}
          </Button>

          <div className="min-h-0 flex-1 rounded-xl border border-line bg-white/[0.02] p-2">
            <div className="mb-1 flex items-center justify-between px-1">
              <p className="text-[9px] uppercase tracking-[0.22em] text-slate-500">Historial</p>
              <Badge color="slate">{data?.total ?? 0}</Badge>
            </div>
            <div className="max-h-[140px] space-y-1 overflow-y-auto pr-1">
              {(data?.historial ?? []).slice(0, 12).map((t) => (
                <button
                  key={t.id}
                  type="button"
                  title="Repetir esta expresión"
                  onClick={() => repetir(t.expr)}
                  className="flex w-full items-center justify-between gap-2 rounded-lg border border-transparent px-1.5 py-1 text-left transition-colors hover:border-line hover:bg-white/[0.03]"
                >
                  <span className="min-w-0">
                    <span className="block font-mono text-[11px] text-slate-300">
                      {t.expr} = <span className="text-gold">{t.total}</span>
                    </span>
                    <span className="block truncate text-[9px] text-slate-500">
                      {t.razon || "sin razón"} · {horaCorta(t.ts)}
                    </span>
                  </span>
                  <span className="shrink-0 text-[10px] text-slate-600">↻</span>
                </button>
              ))}
              {!data?.historial?.length ? (
                <p className="px-2 py-3 text-center text-[10px] text-slate-600">Sin tiradas todavía.</p>
              ) : null}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
