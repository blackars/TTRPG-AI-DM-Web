"use client";

import { useEffect, useRef, useState } from "react";
import { Badge, Button, Chip, Empty, ErrorBox, Field, Input, Select, Switch } from "@/components/ui";
import { api, errorTexto } from "@/lib/api";
import { cn, horaCorta } from "@/lib/format";
import { useAppStore } from "@/lib/store";
import { useApi } from "@/lib/useApi";
import type { ModuleProps } from "./types";

interface Opcion {
  key: string;
  label: string;
  tipo: "number" | "select";
  opciones?: string[];
  default: string | number;
}

interface Regla {
  id: string;
  nombre: string;
  icono: string;
  aporta: string;
  ejemplo: string;
  dados: string;
  depende: string[];
  opciones: Opcion[];
}

interface Ruleset {
  id: number;
  nombre: string;
  activo: boolean;
  mix: { activos: string[]; opciones: Record<string, Record<string, string | number>> };
  ts: string;
}

interface ReglasData {
  catalogo: Regla[];
  activos: string[];
  opciones: Record<string, Record<string, string | number>>;
  texto: string;
  ruleset_activo: { id: number; nombre: string } | null;
  rulesets: Ruleset[];
}

interface ResultadoCheck {
  resultado: Record<string, unknown>;
  tirada: { expr: string; total: number; tiradas: number[]; ts: string };
}

