/**
 * synchronizer.js
 * ---------------
 * Módulo de sincronización: lee el CSV, envía cada registro al webhook de
 * Bitrix24 y actualiza el CSV en tiempo real con el resultado.
 *
 * Herramienta: Node.js nativo (https, sin dependencias externas)
 *
 * Requirements: 1.1–1.7, 2.1–2.7, 3.1–3.7, 4.1–4.4
 */

"use strict";

const https = require("https");
const { leerCSV, guardarCSV } = require("./conexion_csv");

// ── Constantes ───────────────────────────────────────────────────────────────

const WEBHOOK_URL = (
  process.env.BITRIX_WEBHOOK_URL ||
  process.env.CRM_BITRIX_WEBHOOK_URL ||
  ""
).trim();
const TIMEOUT_MS  = 30_000;   // 30 segundos
const DELAY_MS    = 500;      // 0.5 segundos entre registros

// ── Utilidades internas ──────────────────────────────────────────────────────

/**
 * Devuelve la fecha/hora actual en formato YYYY-MM-DD HH:mm:ss.
 * @returns {string}
 */
function _fechaActual() {
  const ahora = new Date();
  const pad   = n => String(n).padStart(2, "0");

  const yyyy = ahora.getFullYear();
  const mm   = pad(ahora.getMonth() + 1);
  const dd   = pad(ahora.getDate());
  const hh   = pad(ahora.getHours());
  const min  = pad(ahora.getMinutes());
  const ss   = pad(ahora.getSeconds());

  return `${yyyy}-${mm}-${dd} ${hh}:${min}:${ss}`;
}

/**
 * Devuelve la URL configurada para el webhook de Bitrix24.
 * @returns {string}
 */
function obtenerWebhookUrl() {
  if (!WEBHOOK_URL) {
    throw new Error("BITRIX_WEBHOOK_URL no configurada.");
  }
  if (WEBHOOK_URL.includes("{token}")) {
    throw new Error("BITRIX_WEBHOOK_URL contiene un token placeholder.");
  }
  return WEBHOOK_URL;
}

// ── Funciones públicas ───────────────────────────────────────────────────────

/**
 * Espera `ms` milisegundos, pero puede cancelarse antes si el controlador
 * activa la señal de pausa. Sondea cada 100 ms.
 *
 * @param {number} ms - Milisegundos a esperar.
 * @param {Object} controlador - Referencia al Controlador_Ejecucion.
 * @returns {Promise<boolean>} true si completó el tiempo, false si fue cancelado.
 */
function esperaCancelable(ms, controlador) {
  return new Promise(resolve => {
    let transcurrido = 0;
    const INTERVALO  = 100;

    const tick = () => {
      // Verificar señal de pausa antes de cada tick
      if (controlador && controlador.getPausaSenal()) {
        return resolve(false);
      }

      transcurrido += INTERVALO;

      if (transcurrido >= ms) {
        return resolve(true);
      }

      setTimeout(tick, INTERVALO);
    };

    setTimeout(tick, INTERVALO);
  });
}

/**
 * Envía un payload JSON al webhook de Bitrix24 mediante HTTP POST nativo.
 * Aplica un timeout de 30 segundos.
 *
 * @param {Object} payload - Objeto JSON ya parseado.
 * @returns {Promise<{ ok: boolean, bitrixId?: string, error?: string, respuesta: string }>}
 */
