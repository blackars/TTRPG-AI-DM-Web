"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Badge, Button, EmojiPicker, Empty, ErrorBox, Field, Input, Modal, Select, Textarea,
} from "@/components/ui";
import { api, errorTexto } from "@/lib/api";
import { cn } from "@/lib/format";
import { useAppStore } from "@/lib/store";
import { useApi } from "@/lib/useApi";
import type { ModuleProps } from "./types";

interface Item {
  id: number;
  section_id: number;
  nombre: string;
  qty: number;
  valor: string;
  nota: string;
  icono: string;
  token_path: string;
  external_key: string;
}

interface Seccion {
  id: number;
  character_id: number;
  nombre: string;
  orden: number;
  items: Item[];
}

interface Personaje {
  id: number;
  nombre: string;
  kind: string;
  emoji: string;
  hp: number;
  hp_max: number;
  notas: string;
  secciones: Seccion[];
}

interface InventarioData {
  personajes: Personaje[];
  total_items: number;
  total_secciones: number;
}

interface FormItem {
  id?: number;
  section_id: number;
  nombre: string;
  qty: number;
  valor: string;
  nota: string;
  icono: string;
}

const FORM_VACIO: FormItem = {
  section_id: 0, nombre: "", qty: 1, valor: "", nota: "", icono: "📦",
};

