"use client";

import { useEffect, useMemo, useState } from "react";
import { Badge, Button, Empty, ErrorBox, Field, Input, Modal, Select, Switch } from "@/components/ui";
import { api, errorTexto } from "@/lib/api";
import { audioEngine, type Sonido } from "@/lib/audio";
import { cn } from "@/lib/format";
import { useAppStore } from "@/lib/store";
import { useApi } from "@/lib/useApi";
import type { ModuleProps } from "./types";

interface SonidoEstado {
  grupos: Array<{ nombre: string; sonidos: Sonido[] }>;
  total: number;
  escena_activa: {
    id: number;
    nombre: string;
    playlist: number[];
  } | null;
  presets_sinteticos: Array<{ src: string; nombre: string }>;
  carpeta_archivos: string;
}

export function SonidoModule(_props: ModuleProps) {
  const { data, setData, error } = useApi<SonidoEstado>("/api/modules/sonido/state");
  const [activos, setActivos] = useState<number[]>([]);
  const [cargando, setCargando] = useState<string | null>(null);
  const [errorLocal, setErrorLocal] = useState<string | null>(null);
  const [busqueda, setBusqueda] = useState("");
  const [form, setForm] = useState<Sonido | null>(null);
  const [preset, setPreset] = useState("synth:bosque");
  const [nombrePreset, setNombrePreset] = useState("");
  const [creando, setCreando] = useState(false);
  const [volumenes, setVolumenes] = useState<Record<number, number>>({});
  const muted = useAppStore((s) => s.audioMuted);
  const setMuted = useAppStore((s) => s.setAudioMuted);
  const master = useAppStore((s) => s.masterVolume);
  const setMaster = useAppStore((s) => s.setMasterVolume);
  const setAudioReady = useAppStore((s) => s.setAudioReady);
  const bump = useAppStore((s) => s.bump);
  const notify = useAppStore((s) => s.notify);

  useEffect(() => {
    const t = setInterval(() => setActivos(audioEngine.idsActivos()), 700);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    if (data) {
      setVolumenes((prev) => {
        const siguiente = { ...prev };
        data.grupos.forEach((g) => g.sonidos.forEach((s) => {
          if (siguiente[s.id] === undefined) siguiente[s.id] = s.volumen;
        }));
        return siguiente;
      });
    }
  }, [data]);

  const sonidos = useMemo(
    () => (data?.grupos ?? []).flatMap((g) => g.sonidos),
    [data],
  );

  const filtrados = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    return (data?.grupos ?? [])
      .map((g) => ({
        ...g,
        sonidos: q
          ? g.sonidos.filter(
              (s) => s.nombre.toLowerCase().includes(q) || g.nombre.toLowerCase().includes(q),
            )
          : g.sonidos,
      }))
      .filter((g) => g.sonidos.length > 0);
  }, [data, busqueda]);

  async function ejecutar(accion: string, payload: Record<string, unknown>, mensaje?: string) {
    setCargando(accion);
    setErrorLocal(null);
    try {
      const res = await api.post<SonidoEstado>("/api/modules/sonido/action", {
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

  async function alternar(sound: Sonido) {
    if (audioEngine.estaSonando(sound.id)) {
      audioEngine.stop(sound.id);
      setActivos(audioEngine.idsActivos());
      return;
    }
    const listo = await audioEngine.init();
    if (!listo) {
      setErrorLocal("El navegador bloqueó el audio. Pulsa de nuevo tras interactuar con la página.");
      return;
    }
    setAudioReady(true);
    await audioEngine.play(sound);
    setActivos(audioEngine.idsActivos());
    notify(`Sonando: ${sound.nombre}`);
  }

  async function guardarVolumen(sound: Sonido) {
    const volumen = volumenes[sound.id] ?? sound.volumen;
    if (Math.abs(volumen - sound.volumen) < 0.01) return;
    await ejecutar("editar", { id: sound.id, volumen }, "Volumen guardado");
  }

  async function alternarPlaylist(sound: Sonido) {
    if (!data?.escena_activa) {
      notify("No hay escena activa para asignar el sonido", "error");
      return;
    }
    const activo = data.escena_activa.playlist.includes(sound.id);
    await ejecutar(
      "asignar_escena",
      { id: sound.id, scene_id: data.escena_activa.id, activo: !activo },
      activo ? "Quitado de la playlist" : "Añadido a la playlist de la escena",
    );
  }

  async function crearPreset() {
    const presetInfo = data?.presets_sinteticos.find((p) => p.src === preset);
    if (!presetInfo) return;
    const ok = await ejecutar(
      "crear_sintetico",
      { src: preset, nombre: nombrePreset.trim() || presetInfo.nombre, grupo: "Ambiente" },
      "Nuevo sonido sintético creado",
    );
    if (ok) {
      setCreando(false);
      setNombrePreset("");
    }
  }

  if (error) return <ErrorBox>{error}</ErrorBox>;
  if (!data) return <div className="h-48 animate-pulse rounded-xl bg-white/5" />;

  return (
    <div className="space-y-3">
      {errorLocal ? <ErrorBox>{errorLocal}</ErrorBox> : null}

      <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-line bg-white/[0.02] p-2.5">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => {
              const nuevo = !muted;
              setMuted(nuevo);
              audioEngine.setMuted(nuevo);
              notify(nuevo ? "Audio silenciado" : "Audio activo");
            }}
            className={cn(
              "flex h-9 w-9 items-center justify-center rounded-lg border text-base",
              muted ? "border-red-500/40 bg-red-500/10 text-red-300" : "border-gold/40 bg-gold/10 text-gold",
            )}
            title={muted ? "Quitar silencio" : "Silenciar"}
          >
            {muted ? "🔇" : "🔊"}
          </button>
          <div>
            <p className="text-[9px] uppercase tracking-widest text-slate-500">Volumen maestro</p>
            <input
              type="range"
              min={0}
              max={1}
              step={0.01}
              value={master}
              onChange={(e) => {
                const v = Number(e.target.value);
                setMaster(v);
                audioEngine.setVolumenMaestro(v);
                window.localStorage.setItem("ttrpg_volumen", String(v));
              }}
              className="mt-1 h-1 w-36 accent-[#f5b544]"
              aria-label="Volumen maestro"
            />
          </div>
        </div>
        <div className="flex items-center gap-1.5">
          <Badge color="teal">{activos.length} sonando</Badge>
          <Button size="xs" variant="ghost" onClick={() => { audioEngine.stopAll(); setActivos([]); }}>
            Detener todo
          </Button>
        </div>
      </div>

      <div className="flex items-center gap-2">
        <Input
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
          placeholder="Buscar sonido o grupo…"
          className="h-8 py-1 text-xs"
        />
        <Button size="sm" variant="secondary" onClick={() => setCreando((v) => !v)}>
          + Sintético
        </Button>
      </div>

      {creando ? (
        <div className="space-y-2 rounded-xl border border-gold/30 bg-gold/[0.05] p-2.5">
          <div className="grid gap-2 sm:grid-cols-2">
            <Field label="Preset">
              <Select value={preset} onChange={(e) => setPreset(e.target.value)} className="h-8 py-1 text-xs">
                {data.presets_sinteticos.map((p) => (
                  <option key={p.src} value={p.src}>{p.nombre}</option>
                ))}
              </Select>
            </Field>
            <Field label="Nombre en la mesa">
              <Input
                value={nombrePreset}
                onChange={(e) => setNombrePreset(e.target.value)}
                placeholder="Opcional"
                className="h-8 py-1 text-xs"
              />
            </Field>
          </div>
          <div className="flex justify-end gap-1.5">
            <Button size="xs" variant="ghost" onClick={() => setCreando(false)}>Cancelar</Button>
            <Button size="xs" variant="primary" loading={cargando === "crear_sintetico"} onClick={() => void crearPreset()}>
              Crear sonido
            </Button>
          </div>
        </div>
      ) : null}

      {data.escena_activa ? (
        <p className="text-[10px] text-slate-500">
          Playlist de <span className="text-gold">{data.escena_activa.nombre}</span>:{" "}
          {data.escena_activa.playlist.length} pistas. El icono ✓ añade o quita sonidos de la escena.
        </p>
      ) : (
        <p className="text-[10px] text-slate-500">Sin escena activa: la playlist se aplicará cuando actives una.</p>
      )}

      <div className="max-h-[46vh] space-y-2 overflow-y-auto pr-1">
        {filtrados.map((grupo) => (
          <div key={grupo.nombre}>
            <p className="mb-1 text-[9px] uppercase tracking-[0.22em] text-slate-500">{grupo.nombre}</p>
            <div className="space-y-1">
              {grupo.sonidos.map((sound) => {
                const sonando = activos.includes(sound.id);
                const enPlaylist = data.escena_activa?.playlist.includes(sound.id) ?? false;
                return (
                  <div
                    key={sound.id}
                    className={cn(
                      "rounded-lg border px-2 py-1.5 transition-colors",
                      sonando ? "border-teal-500/40 bg-teal-500/[0.06]" : "border-line bg-white/[0.02]",
                    )}
                  >
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => void alternar(sound)}
                        className={cn(
                          "flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border text-xs",
                          sonando
                            ? "border-teal-400/50 bg-teal-400/15 text-teal-200"
                            : "border-line text-slate-300 hover:border-gold/50 hover:text-gold",
                        )}
                        title={sonando ? "Detener" : "Reproducir"}
                      >
                        {sonando ? "■" : "▶"}
                      </button>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-xs text-slate-200">{sound.nombre}</p>
                        <p className="truncate text-[9px] text-slate-500">
                          {sound.sintetico ? "sintético" : sound.src} · {sound.loop ? "loop" : "una vez"}
                        </p>
                      </div>
                      <div className="flex shrink-0 items-center gap-0.5">
                        {data.escena_activa ? (
                          <button
                            type="button"
                            onClick={() => void alternarPlaylist(sound)}
                            className={cn(
                              "rounded px-1.5 text-[11px]",
                              enPlaylist ? "text-gold" : "text-slate-600 hover:text-slate-300",
                            )}
                            title={enPlaylist ? "Quitar de la escena" : "Añadir a la escena"}
                          >
                            {enPlaylist ? "✓" : "+"}
                          </button>
                        ) : null}
                        <button
                          type="button"
                          onClick={() => setForm(sound)}
                          className="rounded px-1 text-[10px] text-slate-500 hover:text-gold"
                          title="Editar sonido"
                        >
                          ✎
                        </button>
                      </div>
                    </div>
                    <div className="mt-1 flex items-center gap-2 pl-10">
                      <input
                        type="range"
                        min={0}
                        max={1}
                        step={0.01}
                        value={volumenes[sound.id] ?? sound.volumen}
                        onChange={(e) =>
                          setVolumenes((prev) => ({ ...prev, [sound.id]: Number(e.target.value) }))
                        }
                        onPointerUp={() => void guardarVolumen(sound)}
                        onKeyUp={() => void guardarVolumen(sound)}
                        className="h-1 flex-1 accent-[#f5b544]"
                        aria-label={`Volumen de ${sound.nombre}`}
                      />
                      <span className="w-7 text-right font-mono text-[9px] text-slate-500">
                        {Math.round((volumenes[sound.id] ?? sound.volumen) * 100)}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ))}

        {!filtrados.length ? (
          <Empty icon="🔊" title="Sin resultados">
            <span className="text-[10px]">Prueba otra búsqueda o crea un sonido sintético.</span>
          </Empty>
        ) : null}
      </div>

      <p className="truncate text-[9px] text-slate-600" title={data.carpeta_archivos}>
        Archivos locales: {data.carpeta_archivos}
      </p>

      <Modal open={form !== null} onClose={() => setForm(null)} title="Editar sonido">
        {form ? (
          <div className="space-y-3">
            <Field label="Nombre">
              <Input value={form.nombre} onChange={(e) => setForm({ ...form, nombre: e.target.value })} />
            </Field>
            <div className="grid grid-cols-2 gap-2">
              <Field label="Grupo">
                <Input value={form.grupo} onChange={(e) => setForm({ ...form, grupo: e.target.value })} />
              </Field>
              <Field label={`Volumen · ${Math.round(form.volumen * 100)}%`}>
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.01}
                  value={form.volumen}
                  onChange={(e) => setForm({ ...form, volumen: Number(e.target.value) })}
                  className="mt-3 h-1 w-full accent-[#f5b544]"
                />
              </Field>
            </div>
            <div className="flex items-center justify-between rounded-lg border border-line px-3 py-2">
              <span className="text-xs text-slate-300">Reproducir en bucle</span>
              <Switch checked={form.loop} onChange={(loop) => setForm({ ...form, loop })} label="Loop" />
            </div>
            <div className="flex justify-between gap-2 pt-1">
              <Button
                variant="danger"
                loading={cargando === "borrar"}
                onClick={async () => {
                  if (!window.confirm(`¿Borrar «${form.nombre}» de la biblioteca?`)) return;
                  audioEngine.stop(form.id);
                  const ok = await ejecutar("borrar", { id: form.id }, "Sonido borrado");
                  if (ok) setForm(null);
                }}
              >
                Borrar
              </Button>
              <div className="flex gap-2">
                <Button variant="ghost" onClick={() => setForm(null)}>Cancelar</Button>
                <Button
                  variant="primary"
                  loading={cargando === "editar"}
                  onClick={async () => {
                    const ok = await ejecutar("editar", {
                      id: form.id, nombre: form.nombre, grupo: form.grupo,
                      loop: form.loop, volumen: form.volumen,
                    }, "Sonido actualizado");
                    if (ok) setForm(null);
                  }}
                >
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
