"use strict";

/**
 * app.js — Frontend de Base de Cuentas CRM Bitrix
 * ------------------------------------------------
 * Funcionalidades:
 *  - Carga y muestra los datos del CSV en una tabla paginada
 *  - Búsqueda en tiempo real sobre todos los campos
 *  - Ordenamiento por columna (clic en encabezado)
 *  - Edición inline de celdas con doble clic → modal → guarda en el CSV
 *  - Paginación con navegación por páginas
 */

const API = "http://localhost:3000/api";

// ── Estado global ────────────────────────────────────────────────────────────
const estado = {
  headers   : [],
  pagina    : 1,
  porPagina : 50,
  total     : 0,
  busqueda  : "",
  sortCol   : null,
  sortDir   : "asc",   // "asc" | "desc"
  debounceId: null,
};

// ── Referencias DOM ──────────────────────────────────────────────────────────
const $tabla        = document.getElementById("tabla");
const $thead        = document.getElementById("thead");
const $tbody        = document.getElementById("tbody");
const $estadoCarga  = document.getElementById("estado-carga");
const $badgeTotal   = document.getElementById("badge-total");
const $paginacion   = document.getElementById("paginacion");
const $inputBusq    = document.getElementById("input-busqueda");
const $selectPor    = document.getElementById("select-por-pagina");
const $btnRecargar  = document.getElementById("btn-recargar");

// Modal
const $overlay      = document.getElementById("modal-overlay");
const $modalIdLabel = document.getElementById("modal-id-label");
const $modalColLabel= document.getElementById("modal-col-label");
const $modalValor   = document.getElementById("modal-valor");
const $modalCancelar= document.getElementById("modal-cancelar");
const $modalGuardar = document.getElementById("modal-guardar");

// Toast
const $toast        = document.getElementById("toast");

// ── Columnas que se muestran en la tabla (las más relevantes) ────────────────
// Si quieres ver TODAS las columnas, cambia COLS_VISIBLES a null
const COLS_VISIBLES = [
  "IDENTIFICACION FISCAL",
  "CODIGO SAP",
  "NOMBRE DE CLIENTE",
  "NOMBRE CORTO",
  "CLASE DE CLIENTE",
  "PAIS",
  "CIUDAD",
  "FORMA DE PAGO FADESA Ecu. Metales",
  "CUPO DE CREDITO FADESA Ecu. Metales",
  "FORMA DE PAGO FADESA Ecu. Plasticos",
  "CUPO DE CREDITO FADESA Ecu. Plasticos",
  "FORMA DE PAGO ECB",
  "CUPO DE CREDITO ECB",
  "FORMA DE PAGO FADESA Col. Metales",
  "CUPO DE CREDITO FADESA Col. Metales",
  "RIESGO DEL CLIENTE",
  "SEGMENTO CLIENTE",
  "GRUPO EMPRESARIAL",
  "ESTADO_CARGA",
  "BITRIX_ID",
  "MENSAJE_ERROR",
  "FECHA_EJECUCION",
];

// Columnas editables
const COLS_EDITABLES = new Set([
  "NOMBRE DE CLIENTE",
  "NOMBRE CORTO",
  "CLASE DE CLIENTE",
  "PAIS",
  "CIUDAD",
  "BILLINGSTREET",
  "FORMA DE PAGO FADESA Ecu. Metales",
  "CUPO DE CREDITO FADESA Ecu. Metales",
  "FORMA DE PAGO FADESA Ecu. Plasticos",
  "CUPO DE CREDITO FADESA Ecu. Plasticos",
  "FORMA DE PAGO ECB",
  "CUPO DE CREDITO ECB",
  "FORMA DE PAGO FADESA Col. Metales",
  "CUPO DE CREDITO FADESA Col. Metales",
  "FORMA DE PAGO FADESA Peru Metales",
  "CUPO DE CREDITO FADESA Peru Metales",
  "FORMA DE PAGO FADESA Manta S.A.",
  "CUPO DE CREDITO FADESA Manta S.A.",
  "RIESGO DEL CLIENTE",
  "SEGMENTO CLIENTE",
  "GRUPO EMPRESARIAL",
  "ESTADO_CARGA",
  "BITRIX_ID",
  "MENSAJE_ERROR",
]);