function enviarAlWebhook(payload) {
  return new Promise(resolve => {
    const cuerpo = JSON.stringify(payload);

    // Parsear la URL para extraer host, path y puerto
    let url;
    try {
      url = new URL(obtenerWebhookUrl());
    } catch (err) {
      resolve({
        ok:        false,
        error:     err.message,
        respuesta: "",
      });
      return;
    }

    const opciones = {
      hostname: url.hostname,
      port:     url.port || 443,
      path:     url.pathname + (url.search || ""),
      method:   "POST",
      headers:  {
        "Content-Type":   "application/json",
        "Content-Length": Buffer.byteLength(cuerpo),
      },
    };

    let respondido = false;

    const req = https.request(opciones, res => {
      let datos = "";

      res.on("data", chunk => { datos += chunk; });

      res.on("end", () => {
        if (respondido) return;
        respondido = true;

        const codigoHTTP = res.statusCode;

        // HTTP distinto de 200 → error
        if (codigoHTTP !== 200) {
          const descripcion = res.statusMessage || "Error desconocido";
          resolve({
            ok:        false,
            error:     `HTTP ${codigoHTTP}: ${descripcion}`,
            respuesta: datos,
          });
          return;
        }

        // HTTP 200 → intentar parsear JSON
        let cuerpoRespuesta;
        try {
          cuerpoRespuesta = JSON.parse(datos);
        } catch {
          // Respuesta 200 pero cuerpo no es JSON válido
          resolve({
            ok:        false,
            error:     "HTTP 200: respuesta no es JSON válido",
            respuesta: datos,
          });
          return;
        }

        // HTTP 200 con campo `error` → error de Bitrix
        if (cuerpoRespuesta.error !== undefined) {
          resolve({
            ok:        false,
            error:     String(cuerpoRespuesta.error),
            respuesta: datos,
          });
          return;
        }

        // HTTP 200 con `result` numérico > 0 → éxito
        const resultado = cuerpoRespuesta.result;
        if (typeof resultado === "number" && resultado > 0) {
          resolve({
            ok:       true,
            bitrixId: String(resultado),
            respuesta: datos,
          });
          return;
        }

        // HTTP 200 pero `result` no es un número positivo
        resolve({
          ok:        false,
          error:     `HTTP 200: result inesperado (${JSON.stringify(resultado)})`,
          respuesta: datos,
        });
      });
    });

    // Timeout de 30 segundos
    req.setTimeout(TIMEOUT_MS, () => {
      if (respondido) return;
      respondido = true;
      req.destroy();
      resolve({
        ok:        false,
        error:     "Timeout o error de red",
        respuesta: "",
      });
    });

    // Error de transporte (red caída, DNS, etc.)
    req.on("error", err => {
      if (respondido) return;
      respondido = true;
      resolve({
        ok:        false,
        error:     "Timeout o error de red",
        respuesta: "",
      });
    });

    req.write(cuerpo);
    req.end();
  });
}

/**
 * Inicia el ciclo de sincronización.
 *
 * Para cada registro con ESTADO_CARGA === "no ejecutado":
 *   1. Marca "en proceso" y guarda el CSV.
 *   2. Parsea JSON_BITRIX y envía al webhook (o marca error si JSON inválido).
 *   3. Actualiza todos los campos de resultado y guarda el CSV.
 *   4. Espera 3 000 ms (cancelable por pausa) antes del siguiente registro.
 *   5. Si la señal de pausa está activa, detiene el loop.
 *
 * Al terminar todos los registros, transiciona el controlador a 'completed'.
 *
 * @param {Object} controlador - Referencia al Controlador_Ejecucion.
 * @returns {Promise<{ motivo: 'completed'|'paused'|'error', mensaje?: string }>}
 */
