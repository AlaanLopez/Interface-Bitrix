/**
 * syncController.js
 * -----------------
 * Controlador de ejecución para la sincronización con Bitrix24.
 * Mantiene el estado en memoria y expone métodos para el router HTTP.
 *
 * Estados posibles: 'idle' | 'running' | 'paused' | 'completed'
 *
 * Requirements: 5.1–5.8, 6.1, 7.4, 7.6
 */

"use strict";

const { leerCSV } = require("./conexion_csv");

// ── Estado en memoria ────────────────────────────────────────────────────────

/**
 * @typedef {'idle'|'running'|'paused'|'completed'} EstadoSync
 *
 * @type {{ estado: EstadoSync, pausaSenal: boolean }}
 */
const estado = {
  estado: "idle",
  pausaSenal: false,
};

// ── Getters / Setters ────────────────────────────────────────────────────────

/**
 * Devuelve el estado actual del controlador.
 * @returns {EstadoSync}
 */
function getEstado() {
  return estado.estado;
}

/**
 * Establece la señal de pausa.
 * @param {boolean} v
 */
function setPausaSenal(v) {
  estado.pausaSenal = v;
}

/**
 * Devuelve el valor actual de la señal de pausa.
 * @returns {boolean}
 */
function getPausaSenal() {
  return estado.pausaSenal;
}

/**
 * Transiciona el controlador a un nuevo estado.
 * @param {EstadoSync} nuevoEstado
 */
function transicionar(nuevoEstado) {
  estado.estado = nuevoEstado;
}

// ── Resumen de estados ───────────────────────────────────────────────────────

/**
 * Lee el CSV y devuelve el conteo de registros por cada valor de ESTADO_CARGA.
 * @returns {{ noEjecutado: number, enProceso: number, finalizado: number, error: number }}
 */
function calcularResumen() {
  const { rows } = leerCSV();

  const resumen = {
    noEjecutado: 0,
    enProceso: 0,
    finalizado: 0,
    error: 0,
  };

  for (const row of rows) {
    const estadoCarga = row["ESTADO_CARGA"];
    if (estadoCarga === "no ejecutado") {
      resumen.noEjecutado++;
    } else if (estadoCarga === "en proceso") {
      resumen.enProceso++;
    } else if (estadoCarga === "finalizado") {
      resumen.finalizado++;
    } else if (estadoCarga === "error") {
      resumen.error++;
    }
  }

  return resumen;
}

// ── Últimos registros procesados ─────────────────────────────────────────────

/**
 * Lee el CSV, filtra los registros con ESTADO_CARGA distinto de "no ejecutado",
 * los ordena por FECHA_EJECUCION descendente y devuelve los primeros `limite`.
 * Solo incluye los seis campos requeridos.
 *
 * @param {number} [limite=20]
 * @returns {Object[]}
 */
function obtenerUltimosRegistros(limite = 20) {
  const CAMPOS = [
    "NOMBRE DE CLIENTE",
    "CODIGO SAP",
    "ESTADO_CARGA",
    "BITRIX_ID",
    "MENSAJE_ERROR",
    "FECHA_EJECUCION",
  ];

  const { rows } = leerCSV();

  // Filtrar registros que ya han sido procesados (cualquier estado distinto de "no ejecutado")
  const procesados = rows.filter(row => row["ESTADO_CARGA"] !== "no ejecutado");

  // Ordenar por FECHA_EJECUCION descendente (comparación lexicográfica válida para YYYY-MM-DD HH:mm:ss)
  procesados.sort((a, b) => {
    const fa = a["FECHA_EJECUCION"] || "";
    const fb = b["FECHA_EJECUCION"] || "";
    if (fb > fa) return 1;
    if (fb < fa) return -1;
    return 0;
  });

  // Tomar los primeros `limite` y proyectar solo los seis campos requeridos
  return procesados.slice(0, limite).map(row => {
    const resultado = {};
    for (const campo of CAMPOS) {
      resultado[campo] = row[campo] !== undefined ? row[campo] : "";
    }
    return resultado;
  });
}

// ── Exportar ─────────────────────────────────────────────────────────────────

module.exports = {
  getEstado,
  setPausaSenal,
  getPausaSenal,
  transicionar,
  calcularResumen,
  obtenerUltimosRegistros,
};