export function ReglasModule(_props: ModuleProps) {
  const { data, setData, error } = useApi<ReglasData>("/api/modules/reglas/state");
  const [errorLocal, setErrorLocal] = useState<string | null>(null);
  const [cargando, setCargando] = useState<string | null>(null);
  const [nombreMix, setNombreMix] = useState("");
  const [resultado, setResultado] = useState<ResultadoCheck | null>(null);
  const [pregunta, setPregunta] = useState("");
  const [odds, setOdds] = useState("50/50");
  const [chaos, setChaos] = useState(5);
  const [d20Mod, setD20Mod] = useState(0);
  const [d20Dif, setD20Dif] = useState(15);
  const [d20Modo, setD20Modo] = useState("normal");
  const [d20Razon, setD20Razon] = useState("");
  const [cantidad, setCantidad] = useState(23);
  const [criatura, setCriatura] = useState("trasgos");
  const [iniciado, setIniciado] = useState(false);
  const iniciadoRef = useRef(false);
  const bump = useAppStore((s) => s.bump);
  const notify = useAppStore((s) => s.notify);

  useEffect(() => {
    if (!data || iniciadoRef.current) return;
    iniciadoRef.current = true;
    setIniciado(true);
    setD20Dif(Number(data.opciones.d20?.dificultad ?? 15));
    setD20Modo(String(data.opciones.d20?.modo ?? "normal"));
    setOdds(String(data.opciones.mythic?.odds ?? "50/50"));
    setChaos(Number(data.opciones.mythic?.chaos ?? 5));
  }, [data]);

  async function ejecutar(accion: string, payload: Record<string, unknown>, mensaje?: string) {
    setCargando(accion);
    setErrorLocal(null);
    try {
      const res = await api.post<ReglasData & { estado?: ReglasData; resultado?: Record<string, unknown>; tirada?: ResultadoCheck["tirada"] }>(
        "/api/modules/reglas/action",
        { action: accion, ...payload },
      );
      if (res.estado) {
        setData(res.estado);
        if (res.resultado && res.tirada) setResultado({ resultado: res.resultado, tirada: res.tirada });
      } else {
        setData(res);
      }
      bump();
      if (mensaje) notify(mensaje);
      return res;
    } catch (e) {
      setErrorLocal(errorTexto(e));
      return null;
    } finally {
      setCargando(null);
    }
  }

  if (error) return <ErrorBox>{error}</ErrorBox>;
  if (!data) return <div className="h-48 animate-pulse rounded-xl bg-white/5" />;

  const activos = new Set(data.activos);
  const ventajaActiva = activos.has("ventaja");
  const estadoResultado = resultado?.resultado ?? null;

  return (
    <div className="space-y-3">
      {errorLocal ? <ErrorBox>{errorLocal}</ErrorBox> : null}

      <div className="rounded-xl border border-gold/25 bg-gradient-to-br from-gold/[0.08] via-transparent to-violet-500/[0.06] p-3">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <p className="text-[9px] uppercase tracking-[0.25em] text-gold/70">Mezcla activa</p>
            <p className="font-display text-lg leading-tight text-slate-100">
              {data.ruleset_activo?.nombre ?? "Mesa actual"}
            </p>
          </div>
          <Badge color="gold">{data.activos.length} núcleos</Badge>
        </div>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {data.activos.map((id) => {
            const r = data.catalogo.find((x) => x.id === id);
            return (
              <Chip key={id}>
                {r?.icono} {r?.nombre ?? id}
              </Chip>
            );
          })}
          {!data.activos.length ? <Badge color="red">Sin reglas: solo dados libres</Badge> : null}
        </div>
        <p className="mt-2 text-[11px] leading-relaxed text-slate-400">{data.texto}</p>
      </div>

      <div className="grid gap-2 md:grid-cols-2">
        {data.catalogo.map((regla) => {
          const activo = activos.has(regla.id);
          const bloqueada = regla.depende.some((d) => !activos.has(d));
          return (
            <div
              key={regla.id}
              className={cn(
                "rounded-xl border p-3 transition-colors",
                activo ? "border-gold/35 bg-gold/[0.05]" : "border-line bg-white/[0.02]",
                bloqueada && "opacity-50",
              )}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-start gap-2">
                  <span className="text-xl">{regla.icono}</span>
                  <div>
                    <p className="text-sm font-semibold text-slate-100">{regla.nombre}</p>
                    <div className="mt-0.5 flex gap-1">
                      <Badge color={activo ? "gold" : "slate"}>{regla.dados}</Badge>
                      {regla.depende.length ? <Badge color="slate">req. {regla.depende.join(", ")}</Badge> : null}
                    </div>
                  </div>
                </div>
                <Switch
                  checked={activo}
                  disabled={bloqueada}
                  onChange={(v) => void ejecutar("toggle", { rule_id: regla.id, activo: v })}
                  label={`Activar ${regla.nombre}`}
                />
              </div>
              <p className="mt-2 text-[11px] leading-relaxed text-slate-400">{regla.aporta}</p>
              <p className="mt-1.5 border-l-2 border-violet-500/40 pl-2 text-[10px] italic leading-relaxed text-slate-500">
                {regla.ejemplo}
              </p>

              {activo && regla.opciones.length ? (
                <div className="mt-2 grid grid-cols-2 gap-2 border-t border-line/70 pt-2">
                  {regla.opciones.map((op) => (
                    <Field key={op.key} label={op.label}>
                      {op.tipo === "select" ? (
                        <Select
                          value={String(data.opciones[regla.id]?.[op.key] ?? op.default)}
                          onChange={(e) =>
                            void ejecutar("set_opcion", { rule_id: regla.id, key: op.key, value: e.target.value })
                          }
                          className="h-8 py-1 text-xs"
                        >
                          {op.opciones?.map((v) => <option key={v} value={v}>{v}</option>)}
                        </Select>
                      ) : (
                        <Input
                          type="number"
                          value={Number(data.opciones[regla.id]?.[op.key] ?? op.default)}
                          onChange={(e) =>
                            void ejecutar("set_opcion", {
                              rule_id: regla.id, key: op.key, value: Number(e.target.value),
                            })
                          }
                          className="h-8 py-1 text-xs font-mono"
                        />
                      )}
                    </Field>
                  ))}
                </div>
              ) : null}
            </div>
          );
        })}
      </div>

      <div className="rounded-xl border border-line bg-white/[0.02] p-3">
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <p className="text-[9px] uppercase tracking-[0.25em] text-slate-500">Rulesets guardados</p>
          <div className="flex items-center gap-1">
            <Input
              value={nombreMix}
              onChange={(e) => setNombreMix(e.target.value)}
              placeholder="Nombre de la mezcla"
              className="h-8 w-44 py-1 text-xs"
            />
            <Button
              size="sm"
              variant="secondary"
              loading={cargando === "guardar_ruleset"}
              onClick={async () => {
                if (!nombreMix.trim()) return;
                const res = await ejecutar("guardar_ruleset", { nombre: nombreMix.trim() }, "Mezcla guardada y activada");
                if (res) setNombreMix("");
              }}
            >
              Guardar
            </Button>
          </div>
        </div>
        <div className="space-y-1">
          {data.rulesets.map((rs) => (
            <div key={rs.id} className="flex items-center justify-between gap-2 rounded-lg border border-transparent px-1.5 py-1 hover:border-line">
              <div className="min-w-0">
                <p className="truncate text-xs text-slate-200">
                  {rs.nombre} {rs.activo ? <span className="text-gold">· activo</span> : null}
                </p>
                <p className="truncate text-[9px] text-slate-500">
                  {rs.mix.activos.join(" + ") || "sin núcleos"} · {horaCorta(rs.ts)}
                </p>
              </div>
              <div className="flex shrink-0 gap-1">
                {!rs.activo ? (
                  <Button size="xs" variant="ghost" onClick={() => void ejecutar("activar_ruleset", { ruleset_id: rs.id }, `Activado ${rs.nombre}`)}>
                    Activar
                  </Button>
                ) : null}
                {!rs.activo ? (
                  <Button size="xs" variant="ghost" onClick={() => void ejecutar("borrar_ruleset", { ruleset_id: rs.id }, "Ruleset borrado")}>
                    ✕
                  </Button>
                ) : null}
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="rounded-xl border border-line bg-white/[0.02] p-3">
        <p className="mb-2 text-[9px] uppercase tracking-[0.25em] text-slate-500">Mesa de resolución</p>
        <div className="grid gap-3 lg:grid-cols-3">
          <div className="space-y-2 rounded-lg border border-line/70 p-2.5">
            <div className="flex items-center justify-between">
              <p className="text-xs font-semibold text-slate-200">🎯 Chequeo d20</p>
              <Badge color={activos.has("d20") ? "green" : "red"}>{activos.has("d20") ? "activo" : "off"}</Badge>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <Field label="Mod.">
                <Input type="number" value={d20Mod} onChange={(e) => setD20Mod(Number(e.target.value) || 0)} className="h-8 py-1 font-mono text-xs" />
              </Field>
              <Field label="CD">
                <Input type="number" value={d20Dif} onChange={(e) => setD20Dif(Number(e.target.value) || 15)} className="h-8 py-1 font-mono text-xs" />
              </Field>
            </div>
            <Field label="Modo">
              <Select
                value={d20Modo}
                onChange={(e) => setD20Modo(e.target.value)}
                disabled={!ventajaActiva}
                className="h-8 py-1 text-xs"
              >
                <option value="normal">normal</option>
                <option value="ventaja">ventaja</option>
                <option value="desventaja">desventaja</option>
              </Select>
            </Field>
            <Input value={d20Razon} onChange={(e) => setD20Razon(e.target.value)} placeholder="Razón" className="h-8 py-1 text-xs" />
            <Button
              size="sm"
              variant="primary"
              className="w-full"
              disabled={!activos.has("d20")}
              loading={cargando === "check_d20"}
              onClick={() => void ejecutar("check_d20", {
                mod: d20Mod, dificultad: d20Dif, modo: d20Modo,
                razon: d20Razon || "Chequeo d20",
              })}
            >
              Tirar chequeo
            </Button>
          </div>

          <div className="space-y-2 rounded-lg border border-line/70 p-2.5">
            <div className="flex items-center justify-between">
              <p className="text-xs font-semibold text-slate-200">🔮 Mythic</p>
              <Badge color={activos.has("mythic") ? "violet" : "red"}>{activos.has("mythic") ? "activo" : "off"}</Badge>
            </div>
            <Input value={pregunta} onChange={(e) => setPregunta(e.target.value)} placeholder="¿La cripta está vigilada?" className="h-8 py-1 text-xs" />
            <div className="grid grid-cols-2 gap-2">
              <Field label="Probabilidad">
                <Select value={odds} onChange={(e) => setOdds(e.target.value)} className="h-8 py-1 text-xs">
                  {["imposible", "casi imposible", "muy improbable", "improbable", "50/50", "probable", "muy probable", "casi seguro", "seguro"].map((v) => (
                    <option key={v} value={v}>{v}</option>
                  ))}
                </Select>
              </Field>
              <Field label="Caos">
                <Input type="number" min={1} max={9} value={chaos} onChange={(e) => setChaos(Number(e.target.value) || 5)} className="h-8 py-1 font-mono text-xs" />
              </Field>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <Button
                size="sm"
                variant="secondary"
                disabled={!activos.has("mythic")}
                loading={cargando === "fate_check"}
                onClick={() => void ejecutar("fate_check", { pregunta: pregunta || "Pregunta sin texto", odds, chaos })}
              >
                Sí / No
              </Button>
              <Button
                size="sm"
                variant="secondary"
                disabled={!activos.has("mythic")}
                loading={cargando === "event_meaning"}
                onClick={() => void ejecutar("event_meaning", {})}
              >
                Evento
              </Button>
            </div>
          </div>

          <div className="space-y-2 rounded-lg border border-line/70 p-2.5">
            <div className="flex items-center justify-between">
              <p className="text-xs font-semibold text-slate-200">👹 Spawn dX+Y</p>
              <Badge color={activos.has("spawn") ? "gold" : "red"}>{activos.has("spawn") ? "activo" : "off"}</Badge>
            </div>
            <Field label="Criatura">
              <Input value={criatura} onChange={(e) => setCriatura(e.target.value)} className="h-8 py-1 text-xs" />
            </Field>
            <Field label="Cantidad total">
              <Input type="number" min={1} value={cantidad} onChange={(e) => setCantidad(Number(e.target.value) || 1)} className="h-8 py-1 font-mono text-xs" />
            </Field>
            <Button
              size="sm"
              variant="primary"
              className="w-full"
              disabled={!activos.has("spawn")}
              loading={cargando === "spawn"}
              onClick={() => void ejecutar("spawn", { cantidad, criatura })}
            >
              Calcular spawn
            </Button>
          </div>
        </div>

        {resultado && estadoResultado ? (
          <div className="mt-3 animate-pop rounded-lg border border-gold/30 bg-gold/[0.06] p-3">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <p className="text-[10px] uppercase tracking-widest text-gold/80">Resultado</p>
              <p className="font-mono text-xs text-slate-400">
                {resultado.tirada.expr} → <span className="text-gold">{resultado.tirada.total}</span>
                {resultado.tirada.tiradas.length ? ` [${resultado.tirada.tiradas.join(", ")}]` : ""}
              </p>
            </div>
            <ResultadoVista datos={estadoResultado} />
          </div>
        ) : (
          <Empty icon="🧬" title="Sin resolución todavía">
            <span className="text-[10px]">Elige un chequeo, pregunta a Mythic o calcula un spawn. Todo queda en el historial.</span>
          </Empty>
        )}
      </div>
    </div>
  );
}

function ResultadoVista({ datos }: { datos: Record<string, unknown> }) {
  if ("grado" in datos) {
    const exito = Boolean(datos.exito);
    return (
      <div className="mt-1 flex flex-wrap items-center gap-2">
        <Badge color={exito ? "green" : "red"}>{String(datos.grado)}</Badge>
        <span className="text-sm text-slate-200">
          total {String(datos.total)} vs CD {String(datos.dificultad)}
        </span>
        <span className="text-[10px] text-slate-500">modo {String(datos.modo)}</span>
      </div>
    );
  }
  if ("texto" in datos && "accion" in datos) {
    return (
      <p className="mt-1 font-display text-lg text-slate-100">
        {String(datos.accion)} <span className="text-slate-500">→</span> {String(datos.sujeto)}
      </p>
    );
  }
  if ("texto" in datos) {
    return (
      <div className="mt-1 flex flex-wrap items-center gap-2">
        <Badge color={datos.exito ? "green" : "red"}>{String(datos.texto)}</Badge>
        <span className="text-[11px] text-slate-400">umbral {String(datos.umbral)} · d100 {String(datos.tirada)}</span>
      </div>
    );
  }
  if ("spawneados" in datos) {
    return (
      <div className="mt-1 flex flex-wrap items-center gap-2">
        <Badge color="gold">{String(datos.expresion)}</Badge>
        <span className="text-sm text-slate-200">
          aparecen {String(datos.spawneados)} de {String(datos.cantidad)}
        </span>
        <span className="text-[10px] text-slate-500">
          {String(datos.sobrantes)} en reserva · {String(datos.nota)}
        </span>
      </div>
    );
  }
  return <pre className="mt-1 overflow-x-auto text-[10px] text-slate-400">{JSON.stringify(datos, null, 2)}</pre>;
}