async function iniciarSincronizacion(controlador) {
  // ── 1. Leer el CSV ─────────────────────────────────────────────────────────
  let headers, rows;
  try {
    ({ headers, rows } = leerCSV());
  } catch (err) {
    console.error("[Sync] Error al leer el CSV:", err.message);
    controlador.transicionar("idle");
    return { motivo: "error", mensaje: err.message };
  }

  // ── 2. Validar columna ESTADO_CARGA ────────────────────────────────────────
  if (!headers.includes("ESTADO_CARGA")) {
    const msg = "La columna ESTADO_CARGA no fue encontrada en el archivo.";
    console.error("[Sync]", msg);
    controlador.transicionar("idle");
    return { motivo: "error", mensaje: msg };
  }

  // ── 3. Filtrar registros pendientes ────────────────────────────────────────
  // Trabajamos con los índices originales para poder actualizar `rows` en su lugar.
  const pendientes = rows
    .map((row, idx) => ({ row, idx }))
    .filter(({ row }) => row["ESTADO_CARGA"] === "no ejecutado");

  if (pendientes.length === 0) {
    const msg = "No hay registros pendientes.";
    console.log("[Sync]", msg);
    controlador.transicionar("completed");
    return { motivo: "completed", mensaje: msg };
  }

  try {
    obtenerWebhookUrl();
  } catch (err) {
    console.error("[Sync]", err.message);
    controlador.transicionar("idle");
    return { motivo: "error", mensaje: err.message };
  }

  // ── 4. Iterar sobre los registros pendientes ───────────────────────────────
  for (let i = 0; i < pendientes.length; i++) {
    const { row, idx } = pendientes[i];
    const esUltimo     = i === pendientes.length - 1;

    if (controlador.getPausaSenal()) {
      console.log("[Sync] Sincronización pausada por el operador.");
      return { motivo: "paused" };
    }

    // ── 4a. Marcar "en proceso" y guardar ─────────────────────────────────
    row["ESTADO_CARGA"] = "en proceso";
    try {
      guardarCSV(headers, rows);
    } catch (err) {
      console.error("[Sync] Error al guardar CSV (en proceso):", err.message);
      controlador.transicionar("idle");
      return { motivo: "error", mensaje: err.message };
    }

    // ── 4b. Parsear JSON_BITRIX ────────────────────────────────────────────
    const jsonBitrix = row["JSON_BITRIX"] || "";
    let payload;
    let resultadoEnvio;

    if (!jsonBitrix.trim()) {
      // Campo vacío
      resultadoEnvio = {
        ok:        false,
        error:     "JSON_BITRIX inválido o vacío",
        respuesta: "",
      };
    } else {
      try {
        payload = JSON.parse(jsonBitrix);
      } catch {
        // JSON malformado
        resultadoEnvio = {
          ok:        false,
          error:     "JSON_BITRIX inválido o vacío",
          respuesta: "",
        };
      }
    }

    // ── 4c. Enviar al webhook (solo si el JSON era válido) ─────────────────
    if (resultadoEnvio === undefined) {
      resultadoEnvio = await enviarAlWebhook(payload);
    }

    // ── 4d. Actualizar campos de resultado ────────────────────────────────
    const fechaEjecucion = _fechaActual();
    row["FECHA_EJECUCION"]  = fechaEjecucion;
    row["RESPUESTA_BITRIX"] = resultadoEnvio.respuesta || "";

    if (resultadoEnvio.ok) {
      row["ESTADO_CARGA"]  = "finalizado";
      row["BITRIX_ID"]     = resultadoEnvio.bitrixId || "";
      row["MENSAJE_ERROR"] = "";
    } else {
      row["ESTADO_CARGA"]  = "error";
      row["MENSAJE_ERROR"] = resultadoEnvio.error || "Error desconocido";
      row["BITRIX_ID"]     = "";
    }

    // ── 4e. Guardar CSV con resultado ─────────────────────────────────────
    try {
      guardarCSV(headers, rows);
    } catch (err) {
      console.error("[Sync] Error al guardar CSV (resultado):", err.message);
      controlador.transicionar("idle");
      return { motivo: "error", mensaje: err.message };
    }

    // ── 4f. Delay entre registros (omitir en el último) ───────────────────
    if (!esUltimo) {
      const completado = await esperaCancelable(DELAY_MS, controlador);
      if (!completado) {
        // La señal de pausa canceló el delay → detener el loop
        console.log("[Sync] Sincronización pausada por el operador.");
        return { motivo: "paused" };
      }
    }

    // ── 4g. Verificar señal de pausa al final del registro ────────────────
    // (cubre el caso en que la pausa llegó justo después del último delay)
    if (!esUltimo && controlador.getPausaSenal()) {
      console.log("[Sync] Sincronización pausada por el operador.");
      return { motivo: "paused" };
    }
  }

  // ── 5. Todos los registros procesados → completed ──────────────────────────
  console.log("[Sync] Sincronización completada.");
  controlador.transicionar("completed");
  return { motivo: "completed" };
}

// ── Exportar ─────────────────────────────────────────────────────────────────

module.exports = { iniciarSincronizacion, enviarAlWebhook, esperaCancelable, obtenerWebhookUrl };