// ── Carga de datos ───────────────────────────────────────────────────────────
async function cargarDatos() {
  mostrarEstado("Cargando datos…");
  $tabla.classList.add("hidden");

  const params = new URLSearchParams({
    q      : estado.busqueda,
    pagina : estado.pagina,
    por    : estado.porPagina,
  });

  try {
    const res  = await fetch(`${API}/datos?${params}`);
    if (!res.ok) throw new Error(`Error del servidor: ${res.status}`);
    const data = await res.json();

    estado.headers = data.headers;
    estado.total   = data.total;

    renderizarTabla(data.headers, data.rows);
    renderizarPaginacion(data.total, data.pagina, data.porPagina);

    $badgeTotal.textContent = `${data.total.toLocaleString()} registros`;
    $estadoCarga.classList.add("hidden");
    $tabla.classList.remove("hidden");

  } catch (err) {
    mostrarEstado(`❌ ${err.message}`);
  }
}

// ── Renderizado de tabla ─────────────────────────────────────────────────────
function renderizarTabla(headers, rows) {
  const cols = COLS_VISIBLES
    ? headers.filter(h => COLS_VISIBLES.includes(h))
    : headers;

  // Encabezados
  $thead.innerHTML = "";
  const tr = document.createElement("tr");
  cols.forEach(col => {
    const th = document.createElement("th");
    th.title = col;

    const icono = estado.sortCol === col
      ? (estado.sortDir === "asc" ? " ▲" : " ▼")
      : "";
    th.innerHTML = `${col}<span class="sort-icon">${icono}</span>`;

    th.addEventListener("click", () => ordenarPor(col));
    tr.appendChild(th);
  });
  $thead.appendChild(tr);

  // Filas
  $tbody.innerHTML = "";

  // Ordenamiento local (sobre la página actual)
  let filas = [...rows];
  if (estado.sortCol && cols.includes(estado.sortCol)) {
    filas.sort((a, b) => {
      const va = (a[estado.sortCol] || "").toLowerCase();
      const vb = (b[estado.sortCol] || "").toLowerCase();
      const cmp = va.localeCompare(vb, "es", { numeric: true });
      return estado.sortDir === "asc" ? cmp : -cmp;
    });
  }

  if (filas.length === 0) {
    const td = document.createElement("td");
    td.colSpan = cols.length;
    td.style.textAlign = "center";
    td.style.padding   = "32px";
    td.style.color     = "#5f6368";
    td.textContent     = "No se encontraron registros.";
    const trVacio = document.createElement("tr");
    trVacio.appendChild(td);
    $tbody.appendChild(trVacio);
    return;
  }

  filas.forEach(row => {
    const tr = document.createElement("tr");
    cols.forEach(col => {
      const td  = document.createElement("td");
      const val = row[col] || "";
      td.textContent = val;
      td.title       = val;

      if (col === "NOMBRE DE CLIENTE") td.classList.add("col-nombre");

      if (COLS_EDITABLES.has(col)) {
        td.classList.add("editable");
        td.addEventListener("dblclick", () =>
          abrirModal(row["IDENTIFICACION FISCAL"], col, val)
        );
      }

      tr.appendChild(td);
    });
    $tbody.appendChild(tr);
  });
}

// ── Ordenamiento ─────────────────────────────────────────────────────────────
function ordenarPor(col) {
  if (estado.sortCol === col) {
    estado.sortDir = estado.sortDir === "asc" ? "desc" : "asc";
  } else {
    estado.sortCol = col;
    estado.sortDir = "asc";
  }
  cargarDatos();
}

