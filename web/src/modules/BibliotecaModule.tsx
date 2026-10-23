"use client";

import { useEffect, useMemo, useRef, useState, type ChangeEvent } from "react";
import { Badge, Button, Chip, Empty, ErrorBox, Field, Input, Modal, Select, Spinner } from "@/components/ui";
import { MarkdownView } from "@/components/MarkdownView";
import { API_URL, api, errorTexto } from "@/lib/api";
import { cn } from "@/lib/format";
import { useApi } from "@/lib/useApi";
import { useAppStore } from "@/lib/store";
import type { ModuleProps } from "./types";

interface FichaMeta {
  id: string;
  titulo: string;
  titulo_original?: string;
  genero: string;
  genero_label: string;
  tipo: string;
  tipo_ui: string;
  tipo_label: string;
  categoria: string;
  categoria_label: string;
  familia: string;
  familia_label: string;
  motor: string;
  dados: string[];
  recursos: string[];
  alias: string[];
  icono: string;
  color: string;
  logo?: string;
  tags: string[];
  resumen: string;
  fuente: string;
  seccion: string;
  orden: number;
  actualizado: string;
  ruta: string;
  busqueda: string;
  enlaces: string[];
}

interface Activo {
  id: string;
  titulo: string;
  categoria: string;
  categoria_label: string;
  tipo_ui: string;
  tipo_label: string;
  genero: string;
  genero_label: string;
  familia: string;
  familia_label: string;
  motor: string;
  icono: string;
  color: string;
  seleccionado: string;
}

interface Documento {
  id: string;
  titulo: string;
  nombre: string;
  tipo: string;
  icono: string;
  bytes: number;
  actualizado: string;
  origen: string;
  sistema_id: string;
  ruta: string;
}

interface DocumentoLeido {
  id: string;
  titulo: string;
  nombre: string;
  tipo: string;
  origen: string;
  contenido: string;
  truncado: boolean;
  caracteres: number;
}

interface Faceta {
  valor: string;
  label: string;
}

interface EstadoBiblioteca {
  catalogo: FichaMeta[];
  total: number;
  facetas: {
    categorias: Faceta[];
    generos: Faceta[];
    tipos: Faceta[];
    familias: Faceta[];
    recursos: string[];
  };
  estadisticas: {
    por_categoria: Record<string, number>;
    por_tipo: Record<string, number>;
    documentos: number;
    documentos_activos: number;
  };
  sistema_activo: Activo | null;
  documentos: Documento[];
  generadores: {
    mythic: {
      nombre: string;
      odds: string[];
      chaos: number[];
      tipos: { id: string; label: string }[];
    };
  };
  rutas: { clasica: string; api: string; subidas: string };
  aviso: string;
}

interface DetalleFicha extends FichaMeta {
  contenido: string;
  personalizacion: string;
  documentos: Documento[];
}

interface ResultadoMythic {
  texto?: string;
  tirada?: number;
  umbral?: number;
  odds?: string;
  chaos?: number;
  exito?: boolean;
  excepcional?: boolean;
  accion?: string;
  sujeto?: string;
  descriptor?: string;
  detalle?: string;
  foco?: { tirada: number; texto: string };
  tiradas?: number[];
}

interface TiradaMythic {
  id: number;
  expr: string;
  tiradas: number[];
  total: number;
  razon: string;
  modo: string;
  ts: string;
}

type Tab = "catalogo" | "generadores" | "material";

const normalizar = (value: string) =>
  value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();

