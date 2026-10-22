"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { SceneBoard, type Escena, type TokenEscena } from "@/components/SceneBoard";
import { Badge, Button, Empty, EmojiPicker, ErrorBox, Field, Input, Modal } from "@/components/ui";
import { api, errorTexto } from "@/lib/api";
import { cn } from "@/lib/format";
import { useAppStore } from "@/lib/store";
import { useApi } from "@/lib/useApi";
import type { ModuleProps } from "./types";

export interface EscenariosData {
  escenas: Escena[];
  activa: Escena | null;
  grid: { cols: number; rows: number };
  sonidos: Array<{ id: number; nombre: string; grupo: string; src: string }>;
  presets_bg: Array<{ nombre: string; valor: string }>;
}

export function EscenarioModule(_props: ModuleProps) {
  const { data, setData, error } = useApi<EscenariosData>("/api/modules/escenarios/state");
  const [seleccionado, setSeleccionado] = useState<string | null>(null);
  const [modal, setModal] = useState(false);
  const [nuevo, setNuevo] = useState({ nombre: "", emoji: "🔵", x: 5, y: 4, color: "#f5b544" });
  const [luzColor, setLuzColor] = useState("#f5b544");
  const [luzOpacidad, setLuzOpacidad] = useState(0.18);
  const [cargando, setCargando] = useState<string | null>(null);
  const [errorLocal, setErrorLocal] = useState<string | null>(null);
  const bump = useAppStore((s) => s.bump);
  const notify = useAppStore((s) => s.notify);

  useEffect(() => {
    if (data?.activa) {
      setLuzColor(data.activa.light?.color ?? "#f5b544");
      setLuzOpacidad(data.activa.light?.opacity ?? 0.18);
      if (seleccionado && !data.activa.tokens.some((t) => t.id === seleccionado)) setSeleccionado(null);
    }
  }, [data?.activa?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  async function ejecutar(accion: string, payload: Record<string, unknown>, mensaje?: string) {
    setCargando(accion);
    setErrorLocal(null);
    try {
      const res = await api.post<EscenariosData>("/api/modules/escenarios/action", { action: accion, ...payload });
      setData(res);
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
  if (!data) return <div className="h-56 animate-pulse rounded-xl bg-white/5" />;

  if (!data.activa) {
    return (
      <Empty icon="🎭" title="No hay escena activa" action={
        <Link href="/pantalla/escenas"><Button size="sm" variant="primary">Ir a escenarios</Button></Link>
      }>
        Activa una escena para que el tablero, el proyector y el asistente compartan el mismo estado.
      </Empty>
    );
  }

  const escena = data.activa;
  const tokenSel = escena.tokens.find((t) => t.id === seleccionado) ?? null;

  function clicCasilla(x: number, y: number) {
    if (seleccionado) {
      void ejecutar("mover_token", { scene_id: escena.id, token_id: seleccionado, x, y });
    } else {
      setNuevo({ nombre: "", emoji: "🔵", x, y, color: "#f5b544" });
      setModal(true);
    }
  }

  async function agregarToken() {
    if (!nuevo.nombre.trim()) return;
    const ok = await ejecutar("agregar_token", {
      scene_id: escena.id, token_nombre: nuevo.nombre.trim(), emoji: nuevo.emoji,
      x: nuevo.x, y: nuevo.y, color: nuevo.color,
    }, "Token colocado");
    if (ok) {
      setModal(false);
      setNuevo({ nombre: "", emoji: "🔵", x: 5, y: 4, color: "#f5b544" });
    }
  }

  return (
    <div className="space-y-3">
      {errorLocal ? <ErrorBox>{errorLocal}</ErrorBox> : null}

      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="font-display text-xl leading-tight text-slate-100">{escena.nombre}</h3>
            <Badge color="gold">activa</Badge>
          </div>
          <p className="mt-0.5 text-[11px] leading-relaxed text-slate-400">{escena.descripcion}</p>
        </div>
        <div className="flex shrink-0 flex-wrap gap-1.5">
          <Button size="sm" variant="secondary" onClick={() => setModal(true)}>+ Token</Button>
          <Link href="/pantalla/escenas">
            <Button size="sm" variant="ghost">Gestionar escenas</Button>
          </Link>
        </div>
      </div>

      <SceneBoard
        escena={{
          ...escena,
          light: { color: luzColor, opacity: luzOpacidad },
        }}
        grid={data.grid}
        selectedId={seleccionado}
        onTokenClick={(t: TokenEscena) => setSeleccionado(t.id === seleccionado ? null : t.id)}
        onCellClick={clicCasilla}
      />

      <div className="flex flex-wrap items-center justify-between gap-2 text-[10px] text-slate-500">
        <p>
          {seleccionado
            ? "Haz clic en una casilla para mover el token seleccionado."
            : "Haz clic en una casilla vacía para colocar un token nuevo."}
        </p>
        <div className="flex items-center gap-1.5">
          {tokenSel ? (
            <>
              <Badge color="gold">{tokenSel.emoji} {tokenSel.nombre}</Badge>
              <Button
                size="xs"
                variant="danger"
                loading={cargando === "borrar_token"}
                onClick={() => {
                  if (!window.confirm(`¿Quitar a ${tokenSel.nombre} de la escena?`)) return;
                  void ejecutar("borrar_token", { scene_id: escena.id, token_id: tokenSel.id }, "Token retirado");
                  setSeleccionado(null);
                }}
              >
                Quitar
              </Button>
            </>
          ) : (
            <span className="italic">Ningún token seleccionado</span>
          )}
        </div>
      </div>

      <div className="flex flex-wrap gap-1.5">
        {escena.tokens.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setSeleccionado(t.id === seleccionado ? null : t.id)}
            className={cn(
              "rounded-full border px-2 py-0.5 text-[10px] transition-colors",
              t.id === seleccionado
                ? "border-gold/60 bg-gold/15 text-gold"
                : "border-line bg-white/[0.02] text-slate-400 hover:text-slate-200",
            )}
          >
            {t.emoji} {t.nombre} <span className="text-slate-600">({t.x},{t.y})</span>
          </button>
        ))}
      </div>

      <div className="grid gap-2 sm:grid-cols-[1fr_auto_auto] sm:items-end">
        <Field label="Luz ambiental">
          <div className="flex items-center gap-2">
            <input
              type="color"
              value={luzColor}
              onChange={(e) => setLuzColor(e.target.value)}
              className="h-8 w-10 cursor-pointer rounded border border-line bg-transparent"
              aria-label="Color de luz"
            />
            <input
              type="range"
              min={0}
              max={0.9}
              step={0.01}
              value={luzOpacidad}
              onChange={(e) => setLuzOpacidad(Number(e.target.value))}
              className="h-1 flex-1 accent-[#f5b544]"
              aria-label="Intensidad de luz"
            />
            <span className="w-8 text-right font-mono text-[10px] text-slate-500">{Math.round(luzOpacidad * 100)}%</span>
          </div>
        </Field>
        <Button
          size="sm"
          variant="secondary"
          loading={cargando === "set_light"}
          onClick={() => void ejecutar("set_light", {
            scene_id: escena.id, color: luzColor, opacity: luzOpacidad,
          }, "Luz actualizada")}
        >
          Aplicar luz
        </Button>
        <Badge color="slate">{escena.playlist.length} sonidos</Badge>
      </div>

      <Modal open={modal} onClose={() => setModal(false)} title="Colocar token">
        <div className="space-y-3">
          <div className="flex items-end gap-2">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl border border-line bg-ink text-2xl">
              {nuevo.emoji}
            </div>
            <Field label="Nombre" className="flex-1">
              <Input
                autoFocus
                value={nuevo.nombre}
                onChange={(e) => setNuevo({ ...nuevo, nombre: e.target.value })}
                placeholder="Lobo espectral"
                onKeyDown={(e) => {
                  if (e.key === "Enter") void agregarToken();
                }}
              />
            </Field>
          </div>
          <EmojiPicker value={nuevo.emoji} onChange={(emoji) => setNuevo({ ...nuevo, emoji })} />
          <div className="grid grid-cols-3 gap-2">
            <Field label="X">
              <Input type="number" min={0} max={data.grid.cols - 1} value={nuevo.x} onChange={(e) => setNuevo({ ...nuevo, x: Number(e.target.value) || 0 })} className="font-mono" />
            </Field>
            <Field label="Y">
              <Input type="number" min={0} max={data.grid.rows - 1} value={nuevo.y} onChange={(e) => setNuevo({ ...nuevo, y: Number(e.target.value) || 0 })} className="font-mono" />
            </Field>
            <Field label="Color">
              <input
                type="color"
                value={nuevo.color}
                onChange={(e) => setNuevo({ ...nuevo, color: e.target.value })}
                className="h-10 w-full cursor-pointer rounded-lg border border-line bg-transparent"
              />
            </Field>
          </div>
          <div className="flex justify-end gap-2 pt-1">
            <Button variant="ghost" onClick={() => setModal(false)}>Cancelar</Button>
            <Button variant="primary" onClick={() => void agregarToken()} loading={cargando === "agregar_token"}>
              Colocar token
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
