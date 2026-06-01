/**
 * conexion_csv.js
 * ---------------
 * Módulo de conexión para leer y modificar el archivo
 * "Base de cuentas valores únicos.csv".
 *
 * Herramienta: Node.js (fs nativo — sin dependencias externas)
 * Separador  : punto y coma (;)
 * Encoding   : latin1 (compatible con caracteres especiales del archivo)
 */

"use strict";

const fs   = require("fs");
const path = require("path");

// ── Ruta al archivo ──────────────────────────────────────────────────────────
const CSV_PATH = path.resolve(
  process.env.CRM_CSV_PATH ||
  process.env.CSV_PATH ||
  path.join(__dirname, "..", "Base de cuentas valores únicos.csv")
);
const SEPARADOR = ";";
const ENCODING  = "latin1";

// ── Utilidades internas ──────────────────────────────────────────────────────

/**
 * Parsea el contenido crudo del CSV en un array de objetos.
 * @param {string} contenido - Texto completo del archivo.
 * @returns {{ headers: string[], rows: Object[] }}
 */
function _parsear(contenido) {
  const registros = _parsearRegistros(contenido);
  if (registros.length === 0) return { headers: [], rows: [] };

  const headers = registros[0].map((h, idx) =>
    idx === 0 ? h.replace(/^\uFEFF/, "") : h
  );

  const rows = registros.slice(1)
    .filter(campos => campos.some(c => String(c).trim() !== ""))
    .map(campos => {
      const obj = {};
      headers.forEach((h, idx) => {
        obj[h] = campos[idx] !== undefined ? campos[idx] : "";
      });
      return obj;
    });

  return { headers, rows };
}

/**
 * Parsea CSV completo respetando comillas, separadores y saltos de línea dentro
 * de campos entrecomillados.
 * @param {string} contenido
 * @returns {string[][]}
 */
function _parsearRegistros(contenido) {
  const registros = [];
  let campos = [];
  let actual = "";
  let enComillas = false;
  let campoEntrecomillado = false;

  const cerrarCampo = () => {
    campos.push(actual);
    actual = "";
    campoEntrecomillado = false;
  };

  const cerrarRegistro = () => {
    cerrarCampo();
    registros.push(campos);
    campos = [];
  };

  for (let i = 0; i < contenido.length; i++) {
    const c = contenido[i];

    if (c === '"') {
      if (enComillas && contenido[i + 1] === '"') {
        actual += '"';
        i++;
      } else if (!enComillas && actual === "") {
        enComillas = true;
        campoEntrecomillado = true;
      } else if (enComillas) {
        enComillas = false;
      } else {
        actual += c;
      }
    } else if (c === SEPARADOR && !enComillas) {
      cerrarCampo();
    } else if ((c === "\n" || c === "\r") && !enComillas) {
      cerrarRegistro();
      if (c === "\r" && contenido[i + 1] === "\n") i++;
    } else {
      actual += c;
    }
  }

  if (actual !== "" || campoEntrecomillado || campos.length > 0) {
    cerrarRegistro();
  }

  return registros;
}

/**
 * Serializa el array de objetos de vuelta a texto CSV.
 * @param {string[]} headers
 * @param {Object[]} rows
 * @returns {string}
 */
function _serializar(headers, rows) {
  const lineas = [headers.join(SEPARADOR)];
  for (const row of rows) {
    const campos = headers.map(h => _escaparCampo(row[h] !== undefined ? row[h] : ""));
    lineas.push(campos.join(SEPARADOR));
  }
  return lineas.join("\r\n");
}

/**
 * Escapa un valor para CSV usando comillas dobles solo cuando hace falta.
 * @param {*} valor
 * @returns {string}
 */
function _escaparCampo(valor) {
  const texto = String(valor ?? "");
  const requiereComillas =
    texto.includes(SEPARADOR) ||
    texto.includes('"') ||
    texto.includes("\n") ||
    texto.includes("\r") ||
    texto !== texto.trim();

  if (!requiereComillas) return texto;
  return `"${texto.replace(/"/g, '""')}"`;
}

// ── Funciones públicas ───────────────────────────────────────────────────────

/**
 * Lee el CSV y devuelve { headers, rows }.
 * @returns {{ headers: string[], rows: Object[] }}
 */
