/* Biblioteca TTRPG · interfaz de exploración
   Datos: datos.js (generado por tools/build_index.py)
   Markdown: assets/marked.min.js
*/
(() => {
  "use strict";

  const DATA = (window.BIBLIOTECA && Array.isArray(window.BIBLIOTECA.fichas))
    ? window.BIBLIOTECA.fichas
    : [];

  const $ = (sel) => document.querySelector(sel);

  const state = {
    q: "",
    genero: "todos",
    tipo: "todos",
    orden: "orden",
    selected: null,
  };

  const norm = (value) => String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();

  const esc = (value) => String(value ?? "").replace(/[&<>"']/g, (c) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  }[c]));

  // Índice de búsqueda: título, resumen, etiquetas y contenido completo.
  DATA.forEach((f) => {
    f._search = norm([
      f.titulo,
      f.resumen,
      f.genero_label,
      f.tipo_label,
      (f.tags || []).join(" "),
      f.contenido,
    ].join(" "));
  });

  const generos = [...new Map(DATA.map((f) => [f.genero, f.genero_label])).entries()];
  const tipos = [...new Map(DATA.map((f) => [f.tipo, f.tipo_label])).entries()];

  const conteo = (predicado) => DATA.filter(predicado).length;

  function renderFiltros() {
    const botonesGenero = [
      ["todos", "Todos", DATA.length],
      ...generos.map(([valor, label]) => [
        valor,
        label,
        conteo((f) => f.genero === valor),
      ]),
    ];

    $("#generos").innerHTML = botonesGenero.map(([valor, label, n]) => `
      <button type="button" class="chip ${state.genero === valor ? "activo" : ""}"
              data-filtro="genero" data-valor="${esc(valor)}">
        ${esc(label)} <span class="n">${n}</span>
      </button>
    `).join("");

    const botonesTipo = [
      ["todos", "Todos", DATA.length],
      ...tipos.map(([valor, label]) => [
        valor,
        label,
        conteo((f) => f.tipo === valor),
      ]),
    ];

    $("#tipos").innerHTML = botonesTipo.map(([valor, label, n]) => `
      <button type="button" class="chip ${state.tipo === valor ? "activo" : ""}"
              data-filtro="tipo" data-valor="${esc(valor)}">
        ${esc(label)} <span class="n">${n}</span>
      </button>
    `).join("");

    $("#stats").innerHTML = `
      <div><b>${conteo((f) => f.tipo === "ficha")}</b><span>Fichas</span></div>
      <div><b>${conteo((f) => f.tipo === "coleccion")}</b><span>Colecciones</span></div>
      <div><b>${conteo((f) => f.tipo === "indice")}</b><span>Índices</span></div>
    `;

    const sub = $("#brand-sub");
    if (sub) sub.textContent = `${DATA.length} fichas · DM IA`;

    const bienvenidaTotal = $("#bienvenida-total");
    if (bienvenidaTotal) bienvenidaTotal.textContent = DATA.length;
  }

  function filtrados() {
    let lista = DATA.filter((f) => state.genero === "todos" || f.genero === state.genero);
    lista = lista.filter((f) => state.tipo === "todos" || f.tipo === state.tipo);

    const q = norm(state.q.trim());
    if (q) {
      lista = lista.filter((f) => f._search.includes(q));
    }

    const porOrden = (a, b) => (a.orden - b.orden) || a.titulo.localeCompare(b.titulo, "es");
    const porTitulo = (a, b) => a.titulo.localeCompare(b.titulo, "es");
    const porGenero = (a, b) => a.genero.localeCompare(b.genero, "es")
      || a.titulo.localeCompare(b.titulo, "es");

    if (state.orden === "titulo") lista.sort(porTitulo);
    else if (state.orden === "genero") lista.sort(porGenero);
    else lista.sort(porOrden);

    return lista;
  }

  function tagsHTML(tags, max = 4) {
    const visibles = (tags || []).slice(0, max);
    const resto = (tags || []).length - visibles.length;
    return visibles.map((t) => `<span class="tag">${esc(t)}</span>`).join("")
      + (resto > 0 ? `<span class="tag mas">+${resto}</span>` : "");
  }

  function cardHTML(f) {
    return `
      <button type="button" class="card ${state.selected === f.id ? "activa" : ""}"
              data-id="${esc(f.id)}" title="${esc(f.resumen)}">
        <span class="icono" style="--c:${esc(f.color)}">
          ${f.logo ? `<img src="${esc(f.logo)}" alt="" onerror="this.style.display='none'">` : esc(f.icono)}
        </span>
        <span class="card-body">
          <span class="card-top">
            <span class="card-title">${esc(f.titulo)}</span>
            <span class="badge" data-tipo="${esc(f.tipo)}">${esc(f.tipo_label)}</span>
          </span>
          <span class="card-summary">${esc(f.resumen)}</span>
          <span class="tags">${tagsHTML(f.tags)}</span>
        </span>
      </button>
    `;
  }

  function renderLista() {
    const lista = filtrados();

    const titulo = state.q.trim()
      ? "Búsqueda"
      : (state.genero === "todos"
        ? "Todas las fichas"
        : (generos.find(([g]) => g === state.genero)?.[1] || "Fichas"));

    $("#lista-titulo").textContent = titulo;
    $("#contador").textContent = `${lista.length} de ${DATA.length} · ${state.tipo === "todos" ? "todos los tipos" : tipos.find(([t]) => t === state.tipo)?.[1] || state.tipo}`;
    $("#cards").innerHTML = lista.length
      ? lista.map(cardHTML).join("")
      : `<div class="vacio">
           <div class="vacio-icono">🔎</div>
           <strong>Sin resultados</strong>
           <span>Prueba con otro término o quita los filtros.</span>
           <button type="button" class="btn" id="limpiar-filtros">Limpiar filtros</button>
         </div>`;

    const limpiar = $("#limpiar-filtros");
    if (limpiar) {
      limpiar.addEventListener("click", () => {
        state.q = "";
        state.genero = "todos";
        state.tipo = "todos";
        $("#q").value = "";
        renderFiltros();
        renderLista();
      });
    }
  }

  function renderDetalle(f) {
    const icono = f.logo
      ? `<img src="${esc(f.logo)}" alt="" onerror="this.style.display='none'">`
      : esc(f.icono);

    const tags = (f.tags || [])
      .map((t) => `<span class="tag" data-tag="${esc(t)}">${esc(t)}</span>`)
      .join("");

    let html;
    if (window.marked && typeof window.marked.parse === "function") {
      html = window.marked.parse(f.contenido);
    } else {
      html = `<pre>${esc(f.contenido)}</pre>`;
    }

    const article = $("#ficha");
    article.innerHTML = `
      <div class="detalle-inner">
        <header class="ficha-head">
          <div class="icono-grande" style="--c:${esc(f.color)}">${icono}</div>
          <div class="ficha-meta">
            <div class="eyebrow">${esc(f.genero_label)} · ${esc(f.tipo_label)}</div>
            <h1>${esc(f.titulo)}</h1>
            <div class="tags">${tags}</div>
            <div class="acciones">
              <a class="btn primario" href="${esc(f.ruta)}" target="_blank" rel="noopener">Abrir .md</a>
              <button type="button" class="btn" id="copiar-ruta">Copiar ruta</button>
            </div>
            <div class="ruta"><code>biblioteca/${esc(f.ruta)}</code></div>
          </div>
        </header>

        <div class="aviso-ia">
          🤖 <strong>Para el DM IA:</strong> carga esta ficha y después su sección
          <em>Personalización del usuario</em>. Ahí estarán tus reglas, variaciones,
          historias, locaciones y comandos.
        </div>

        <div class="markdown">${html}</div>
      </div>
    `;

    $("#bienvenida").hidden = true;
    article.hidden = false;
    $("#detalle").scrollTop = 0;

    // Tablas anchas con scroll horizontal.
    article.querySelectorAll("table").forEach((table) => {
      if (table.parentElement && table.parentElement.classList.contains("table-wrap")) return;
      const wrap = document.createElement("div");
      wrap.className = "table-wrap";
      table.parentNode.insertBefore(wrap, table);
      wrap.appendChild(table);
    });

    // Enlaces externos en pestaña nueva.
    article.querySelectorAll("a").forEach((a) => {
      if (/^https?:/i.test(a.getAttribute("href") || "")) {
        a.target = "_blank";
        a.rel = "noopener";
      }
    });

    // Etiquetas clicables: buscar ese tag.
    article.querySelectorAll("[data-tag]").forEach((tag) => {
      tag.addEventListener("click", () => {
        const valor = tag.getAttribute("data-tag") || "";
        state.q = valor;
        $("#q").value = valor;
        renderLista();
        $("#q").focus();
      });
    });

    const copiar = $("#copiar-ruta");
    if (copiar) {
      copiar.addEventListener("click", async () => {
        const texto = `biblioteca/${f.ruta}`;
        const original = copiar.textContent;
        try {
          if (navigator.clipboard && window.isSecureContext) {
            await navigator.clipboard.writeText(texto);
          } else {
            const ta = document.createElement("textarea");
            ta.value = texto;
            ta.style.position = "fixed";
            ta.style.opacity = "0";
            document.body.appendChild(ta);
            ta.select();
            document.execCommand("copy");
            ta.remove();
          }
          copiar.textContent = "¡Copiado!";
        } catch {
          copiar.textContent = "No se pudo copiar";
        }
        setTimeout(() => { copiar.textContent = original; }, 1600);
      });
    }

    if (window.innerWidth <= 980) {
      $("#detalle").classList.add("open");
      document.documentElement.classList.add("detalle-abierto");
      document.body.classList.add("detalle-abierto");
    }
  }

  function seleccionar(id, push = true) {
    const f = DATA.find((x) => x.id === id);
    if (!f) return;
    state.selected = id;
    renderDetalle(f);
    document.querySelectorAll(".card").forEach((card) => {
      card.classList.toggle("activa", card.dataset.id === id);
    });
    if (push) {
      try {
        history.replaceState(null, "", `${location.href.split("#")[0]}#${encodeURIComponent(id)}`);
      } catch {
        /* file:// puede bloquear replaceState en algunos navegadores. */
      }
    }
  }

  function mostrarBienvenida() {
    state.selected = null;
    $("#ficha").hidden = true;
    $("#bienvenida").hidden = false;
    $("#detalle").classList.remove("open");
    document.documentElement.classList.remove("detalle-abierto");
    document.body.classList.remove("detalle-abierto");
    document.querySelectorAll(".card").forEach((card) => card.classList.remove("activa"));
  }

  function cerrarDetalle() {
    $("#detalle").classList.remove("open");
    document.documentElement.classList.remove("detalle-abierto");
    document.body.classList.remove("detalle-abierto");
    try {
      history.replaceState(null, "", location.href.split("#")[0]);
    } catch {
      /* ignore */
    }
  }

  // ---------- Eventos ----------

  $("#q").addEventListener("input", (event) => {
    state.q = event.target.value;
    renderLista();
  });

  $("#orden").addEventListener("change", (event) => {
    state.orden = event.target.value;
    renderLista();
  });

  $("#generos").addEventListener("click", (event) => {
    const boton = event.target.closest("[data-filtro]");
    if (!boton) return;
    state.genero = boton.dataset.valor;
    renderFiltros();
    renderLista();
  });

  $("#tipos").addEventListener("click", (event) => {
    const boton = event.target.closest("[data-filtro]");
    if (!boton) return;
    state.tipo = boton.dataset.valor;
    renderFiltros();
    renderLista();
  });

  $("#cards").addEventListener("click", (event) => {
    const card = event.target.closest(".card");
    if (card) seleccionar(card.dataset.id);
  });

  $("#cerrar").addEventListener("click", cerrarDetalle);

  window.addEventListener("hashchange", () => {
    const id = decodeURIComponent(location.hash.slice(1));
    if (id && DATA.some((f) => f.id === id)) seleccionar(id, false);
    else mostrarBienvenida();
  });

  document.addEventListener("keydown", (event) => {
    const enInput = document.activeElement === $("#q");

    if (event.key === "/" && !enInput) {
      event.preventDefault();
      $("#q").focus();
      $("#q").select();
    }

    if (event.key === "Escape") {
      if (enInput) {
        $("#q").value = "";
        state.q = "";
        renderLista();
        $("#q").blur();
      } else if (window.innerWidth <= 980) {
        cerrarDetalle();
      }
    }
  });

  // ---------- Arranque ----------

  renderFiltros();
  renderLista();

  const inicial = decodeURIComponent(location.hash.slice(1));
  if (inicial && DATA.some((f) => f.id === inicial)) {
    seleccionar(inicial, false);
  } else {
    mostrarBienvenida();
  }
})();