// ── Paginación ───────────────────────────────────────────────────────────────
function renderizarPaginacion(total, paginaActual, porPagina) {
  $paginacion.innerHTML = "";
  const totalPaginas = Math.ceil(total / porPagina);
  if (totalPaginas <= 1) return;

  const agregar = (texto, pagina, activa = false, disabled = false) => {
    const btn = document.createElement("button");
    btn.innerHTML = texto;
    if (activa)   btn.classList.add("activa");
    if (disabled) btn.disabled = true;
    btn.addEventListener("click", () => {
      estado.pagina = pagina;
      cargarDatos();
    });
    $paginacion.appendChild(btn);
  };

  agregar("«", 1,              false, paginaActual === 1);
  agregar("‹", paginaActual - 1, false, paginaActual === 1);

  // Ventana de páginas
  const ventana = 2;
  let inicio = Math.max(1, paginaActual - ventana);
  let fin    = Math.min(totalPaginas, paginaActual + ventana);

  if (inicio > 1) {
    agregar("1", 1);
    if (inicio > 2) {
      const sep = document.createElement("span");
      sep.className   = "info-pagina";
      sep.textContent = "…";
      $paginacion.appendChild(sep);
    }
  }

  for (let p = inicio; p <= fin; p++) {
    agregar(p, p, p === paginaActual);
  }

  if (fin < totalPaginas) {
    if (fin < totalPaginas - 1) {
      const sep = document.createElement("span");
      sep.className   = "info-pagina";
      sep.textContent = "…";
      $paginacion.appendChild(sep);
    }
    agregar(totalPaginas, totalPaginas);
  }

  agregar("›", paginaActual + 1, false, paginaActual === totalPaginas);
  agregar("»", totalPaginas,     false, paginaActual === totalPaginas);

  const info = document.createElement("span");
  info.className   = "info-pagina";
  info.textContent = `Página ${paginaActual} de ${totalPaginas}`;
  $paginacion.appendChild(info);
}

// ── Modal de edición ─────────────────────────────────────────────────────────
let _editando = { id: null, col: null };

function abrirModal(id, col, valorActual) {
  _editando = { id, col };
  $modalIdLabel.innerHTML  = `<strong>ID Fiscal:</strong> ${id}`;
  $modalColLabel.innerHTML = `<strong>Campo:</strong> ${col}`;
  $modalValor.value        = valorActual;
  $overlay.classList.remove("hidden");
  setTimeout(() => $modalValor.focus(), 50);
}

function cerrarModal() {
  $overlay.classList.add("hidden");
  _editando = { id: null, col: null };
}

$modalCancelar.addEventListener("click", cerrarModal);
$overlay.addEventListener("click", e => { if (e.target === $overlay) cerrarModal(); });

$modalGuardar.addEventListener("click", async () => {
  const { id, col } = _editando;
  const nuevoValor  = $modalValor.value;

  $modalGuardar.disabled    = true;
  $modalGuardar.textContent = "Guardando…";

  try {
    const res = await fetch(`${API}/celda`, {
      method : "PUT",
      headers: { "Content-Type": "application/json" },
      body   : JSON.stringify({ identificacion: id, columna: col, valor: nuevoValor }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Error al guardar");

    mostrarToast("✅ Cambio guardado correctamente", "success");
    cerrarModal();
    cargarDatos();
  } catch (err) {
    mostrarToast(`❌ ${err.message}`, "error");
  } finally {
    $modalGuardar.disabled    = false;
    $modalGuardar.textContent = "Guardar";
  }
});

// Guardar con Ctrl+Enter
$modalValor.addEventListener("keydown", e => {
  if (e.key === "Enter" && e.ctrlKey) $modalGuardar.click();
  if (e.key === "Escape")             cerrarModal();
});

// ── Toast ────────────────────────────────────────────────────────────────────
let _toastTimer = null;
function mostrarToast(mensaje, tipo = "") {
  $toast.textContent = mensaje;
  $toast.className   = `toast ${tipo}`;
  clearTimeout(_toastTimer);
  _toastTimer = setTimeout(() => { $toast.className = "toast hidden"; }, 3500);
}

// ── Estado de carga ──────────────────────────────────────────────────────────
function mostrarEstado(msg) {
  $estadoCarga.textContent = msg;
  $estadoCarga.classList.remove("hidden");
  $tabla.classList.add("hidden");
}

// ── Eventos de controles ─────────────────────────────────────────────────────
$inputBusq.addEventListener("input", () => {
  clearTimeout(estado.debounceId);
  estado.debounceId = setTimeout(() => {
    estado.busqueda = $inputBusq.value.trim();
    estado.pagina   = 1;
    cargarDatos();
  }, 350);
});

$selectPor.addEventListener("change", () => {
  estado.porPagina = parseInt($selectPor.value, 10);
  estado.pagina    = 1;
  cargarDatos();
});

$btnRecargar.addEventListener("click", () => {
  estado.pagina   = 1;
  estado.busqueda = "";
  $inputBusq.value = "";
  cargarDatos();
});

// ── Inicio ───────────────────────────────────────────────────────────────────
cargarDatos();
