"use client";

import { useEffect, useMemo, useState } from "react";
import { Badge, Button, Empty, ErrorBox, Input, Select } from "@/components/ui";
import { api, errorTexto } from "@/lib/api";
import { fechaCorta } from "@/lib/format";
import { useAppStore } from "@/lib/store";
import { useApi } from "@/lib/useApi";
import type { ModuleProps } from "./types";

interface MiniResultado {
  id: string | number;
  nombre: string;
  tipo: string;
  codigo: string;
  imagen: string;
  lore: string;
}

interface Enlace {
  id: number;
  external_key: string;
  kind: string;
  local_ref: string;
  nombre: string;
  ts: string;
}

interface MiniBaseData {
  configurado: boolean;
  url: string;
  token_presente: boolean;
  enlaces: Enlace[];
  total_enlaces: number;
  table_state: {
    phase: string;
    grid_visible: boolean;
    tokens: Array<{ nombre: string; x: number; y: number; emoji: string }>;
    escena: string | null;
  };
  ayuda: string;
}

interface PersonajesData {
  personajes: Array<{ id: number; nombre: string; emoji: string }>;
}

interface InventarioData {
  personajes: Array<{
    id: number;
    nombre: string;
    secciones: Array<{ id: number; nombre: string }>;
  }>;
}

interface RespuestaMini {
  ok: boolean;
  error?: string;
  detalle?: string;
  status?: number;
  resultados?: MiniResultado[];
  enlace?: string;
  estado?: MiniBaseData;
}

