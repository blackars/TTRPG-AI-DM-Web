"use client";

import { useEffect, useState } from "react";
import { Badge, Button, Empty, EmojiPicker, ErrorBox, Field, HpBar, Input, Modal, Select, Textarea } from "@/components/ui";
import { api, errorTexto } from "@/lib/api";
import { cn } from "@/lib/format";
import { useAppStore } from "@/lib/store";
import { useApi } from "@/lib/useApi";
import type { ModuleProps } from "./types";

interface Personaje {
  id: number;
  nombre: string;
  kind: "personaje" | "criatura" | string;
  emoji: string;
  hp: number;
  hp_max: number;
  notas: string;
  stats: Record<string, string | number>;
  en_escena: boolean;
  created_at: string;
}

interface PersonajesData {
  personajes: Personaje[];
  escena_activa: { id: number; nombre: string } | null;
}

interface FormPersonaje {
  id?: number;
  nombre: string;
  kind: "personaje" | "criatura";
  emoji: string;
  hp: number;
  hp_max: number;
  notas: string;
  stats: Array<{ k: string; v: string }>;
}

const NUEVO: FormPersonaje = {
  nombre: "",
  kind: "personaje",
  emoji: "🧙",
  hp: 10,
  hp_max: 10,
  notas: "",
  stats: [],
};

function aForm(p: Personaje): FormPersonaje {
  return {
    id: p.id,
    nombre: p.nombre,
    kind: p.kind === "criatura" ? "criatura" : "personaje",
    emoji: p.emoji,
    hp: p.hp,
    hp_max: p.hp_max,
    notas: p.notas,
    stats: Object.entries(p.stats || {}).map(([k, v]) => ({ k, v: String(v) })),
  };
}

