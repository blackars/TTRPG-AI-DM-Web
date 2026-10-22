"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { Badge, Button, ErrorBox, Field, Input, Select } from "@/components/ui";
import { api, errorTexto } from "@/lib/api";
import { cn } from "@/lib/format";
import { useAppStore } from "@/lib/store";
import { useApi } from "@/lib/useApi";
import type { Instancia, ModuleMetaApi, PantallaData, Slot } from "@/lib/types";
import type { ModuleProps } from "./types";

const SLOTS: Array<{ id: Slot; nombre: string }> = [
  { id: "principal", nombre: "Principal" },
  { id: "lateral", nombre: "Lateral" },
  { id: "inferior", nombre: "Inferior" },
  { id: "overlay", nombre: "Overlay" },
];

interface ModulosResp {
  modulos: ModuleMetaApi[];
}

export function EditorModule({ pantalla }: ModuleProps) {
  const router = useRouter();
  const { data, error, refrescar } = useApi<PantallaData>(`/api/screens/${pantalla}`);
  const { data: catalogo } = useApi<ModulosResp>("/api/modules");
  const [nombrePantalla, setNombrePantalla] = useState("");
  const [editandoNombre, setEditandoNombre] = useState(false);
  const [nuevaPantalla, setNuevaPantalla] = useState("");
  const [creando, setCreando] = useState(false);
  const [moduloNuevo, setModuloNuevo] = useState("dado");
  const [slotNuevo, setSlotNuevo] = useState<Slot>("principal");
  const [cargando, setCargando] = useState<string | null>(null);
  const [errorLocal, setErrorLocal] = useState<string | null>(null);
  const bump = useAppStore((s) => s.bump);
  const notify = useAppStore((s) => s.notify);

  const metas = useMemo(() => {
    const mapa = new Map<string, ModuleMetaApi>();
    (catalogo?.modulos ?? []).forEach((m) => mapa.set(m.id, m));
    return mapa;
  }, [catalogo]);

  const disponibles = useMemo(() => {
    const actuales = new Set((data?.instancias ?? []).map((i) => i.module_id));
    return (catalogo?.modulos ?? []).filter((m) => !m.singleton || !actuales.has(m.id));
  }, [catalogo, data]);

  async function recargar() {
    await refrescar(true);
    bump();
  }

  async function accion<T>(clave: string, fn: () => Promise<T>, mensaje?: string) {
    setCargando(clave);
    setErrorLocal(null);
    try {
      await fn();
      await recargar();
      if (mensaje) notify(mensaje);
      return true;
    } catch (e) {
      setErrorLocal(errorTexto(e));
      return false;
    } finally {
      setCargando(null);
    }
  }

  if (error) return <ErrorBox>{error}</ErrorBox>;
  if (!data) return <div className="h-48 animate-pulse rounded-xl bg-white/5" />;

  const screen = data.pantalla;
  const porSlot = (slot: Slot) =>
    data.instancias
      .filter((i) => i.slot === slot)
      .sort((a, b) => a.orden - b.orden || a.id - b.id);

  async function mover(inst: Instancia, direccion: -1 | 1) {
    const hermanos = porSlot(inst.slot as Slot);
    const indice = hermanos.findIndex((h) => h.id === inst.id);
    const destino = hermanos[indice + direccion];
    if (!destino) return;
    await accion(`mover-${inst.id}`, async () => {
      await api.patch(`/api/screens/${screen.id}/instances/${inst.id}`, { orden: destino.orden });
      await api.patch(`/api/screens/${screen.id}/instances/${destino.id}`, { orden: inst.orden });
    });
  }

  async function cambiarSlot(inst: Instancia, slot: Slot) {
    await accion(`slot-${inst.id}`, () =>
      api.patch(`/api/screens/${screen.id}/instances/${inst.id}`, { slot }),
    );
  }

  async function alternarColapso(inst: Instancia) {
    await accion(`col-${inst.id}`, () =>
      api.patch(`/api/screens/${screen.id}/instances/${inst.id}`, { collapsed: !inst.collapsed }),
    );
  }

  async function quitar(inst: Instancia) {
    const meta = metas.get(inst.module_id);
    if (!window.confirm(`¿Quitar «${meta?.nombre ?? inst.module_id}» de esta pantalla?`)) return;
    await accion(`quitar-${inst.id}`, () =>
      api.del(`/api/screens/${screen.id}/instances/${inst.id}`),
    "Módulo retirado de la pantalla");
  }

  async function agregar() {
    const meta = metas.get(moduloNuevo);
    if (!meta) return;
    const slot = meta.overlay ? "overlay" : slotNuevo;
    const ok = await accion("agregar", () =>
      api.post(`/api/screens/${screen.id}/instances`, { module_id: moduloNuevo, slot }),
    "Módulo añadido a la pantalla");
    if (ok) setModuloNuevo(disponibles[0]?.id ?? "dado");
  }

  async function renombrar() {
    if (!nombrePantalla.trim()) return;
    const ok = await accion("renombrar", () =>
      api.patch(`/api/screens/${screen.id}`, { nombre: nombrePantalla.trim() }),
    "Pantalla renombrada");
    if (ok) setEditandoNombre(false);
  }

  async function crearPantalla() {
    if (!nuevaPantalla.trim()) return;
    setCreando(true);
    setErrorLocal(null);
    try {
      const res = await api.post<{ slug: string; nombre: string }>("/api/screens", {
        nombre: nuevaPantalla.trim(),
      });
      bump();
      notify(`Pantalla creada: ${res.nombre}`);
      setNuevaPantalla("");
      router.push(`/pantalla/${res.slug}`);
    } catch (e) {
      setErrorLocal(errorTexto(e));
    } finally {
      setCreando(false);
    }
  }

  return (
    <div className="space-y-2.5">
      {errorLocal ? <ErrorBox>{errorLocal}</ErrorBox> : null}

      <div className="rounded-xl border border-line bg-white/[0.02] p-2.5">
        {editandoNombre ? (
          <div className="flex items-end gap-1.5">
            <Field label="Nombre de la pantalla" className="flex-1">
              <Input
                autoFocus
                value={nombrePantalla}
                onChange={(e) => setNombrePantalla(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") void renombrar();
                  if (e.key === "Escape") setEditandoNombre(false);
                }}
                className="h-8 py-1 text-xs"
              />
            </Field>
            <Button size="sm" variant="primary" loading={cargando === "renombrar"} onClick={() => void renombrar()}>✓</Button>
            <Button size="sm" variant="ghost" onClick={() => setEditandoNombre(false)}>✕</Button>
          </div>
        ) : (
          <div className="flex items-center justify-between gap-2">
            <div className="min-w-0">
              <p className="text-[9px] uppercase tracking-[0.22em] text-slate-500">Pantalla actual</p>
              <p className="truncate font-display text-base text-slate-100">{screen.nombre}</p>
              <p className="truncate font-mono text-[9px] text-slate-600">/pantalla/{screen.slug}</p>
            </div>
            <Button
              size="xs"
              variant="secondary"
              onClick={() => {
                setNombrePantalla(screen.nombre);
                setEditandoNombre(true);
              }}
            >
              Renombrar
            </Button>
          </div>
        )}
      </div>

      <div className="rounded-xl border border-gold/25 bg-gold/[0.04] p-2.5">
        <p className="mb-1.5 text-[9px] uppercase tracking-[0.22em] text-gold/70">Añadir módulo</p>
        <div className="flex items-end gap-1.5">
          <Field label="Módulo" className="flex-1">
            <Select
              value={moduloNuevo}
              onChange={(e) => {
                setModuloNuevo(e.target.value);
                const meta = metas.get(e.target.value);
                if (meta) setSlotNuevo(meta.overlay ? "overlay" : meta.slot);
              }}
              className="h-8 py-1 text-[11px]"
            >
              {disponibles.map((m) => (
                <option key={m.id} value={m.id}>{m.icono} {m.nombre}</option>
              ))}
              {!disponibles.length ? <option value="">Todos los módulos ya están</option> : null}
            </Select>
          </Field>
          <Field label="Slot">
            <Select
              value={slotNuevo}
              onChange={(e) => setSlotNuevo(e.target.value as Slot)}
              className="h-8 w-24 py-1 text-[11px]"
              disabled={metas.get(moduloNuevo)?.overlay}
            >
              {SLOTS.map((s) => <option key={s.id} value={s.id}>{s.nombre}</option>)}
            </Select>
          </Field>
          <Button
            size="sm"
            variant="primary"
            loading={cargando === "agregar"}
            disabled={!disponibles.length}
            onClick={() => void agregar()}
          >
            +
          </Button>
        </div>
      </div>

      <div className="max-h-[42vh] space-y-2 overflow-y-auto pr-1">
        {SLOTS.map((slot) => {
          const instancias = porSlot(slot.id);
          return (
            <div key={slot.id}>
              <div className="mb-1 flex items-center justify-between">
                <p className="text-[9px] uppercase tracking-[0.22em] text-slate-500">{slot.nombre}</p>
                <Badge color="slate">{instancias.length}</Badge>
              </div>
              {!instancias.length ? (
                <p className="rounded-lg border border-dashed border-line px-2 py-1.5 text-[9px] italic text-slate-600">
                  Slot vacío
                </p>
              ) : (
                <div className="space-y-1">
                  {instancias.map((inst, i) => {
                    const meta = metas.get(inst.module_id);
                    const fijo = slot.id === "overlay" && ["asistente", "editor"].includes(inst.module_id);
                    return (
                      <div
                        key={inst.id}
                        className={cn(
                          "rounded-lg border px-2 py-1.5",
                          inst.collapsed ? "border-line/60 bg-white/[0.01]" : "border-line bg-white/[0.02]",
                        )}
                      >
                        <div className="flex items-center gap-1.5">
                          <span className="text-sm">{meta?.icono ?? "🧩"}</span>
                          <span className="min-w-0 flex-1 truncate text-[11px] text-slate-200">
                            {meta?.nombre ?? inst.module_id}
                          </span>
                          <span className="font-mono text-[8px] text-slate-600">#{inst.id}</span>
                        </div>
                        <div className="mt-1 flex flex-wrap items-center gap-0.5">
                          <button
                            type="button"
                            onClick={() => void mover(inst, -1)}
                            disabled={i === 0}
                            className="rounded px-1 text-[10px] text-slate-500 hover:text-gold disabled:opacity-25"
                            title="Subir"
                          >
                            ↑
                          </button>
                          <button
                            type="button"
                            onClick={() => void mover(inst, 1)}
                            disabled={i === instancias.length - 1}
                            className="rounded px-1 text-[10px] text-slate-500 hover:text-gold disabled:opacity-25"
                            title="Bajar"
                          >
                            ↓
                          </button>
                          {!meta?.overlay ? (
                            <Select
                              value={inst.slot}
                              onChange={(e) => void cambiarSlot(inst, e.target.value as Slot)}
                              className="h-6 w-20 px-1 py-0 text-[9px]"
                              title="Mover de slot"
                            >
                              {SLOTS.filter((s) => s.id !== "overlay").map((s) => (
                                <option key={s.id} value={s.id}>{s.nombre}</option>
                              ))}
                            </Select>
                          ) : null}
                          <button
                            type="button"
                            onClick={() => void alternarColapso(inst)}
                            className="rounded px-1 text-[9px] text-slate-500 hover:text-gold"
                            title={inst.collapsed ? "Expandir" : "Colapsar"}
                          >
                            {inst.collapsed ? "▣" : "▤"}
                          </button>
                          <button
                            type="button"
                            onClick={() => void quitar(inst)}
                            disabled={fijo}
                            className="ml-auto rounded px-1 text-[10px] text-slate-500 hover:text-red-300 disabled:opacity-20"
                            title={fijo ? "Este módulo es parte del chasis" : "Quitar"}
                          >
                            ✕
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div className="rounded-xl border border-dashed border-line p-2.5">
        <p className="mb-1.5 text-[9px] uppercase tracking-[0.22em] text-slate-500">Nueva pantalla</p>
        <div className="flex gap-1.5">
          <Input
            value={nuevaPantalla}
            onChange={(e) => setNuevaPantalla(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") void crearPantalla();
            }}
            placeholder="Ej. Combate nocturno"
            className="h-8 py-1 text-xs"
          />
          <Button size="sm" variant="secondary" loading={creando} onClick={() => void crearPantalla()}>
            Crear
          </Button>
        </div>
        <p className="mt-1 text-[9px] leading-relaxed text-slate-600">
          Toda pantalla nueva nace con los overlays de asistente, sonido y este editor.
        </p>
      </div>
    </div>
  );
}