export function MiniBaseModule(_props: ModuleProps) {
  const { data, setData, error } = useApi<MiniBaseData>("/api/modules/minibase/state");
  const { data: personajes } = useApi<PersonajesData>("/api/modules/personajes/state");
  const { data: inventario } = useApi<InventarioData>("/api/modules/inventario/state");
  const [busqueda, setBusqueda] = useState("");
  const [resultados, setResultados] = useState<MiniResultado[]>([]);
  const [buscando, setBuscando] = useState(false);
  const [probando, setProbando] = useState(false);
  const [cargando, setCargando] = useState<string | null>(null);
  const [errorLocal, setErrorLocal] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [characterId, setCharacterId] = useState<number | null>(null);
  const [sectionId, setSectionId] = useState<number | null>(null);
  const [publicando, setPublicando] = useState(false);
  const bump = useAppStore((s) => s.bump);
  const notify = useAppStore((s) => s.notify);

  const personaje = useMemo(
    () => inventario?.personajes.find((p) => p.id === characterId) ?? inventario?.personajes[0] ?? null,
    [inventario, characterId],
  );

  useEffect(() => {
    if (!characterId && inventario?.personajes.length) {
      setCharacterId(inventario.personajes[0].id);
    }
  }, [inventario, characterId]);

  useEffect(() => {
    if (personaje?.secciones.length) {
      setSectionId(personaje.secciones[0].id);
    } else {
      setSectionId(null);
    }
  }, [personaje?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  async function ejecutar(accion: string, payload: Record<string, unknown> = {}) {
    setErrorLocal(null);
    setAviso(null);
    try {
      const res = await api.post<RespuestaMini>("/api/modules/minibase/action", {
        action: accion,
        ...payload,
      });
      if (res.estado) setData(res.estado);
      if (!res.ok && res.error) setErrorLocal(res.error);
      if (res.detalle && res.ok) setAviso(res.detalle);
      bump();
      return res;
    } catch (e) {
      setErrorLocal(errorTexto(e));
      return null;
    }
  }

  async function buscar() {
    setBuscando(true);
    const res = await ejecutar("buscar", { query: busqueda });
    if (res) setResultados(res.resultados ?? []);
    setBuscando(false);
  }

  async function probar() {
    setProbando(true);
    const res = await ejecutar("probar");
    if (res?.ok) notify("MiniBase responde correctamente");
    setProbando(false);
  }

  async function publicar() {
    setPublicando(true);
    const res = await ejecutar("publicar_escena");
    if (res?.ok) notify("Estado del tablero publicado en MiniBase (solo lectura)");
    setPublicando(false);
  }

  async function importar(mini: MiniResultado, destino: "token" | "item") {
    setCargando(`${destino}-${mini.id}`);
    const payload: Record<string, unknown> = {
      mini_id: mini.id,
      payload: mini,
      destino,
      nombre: mini.nombre,
      emoji: mini.tipo === "criatura" ? "👹" : "🧩",
    };
    if (destino === "item") {
      payload.character_id = characterId;
      payload.section_id = sectionId;
    }
    const res = await ejecutar("importar", payload);
    if (res?.ok) {
      notify(destino === "token" ? "Mini colocada en el tablero" : "Mini importada como item");
    }
    setCargando(null);
  }

  if (error) return <ErrorBox>{error}</ErrorBox>;
  if (!data) return <div className="h-48 animate-pulse rounded-xl bg-white/5" />;

  return (
    <div className="space-y-2.5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-1.5">
          <Badge color={data.configurado ? "green" : "red"}>
            {data.configurado ? "conectado" : "sin configurar"}
          </Badge>
          <Badge color="slate">read-only</Badge>
        </div>
        <div className="flex gap-1">
          <Button size="xs" variant="ghost" loading={probando} onClick={() => void probar()}>
            Probar
          </Button>
          <Button size="xs" variant="ghost" loading={publicando} onClick={() => void publicar()}>
            Publicar tablero
          </Button>
        </div>
      </div>

      {errorLocal ? <ErrorBox>{errorLocal}</ErrorBox> : null}
      {aviso ? (
        <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-[10px] text-emerald-200">
          {aviso}
        </div>
      ) : null}

      <p className="text-[10px] leading-relaxed text-slate-500">
        {data.configurado
          ? `Conectado a ${data.url}. La integración es opcional y nunca bloquea la mesa local.`
          : data.ayuda}
      </p>

      <div className="flex gap-1.5">
        <Input
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") void buscar();
          }}
          placeholder="Buscar miniatura en MiniBase…"
          className="h-8 py-1 text-xs"
        />
        <Button size="sm" variant="secondary" loading={buscando} onClick={() => void buscar()}>
          Buscar
        </Button>
      </div>

      <div className="grid grid-cols-2 gap-1.5">
        <div>
          <p className="mb-0.5 text-[9px] uppercase tracking-wider text-slate-500">Personaje destino</p>
          <Select
            value={characterId ?? ""}
            onChange={(e) => setCharacterId(Number(e.target.value) || null)}
            className="h-7 py-0 text-[10px]"
          >
            {(personajes?.personajes ?? []).map((p) => (
              <option key={p.id} value={p.id}>{p.emoji} {p.nombre}</option>
            ))}
          </Select>
        </div>
        <div>
          <p className="mb-0.5 text-[9px] uppercase tracking-wider text-slate-500">Sección de inventario</p>
          <Select
            value={sectionId ?? ""}
            onChange={(e) => setSectionId(Number(e.target.value) || null)}
            className="h-7 py-0 text-[10px]"
            disabled={!personaje?.secciones.length}
          >
            {(personaje?.secciones ?? []).map((s) => (
              <option key={s.id} value={s.id}>{s.nombre}</option>
            ))}
            {!personaje?.secciones.length ? <option value="">Sin secciones</option> : null}
          </Select>
        </div>
      </div>

      {resultados.length ? (
        <div className="max-h-[34vh] space-y-1.5 overflow-y-auto pr-1">
          {resultados.map((mini) => (
            <div key={mini.id} className="flex gap-2 rounded-xl border border-line bg-white/[0.02] p-2">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-line bg-ink text-lg">
                {mini.imagen ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={mini.imagen}
                    alt={mini.nombre}
                    className="h-full w-full object-cover"
                    onError={(e) => { e.currentTarget.style.display = "none"; }}
                  />
                ) : "🧩"}
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-xs font-semibold text-slate-100">{mini.nombre}</p>
                <p className="truncate text-[9px] text-slate-500">{mini.tipo} · {mini.codigo || mini.id}</p>
                {mini.lore ? <p className="line-clamp-2 text-[9px] leading-relaxed text-slate-500">{mini.lore}</p> : null}
                <div className="mt-1 flex gap-1">
                  <Button
                    size="xs"
                    variant="primary"
                    loading={cargando === `token-${mini.id}`}
                    onClick={() => void importar(mini, "token")}
                  >
                    → Token
                  </Button>
                  <Button
                    size="xs"
                    variant="secondary"
                    loading={cargando === `item-${mini.id}`}
                    disabled={!sectionId}
                    onClick={() => void importar(mini, "item")}
                  >
                    → Item
                  </Button>
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <Empty icon="🧩" title="Sin resultados de MiniBase">
          <span className="text-[10px]">
            La búsqueda solo se activa si configuras MINIBASE_URL. La mesa sigue funcionando sin ella.
          </span>
        </Empty>
      )}

      <div className="rounded-xl border border-line bg-white/[0.02] p-2.5">
        <div className="mb-1 flex items-center justify-between">
          <p className="text-[9px] uppercase tracking-[0.2em] text-slate-500">
            Vínculos reales · {data.total_enlaces}
          </p>
          <Badge color="gold">{data.enlaces.filter((e) => e.kind === "token").length} tokens</Badge>
        </div>
        <div className="space-y-1">
          {data.enlaces.slice(0, 6).map((e) => (
            <div key={e.id} className="flex items-center justify-between gap-2 text-[10px]">
              <span className="truncate text-slate-300">{e.kind === "token" ? "🗺️" : "🎒"} {e.nombre}</span>
              <span className="shrink-0 text-slate-600">{fechaCorta(e.ts)}</span>
            </div>
          ))}
          {!data.enlaces.length ? (
            <p className="py-1 text-[10px] italic text-slate-600">Todavía no has importado ninguna mini.</p>
          ) : null}
        </div>
      </div>

      <p className="text-[9px] leading-relaxed text-slate-600">
        Tablero local: {data.table_state.escena ?? "sin escena"} · fase {data.table_state.phase} ·{" "}
        {data.table_state.tokens.length} tokens. Nunca se escribe en el repositorio MiniBase.
      </p>
    </div>
  );
}
