"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { Badge, Button, ErrorBox, Spinner } from "@/components/ui";
import { api, errorTexto } from "@/lib/api";
import { ejecutarAccion, NOMBRES_ACCION, type ResultadoAccion } from "@/lib/actions";
import { cn, horaCorta } from "@/lib/format";
import { useAppStore } from "@/lib/store";
import { useApi } from "@/lib/useApi";
import type { AccionIA } from "@/lib/types";
import type { ModuleProps } from "./types";

interface Mensaje {
  id: number;
  role: "user" | "assistant" | string;
  contenido: string;
  proveedor: string;
  ts: string;
}

interface Provider {
  proveedor: string;
  configurado: boolean;
  modelo: string;
  muerto_hasta: number;
  fallos: number;
}

interface AsistenteData {
  mensajes: Mensaje[];
  conversacion: string;
  providers: Provider[];
  acciones_permitidas: Record<string, { descripcion: string; campos: string[] }>;
}

interface RespuestaTurno {
  respuesta: string;
  mensaje: Mensaje;
  acciones: AccionIA[];
  proveedor: string;
  modelo: string;
  latencia_ms: number;
  contexto_resumen: {
    escena: string | null;
    ultima_tirada: string | null;
    personajes: number;
    items: number;
  };
}

interface Contexto {
  escena_activa: { nombre: string; descripcion: string; tokens: unknown[] } | null;
  mix_reglas: { ruleset_nombre: string; texto: string; activos: string[] };
  notas_dm: string;
  personajes: Array<{ id: number; nombre: string; kind: string; hp: number; hp_max: number }>;
  npcs: Array<{ nombre: string }>;
  sonidos_disponibles: Array<{ nombre: string }>;
  pantallas: Array<{ slug: string; nombre: string }>;
  badges_de_modulos: Record<string, number>;
}

const SUGERENCIAS = [
  "¿Dónde estamos y qué llevamos?",
  "Tira d20+3 para buscar rastros",
  "¿Qué NPC debería hablar ahora?",
  "Resume la escena y las reglas activas",
];

