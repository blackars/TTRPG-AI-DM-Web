"use client";

import Link from "next/link";
import { useState } from "react";
import { SceneBoard, fondo, PRESENTACION_VACIA } from "@/components/SceneBoard";
import { Badge, Button, Empty, EmojiPicker, ErrorBox, Field, Input, Modal, Select, Textarea } from "@/components/ui";
import { api, API_URL, errorTexto } from "@/lib/api";
import { cn } from "@/lib/format";
import { leerPantallaCm, leerProyectorLocal, publicarProyector } from "@/lib/proyector";
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
  const [tableroSel, setTableroSel] = useState<string | null>(null);
  const [nuevoToken, setNuevoToken] = useState<{ nombre: string; emoji: string; x: number; y: number } | null>(null);
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
    setTableroSel(null);
    setNuevoToken(null);
    setForm({
      id: escena.id, nombre: escena.nombre, descripcion: escena.descripcion,
      bg: escena.bg, luzColor: escena.light?.color ?? "#f5b544",
      luzOpacidad: escena.light?.opacity ?? 0.18, playlist: escena.playlist,
    });
  }

  function cerrarFormulario() {
    setForm(null);
    setTableroSel(null);
    setNuevoToken(null);
  }

  function clicCasillaTablero(x: number, y: number) {
    if (!form?.id) return;
    if (tableroSel) {
      void ejecutar("mover_token", { scene_id: form.id, token_id: tableroSel, x, y }, "Token movido");
    } else {
      setNuevoToken({ nombre: "", emoji: "🔵", x, y });
    }
  }

  async function colocarToken() {
    if (!form?.id || !nuevoToken) return;
    if (!nuevoToken.nombre.trim()) {
      notify("Ponle un nombre al token antes de colocarlo", "error");
      return;
    }
    const ok = await ejecutar("agregar_token", {
      scene_id: form.id, token_nombre: nuevoToken.nombre.trim(), emoji: nuevoToken.emoji,
      x: nuevoToken.x, y: nuevoToken.y,
    }, "Token colocado");
    if (ok) setNuevoToken(null);
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

  function proyectar(escena: EscenariosData["escenas"][number]) {
    if (!data) return;
    const local = leerProyectorLocal();
    // Si la sala de control ya publicó esta misma escena, no pisamos su
    // presentación más reciente con la copia de la API.
    if (!local || local.escena?.id !== escena.id) {
      publicarProyector({
        escena,
        grid: data.grid,
        presentacion: escena.presentacion ?? PRESENTACION_VACIA,
        pantalla_cm: leerPantallaCm(),
      });
    }
    const ventana = window.open(
      "/proyector",
      "ttrpg-proyector",
      "popup=yes,width=1280,height=800,left=80,top=80",
    );
    if (!ventana) {
      notify("El navegador bloqueó la ventana del proyector", "error");
      return;
    }
    if (!escena.activo) {
      void ejecutar("activar", { id: escena.id }, `Escena activa: ${escena.nombre}`);
    }
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
        <div className="flex flex-wrap items-center gap-1.5">
          <Link href="/pantalla/proyector">
            <Button size="sm" variant="secondary">📺 Sala de proyección</Button>
          </Link>
          <Button size="sm" variant="primary" onClick={() => setForm({ ...NUEVA, playlist: [] })}>
            + Nueva escena
          </Button>
        </div>
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
              {escena.presentacion?.mapa_url ? (
                <img
                  src={`${API_URL}${escena.presentacion.mapa_url}`}
                  alt=""
                  className="absolute inset-0 h-full w-full object-cover opacity-80"
                  draggable={false}
                />
              ) : null}
              <div className="absolute inset-0 bg-gradient-to-t from-black/50 via-transparent to-transparent" />
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
                {escena.presentacion?.mapa_url ? <Badge color="green">mapa</Badge> : null}
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
                <Button size="xs" variant="secondary" onClick={() => proyectar(escena)}>
                  📺 Proyectar
                </Button>
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

      <Modal open={form !== null} onClose={cerrarFormulario} title={form?.id ? "Editar escena" : "Nueva escena"} wide>
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
            <p className="text-[10px] leading-relaxed text-slate-500">
              El fondo es para el tablero táctico. Para subir y proyectar una imagen de mapa usa la{" "}
              <Link href="/pantalla/proyector" className="text-gold/80 underline hover:text-gold">
                sala de proyección
              </Link>.
            </p>
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
                readonly={!form.id}
                selectedId={tableroSel}
                onTokenClick={(t) => setTableroSel(t.id === tableroSel ? null : t.id)}
                onTokenMove={(t, x, y) => {
                  setTableroSel(t.id);
                  void ejecutar("mover_token", { scene_id: form.id, token_id: t.id, x, y }, "Token movido");
                }}
                onCellClick={form.id ? clicCasillaTablero : undefined}
                className="rounded-none border-0"
              />
            </div>
            {form.id ? (
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-[10px] leading-relaxed text-slate-500">
                  {tableroSel
                    ? "Arrastra el token a otra casilla o haz clic en una casilla para moverlo."
                    : "Arrastra un token para moverlo, o haz clic en una casilla vacía para colocar uno nuevo."}
                </p>
                {tableroSel ? (
                  <Button
                    size="xs"
                    variant="danger"
                    loading={cargando === "borrar_token"}
                    onClick={() => {
                      const token = data.escenas.find((e) => e.id === form.id)?.tokens.find((t) => t.id === tableroSel);
                      if (!token || !window.confirm(`¿Quitar a ${token.nombre} de la escena?`)) return;
                      void ejecutar("borrar_token", { scene_id: form.id, token_id: tableroSel }, "Token retirado");
                      setTableroSel(null);
                    }}
                  >
                    Quitar token
                  </Button>
                ) : null}
              </div>
            ) : null}
            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={cerrarFormulario}>Cancelar</Button>
              <Button variant="primary" onClick={() => void guardar()} loading={cargando === "crear" || cargando === "editar"}>
                {form.id ? "Guardar cambios" : "Crear escena"}
              </Button>
            </div>
          </div>
        ) : null}
      </Modal>

      <Modal open={nuevoToken !== null} onClose={() => setNuevoToken(null)} title="Colocar token">
        {nuevoToken ? (
          <div className="space-y-3">
            <div className="flex items-end gap-2">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border border-line bg-ink text-2xl">
                {nuevoToken.emoji}
              </div>
              <Field label="Nombre" className="flex-1">
                <Input
                  autoFocus
                  value={nuevoToken.nombre}
                  onChange={(e) => setNuevoToken({ ...nuevoToken, nombre: e.target.value })}
                  placeholder="Lobo espectral"
                  onKeyDown={(e) => {
                    if (e.key === "Enter") void colocarToken();
                  }}
                />
              </Field>
            </div>
            <EmojiPicker value={nuevoToken.emoji} onChange={(emoji) => setNuevoToken({ ...nuevoToken, emoji })} />
            <p className="text-[10px] leading-relaxed text-slate-500">
              Se colocará en la casilla ({nuevoToken.x}, {nuevoToken.y}).
            </p>
            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setNuevoToken(null)}>Cancelar</Button>
              <Button variant="primary" onClick={() => void colocarToken()} loading={cargando === "agregar_token"}>
                Colocar token
              </Button>
            </div>
          </div>
        ) : null}
      </Modal>
    </div>
  );
}