export function InventarioModule(_props: ModuleProps) {
  const { data, setData, error } = useApi<InventarioData>("/api/modules/inventario/state");
  const selected = useAppStore((s) => s.selectedCharacterId);
  const setSelected = useAppStore((s) => s.setSelectedCharacter);
  const bump = useAppStore((s) => s.bump);
  const notify = useAppStore((s) => s.notify);

  const [busqueda, setBusqueda] = useState("");
  const [form, setForm] = useState<FormItem | null>(null);
  const [errorLocal, setErrorLocal] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);
  const [nuevaSeccion, setNuevaSeccion] = useState("");
  const [editandoSeccion, setEditandoSeccion] = useState<number | null>(null);
  const [nombreSeccion, setNombreSeccion] = useState("");

  const personajes = data?.personajes ?? [];
  const personaje = useMemo(() => {
    const elegido = personajes.find((p) => p.id === selected);
    if (elegido) return elegido;
    return personajes.find((p) => p.kind === "personaje") ?? personajes[0] ?? null;
  }, [personajes, selected]);

  useEffect(() => {
    if (personaje && personaje.id !== selected) setSelected(personaje.id);
  }, [personaje, selected, setSelected]);

  const seccionesFiltradas = useMemo(() => {
    if (!personaje) return [];
    const q = busqueda.trim().toLowerCase();
    if (!q) return personaje.secciones;
    return personaje.secciones
      .map((s) => ({
        ...s,
        items: s.items.filter(
          (i) =>
            i.nombre.toLowerCase().includes(q) ||
            i.nota.toLowerCase().includes(q) ||
            i.valor.toLowerCase().includes(q),
        ),
      }))
      .filter((s) => s.items.length > 0 || s.nombre.toLowerCase().includes(q));
  }, [personaje, busqueda]);

  async function ejecutar(tipo: string, payload: Record<string, unknown>, mensaje?: string) {
    setGuardando(true);
    setErrorLocal(null);
    try {
      const res = await api.post<InventarioData>("/api/modules/inventario/action", {
        action: tipo,
        ...payload,
      });
      setData(res);
      bump();
      if (mensaje) notify(mensaje);
      return true;
    } catch (e) {
      setErrorLocal(errorTexto(e));
      return false;
    } finally {
      setGuardando(false);
    }
  }

  async function crearSeccion() {
    if (!personaje || !nuevaSeccion.trim()) return;
    const ok = await ejecutar("crear_seccion", {
      character_id: personaje.id, nombre: nuevaSeccion.trim(),
    }, "Sección creada");
    if (ok) setNuevaSeccion("");
  }

  async function renombrarSeccion(id: number) {
    if (!nombreSeccion.trim()) return;
    const ok = await ejecutar("editar_seccion", { section_id: id, nombre: nombreSeccion.trim() }, "Sección renombrada");
    if (ok) setEditandoSeccion(null);
  }

  async function borrarSeccion(s: Seccion) {
    if (!window.confirm(`¿Borrar la sección «${s.nombre}» y sus ${s.items.length} items?`)) return;
    await ejecutar("borrar_seccion", { section_id: s.id }, "Sección borrada");
  }

  function abrirNuevo(sectionId: number) {
    setForm({ ...FORM_VACIO, section_id: sectionId });
  }

  function abrirItem(item: Item) {
    setForm({
      id: item.id, section_id: item.section_id, nombre: item.nombre, qty: item.qty,
      valor: item.valor, nota: item.nota, icono: item.icono,
    });
  }

  async function guardarItem() {
    if (!form || !form.nombre.trim()) return;
    const payload = {
      section_id: form.section_id,
      nombre: form.nombre.trim(),
      qty: form.qty,
      valor: form.valor,
      nota: form.nota,
      icono: form.icono,
    };
    const ok = form.id
      ? await ejecutar("editar_item", { item_id: form.id, ...payload }, "Item actualizado")
      : await ejecutar("crear_item", payload, "Item añadido");
    if (ok) setForm(null);
  }

  async function borrarItem() {
    if (!form?.id) return;
    if (!window.confirm(`¿Borrar «${form.nombre}» del inventario?`)) return;
    const ok = await ejecutar("borrar_item", { item_id: form.id }, "Item borrado");
    if (ok) setForm(null);
  }

  if (error) return <ErrorBox>{error}</ErrorBox>;
  if (!data) {
    return <div className="h-40 animate-pulse rounded-xl bg-white/5" />;
  }

  return (
    <div className="space-y-3">
      {errorLocal ? <ErrorBox>{errorLocal}</ErrorBox> : null}

      <div className="flex flex-wrap gap-1.5">
        {personajes.map((p) => (
          <button
            key={p.id}
            type="button"
            onClick={() => setSelected(p.id)}
            className={cn(
              "flex items-center gap-2 rounded-xl border px-2.5 py-1.5 text-left transition-all",
              personaje?.id === p.id
                ? "border-gold/50 bg-gold/10 text-slate-100"
                : "border-line bg-white/[0.02] text-slate-400 hover:border-slate-600",
            )}
          >
            <span className="text-lg">{p.emoji}</span>
            <span>
              <span className="block text-xs font-medium leading-tight">{p.nombre}</span>
              <span className="block text-[9px] uppercase tracking-wider text-slate-500">
                {p.kind} · {p.hp}/{p.hp_max} HP
              </span>
            </span>
          </button>
        ))}
      </div>

      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <span className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-xs text-slate-500">⌕</span>
          <Input
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            placeholder="Buscar item, nota o valor…"
            className="pl-7"
          />
        </div>
        <Badge color="slate">{personaje?.secciones.length ?? 0} secciones</Badge>
        <Badge color="gold">
          {personaje?.secciones.reduce((acc, s) => acc + s.items.reduce((a, i) => a + i.qty, 0), 0) ?? 0} uds.
        </Badge>
      </div>

      {!personaje ? (
        <Empty icon="🎒" title="Sin personajes">Crea un personaje para colgar su inventario.</Empty>
      ) : (
        <div className="grid gap-2.5 lg:grid-cols-2">
          {seccionesFiltradas.map((seccion) => (
            <div key={seccion.id} className="rounded-xl border border-line bg-white/[0.02] p-2.5">
              <div className="mb-1.5 flex items-center justify-between gap-2">
                {editandoSeccion === seccion.id ? (
                  <div className="flex flex-1 items-center gap-1">
                    <Input
                      autoFocus
                      value={nombreSeccion}
                      onChange={(e) => setNombreSeccion(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") void renombrarSeccion(seccion.id);
                        if (e.key === "Escape") setEditandoSeccion(null);
                      }}
                      className="h-7 py-1 text-xs"
                    />
                    <Button size="xs" variant="primary" onClick={() => void renombrarSeccion(seccion.id)}>✓</Button>
                    <Button size="xs" variant="ghost" onClick={() => setEditandoSeccion(null)}>✕</Button>
                  </div>
                ) : (
                  <>
                    <div className="flex min-w-0 items-center gap-1.5">
                      <span className="truncate text-xs font-semibold uppercase tracking-widest text-slate-300">
                        {seccion.nombre}
                      </span>
                      <span className="text-[9px] text-slate-600">{seccion.items.length}</span>
                    </div>
                    <div className="flex shrink-0 items-center gap-0.5">
                      <button
                        type="button"
                        title="Renombrar sección"
                        onClick={() => {
                          setEditandoSeccion(seccion.id);
                          setNombreSeccion(seccion.nombre);
                        }}
                        className="rounded px-1 text-[10px] text-slate-500 hover:text-gold"
                      >
                        ✎
                      </button>
                      <button
                        type="button"
                        title="Borrar sección"
                        onClick={() => void borrarSeccion(seccion)}
                        className="rounded px-1 text-[10px] text-slate-500 hover:text-red-400"
                      >
                        ✕
                      </button>
                      <Button size="xs" variant="ghost" onClick={() => abrirNuevo(seccion.id)} title="Añadir item">
                        +
                      </Button>
                    </div>
                  </>
                )}
              </div>

              <div className="space-y-0.5">
                {seccion.items.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => abrirItem(item)}
                    className="group flex w-full items-center gap-2 rounded-lg border border-transparent px-1.5 py-1 text-left transition-colors hover:border-line hover:bg-white/[0.04]"
                  >
                    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md border border-white/10 bg-ink text-sm">
                      {item.icono}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex items-baseline justify-between gap-2">
                        <span className="truncate text-xs text-slate-200">{item.nombre}</span>
                        <span className="shrink-0 font-mono text-[10px] text-gold">×{item.qty}</span>
                      </span>
                      {(item.valor || item.nota) ? (
                        <span className="block truncate text-[9px] text-slate-500">
                          {item.valor ? `${item.valor} · ` : ""}{item.nota}
                        </span>
                      ) : null}
                    </span>
                    {item.external_key ? <span title="Vinculado a MiniBase" className="text-[9px]">🧩</span> : null}
                  </button>
                ))}
                {!seccion.items.length ? (
                  <p className="px-1 py-2 text-[10px] text-slate-600">Sección vacía. Añade un item con +.</p>
                ) : null}
              </div>
            </div>
          ))}

          <div className="flex items-center gap-1 rounded-xl border border-dashed border-line p-2">
            <Input
              value={nuevaSeccion}
              onChange={(e) => setNuevaSeccion(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") void crearSeccion();
              }}
              placeholder="Nueva sección (Armas, Botín…)"
              className="h-8 border-0 bg-transparent py-1 text-xs"
            />
            <Button size="sm" variant="secondary" loading={guardando} onClick={() => void crearSeccion()}>
              + Sección
            </Button>
          </div>
        </div>
      )}

      <Modal
        open={form !== null}
        onClose={() => setForm(null)}
        title={form?.id ? "Detalle del item" : "Nuevo item"}
      >
        {form ? (
          <div className="space-y-3">
            <div className="flex items-end gap-2">
              <div className="flex h-12 w-12 items-center justify-center rounded-xl border border-line bg-ink text-2xl">
                {form.icono}
              </div>
              <Field label="Nombre" className="flex-1">
                <Input
                  autoFocus
                  value={form.nombre}
                  onChange={(e) => setForm({ ...form, nombre: e.target.value })}
                  placeholder="Poción de curación"
                />
              </Field>
            </div>
            <EmojiPicker value={form.icono} onChange={(icono) => setForm({ ...form, icono })} />
            <div className="grid grid-cols-2 gap-2">
              <Field label="Cantidad">
                <Input
                  type="number"
                  min={0}
                  value={form.qty}
                  onChange={(e) => setForm({ ...form, qty: Math.max(0, Number(e.target.value) || 0) })}
                  className="font-mono"
                />
              </Field>
              <Field label="Valor">
                <Input
                  value={form.valor}
                  onChange={(e) => setForm({ ...form, valor: e.target.value })}
                  placeholder="50 po"
                />
              </Field>
            </div>
            <Field label="Sección">
              <Select
                value={form.section_id}
                onChange={(e) => setForm({ ...form, section_id: Number(e.target.value) })}
              >
                {personaje?.secciones.map((s) => (
                  <option key={s.id} value={s.id}>{s.nombre}</option>
                ))}
              </Select>
            </Field>
            <Field label="Nota">
              <Textarea
                value={form.nota}
                onChange={(e) => setForm({ ...form, nota: e.target.value })}
                placeholder="Sabe a raíz quemada; la compró a Guld."
              />
            </Field>
            <div className="flex justify-between gap-2 pt-1">
              {form.id ? (
                <Button variant="danger" onClick={() => void borrarItem()} loading={guardando}>
                  Borrar item
                </Button>
              ) : <span />}
              <div className="flex gap-2">
                <Button variant="ghost" onClick={() => setForm(null)}>Cancelar</Button>
                <Button variant="primary" onClick={() => void guardarItem()} loading={guardando}>
                  Guardar
                </Button>
              </div>
            </div>
          </div>
        ) : null}
      </Modal>
    </div>
  );
}