function enLinea(texto: string): ReactNode[] {
  const partes = texto.split(/(\*\*[^*]+\*\*|`[^`]+`)/g).filter(Boolean);
  return partes.map((parte, i) => {
    if (parte.startsWith("**") && parte.endsWith("**")) {
      return <strong key={i} className="font-semibold text-slate-100">{parte.slice(2, -2)}</strong>;
    }
    if (parte.startsWith("`") && parte.endsWith("`")) {
      return (
        <code key={i} className="rounded border border-line bg-ink px-1 py-0.5 font-mono text-[11px] text-gold">
          {parte.slice(1, -1)}
        </code>
      );
    }
    return <span key={i}>{parte}</span>;
  });
}

function Texto({ contenido }: { contenido: string }) {
  return (
    <div className="space-y-1.5 text-[12.5px] leading-relaxed text-slate-300">
      {contenido.split("\n").map((linea, i) =>
        linea.trim() ? (
          <p key={i} className={linea.trimStart().startsWith("- ") ? "pl-2" : undefined}>
            {enLinea(linea)}
          </p>
        ) : null,
      )}
    </div>
  );
}

function resumenAccion(accion: AccionIA): string {
  return Object.entries(accion)
    .filter(([k]) => k !== "action")
    .map(([k, v]) => `${k}: ${String(v)}`)
    .join(" · ");
}

export function AsistenteModule(_props: ModuleProps) {
  const { data, setData, error, refrescar } = useApi<AsistenteData>("/api/modules/asistente/state");
  const [texto, setTexto] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [pensando, setPensando] = useState(false);
  const [acciones, setAcciones] = useState<AccionIA[]>([]);
  const [resultados, setResultados] = useState<Record<number, ResultadoAccion>>({});
  const [ejecutando, setEjecutando] = useState<number | null>(null);
  const [errorLocal, setErrorLocal] = useState<string | null>(null);
  const [ultimo, setUltimo] = useState<RespuestaTurno | null>(null);
  const [verContexto, setVerContexto] = useState(false);
  const [contexto, setContexto] = useState<Contexto | null>(null);
  const finRef = useRef<HTMLDivElement | null>(null);
  const bump = useAppStore((s) => s.bump);
  const notify = useAppStore((s) => s.notify);

  const mensajes = data?.mensajes ?? [];

  useEffect(() => {
    finRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [mensajes.length, pensando]);

  async function enviar(mensaje: string) {
    const limpio = mensaje.trim();
    if (!limpio || enviando) return;
    setEnviando(true);
    setPensando(true);
    setErrorLocal(null);
    setResultados({});
    setAcciones([]);
    setTexto("");
    const provisional: Mensaje = {
      id: -Date.now(), role: "user", contenido: limpio, proveedor: "", ts: new Date().toISOString(),
    };
    setData((prev) => (prev ? { ...prev, mensajes: [...prev.mensajes, provisional] } : prev));
    try {
      const res = await api.post<RespuestaTurno>("/api/assistant/turn", {
        mensaje: limpio,
        conversacion: "principal",
      });
      setUltimo(res);
      setAcciones(res.acciones);
      setData((prev) =>
        prev
          ? {
              ...prev,
              mensajes: [
                ...prev.mensajes.map((m) => (m.id === provisional.id ? { ...m, id: res.mensaje.id - 1 } : m)),
                res.mensaje,
              ],
            }
          : prev,
      );
      bump();
      if (res.acciones.length) notify(`El asistente propone ${res.acciones.length} acción(es)`);
    } catch (e) {
      setErrorLocal(errorTexto(e));
      setData((prev) => (prev ? { ...prev, mensajes: prev.mensajes.filter((m) => m.id !== provisional.id) } : prev));
      setTexto(limpio);
    } finally {
      setPensando(false);
      setEnviando(false);
    }
  }

  async function ejecutar(accion: AccionIA, indice: number) {
    setEjecutando(indice);
    setErrorLocal(null);
    try {
      const resultado = await ejecutarAccion(accion);
      setResultados((prev) => ({ ...prev, [indice]: resultado }));
      notify(resultado.mensaje);
      bump();
    } catch (e) {
      const resultado = { ok: false, mensaje: errorTexto(e) };
      setResultados((prev) => ({ ...prev, [indice]: resultado }));
      notify(resultado.mensaje, "error");
    } finally {
      setEjecutando(null);
    }
  }

  async function abrirContexto() {
    const abierto = !verContexto;
    setVerContexto(abierto);
    if (abierto && !contexto) {
      try {
        setContexto(await api.get<Contexto>("/api/assistant/context"));
      } catch (e) {
        setErrorLocal(errorTexto(e));
      }
    }
  }

  async function limpiar() {
    if (!window.confirm("¿Borrar toda la conversación del asistente?")) return;
    try {
      await api.post<AsistenteData>("/api/modules/asistente/action", { action: "limpiar", conversacion: "principal" });
      setAcciones([]);
      setUltimo(null);
      await refrescar(true);
      notify("Conversación borrada");
    } catch (e) {
      setErrorLocal(errorTexto(e));
    }
  }

  if (error) return <ErrorBox>{error}</ErrorBox>;
  if (!data) return <div className="h-48 animate-pulse rounded-xl bg-white/5" />;

  const providerActivo = data.providers.find((p) => p.configurado) ?? data.providers[data.providers.length - 1];

  return (
    <div className="flex h-full min-h-0 flex-col gap-2">
      <div className="flex flex-wrap items-center justify-between gap-1.5">
        <div className="flex flex-wrap items-center gap-1">
          <Badge color="violet">✨ DM copiloto</Badge>
          {providerActivo ? (
            <Badge color={providerActivo.proveedor === "mock" ? "slate" : "green"}>
              {providerActivo.proveedor} · {providerActivo.modelo || "auto"}
            </Badge>
          ) : null}
          {ultimo ? <Badge color="slate">{ultimo.latencia_ms} ms</Badge> : null}
        </div>
        <div className="flex gap-1">
          <button
            type="button"
            onClick={() => void abrirContexto()}
            className={cn("rounded px-1.5 text-[10px]", verContexto ? "text-gold" : "text-slate-500 hover:text-slate-200")}
            title="Ver el contexto que lee la IA"
          >
            contexto
          </button>
          <button
            type="button"
            onClick={() => void limpiar()}
            className="rounded px-1.5 text-[10px] text-slate-500 hover:text-red-300"
          >
            limpiar
          </button>
        </div>
      </div>

      {errorLocal ? <ErrorBox>{errorLocal}</ErrorBox> : null}

      {verContexto ? (
        <div className="max-h-48 space-y-1.5 overflow-y-auto rounded-xl border border-line bg-white/[0.02] p-2.5 text-[10px] text-slate-400">
          {contexto ? (
            <>
              <p><span className="text-slate-500">Escena:</span> {contexto.escena_activa?.nombre ?? "ninguna"}</p>
              <p><span className="text-slate-500">Reglas:</span> {contexto.mix_reglas.texto}</p>
              <p>
                <span className="text-slate-500">Personajes:</span>{" "}
                {contexto.personajes.map((p) => `${p.nombre} ${p.hp}/${p.hp_max}`).join(" · ")}
              </p>
              <p><span className="text-slate-500">NPCs:</span> {contexto.npcs.map((n) => n.nombre).join(", ") || "ninguno"}</p>
              <p><span className="text-slate-500">Notas DM:</span> {contexto.notas_dm ? `${contexto.notas_dm.slice(0, 180)}…` : "vacías"}</p>
              <p><span className="text-slate-500">Pantallas:</span> {contexto.pantallas.map((p) => p.nombre).join(", ")}</p>
              <p>
                <span className="text-slate-500">Módulos:</span>{" "}
                {Object.entries(contexto.badges_de_modulos).map(([k, v]) => `${k} ${v}`).join(" · ")}
              </p>
            </>
          ) : (
            <p className="italic text-slate-500">Cargando contexto…</p>
          )}
        </div>
      ) : null}

      <div className="min-h-[180px] flex-1 space-y-2 overflow-y-auto rounded-xl border border-line bg-[#0a0d14]/70 p-2.5">
        {mensajes.map((m) => (
          <div key={m.id} className={cn("flex gap-2", m.role === "user" ? "justify-end" : "justify-start")}>
            {m.role !== "user" ? (
              <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-gold/30 bg-gold/10 text-xs">
                ✨
              </span>
            ) : null}
            <div
              className={cn(
                "max-w-[88%] rounded-xl border px-2.5 py-1.5",
                m.role === "user"
                  ? "border-gold/25 bg-gold/[0.08]"
                  : "border-line bg-white/[0.03]",
              )}
            >
              <Texto contenido={m.contenido} />
              <div className="mt-1 flex items-center justify-end gap-1.5 text-[8px] uppercase tracking-wider text-slate-600">
                {m.proveedor && m.proveedor !== "sistema" ? <span>{m.proveedor}</span> : null}
                <span>{horaCorta(m.ts)}</span>
              </div>
            </div>
          </div>
        ))}

        {pensando ? (
          <div className="flex items-center gap-2 text-[11px] text-slate-500">
            <Spinner className="h-3 w-3" /> El asistente cruza el contexto de la mesa…
          </div>
        ) : null}
        <div ref={finRef} />
      </div>

      {acciones.length ? (
        <div className="space-y-1.5 rounded-xl border border-gold/30 bg-gold/[0.04] p-2">
          <p className="text-[9px] uppercase tracking-[0.2em] text-gold/80">
            Acciones propuestas · confirma para ejecutar
          </p>
          {acciones.map((accion, i) => {
            const resultado = resultados[i];
            return (
              <div key={`${accion.action}-${i}`} className="rounded-lg border border-line bg-ink/60 p-2">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-[11px] font-semibold text-slate-200">
                      {NOMBRES_ACCION[accion.action] ?? accion.action}
                    </p>
                    <p className="break-words text-[9px] text-slate-500">{resumenAccion(accion)}</p>
                  </div>
                  <Button
                    size="xs"
                    variant="primary"
                    loading={ejecutando === i}
                    disabled={Boolean(resultado)}
                    onClick={() => void ejecutar(accion, i)}
                  >
                    {resultado ? "Hecha" : "Ejecutar"}
                  </Button>
                </div>
                {resultado ? (
                  <p className={cn("mt-1 text-[10px]", resultado.ok ? "text-emerald-300" : "text-red-300")}>
                    {resultado.mensaje}
                  </p>
                ) : null}
              </div>
            );
          })}
        </div>
      ) : null}

      <div className="flex flex-wrap gap-1">
        {SUGERENCIAS.map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => void enviar(s)}
            disabled={enviando}
            className="rounded-full border border-line bg-white/[0.02] px-2 py-0.5 text-[9px] text-slate-400 transition-colors hover:border-gold/40 hover:text-gold disabled:opacity-40"
          >
            {s}
          </button>
        ))}
      </div>

      <div className="flex items-end gap-1.5">
        <textarea
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              void enviar(texto);
            }
          }}
          rows={2}
          placeholder="Pregunta, pide una tirada o narrativa… (Enter envía)"
          className="max-h-24 min-h-[42px] flex-1 resize-none rounded-xl border border-line bg-[#0a0d14] px-3 py-2 text-xs text-slate-100 placeholder:text-slate-600 focus:border-gold/60 focus:outline-none"
        />
        <Button
          variant="primary"
          loading={enviando}
          onClick={() => void enviar(texto)}
          disabled={!texto.trim()}
          className="h-[42px]"
        >
          Enviar
        </Button>
      </div>
    </div>
  );
}
