"use client";

import { useState } from "react";
import { SceneBoard, fondo } from "@/components/SceneBoard";
import { Badge, Button, Empty, ErrorBox, Field, Input, Modal, Select, Textarea } from "@/components/ui";
import { api, errorTexto } from "@/lib/api";
import { cn } from "@/lib/format";
import { useAppStore } from "@/lib/store";
import { useApi } from "@/lib/useApi";
import type { EscenariosData } from "./EscenarioModule";
import type { ModuleProps } from "./types";

interface FormEscena {
  id?: number;
  nombre: string;
  descripcion: string;
  bg: string;
  luzColor: string;
  luzOpacidad: number;
  playlist: number[];
}

const NUEVA: FormEscena = {
  nombre: "",
  descripcion: "",
  bg: "radial-gradient(120% 90% at 30% 10%, #1e5c3f 0%, #123a2a 45%, #07130f 100%)",
  luzColor: "#9ae6b4",
  luzOpacidad: 0.18,
  playlist: [],
};

export function EscenariosModule(_props: ModuleProps) {
  const { data, setData, error } = useApi<EscenariosData>("/api/modules/escenarios/state");
  const [form, setForm] = useState<FormEscena | null>(null);
  const [cargando, setCargando] = useState<string | null>(null);
  const [errorLocal, setErrorLocal] = useState<string | null>(null);
  const bump = useAppStore((s) => s.bump);
  const notify = useAppStore((s) => s.notify);

  async function ejecutar(accion: string, payload: Record<string, unknown>, mensaje?: string) {
    setCargando(accion);
    setErrorLocal(null);
    try {
      const res = await api.post<EscenariosData>("/api/modules/escenarios/action", { action: accion, ...payload });
      setData(res);
      bump();
      if (mensaje) notify(mensaje);
      return true;
    } catch (e) {
      setErrorLocal(errorTexto(e));
      return false;
    } finally {
      setCargando(null);
    }
  }

  function editar(escena: EscenariosData["escenas"][number]) {
    setForm({
      id: escena.id, nombre: escena.nombre, descripcion: escena.descripcion,
      bg: escena.bg, luzColor: escena.light?.color ?? "#f5b544",
      luzOpacidad: escena.light?.opacity ?? 0.18, playlist: escena.playlist,
    });
  }

  async function guardar() {
    if (!form || !form.nombre.trim()) return;
    const payload = {
      nombre: form.nombre.trim(),
      descripcion: form.descripcion,
      bg: form.bg,
      light: { color: form.luzColor, opacity: form.luzOpacidad },
      playlist: form.playlist,
    };
    const ok = form.id
      ? await ejecutar("editar", { id: form.id, ...payload }, "Escena actualizada")
      : await ejecutar("crear", payload, "Escena creada");
    if (ok) setForm(null);
  }

  if (error) return <ErrorBox>{error}</ErrorBox>;
  if (!data) return <div className="h-48 animate-pulse rounded-xl bg-white/5" />;

  return (
    <div className="space-y-3">
      {errorLocal ? <ErrorBox>{errorLocal}</ErrorBox> : null}

      <div className="flex items-center justify-between gap-2">
        <div>
          <p className="text-[9px] uppercase tracking-[0.25em] text-slate-500">Catálogo de escenas</p>
          <p className="text-xs text-slate-400">{data.escenas.length} escenas · {data.activa?.nombre ?? "ninguna activa"}</p>
        </div>
        <Button size="sm" variant="primary" onClick={() => setForm({ ...NUEVA, playlist: [] })}>
          + Nueva escena
        </Button>
      </div>

      <div className="grid gap-2.5 md:grid-cols-2">
        {data.escenas.map((escena) => (
          <div
            key={escena.id}
            className={cn(
              "overflow-hidden rounded-xl border bg-white/[0.02] transition-colors",
              escena.activo ? "border-gold/50" : "border-line",
            )}
          >
            <div className="relative h-24" style={fondo(escena.bg)}>
              <div
                className="absolute inset-0"
                style={{
                  background: `radial-gradient(circle at 50% 30%, ${escena.light?.color ?? "#f5b544"}44, transparent 70%)`,
                  mixBlendMode: "screen",
                }}
              />
              <div className="absolute inset-0">
                {escena.tokens.slice(0, 8).map((t) => (
                  <span
                    key={t.id}
                    className="absolute -translate-x-1/2 -translate-y-1/2 text-base drop-shadow"
                    style={{ left: `${((t.x + 0.5) / data.grid.cols) * 100}%`, top: `${((t.y + 0.5) / data.grid.rows) * 100}%` }}
                  >
                    {t.emoji}
                  </span>
                ))}
              </div>
              <div className="absolute right-1.5 top-1.5 flex gap-1">
                {escena.activo ? <Badge color="gold">activa</Badge> : null}
                <Badge color="slate">{escena.tokens.length} tokens</Badge>
              </div>
            </div>
            <div className="space-y-1.5 p-2.5">
              <p className="font-display text-base leading-tight text-slate-100">{escena.nombre}</p>
              <p className="line-clamp-2 text-[10px] leading-relaxed text-slate-500">{escena.descripcion}</p>
              <div className="flex flex-wrap gap-1">
                {escena.playlist.map((id) => {
                  const s = data.sonidos.find((x) => x.id === id);
                  return s ? <Badge key={id} color="teal">🔊 {s.nombre}</Badge> : null;
                })}
                {!escena.playlist.length ? <span className="text-[9px] italic text-slate-600">sin playlist</span> : null}
              </div>
              <div className="flex flex-wrap gap-1 pt-1">
                {!escena.activo ? (
                  <Button
                    size="xs"
                    variant="primary"
                    loading={cargando === `activar-${escena.id}`}
                    onClick={() => void ejecutar("activar", { id: escena.id }, `Escena activa: ${escena.nombre}`)}
                  >
                    Activar
                  </Button>
                ) : (
                  <Badge color="gold">en vivo</Badge>
                )}
                <Button size="xs" variant="secondary" onClick={() => editar(escena)}>Editar</Button>
                <Button
                  size="xs"
                  variant="ghost"
                  disabled={escena.activo}
                  onClick={() => {
                    if (!window.confirm(`¿Borrar la escena «${escena.nombre}»?`)) return;
                    void ejecutar("borrar", { id: escena.id }, "Escena borrada");
                  }}
                >
                  Borrar
                </Button>
              </div>
            </div>
          </div>
        ))}
      </div>

      {!data.escenas.length ? (
        <Empty icon="🎭" title="Sin escenas">Crea la primera escena y actívala para el proyector.</Empty>
      ) : null}

      <Modal open={form !== null} onClose={() => setForm(null)} title={form?.id ? "Editar escena" : "Nueva escena"} wide>
        {form ? (
          <div className="space-y-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Nombre">
                <Input autoFocus value={form.nombre} onChange={(e) => setForm({ ...form, nombre: e.target.value })} />
              </Field>
              <Field label="Fondo (gradiente, color o url)">
                <Input value={form.bg} onChange={(e) => setForm({ ...form, bg: e.target.value })} className="font-mono text-[10px]" />
              </Field>
            </div>
            <div className="flex flex-wrap gap-1">
              {data.presets_bg.map((p) => (
                <button
                  key={p.nombre}
                  type="button"
                  onClick={() => setForm({ ...form, bg: p.valor })}
                  className={cn(
                    "rounded-md border px-2 py-1 text-[10px]",
                    form.bg === p.valor ? "border-gold/60 text-gold" : "border-line text-slate-400 hover:text-slate-200",
                  )}
                >
                  {p.nombre}
                </button>
              ))}
            </div>
            <Field label="Descripción">
              <Textarea value={form.descripcion} onChange={(e) => setForm({ ...form, descripcion: e.target.value })} />
            </Field>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Color de luz">
                <div className="flex items-center gap-2">
                  <input
                    type="color"
                    value={form.luzColor}
                    onChange={(e) => setForm({ ...form, luzColor: e.target.value })}
                    className="h-10 w-14 cursor-pointer rounded border border-line bg-transparent"
                  />
                  <Input value={form.luzColor} onChange={(e) => setForm({ ...form, luzColor: e.target.value })} className="font-mono" />
                </div>
              </Field>
              <Field label={`Opacidad de luz · ${Math.round(form.luzOpacidad * 100)}%`}>
                <input
                  type="range"
                  min={0}
                  max={0.9}
                  step={0.01}
                  value={form.luzOpacidad}
                  onChange={(e) => setForm({ ...form, luzOpacidad: Number(e.target.value) })}
                  className="mt-3 h-1 w-full accent-[#f5b544]"
                />
              </Field>
            </div>
            <Field label="Playlist de la escena">
              <div className="grid max-h-40 grid-cols-2 gap-1 overflow-y-auto rounded-lg border border-line bg-[#0a0d14] p-2">
                {data.sonidos.map((s) => {
                  const activo = form.playlist.includes(s.id);
                  return (
                    <button
                      key={s.id}
                      type="button"
                      onClick={() =>
                        setForm({
                          ...form,
                          playlist: activo
                            ? form.playlist.filter((id) => id !== s.id)
                            : [...form.playlist, s.id],
                        })
                      }
                      className={cn(
                        "flex items-center justify-between rounded-md border px-2 py-1 text-left text-[10px]",
                        activo ? "border-gold/40 bg-gold/10 text-gold" : "border-transparent text-slate-400 hover:bg-white/5",
                      )}
                    >
                      <span className="truncate">{s.nombre}</span>
                      <span className="ml-1 shrink-0 text-[9px] text-slate-600">{s.grupo}</span>
                    </button>
                  );
                })}
              </div>
            </Field>
            <div className="overflow-hidden rounded-xl border border-line">
              <SceneBoard
                escena={{
                  id: form.id ?? 0, nombre: form.nombre, descripcion: form.descripcion,
                  bg: form.bg, light: { color: form.luzColor, opacity: form.luzOpacidad },
                  tokens: form.id ? data.escenas.find((e) => e.id === form.id)?.tokens ?? [] : [],
                  playlist: form.playlist, activo: false, ts: "",
                }}
                grid={data.grid}
                readonly
                className="rounded-none border-0"
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setForm(null)}>Cancelar</Button>
              <Button variant="primary" onClick={() => void guardar()} loading={cargando === "crear" || cargando === "editar"}>
                {form.id ? "Guardar cambios" : "Crear escena"}
              </Button>
            </div>
          </div>
        ) : null}
      </Modal>
    </div>
  );
}
