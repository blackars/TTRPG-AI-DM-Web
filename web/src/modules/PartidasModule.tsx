"use client";

import { useRef, useState } from "react";
import { Badge, Button, Empty, ErrorBox, Field, Input, Modal } from "@/components/ui";
import { API_URL, api, errorTexto } from "@/lib/api";
import { bytes, fechaCorta } from "@/lib/format";
import { useAppStore } from "@/lib/store";
import { useApi } from "@/lib/useApi";
import type { ModuleProps } from "./types";

interface Resumen {
  personajes: number;
  items: number;
  escenas: number;
  tiradas: number;
  mensajes_ia: number;
  npcs: number;
  pantallas: number;
  sonidos: number;
}

interface Partida {
  id: number;
  nombre: string;
  ts: string;
  bytes: number;
  resumen: Resumen;
}

interface PartidasData {
  partidas: Partida[];
  total: number;
}

export function PartidasModule(_props: ModuleProps) {
  const { data, setData, error } = useApi<PartidasData>("/api/modules/partidas/state");
  const [nombre, setNombre] = useState("");
  const [cargando, setCargando] = useState<string | null>(null);
  const [errorLocal, setErrorLocal] = useState<string | null>(null);
  const [importando, setImportando] = useState(false);
  const [confirmar, setConfirmar] = useState<Partida | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const bump = useAppStore((s) => s.bump);
  const notify = useAppStore((s) => s.notify);

  async function ejecutar(accion: string, payload: Record<string, unknown>, mensaje?: string) {
    setCargando(accion);
    setErrorLocal(null);
    try {
      const res = await api.post<PartidasData>("/api/modules/partidas/action", { action: accion, ...payload });
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

  async function guardar() {
    if (!nombre.trim()) {
      setErrorLocal("Ponle un nombre a la partida antes de guardar.");
      return;
    }
    const ok = await ejecutar("guardar", { nombre: nombre.trim() }, "Partida guardada");
    if (ok) setNombre("");
  }

  async function cargar(partida: Partida) {
    setConfirmar(null);
    const ok = await ejecutar("cargar", { id: partida.id }, `Partida cargada: ${partida.nombre}`);
    if (ok) {
      window.setTimeout(() => window.location.assign("/pantalla/mesa"), 550);
    }
  }

  async function exportar(partida: Partida) {
    setErrorLocal(null);
    try {
      const res = await fetch(`${API_URL}/api/saves/${partida.id}/export`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `ttrpg_${partida.nombre.replace(/[^\w-]+/g, "_")}.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      notify("Partida exportada en JSON");
    } catch (e) {
      setErrorLocal(`No se pudo exportar: ${errorTexto(e)}`);
    }
  }

  async function importarArchivo(file: File) {
    setImportando(true);
    setErrorLocal(null);
    try {
      const texto = await file.text();
      const json = JSON.parse(texto) as Record<string, unknown>;
      const res = await api.post<PartidasData>("/api/saves/import", json);
      setData(res);
      bump();
      notify("Partida importada y restaurada");
      window.setTimeout(() => window.location.assign("/pantalla/mesa"), 650);
    } catch (e) {
      setErrorLocal(`Importación fallida: ${errorTexto(e)}`);
    } finally {
      setImportando(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  if (error) return <ErrorBox>{error}</ErrorBox>;
  if (!data) return <div className="h-48 animate-pulse rounded-xl bg-white/5" />;

  return (
    <div className="space-y-3">
      {errorLocal ? <ErrorBox>{errorLocal}</ErrorBox> : null}

      <div className="rounded-xl border border-gold/25 bg-gold/[0.05] p-3">
        <p className="text-[9px] uppercase tracking-[0.25em] text-gold/70">Nueva instantánea</p>
        <div className="mt-2 flex flex-wrap items-end gap-2">
          <Field label="Nombre de la partida" className="min-w-[180px] flex-1">
            <Input
              value={nombre}
              onChange={(e) => setNombre(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") void guardar();
              }}
              placeholder={`Sesión del ${new Date().toLocaleDateString("es-ES")}`}
            />
          </Field>
          <Button variant="primary" loading={cargando === "guardar"} onClick={() => void guardar()}>
            💾 Guardar ahora
          </Button>
        </div>
        <p className="mt-1.5 text-[10px] text-slate-500">
          Guarda personajes, inventario, escenas, pantallas, reglas, NPCs, sonidos y memoria del asistente.
        </p>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-[9px] uppercase tracking-[0.25em] text-slate-500">
          Archivo de partidas · {data.total}
        </p>
        <div className="flex gap-1.5">
          <input
            ref={inputRef}
            type="file"
            accept="application/json,.json"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void importarArchivo(file);
            }}
          />
          <Button size="sm" variant="secondary" loading={importando} onClick={() => inputRef.current?.click()}>
            📥 Importar JSON
          </Button>
        </div>
      </div>

      {!data.partidas.length ? (
        <Empty icon="💾" title="Sin partidas guardadas">
          Guarda una instantánea antes de experimentar con la mesa. Puedes volver a ella en cualquier momento.
        </Empty>
      ) : (
        <div className="grid gap-2 md:grid-cols-2">
          {data.partidas.map((partida) => (
            <div key={partida.id} className="rounded-xl border border-line bg-white/[0.02] p-2.5">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-slate-100">{partida.nombre}</p>
                  <p className="text-[9px] text-slate-500">
                    {fechaCorta(partida.ts)} · {bytes(partida.bytes)}
                  </p>
                </div>
                <Badge color="slate">#{partida.id}</Badge>
              </div>

              <div className="mt-2 grid grid-cols-4 gap-1 text-center">
                {[
                  ["🧙", partida.resumen.personajes],
                  ["🎒", partida.resumen.items],
                  ["🎭", partida.resumen.escenas],
                  ["🎲", partida.resumen.tiradas],
                ].map(([icono, valor]) => (
                  <div key={String(icono)} className="rounded-md border border-line/70 bg-ink/40 py-1">
                    <p className="text-[10px]">{icono}</p>
                    <p className="font-mono text-[10px] text-slate-300">{valor}</p>
                  </div>
                ))}
              </div>

              <div className="mt-2 flex flex-wrap justify-end gap-1">
                <Button
                  size="xs"
                  variant="primary"
                  loading={cargando === "cargar"}
                  onClick={() => setConfirmar(partida)}
                >
                  Cargar
                </Button>
                <Button size="xs" variant="secondary" onClick={() => void exportar(partida)}>
                  Exportar
                </Button>
                <Button
                  size="xs"
                  variant="ghost"
                  className="text-red-300/70 hover:text-red-200"
                  onClick={() => {
                    if (!window.confirm(`¿Borrar la partida «${partida.nombre}»?`)) return;
                    void ejecutar("borrar", { id: partida.id }, "Partida borrada");
                  }}
                >
                  Borrar
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      <Modal open={confirmar !== null} onClose={() => setConfirmar(null)} title="Cargar partida">
        {confirmar ? (
          <div className="space-y-3">
            <p className="text-sm leading-relaxed text-slate-300">
              Vas a restaurar <span className="text-gold">{confirmar.nombre}</span>. Se sustituirá
              toda la mesa actual: personajes, escenas, pantallas y conversaciones.
            </p>
            <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-200">
              Esta acción no se puede deshacer. Guarda una instantánea de la mesa actual si la necesitas.
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setConfirmar(null)}>Cancelar</Button>
              <Button variant="primary" onClick={() => void cargar(confirmar)}>Cargar y restaurar</Button>
            </div>
          </div>
        ) : null}
      </Modal>
    </div>
  );
}
