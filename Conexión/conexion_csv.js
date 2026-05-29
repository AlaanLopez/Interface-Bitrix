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
const CSV_PATH = path.join(__dirname, "..", "Base de cuentas valores únicos.csv");
const SEPARADOR = ";";
const ENCODING  = "latin1";

// ── Utilidades internas ──────────────────────────────────────────────────────

/**
 * Parsea el contenido crudo del CSV en un array de objetos.
 * @param {string} contenido - Texto completo del archivo.
 * @returns {{ headers: string[], rows: Object[] }}
 */
function _parsear(contenido) {
  const lineas  = contenido.replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n");
  const headers = lineas[0].split(SEPARADOR);
  const rows    = [];

  for (let i = 1; i < lineas.length; i++) {
    const linea = lineas[i];
    if (!linea.trim()) continue;          // ignorar líneas vacías

    // Dividir respetando campos que contienen el separador dentro de comillas
    const campos = _dividirLinea(linea);
    const obj    = {};
    headers.forEach((h, idx) => {
      obj[h] = campos[idx] !== undefined ? campos[idx] : "";
    });
    rows.push(obj);
  }

  return { headers, rows };
}

/**
 * Divide una línea CSV respetando campos entre comillas dobles.
 * @param {string} linea
 * @returns {string[]}
 */
function _dividirLinea(linea) {
  const campos = [];
  let actual   = "";
  let enComillas = false;

  for (let i = 0; i < linea.length; i++) {
    const c = linea[i];

    if (c === '"') {
      if (enComillas && linea[i + 1] === '"') {
        actual += '"';   // comilla escapada ""
        i++;
      } else {
        enComillas = !enComillas;
        actual += c;     // conservar las comillas en el valor
      }
    } else if (c === SEPARADOR && !enComillas) {
      campos.push(actual);
      actual = "";
    } else {
      actual += c;
    }
  }
  campos.push(actual);
  return campos;
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
    const campos = headers.map(h => row[h] !== undefined ? row[h] : "");
    lineas.push(campos.join(SEPARADOR));
  }
  return lineas.join("\r\n");
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
  fs.writeFileSync(ruta, contenido, ENCODING);
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