function leerCSV() {
  if (!fs.existsSync(CSV_PATH)) {
    throw new Error(`Archivo no encontrado: ${CSV_PATH}`);
  }
  const contenido = fs.readFileSync(CSV_PATH, ENCODING);
  const datos     = _parsear(contenido);
  console.log(`[OK] Archivo leído: ${datos.rows.length} filas × ${datos.headers.length} columnas`);
  return datos;
}

/**
 * Guarda el CSV (sobreescribe el original o una ruta alternativa).
 * @param {string[]} headers
 * @param {Object[]} rows
 * @param {string}   [ruta] - Ruta de destino (opcional).
 */
function guardarCSV(headers, rows, ruta = CSV_PATH) {
  const contenido = _serializar(headers, rows);
  const dir = path.dirname(ruta);
  const tmp = path.join(dir, `.${path.basename(ruta)}.${process.pid}.tmp`);
  fs.writeFileSync(tmp, contenido, ENCODING);
  fs.renameSync(tmp, ruta);
  console.log(`[OK] Archivo guardado en: ${ruta}`);
}

/**
 * Devuelve la lista de columnas del CSV.
 * @returns {string[]}
 */
function obtenerColumnas() {
  const { headers } = leerCSV();
  return headers;
}

/**
 * Filtra filas donde `columna` contiene `valor` (sin distinción de mayúsculas).
 * @param {string} columna - Nombre de la columna.
 * @param {string} valor   - Texto a buscar.
 * @returns {Object[]}
 */
function buscarPorColumna(columna, valor) {
  const { headers, rows } = leerCSV();

  if (!headers.includes(columna)) {
    throw new Error(`Columna '${columna}' no existe.\nColumnas disponibles: ${headers.join(", ")}`);
  }

  const valorLower = valor.toLowerCase();
  const resultado  = rows.filter(r => (r[columna] || "").toLowerCase().includes(valorLower));
  console.log(`[OK] ${resultado.length} fila(s) encontrada(s) para '${valor}' en '${columna}'`);
  return resultado;
}

/**
 * Actualiza el valor de una celda identificando la fila por IDENTIFICACION FISCAL
 * y guarda el archivo automáticamente.
 * @param {string} identificacion - Valor de 'IDENTIFICACION FISCAL'.
 * @param {string} columna        - Columna a modificar.
 * @param {string} nuevoValor     - Nuevo valor.
 */
function actualizarCelda(identificacion, columna, nuevoValor) {
  const COL_ID = "IDENTIFICACION FISCAL";
  const { headers, rows } = leerCSV();

  if (!headers.includes(COL_ID)) {
    throw new Error(`Columna clave '${COL_ID}' no encontrada en el archivo.`);
  }
  if (!headers.includes(columna)) {
    throw new Error(`Columna '${columna}' no existe.`);
  }

  const indices = rows.reduce((acc, r, i) => {
    if (r[COL_ID] === identificacion) acc.push(i);
    return acc;
  }, []);

  if (indices.length === 0) {
    throw new Error(`No se encontró ninguna fila con ${COL_ID} = '${identificacion}'`);
  }

  indices.forEach(i => { rows[i][columna] = nuevoValor; });
  guardarCSV(headers, rows);
  console.log(`[OK] Celda actualizada → ${COL_ID}='${identificacion}' | ${columna}='${nuevoValor}'`);
}

/**
 * Agrega una nueva fila al CSV y guarda el archivo.
 * @param {Object} nuevaFila - Objeto con los valores de la nueva fila.
 */
function agregarFila(nuevaFila) {
  const { headers, rows } = leerCSV();
  const fila = {};
  headers.forEach(h => { fila[h] = nuevaFila[h] !== undefined ? nuevaFila[h] : ""; });
  rows.push(fila);
  guardarCSV(headers, rows);
  console.log(`[OK] Nueva fila agregada. Total filas: ${rows.length}`);
}

// ── Exportar ─────────────────────────────────────────────────────────────────
module.exports = {
  leerCSV,
  guardarCSV,
  obtenerColumnas,
  buscarPorColumna,
  actualizarCelda,
  agregarFila,
  CSV_PATH,
};

// ── Prueba rápida si se ejecuta directamente ─────────────────────────────────
if (require.main === module) {
  const { headers, rows } = leerCSV();

  console.log("\nColumnas disponibles:");
  headers.forEach(h => console.log(`  - ${h}`));

  console.log("\nPrimeras 3 filas (NOMBRE DE CLIENTE):");
  rows.slice(0, 3).forEach(r => console.log(`  ${r["IDENTIFICACION FISCAL"]} | ${r["NOMBRE DE CLIENTE"]}`));
}