function bytesLegibles(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function logoUrl(item: { logo?: string }): string | null {
  if (!item.logo) return null;
  if (item.logo.startsWith("http")) return item.logo;
  return `${API_URL}/biblioteca-assets/${item.logo.replace(/^assets\//, "")}`;
}

function FichaIcono({ item, grande = false }: { item: Pick<FichaMeta, "icono" | "color" | "logo">; grande?: boolean }) {
  const logo = logoUrl(item);
  return (
    <span
      className={cn(
        "flex shrink-0 items-center justify-center rounded-xl border text-2xl",
        grande ? "h-14 w-14 text-3xl" : "h-10 w-10 text-xl",
      )}
      style={{ backgroundColor: `${item.color}22`, borderColor: `${item.color}77` }}
    >
      {logo ? <img src={logo} alt="" className="h-full w-full rounded-xl object-cover" /> : item.icono}
    </span>
  );
}

function Tarjeta({
  item,
  activa,
  onClick,
}: {
  item: FichaMeta;
  activa: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "group flex h-full flex-col rounded-xl border bg-panel2/60 p-3 text-left transition-all",
        "hover:-translate-y-0.5 hover:border-gold/40 hover:bg-panel2 hover:shadow-glow",
        activa ? "border-gold/70 bg-gold/5 shadow-glow" : "border-line",
      )}
    >
      <div className="flex items-start gap-3">
        <FichaIcono item={item} />
        <div className="min-w-0 flex-1">
          <div className="mb-1 flex flex-wrap items-center gap-1">
            <Badge color={item.categoria === "wargame" ? "red" : item.categoria === "juego-de-mesa" ? "violet" : "slate"}>
              {item.categoria_label}
            </Badge>
            <Badge color={item.tipo_ui === "sistema" ? "gold" : item.tipo_ui === "documento" ? "teal" : "slate"}>
              {item.tipo_label}
            </Badge>
            {activa ? <Badge color="green">Activa</Badge> : null}
          </div>
          <h3 className="truncate font-display text-base font-semibold text-slate-100 group-hover:text-gold">
            {item.titulo}
          </h3>
          <p className="mt-0.5 truncate text-[11px] text-slate-500">
            {item.genero_label} · {item.motor || "Sin motor declarado"}
          </p>
        </div>
      </div>
      <p className="mt-2 line-clamp-2 text-[12px] leading-5 text-slate-400">{item.resumen}</p>
      <div className="mt-auto flex flex-wrap gap-1 pt-2">
        {item.recursos.slice(0, 4).map((recurso) => (
          <span
            key={recurso}
            className="rounded-md border border-white/10 bg-white/5 px-1.5 py-0.5 text-[9px] uppercase tracking-wide text-slate-400"
          >
            {recurso}
          </span>
        ))}
      </div>
    </button>
  );
}

