"use client";

import { useState } from "react";
import { Badge, Button, Empty, ErrorBox, Field, Input, Modal, Textarea } from "@/components/ui";
import { api, errorTexto } from "@/lib/api";
import { useAppStore } from "@/lib/store";
import { useApi } from "@/lib/useApi";
import type { ModuleProps } from "./types";

interface Npc {
  id: number;
  nombre: string;
  voz: string;
  tono: string;
  frases: string[];
  notas: string;
  ts: string;
}

interface NpcsData {
  npcs: Npc[];
  total: number;
}

interface FormNpc {
  id?: number;
  nombre: string;
  voz: string;
  tono: string;
  frases: string;
  notas: string;
}

const NUEVO: FormNpc = { nombre: "", voz: "", tono: "", frases: "", notas: "" };

export function NpcsModule(_props: ModuleProps) {
  const { data, setData, error } = useApi<NpcsData>("/api/modules/npcs/state");
  const [form, setForm] = useState<FormNpc | null>(null);
  const [gen, setGen] = useState<{ npc: Npc; situacion: string; texto: string; proveedor: string } | null>(null);
  const [cargando, setCargando] = useState<string | null>(null);
  const [generando, setGenerando] = useState(false);
  const [errorLocal, setErrorLocal] = useState<string | null>(null);
  const bump = useAppStore((s) => s.bump);
  const notify = useAppStore((s) => s.notify);

  async function ejecutar(accion: string, payload: Record<string, unknown>, mensaje?: string) {
    setCargando(accion);
    setErrorLocal(null);
    try {
      const res = await api.post<NpcsData>("/api/modules/npcs/action", { action: accion, ...payload });
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
    if (!form || !form.nombre.trim()) return;
    const frases = form.frases.split("\n").map((f) => f.trim()).filter(Boolean);
    const payload = {
      nombre: form.nombre.trim(),
      voz: form.voz,
      tono: form.tono,
      frases,
      notas: form.notas,
    };
    const ok = form.id
      ? await ejecutar("editar", { id: form.id, ...payload }, "NPC actualizado")
      : await ejecutar("crear", payload, "NPC creado");
    if (ok) setForm(null);
  }

  async function redactar() {
    if (!gen) return;
    setGenerando(true);
    setErrorLocal(null);
    try {
      const res = await api.post<{ texto: string; proveedor: string }>("/api/assistant/npc_text", {
        npc_id: gen.npc.id,
        situacion: gen.situacion,
      });
      setGen({ ...gen, texto: res.texto, proveedor: res.proveedor });
      bump();
    } catch (e) {
      setErrorLocal(errorTexto(e));
    } finally {
      setGenerando(false);
    }
  }

  if (error) return <ErrorBox>{error}</ErrorBox>;
  if (!data) return <div className="h-48 animate-pulse rounded-xl bg-white/5" />;

  return (
    <div className="space-y-2.5">
      {errorLocal ? <ErrorBox>{errorLocal}</ErrorBox> : null}

      <div className="flex items-center justify-between gap-2">
        <p className="text-[9px] uppercase tracking-[0.25em] text-slate-500">
          Reparto · {data.total} NPCs
        </p>
        <Button size="xs" variant="primary" onClick={() => setForm({ ...NUEVO })}>+ NPC</Button>
      </div>

      {!data.npcs.length ? (
        <Empty icon="💬" title="Sin NPCs">Crea una voz para esta mesa; la IA respetará su tono.</Empty>
      ) : (
        <div className="max-h-[52vh] space-y-1.5 overflow-y-auto pr-1">
          {data.npcs.map((npc) => (
            <div key={npc.id} className="rounded-xl border border-line bg-white/[0.02] p-2.5">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-slate-100">{npc.nombre}</p>
                  <p className="truncate text-[10px] text-slate-400">{npc.voz || "voz sin definir"}</p>
                </div>
                <Badge color="violet">NPC</Badge>
              </div>
              {npc.tono ? (
                <p className="mt-1 line-clamp-2 text-[10px] leading-relaxed text-slate-500">{npc.tono}</p>
              ) : null}
              {npc.frases.length ? (
                <p className="mt-1.5 border-l-2 border-violet-500/40 pl-2 text-[10px] italic leading-relaxed text-slate-400">
                  «{npc.frases[0]}»
                </p>
              ) : null}
              <div className="mt-1.5 flex flex-wrap justify-end gap-1">
                <Button
                  size="xs"
                  variant="secondary"
                  onClick={() => setGen({ npc, situacion: "", texto: "", proveedor: "" })}
                >
                  ✨ Redactar
                </Button>
                <Button
                  size="xs"
                  variant="ghost"
                  onClick={() =>
                    setForm({
                      id: npc.id, nombre: npc.nombre, voz: npc.voz, tono: npc.tono,
                      frases: npc.frases.join("\n"), notas: npc.notas,
                    })
                  }
                >
                  Editar
                </Button>
                <Button
                  size="xs"
                  variant="ghost"
                  className="text-red-300/70 hover:text-red-200"
                  onClick={() => {
                    if (!window.confirm(`¿Borrar a ${npc.nombre}?`)) return;
                    void ejecutar("borrar", { id: npc.id }, "NPC borrado");
                  }}
                >
                  ✕
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      <Modal open={form !== null} onClose={() => setForm(null)} title={form?.id ? "Editar NPC" : "Nuevo NPC"} wide>
        {form ? (
          <div className="space-y-3">
            <Field label="Nombre">
              <Input autoFocus value={form.nombre} onChange={(e) => setForm({ ...form, nombre: e.target.value })} />
            </Field>
            <div className="grid gap-2 sm:grid-cols-2">
              <Field label="Voz" hint="timbre, acento…">
                <Input value={form.voz} onChange={(e) => setForm({ ...form, voz: e.target.value })} />
              </Field>
              <Field label="Tono" hint="actitud y límites">
                <Input value={form.tono} onChange={(e) => setForm({ ...form, tono: e.target.value })} />
              </Field>
            </div>
            <Field label="Frases habituales" hint="una por línea">
              <Textarea
                value={form.frases}
                onChange={(e) => setForm({ ...form, frases: e.target.value })}
                placeholder={"La ceniza recuerda lo que vosotros olvidáis.\nNo preguntéis quién abrió la puerta."}
              />
            </Field>
            <Field label="Notas privadas">
              <Textarea value={form.notas} onChange={(e) => setForm({ ...form, notas: e.target.value })} />
            </Field>
            <div className="flex justify-end gap-2 pt-1">
              <Button variant="ghost" onClick={() => setForm(null)}>Cancelar</Button>
              <Button variant="primary" onClick={() => void guardar()} loading={cargando === "crear" || cargando === "editar"}>
                {form.id ? "Guardar NPC" : "Crear NPC"}
              </Button>
            </div>
          </div>
        ) : null}
      </Modal>

      <Modal open={gen !== null} onClose={() => setGen(null)} title={gen ? `Redactar para ${gen.npc.nombre}` : "Redactar"} wide>
        {gen ? (
          <div className="space-y-3">
            <div className="flex flex-wrap gap-1">
              <Badge color="violet">{gen.npc.voz || "voz libre"}</Badge>
              {gen.proveedor ? <Badge color="slate">{gen.proveedor}</Badge> : null}
            </div>
            <Field label="Situación" hint="qué acaba de pasar">
              <Textarea
                value={gen.situacion}
                onChange={(e) => setGen({ ...gen, situacion: e.target.value })}
                placeholder="El grupo le muestra el amuleto de jade y le exige respuestas."
              />
            </Field>
            <Button variant="primary" className="w-full" loading={generando} onClick={() => void redactar()}>
              ✨ Generar diálogo
            </Button>
            {gen.texto ? (
              <div className="rounded-xl border border-gold/30 bg-gold/[0.05] p-3">
                <p className="whitespace-pre-wrap text-sm leading-relaxed text-slate-100">{gen.texto}</p>
                <div className="mt-2 flex justify-end">
                  <Button
                    size="xs"
                    variant="secondary"
                    onClick={async () => {
                      try {
                        await navigator.clipboard.writeText(gen.texto);
                        notify("Diálogo copiado");
                      } catch {
                        notify("No se pudo copiar", "error");
                      }
                    }}
                  >
                    Copiar
                  </Button>
                </div>
              </div>
            ) : null}
          </div>
        ) : null}
      </Modal>
    </div>
  );
}