export function PersonajesModule(_props: ModuleProps) {
  const { data, setData, error } = useApi<PersonajesData>("/api/modules/personajes/state");
  const [form, setForm] = useState<FormPersonaje | null>(null);
  const [cargando, setCargando] = useState<string | null>(null);
  const [errorLocal, setErrorLocal] = useState<string | null>(null);
  const [filtro, setFiltro] = useState<"todos" | "personaje" | "criatura">("todos");
  const selected = useAppStore((s) => s.selectedCharacterId);
  const setSelected = useAppStore((s) => s.setSelectedCharacter);
  const bump = useAppStore((s) => s.bump);
  const notify = useAppStore((s) => s.notify);

  useEffect(() => {
    if (!selected && data?.personajes.length) {
      const primero = data.personajes.find((p) => p.kind === "personaje") ?? data.personajes[0];
      setSelected(primero.id);
    }
  }, [data, selected, setSelected]);

  async function ejecutar(accion: string, payload: Record<string, unknown>, mensaje?: string) {
    setCargando(accion);
    setErrorLocal(null);
    try {
      const res = await api.post<PersonajesData>("/api/modules/personajes/action", {
        action: accion,
        ...payload,
      });
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

  async function cambiarHp(p: Personaje, delta: number) {
    const hp = Math.max(0, Math.min(p.hp_max, p.hp + delta));
    if (hp === p.hp) return;
    await ejecutar("editar", { id: p.id, hp }, `${p.nombre}: ${hp}/${p.hp_max} HP`);
  }

  async function guardar() {
    if (!form || !form.nombre.trim()) return;
    const stats: Record<string, string> = {};
    form.stats.forEach((s) => {
      if (s.k.trim()) stats[s.k.trim()] = s.v;
    });
    const payload = {
      nombre: form.nombre.trim(),
      kind: form.kind,
      emoji: form.emoji,
      hp: form.hp,
      hp_max: form.hp_max,
      notas: form.notas,
      stats,
    };
    const ok = form.id
      ? await ejecutar("editar", { id: form.id, ...payload }, "Ficha actualizada")
      : await ejecutar("crear", payload, "Personaje creado");
    if (ok) setForm(null);
  }

  if (error) return <ErrorBox>{error}</ErrorBox>;
  if (!data) return <div className="h-48 animate-pulse rounded-xl bg-white/5" />;

  const visibles = data.personajes.filter((p) => filtro === "todos" || p.kind === filtro);

  return (
    <div className="space-y-2.5">
      {errorLocal ? <ErrorBox>{errorLocal}</ErrorBox> : null}

      <div className="flex flex-wrap items-center justify-between gap-1.5">
        <div className="flex overflow-hidden rounded-lg border border-line">
          {(["todos", "personaje", "criatura"] as const).map((f) => (
            <button
              key={f}
              type="button"
              onClick={() => setFiltro(f)}
              className={cn(
                "px-2 py-1 text-[10px] capitalize transition-colors",
                filtro === f ? "bg-gold/15 text-gold" : "text-slate-500 hover:text-slate-200",
              )}
            >
              {f}
            </button>
          ))}
        </div>
        <Button size="xs" variant="primary" onClick={() => setForm({ ...NUEVO })}>+ Ficha</Button>
      </div>

      {!visibles.length ? (
        <Empty icon="🧙" title="Sin fichas">Crea un personaje o una criatura para esta mesa.</Empty>
      ) : (
        <div className="max-h-[52vh] space-y-1.5 overflow-y-auto pr-1">
          {visibles.map((p) => (
            <div
              key={p.id}
              className={cn(
                "rounded-xl border p-2 transition-colors",
                selected === p.id ? "border-gold/40 bg-gold/[0.05]" : "border-line bg-white/[0.02]",
              )}
            >
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setSelected(p.id)}
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-white/10 bg-ink text-lg"
                  title="Seleccionar para el inventario"
                >
                  {p.emoji}
                </button>
                <button
                  type="button"
                  onClick={() => setForm(aForm(p))}
                  className="min-w-0 flex-1 text-left"
                  title="Editar ficha"
                >
                  <div className="flex items-center gap-1.5">
                    <span className="truncate text-xs font-semibold text-slate-100">{p.nombre}</span>
                    <Badge color={p.kind === "criatura" ? "red" : "teal"}>{p.kind}</Badge>
                    {p.en_escena ? <Badge color="gold">tablero</Badge> : null}
                  </div>
                  <p className="truncate text-[9px] text-slate-500">
                    {Object.entries(p.stats || {}).slice(0, 3).map(([k, v]) => `${k} ${v}`).join(" · ") || "sin stats"}
                  </p>
                </button>
                <div className="flex shrink-0 items-center gap-0.5">
                  <button
                    type="button"
                    onClick={() => void cambiarHp(p, -1)}
                    className="h-6 w-6 rounded border border-line text-xs text-red-300 hover:border-red-500/40"
                    title="Restar 1 HP"
                  >
                    −
                  </button>
                  <span className="w-11 text-center font-mono text-[10px] text-slate-300">
                    {p.hp}/{p.hp_max}
                  </span>
                  <button
                    type="button"
                    onClick={() => void cambiarHp(p, 1)}
                    className="h-6 w-6 rounded border border-line text-xs text-emerald-300 hover:border-emerald-500/40"
                    title="Sumar 1 HP"
                  >
                    +
                  </button>
                </div>
              </div>
              <div className="mt-1.5">
                <HpBar hp={p.hp} hpMax={p.hp_max} />
              </div>
              <div className="mt-1.5 flex flex-wrap items-center justify-end gap-1">
                <Button
                  size="xs"
                  variant="ghost"
                  disabled={p.en_escena || !data.escena_activa}
                  loading={cargando === `enviar-${p.id}`}
                  onClick={() => void ejecutar("enviar_a_escena", { id: p.id }, `${p.nombre} enviado al tablero`)}
                >
                  {p.en_escena ? "En tablero" : "→ Tablero"}
                </Button>
                <Button size="xs" variant="ghost" onClick={() => setForm(aForm(p))}>Editar</Button>
                <Button
                  size="xs"
                  variant="ghost"
                  className="text-red-300/70 hover:text-red-200"
                  onClick={() => {
                    if (!window.confirm(`¿Borrar la ficha de ${p.nombre}? También se borrará su inventario.`)) return;
                    void ejecutar("borrar", { id: p.id }, "Ficha borrada");
                  }}
                >
                  ✕
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      <p className="text-[9px] text-slate-600">
        {data.escena_activa ? `Tablero: ${data.escena_activa.nombre}` : "Sin escena activa para enviar tokens."}
      </p>

      <Modal open={form !== null} onClose={() => setForm(null)} title={form?.id ? "Editar ficha" : "Nueva ficha"} wide>
        {form ? (
          <div className="space-y-3">
            <div className="flex items-end gap-2">
              <div className="flex h-12 w-12 items-center justify-center rounded-xl border border-line bg-ink text-2xl">
                {form.emoji}
              </div>
              <Field label="Nombre" className="flex-1">
                <Input autoFocus value={form.nombre} onChange={(e) => setForm({ ...form, nombre: e.target.value })} />
              </Field>
              <Field label="Tipo">
                <Select
                  value={form.kind}
                  onChange={(e) => setForm({ ...form, kind: e.target.value as FormPersonaje["kind"] })}
                  className="w-32"
                >
                  <option value="personaje">personaje</option>
                  <option value="criatura">criatura</option>
                </Select>
              </Field>
            </div>

            <EmojiPicker value={form.emoji} onChange={(emoji) => setForm({ ...form, emoji })} />

            <div className="grid grid-cols-2 gap-2">
              <Field label="HP actual">
                <Input
                  type="number"
                  min={0}
                  max={form.hp_max}
                  value={form.hp}
                  onChange={(e) => setForm({ ...form, hp: Math.max(0, Number(e.target.value) || 0) })}
                  className="font-mono"
                />
              </Field>
              <Field label="HP máximo">
                <Input
                  type="number"
                  min={1}
                  value={form.hp_max}
                  onChange={(e) => setForm({ ...form, hp_max: Math.max(1, Number(e.target.value) || 1) })}
                  className="font-mono"
                />
              </Field>
            </div>

            <Field label="Notas de ficha">
              <Textarea
                value={form.notas}
                onChange={(e) => setForm({ ...form, notas: e.target.value })}
                placeholder="Trasfondo, secretos, deudas…"
              />
            </Field>

            <Field label="Estadísticas libres" hint="FUE, DES, ataque, defensa…">
              <div className="space-y-1.5">
                {form.stats.map((s, i) => (
                  <div key={i} className="flex gap-1.5">
                    <Input
                      value={s.k}
                      onChange={(e) => {
                        const stats = [...form.stats];
                        stats[i] = { ...s, k: e.target.value };
                        setForm({ ...form, stats });
                      }}
                      placeholder="Clave"
                      className="h-8 flex-1 py-1 text-xs"
                    />
                    <Input
                      value={s.v}
                      onChange={(e) => {
                        const stats = [...form.stats];
                        stats[i] = { ...s, v: e.target.value };
                        setForm({ ...form, stats });
                      }}
                      placeholder="Valor"
                      className="h-8 flex-1 py-1 text-xs"
                    />
                    <Button
                      size="xs"
                      variant="ghost"
                      onClick={() => setForm({ ...form, stats: form.stats.filter((_, j) => j !== i) })}
                    >
                      ✕
                    </Button>
                  </div>
                ))}
                <Button
                  size="xs"
                  variant="secondary"
                  onClick={() => setForm({ ...form, stats: [...form.stats, { k: "", v: "" }] })}
                >
                  + Estadística
                </Button>
              </div>
            </Field>

            <div className="flex justify-end gap-2 pt-1">
              <Button variant="ghost" onClick={() => setForm(null)}>Cancelar</Button>
              <Button variant="primary" onClick={() => void guardar()} loading={cargando === "crear" || cargando === "editar"}>
                {form.id ? "Guardar ficha" : "Crear ficha"}
              </Button>
            </div>
          </div>
        ) : null}
      </Modal>
    </div>
  );
}