export function BibliotecaModule(_props: ModuleProps) {
  const { data, error, loading, refrescar } = useApi<EstadoBiblioteca>("/api/modules/biblioteca/state");
  const notify = useAppStore((s) => s.notify);
  const bump = useAppStore((s) => s.bump);
  const fileRef = useRef<HTMLInputElement>(null);

  const [tab, setTab] = useState<Tab>("catalogo");
  const [q, setQ] = useState("");
  const [categoria, setCategoria] = useState("todos");
  const [genero, setGenero] = useState("todos");
  const [tipo, setTipo] = useState("todos");
  const [familia, setFamilia] = useState("todos");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detalle, setDetalle] = useState<DetalleFicha | null>(null);
  const [detalleLoading, setDetalleLoading] = useState(false);
  const [docAbierto, setDocAbierto] = useState<DocumentoLeido | null>(null);
  const [subiendo, setSubiendo] = useState(false);
  const [pregunta, setPregunta] = useState("");
  const [odds, setOdds] = useState("50/50");
  const [chaos, setChaos] = useState(5);
  const [mythicLoading, setMythicLoading] = useState(false);
  const [resultado, setResultado] = useState<ResultadoMythic | null>(null);
  const [tirada, setTirada] = useState<TiradaMythic | null>(null);

  const activoId = data?.sistema_activo?.id ?? null;

  useEffect(() => {
    if (!selectedId && activoId) setSelectedId(activoId);
  }, [activoId, selectedId]);

  useEffect(() => {
    if (!selectedId) {
      setDetalle(null);
      return;
    }
    let vivo = true;
    setDetalleLoading(true);
    api
      .get<DetalleFicha>(`/api/biblioteca/fichas/${encodeURIComponent(selectedId)}`)
      .then((d) => {
        if (vivo) setDetalle(d);
      })
      .catch((e) => {
        if (vivo) notify(errorTexto(e), "error");
      })
      .finally(() => {
        if (vivo) setDetalleLoading(false);
      });
    return () => {
      vivo = false;
    };
  }, [selectedId, notify]);

  const filtradas = useMemo(() => {
    if (!data) return [];
    const qn = normalizar(q.trim());
    return data.catalogo.filter((item) => {
      if (categoria !== "todos" && item.categoria !== categoria) return false;
      if (genero !== "todos" && item.genero !== genero) return false;
      if (tipo !== "todos" && item.tipo_ui !== tipo) return false;
      if (familia !== "todos" && item.familia !== familia) return false;
      if (qn && !item.busqueda.includes(qn)) return false;
      return true;
    });
  }, [data, q, categoria, genero, tipo, familia]);

  const docsActivos = useMemo(
    () => (data?.documentos ?? []).filter((d) => activoId && d.sistema_id === activoId),
    [data?.documentos, activoId],
  );

  const personalizacionBase = useMemo(() => {
    if (!detalle) return { base: "", personalizacion: "" };
    const partes = detalle.contenido.split(/^##\s+Personalizaci[oó]n del usuario\s*$/m);
    return {
      base: partes[0]?.trim() || detalle.contenido,
      personalizacion: detalle.personalizacion || "",
    };
  }, [detalle]);

  async function recargarDetalle(id: string | null = selectedId) {
    if (!id) return;
    try {
      const d = await api.get<DetalleFicha>(`/api/biblioteca/fichas/${encodeURIComponent(id)}`);
      setDetalle(d);
    } catch {
      /* la recarga es best-effort; el estado principal ya se ha refrescado */
    }
  }

  async function seleccionar(id: string) {
    try {
      await api.post("/api/modules/biblioteca/action", { action: "seleccionar", ficha_id: id });
      setSelectedId(id);
      notify("Sistema activo actualizado.");
      await refrescar(true);
      bump();
    } catch (e) {
      notify(errorTexto(e), "error");
    }
  }

  async function limpiar() {
    try {
      await api.post("/api/modules/biblioteca/action", { action: "limpiar" });
      setSelectedId(null);
      setDetalle(null);
      notify("Biblioteca sin sistema activo.");
      await refrescar(true);
      bump();
    } catch (e) {
      notify(errorTexto(e), "error");
    }
  }

  async function vincular(doc: Documento, sistemaId: string | null) {
    try {
      await api.post("/api/modules/biblioteca/action", {
        action: "vincular_documento",
        documento_id: doc.id,
        sistema_id: sistemaId,
      });
      notify(sistemaId ? "Documento vinculado al sistema activo." : "Documento desvinculado.");
      await refrescar(true);
      await recargarDetalle();
      bump();
    } catch (e) {
      notify(errorTexto(e), "error");
    }
  }

  async function leerDocumento(doc: Documento) {
    try {
      const leido = await api.get<DocumentoLeido>(`/api/biblioteca/documentos/${doc.id}`);
      setDocAbierto(leido);
    } catch (e) {
      notify(errorTexto(e), "error");
    }
  }

  async function borrarDocumento(doc: Documento) {
    if (!window.confirm(`¿Borrar "${doc.titulo}"? Esta acción no se puede deshacer.`)) return;
    try {
      await api.del(`/api/biblioteca/documentos/${doc.id}`);
      notify("Documento borrado.");
      await refrescar(true);
      bump();
    } catch (e) {
      notify(errorTexto(e), "error");
    }
  }

  async function subirArchivo(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setSubiendo(true);
    try {
      const fd = new FormData();
      fd.append("archivo", file);
      if (selectedId) fd.append("sistema_id", selectedId);
      const resp = await api.upload<{ ok: boolean; documento: Documento }>("/api/biblioteca/documentos", fd);
      notify(`Importado: ${resp.documento.titulo}`);
      setTab("material");
      await refrescar(true);
      await recargarDetalle(selectedId);
      bump();
    } catch (err) {
      notify(errorTexto(err), "error");
    } finally {
      setSubiendo(false);
    }
  }

  async function tirarMythic(tipo: string) {
    setMythicLoading(true);
    try {
      const resp = await api.post<{ resultado: ResultadoMythic; tirada: TiradaMythic }>(
        "/api/modules/biblioteca/action",
        {
          action: "mythic_tirar",
          tipo,
          pregunta: pregunta.trim(),
          odds,
          chaos,
        },
      );
      setResultado(resp.resultado);
      setTirada(resp.tirada);
      bump();
    } catch (e) {
      notify(errorTexto(e), "error");
    } finally {
      setMythicLoading(false);
    }
  }

  if (error && !data) {
    return <ErrorBox>{error}</ErrorBox>;
  }

  if (!data) {
    return (
      <div className="flex items-center justify-center gap-2 py-10 text-xs text-slate-500">
        <Spinner /> Cargando biblioteca…
      </div>
    );
  }

  const mythic = data.generadores.mythic;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <span className="text-2xl">📚</span>
          <div className="min-w-0">
            <h2 className="truncate font-display text-xl text-slate-100">Biblioteca TTRPG</h2>
            <p className="truncate text-[11px] text-slate-500">
              {data.total} fichas y documentos · {data.estadisticas.documentos} documentos · clasificación por categoría, género y motor
            </p>
          </div>
          {loading ? <Spinner className="h-3.5 w-3.5 text-gold" /> : null}
        </div>
        <div className="flex flex-wrap items-center gap-1 rounded-xl border border-line bg-panel2/60 p-1">
          {(
            [
              ["catalogo", "Catálogo", "📖"],
              ["generadores", "Generadores", "🎲"],
              ["material", "Mi material", "📎"],
            ] as [Tab, string, string][]
          ).map(([id, label, icono]) => (
            <button
              key={id}
              type="button"
              onClick={() => setTab(id)}
              className={cn(
                "rounded-lg px-2.5 py-1.5 text-[11px] font-medium transition-colors",
                tab === id ? "bg-gold text-ink" : "text-slate-400 hover:bg-white/5 hover:text-white",
              )}
            >
              {icono} {label}
            </button>
          ))}
        </div>
      </div>

      {data.sistema_activo ? (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-gold/25 bg-gold/5 px-3 py-2">
          <div className="flex items-center gap-2 text-xs text-slate-300">
            <span className="text-gold">Sistema activo:</span>
            <strong className="text-white">{data.sistema_activo.titulo}</strong>
            <Badge color="gold">{data.sistema_activo.categoria_label}</Badge>
            <Badge color="slate">{data.sistema_activo.motor || "sin motor"}</Badge>
            {docsActivos.length ? <Badge color="teal">{docsActivos.length} doc(s) vinculado(s)</Badge> : null}
          </div>
          <div className="flex gap-1">
            <Button size="xs" variant="ghost" onClick={() => setTab("generadores")}>
              Usar generadores
            </Button>
            <Button size="xs" variant="danger" onClick={limpiar}>
              Quitar
            </Button>
          </div>
        </div>
      ) : (
        <div className="rounded-xl border border-dashed border-line px-3 py-2 text-xs text-slate-500">
          Sin sistema activo. Elige una ficha del catálogo para que el DM IA reciba sus reglas, tu personalización y los documentos vinculados.
        </div>
      )}

      {tab === "catalogo" ? (
        <div className="grid items-start gap-3 xl:grid-cols-[minmax(0,1fr)_410px]">
          <div className="min-w-0 space-y-2">
            <div className="flex flex-wrap gap-2">
              <div className="relative min-w-[180px] flex-1">
                <span className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-xs text-slate-500">🔎</span>
                <Input
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  placeholder="Buscar por título, tag, regla, motor…"
                  className="pl-8"
                  aria-label="Buscar en la biblioteca"
                />
              </div>
              <Select value={categoria} onChange={(e) => setCategoria(e.target.value)} className="w-auto min-w-[120px]" aria-label="Categoría">
                <option value="todos">Todas las categorías</option>
                {data.facetas.categorias.map((f) => (
                  <option key={f.valor} value={f.valor}>{f.label}</option>
                ))}
              </Select>
              <Select value={genero} onChange={(e) => setGenero(e.target.value)} className="w-auto min-w-[120px]" aria-label="Género">
                <option value="todos">Todos los géneros</option>
                {data.facetas.generos.map((f) => (
                  <option key={f.valor} value={f.valor}>{f.label}</option>
                ))}
              </Select>
              <Select value={tipo} onChange={(e) => setTipo(e.target.value)} className="w-auto min-w-[110px]" aria-label="Tipo">
                <option value="todos">Todos los tipos</option>
                {data.facetas.tipos.map((f) => (
                  <option key={f.valor} value={f.valor}>{f.label}</option>
                ))}
              </Select>
              <Select value={familia} onChange={(e) => setFamilia(e.target.value)} className="w-auto min-w-[130px]" aria-label="Familia mecánica">
                <option value="todos">Todos los motores</option>
                {data.facetas.familias.map((f) => (
                  <option key={f.valor} value={f.valor}>{f.label}</option>
                ))}
              </Select>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-slate-500">
              <span>{filtradas.length} de {data.total} entradas</span>
              <a
                href={`${API_URL}${data.rutas.clasica}`}
                target="_blank"
                rel="noreferrer"
                className="text-teal underline decoration-teal/30 underline-offset-2 hover:text-white"
              >
                Abrir interfaz clásica
              </a>
            </div>

            {filtradas.length ? (
              <div className="grid gap-2 sm:grid-cols-2">
                {filtradas.map((item) => (
                  <Tarjeta
                    key={item.id}
                    item={item}
                    activa={item.id === activoId}
                    onClick={() => {
                      setSelectedId(item.id);
                      if (window.innerWidth < 1280) setTab("catalogo");
                    }}
                  />
                ))}
              </div>
            ) : (
              <Empty icon="🔍" title="No hay fichas con esos filtros">
                Prueba a quitar el texto de búsqueda o a seleccionar «todos» en categoría, género, tipo y motor.
              </Empty>
            )}
          </div>

          <aside className="min-w-0 rounded-xl border border-line bg-panel2/50 p-3 xl:sticky xl:top-16 xl:max-h-[78vh] xl:overflow-y-auto">
            {detalleLoading ? (
              <div className="flex items-center gap-2 py-8 text-xs text-slate-500"><Spinner /> Cargando ficha…</div>
            ) : detalle ? (
              <div className="space-y-3">
                <div className="flex items-start gap-3">
                  <FichaIcono item={detalle} grande />
                  <div className="min-w-0 flex-1">
                    <div className="mb-1 flex flex-wrap gap-1">
                      <Badge color="gold">{detalle.categoria_label}</Badge>
                      <Badge color="slate">{detalle.tipo_label}</Badge>
                      <Badge color="teal">{detalle.genero_label}</Badge>
                    </div>
                    <h3 className="font-display text-xl leading-tight text-white">{detalle.titulo}</h3>
                    <p className="mt-1 text-[11px] text-slate-500">
                      {detalle.motor || "Sin motor declarado"} · {detalle.familia_label}
                    </p>
                  </div>
                </div>

                <p className="text-[12px] leading-5 text-slate-400">{detalle.resumen}</p>

                <div className="grid grid-cols-2 gap-1.5 text-[10px]">
                  {[
                    ["Categoría", detalle.categoria_label],
                    ["Tipo", detalle.tipo_label],
                    ["Género", detalle.genero_label],
                    ["Familia", detalle.familia_label],
                    ["Fuente", detalle.fuente || "—"],
                    ["Actualizado", detalle.actualizado || "—"],
                  ].map(([k, v]) => (
                    <div key={k} className="rounded-lg border border-line/70 bg-ink/30 px-2 py-1.5">
                      <div className="uppercase tracking-wider text-slate-600">{k}</div>
                      <div className="truncate text-slate-300" title={String(v)}>{v}</div>
                    </div>
                  ))}
                </div>

                {detalle.recursos.length ? (
                  <div className="flex flex-wrap gap-1">
                    {detalle.recursos.map((r) => <Chip key={r} className="text-[10px]">{r}</Chip>)}
                  </div>
                ) : null}

                <div className="flex flex-wrap gap-1">
                  <Button
                    size="sm"
                    variant={detalle.id === activoId ? "danger" : "primary"}
                    onClick={() => (detalle.id === activoId ? limpiar() : seleccionar(detalle.id))}
                  >
                    {detalle.id === activoId ? "Quitar de la mesa" : "Usar como sistema activo"}
                  </Button>
                  <a
                    href={`${API_URL}${data.rutas.clasica}`}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex h-8 items-center rounded-lg border border-line px-2.5 text-[11px] text-slate-400 hover:border-gold/40 hover:text-gold"
                    title="Abrir la biblioteca clásica"
                  >
                    📖 Clásica
                  </a>
                  <a
                    href={`${API_URL}/biblioteca-clasica/${detalle.ruta}`}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex h-8 items-center rounded-lg border border-line px-2.5 text-[11px] text-slate-400 hover:border-gold/40 hover:text-gold"
                    title="Abrir el Markdown original de esta ficha"
                  >
                    📄 .md
                  </a>
                </div>

                <div className="rounded-lg border border-line/70 bg-ink/30 px-2.5 py-2 text-[10px] leading-4 text-slate-500">
                  <strong className="text-slate-300">Contexto IA:</strong>{" "}
                  {detalle.id === activoId
                    ? `el DM recibirá ${detalle.contenido.length.toLocaleString("es-ES")} caracteres de ficha${detalle.personalizacion ? " + tu personalización" : ""} y ${detalle.documentos.length} documento(s) vinculado(s).`
                    : "activa esta ficha para que el DM la use como marco de reglas."}
                </div>

                {detalle.enlaces.length ? (
                  <div className="text-[10px] text-slate-500">
                    <div className="mb-1 uppercase tracking-wider text-slate-600">Enlaces</div>
                    <div className="flex flex-wrap gap-1">
                      {detalle.enlaces.slice(0, 5).map((url) => (
                        <a key={url} href={url} target="_blank" rel="noreferrer" className="max-w-full truncate text-teal hover:text-white">
                          {url.replace(/^https?:\/\//, "").slice(0, 40)}
                        </a>
                      ))}
                    </div>
                  </div>
                ) : null}

                <div className="border-t border-line/70 pt-2">
                  <MarkdownView>{personalizacionBase.base}</MarkdownView>
                </div>

                {personalizacionBase.personalizacion ? (
                  <details className="rounded-xl border border-gold/20 bg-gold/5 p-2" open>
                    <summary className="cursor-pointer text-[11px] font-semibold uppercase tracking-wider text-gold">
                      Tu personalización
                    </summary>
                    <div className="mt-2">
                      <MarkdownView>{personalizacionBase.personalizacion}</MarkdownView>
                    </div>
                  </details>
                ) : (
                  <p className="text-[10px] text-slate-600">
                    Personalización vacía. Edita la sección «Personalización del usuario» en el .md de la ficha para añadir reglas de tu mesa.
                  </p>
                )}

                {detalle.documentos.length ? (
                  <div className="space-y-1 border-t border-line/70 pt-2">
                    <div className="text-[10px] uppercase tracking-wider text-slate-600">Documentos vinculados</div>
                    {detalle.documentos.map((doc) => (
                      <div key={doc.id} className="flex items-center justify-between gap-2 rounded-lg border border-line/70 bg-ink/30 px-2 py-1.5">
                        <button type="button" className="min-w-0 truncate text-left text-[11px] text-slate-300 hover:text-gold" onClick={() => leerDocumento(doc)}>
                          {doc.icono} {doc.titulo}
                        </button>
                        <button type="button" className="text-[10px] text-red-300 hover:text-red-200" onClick={() => vincular(doc, null)}>
                          Quitar
                        </button>
                      </div>
                    ))}
                  </div>
                ) : null}
              </div>
            ) : (
              <div className="space-y-3">
                <Empty icon="📚" title="Elige una ficha">
                  Selecciona un sistema, colección o documento para leerlo y decidir si se convierte en el sistema activo de la mesa.
                </Empty>
                <div className="rounded-xl border border-line/70 bg-ink/30 p-3 text-[11px] text-slate-500">
                  <p className="mb-2 font-semibold text-slate-300">La biblioteca alimenta al DM IA</p>
                  <p>Al activar una ficha, el asistente recibe:</p>
                  <ul className="mt-1 list-disc space-y-0.5 pl-4">
                    <li>La ficha base y su motor.</li>
                    <li>Tu sección de personalización.</li>
                    <li>Los documentos de aventura vinculados.</li>
                  </ul>
                </div>
              </div>
            )}
          </aside>
        </div>
      ) : null}

      {tab === "generadores" ? (
        <div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_360px]">
          <div className="space-y-3 rounded-xl border border-line bg-panel2/50 p-3">
            <div>
              <h3 className="font-display text-lg text-slate-100">Generadores Mythic</h3>
              <p className="mt-0.5 text-[11px] leading-5 text-slate-500">
                Oráculo para jugar solo, improvisar o desbloquear una escena. Las tiradas se resuelven en el backend y quedan en el historial visible para la IA.
              </p>
            </div>
            <div className="grid gap-2 sm:grid-cols-2">
              <Field label="Pregunta o contexto" className="sm:col-span-2">
                <Input
                  value={pregunta}
                  onChange={(e) => setPregunta(e.target.value)}
                  placeholder="¿La puerta está cerrada? ¿El PNJ miente? ¿Qué encuentra el grupo?"
                />
              </Field>
              <Field label="Probabilidad">
                <Select value={odds} onChange={(e) => setOdds(e.target.value)}>
                  {mythic.odds.map((o) => <option key={o} value={o}>{o}</option>)}
                </Select>
              </Field>
              <Field label={`Caos: ${chaos}`}>
                <input
                  type="range"
                  min={1}
                  max={9}
                  value={chaos}
                  onChange={(e) => setChaos(Number(e.target.value))}
                  className="h-10 w-full accent-amber-400"
                />
              </Field>
            </div>
            <div className="flex flex-wrap gap-1.5">
              <Button size="sm" variant="primary" loading={mythicLoading} onClick={() => tirarMythic("pregunta")}>
                Pregunta sí/no
              </Button>
              <Button size="sm" variant="secondary" loading={mythicLoading} onClick={() => tirarMythic("evento")}>
                Significado de evento
              </Button>
              <Button size="sm" variant="secondary" loading={mythicLoading} onClick={() => tirarMythic("completo")}>
                Evento completo
              </Button>
              <Button size="sm" variant="secondary" loading={mythicLoading} onClick={() => tirarMythic("escena")}>
                Ajuste de escena
              </Button>
            </div>
            <p className="text-[10px] text-slate-600">
              El caos alto hace más probables los extremos y los eventos; el caos bajo estabiliza la ficción. Las tablas son curadas y compatibles con Mythic GME.
            </p>
          </div>

          <div className="space-y-2">
            <div className="rounded-xl border border-line bg-panel2/50 p-3">
              <div className="mb-2 flex items-center justify-between">
                <h4 className="text-[11px] font-semibold uppercase tracking-widest text-slate-400">Resultado</h4>
                {tirada ? <Badge color="slate">{tirada.expr}</Badge> : null}
              </div>
              {resultado ? (
                <div className="space-y-2">
                  <p className="font-display text-lg leading-snug text-gold">{resultado.texto || "—"}</p>
                  {resultado.foco ? (
                    <div className="rounded-lg border border-line/70 bg-ink/30 px-2 py-1.5 text-[11px] text-slate-300">
                      <span className="text-slate-500">Foco:</span> {resultado.foco.texto}
                    </div>
                  ) : null}
                  {resultado.accion ? (
                    <div className="grid grid-cols-2 gap-1 text-[11px]">
                      <div className="rounded-lg border border-line/70 bg-ink/30 px-2 py-1.5">
                        <div className="text-[9px] uppercase tracking-wider text-slate-600">Acción</div>
                        <div className="text-slate-300">{resultado.accion}</div>
                      </div>
                      <div className="rounded-lg border border-line/70 bg-ink/30 px-2 py-1.5">
                        <div className="text-[9px] uppercase tracking-wider text-slate-600">Sujeto</div>
                        <div className="text-slate-300">{resultado.sujeto}</div>
                      </div>
                    </div>
                  ) : null}
                  {resultado.descriptor ? (
                    <div className="text-[11px] text-slate-400"><span className="text-slate-500">Descriptor:</span> {resultado.descriptor}</div>
                  ) : null}
                  {resultado.detalle ? <p className="text-[11px] leading-5 text-slate-400">{resultado.detalle}</p> : null}
                  <div className="flex flex-wrap gap-1">
                    {(resultado.tiradas ?? (tirada?.tiradas || [])).map((t, i) => (
                      <Badge key={`${t}-${i}`} color="violet">{t}</Badge>
                    ))}
                    {resultado.umbral ? <Badge color="slate">umbral {resultado.umbral}</Badge> : null}
                    {resultado.odds ? <Badge color="slate">{resultado.odds}</Badge> : null}
                  </div>
                  {tirada ? <p className="text-[10px] text-slate-600">{tirada.razon || "Tirada Mythic"} · {tirada.ts}</p> : null}
                </div>
              ) : (
                <Empty icon="🎲" title="Sin tirada todavía">Formula una pregunta y elige un generador.</Empty>
              )}
            </div>
            <div className="rounded-xl border border-line/70 bg-ink/30 p-3 text-[10px] leading-4 text-slate-500">
              <strong className="text-slate-300">Cómo usarlo:</strong> interpreta el resultado como una propuesta. Si no encaja, reformula la pregunta o ajusta el caos. El DM IA ve la tirada en el contexto y puede continuar la escena.
            </div>
          </div>
        </div>
      ) : null}

      {tab === "material" ? (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-line bg-panel2/50 p-3">
            <div className="min-w-0">
              <h3 className="font-display text-lg text-slate-100">Mi material de campaña</h3>
              <p className="mt-0.5 text-[11px] leading-5 text-slate-500">
                Sube aventuras propias en <strong className="text-slate-300">.md</strong>, <strong className="text-slate-300">.txt</strong> o <strong className="text-slate-300">.pdf</strong>. Se guardan en <code className="text-teal">{data.rutas.subidas}</code> y el DM IA puede leerlos cuando vincules el documento a un sistema.
              </p>
            </div>
            <div className="flex flex-wrap gap-1">
              <input ref={fileRef} type="file" accept=".md,.txt,.pdf" className="hidden" onChange={subirArchivo} />
              <Button variant="primary" loading={subiendo} onClick={() => fileRef.current?.click()}>
                📎 Subir documento
              </Button>
            </div>
          </div>

          {data.documentos.length ? (
            <div className="space-y-1.5">
              {data.documentos.map((doc) => {
                const vinculado = Boolean(activoId && doc.sistema_id === activoId);
                return (
                  <div
                    key={doc.id}
                    className={cn(
                      "flex flex-wrap items-center gap-2 rounded-xl border bg-panel2/40 px-3 py-2",
                      vinculado ? "border-gold/30 bg-gold/5" : "border-line",
                    )}
                  >
                    <span className="text-xl">{doc.icono}</span>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-1">
                        <strong className="truncate text-[12px] text-slate-200">{doc.titulo}</strong>
                        <Badge color={doc.origen === "subida" ? "teal" : "slate"}>{doc.origen === "subida" ? "Subido" : "Biblioteca"}</Badge>
                        {vinculado ? <Badge color="gold">Sistema activo</Badge> : null}
                      </div>
                      <div className="truncate text-[10px] text-slate-500">
                        {doc.tipo.toUpperCase()} · {bytesLegibles(doc.bytes)} · {doc.actualizado} · {doc.nombre}
                        {doc.sistema_id && !vinculado ? ` · vinculado a ${doc.sistema_id}` : ""}
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-1">
                      <Button size="xs" variant="ghost" onClick={() => leerDocumento(doc)}>Leer</Button>
                      <a
                        href={`${API_URL}/api/biblioteca/documentos/${doc.id}/archivo`}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex h-7 items-center rounded-lg border border-transparent px-2 text-[11px] text-slate-400 hover:bg-white/5 hover:text-white"
                      >
                        Descargar
                      </a>
                      {vinculado ? (
                        <Button size="xs" variant="ghost" onClick={() => vincular(doc, null)}>Desvincular</Button>
                      ) : (
                        <Button
                          size="xs"
                          variant="secondary"
                          onClick={() => {
                            if (!activoId) {
                              notify("Activa un sistema antes de vincular documentos.", "error");
                              return;
                            }
                            void vincular(doc, activoId);
                          }}
                        >
                          Vincular
                        </Button>
                      )}
                      {doc.origen === "subida" ? (
                        <Button size="xs" variant="danger" onClick={() => borrarDocumento(doc)}>Borrar</Button>
                      ) : null}
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <Empty icon="📎" title="Todavía no hay documentos">
              Sube una aventura, unas notas de campaña o un PDF. Para PDF se extrae el texto y se indexa para el DM IA.
            </Empty>
          )}
        </div>
      ) : null}

      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-line/60 pt-2 text-[10px] text-slate-600">
        <span>{data.aviso}</span>
        <span>Fuente editable: <code>biblioteca/</code> · {data.total} entradas</span>
      </div>

      <Modal open={Boolean(docAbierto)} onClose={() => setDocAbierto(null)} title={docAbierto?.titulo || "Documento"} wide>
        {docAbierto ? (
          <div className="space-y-2">
            <div className="flex flex-wrap gap-1 text-[10px] text-slate-500">
              <Badge color="slate">{docAbierto.tipo.toUpperCase()}</Badge>
              <Badge color="slate">{docAbierto.caracteres.toLocaleString("es-ES")} caracteres</Badge>
              {docAbierto.truncado ? <Badge color="red">Vista recortada</Badge> : null}
            </div>
            {docAbierto.tipo === "md" ? (
              <MarkdownView>{docAbierto.contenido}</MarkdownView>
            ) : (
              <pre className="max-h-[60vh] overflow-auto whitespace-pre-wrap rounded-xl border border-line bg-ink/60 p-3 text-[12px] leading-5 text-slate-300">
                {docAbierto.contenido}
              </pre>
            )}
          </div>
        ) : null}
      </Modal>
    </div>
  );
}
