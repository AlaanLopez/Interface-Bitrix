"use strict";

/**
 * server.js
 * ---------
 * Servidor HTTP minimalista (Node.js nativo, sin dependencias).
 * Expone una API REST y sirve el frontend estático.
 *
 * Iniciar: node Frontend/server.js
 * URL    : http://localhost:3000
 */

const http = require("http");
const fs   = require("fs");
const path = require("path");
const csv  = require("../Conexión/conexion_csv");
const sync = require("../Conexión/synchronizer");
const syncController = require("../Conexión/syncController");

const PORT       = Number(process.env.PORT || 3000);
const STATIC_DIR = path.join(__dirname, "public");
let syncPromise  = null;

// ── Tipos MIME ───────────────────────────────────────────────────────────────
const MIME = {
  ".html": "text/html; charset=utf-8",
  ".css" : "text/css; charset=utf-8",
  ".js"  : "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".ico" : "image/x-icon",
};

// ── Helpers ──────────────────────────────────────────────────────────────────
function jsonOk(res, data) {
  const body = JSON.stringify(data);
  res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
  res.end(body);
}

function jsonAccepted(res, data) {
  const body = JSON.stringify(data);
  res.writeHead(202, { "Content-Type": "application/json; charset=utf-8" });
  res.end(body);
}

function jsonError(res, status, mensaje) {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify({ error: mensaje }));
}

function leerBody(req) {
  return new Promise((resolve, reject) => {
    let data = "";
    req.on("data", chunk => (data += chunk));
    req.on("end",  () => {
      try { resolve(JSON.parse(data || "{}")); }
      catch (e) { reject(e); }
    });
    req.on("error", reject);
  });
}

function servirArchivo(res, filePath) {
  const ext = path.extname(filePath);
  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404);
      res.end("Not found");
      return;
    }
    res.writeHead(200, { "Content-Type": MIME[ext] || "text/plain" });
    res.end(data);
  });
}

function resolverArchivoEstatico(ruta) {
  let relativa;
  try {
    relativa = decodeURIComponent(ruta).replace(/^\/+/, "");
  } catch {
    return null;
  }

  const filePath = path.resolve(STATIC_DIR, relativa);
  const dentroDePublic =
    filePath === STATIC_DIR ||
    filePath.startsWith(STATIC_DIR + path.sep);

  return dentroDePublic ? filePath : null;
}

function syncActivo() {
  return syncPromise !== null;
}

function obtenerEstadoSync() {
  return {
    activo: syncActivo(),
    ...syncController.obtenerSnapshot(),
  };
}

function iniciarSync(mensajeInicio) {
  if (syncActivo()) {
    return { iniciado: false, mensaje: "La sincronización ya está en ejecución." };
  }

  syncController.setPausaSenal(false);
  syncController.transicionar("running", mensajeInicio);

  syncPromise = sync.iniciarSincronizacion(syncController)
    .then(resultado => {
      if (resultado.motivo === "paused") {
        syncController.transicionar("paused", "Sincronización pausada por el operador.");
      } else if (resultado.motivo === "completed") {
        syncController.transicionar("completed", resultado.mensaje || "Sincronización completada.");
      } else {
        syncController.transicionar("idle", resultado.mensaje || "La sincronización terminó con error.");
      }
      return resultado;
    })
    .catch(err => {
      syncController.transicionar("idle", err.message);
      console.error("[Sync]", err);
      return { motivo: "error", mensaje: err.message };
    })
    .finally(() => {
      syncPromise = null;
    });

  return { iniciado: true, mensaje: mensajeInicio };
}

// ── Router ───────────────────────────────────────────────────────────────────
const server = http.createServer(async (req, res) => {
  // CORS para desarrollo local
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, PUT, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") { res.writeHead(204); res.end(); return; }

  const url    = new URL(req.url, `http://localhost:${PORT}`);
  const ruta   = url.pathname;
  const metodo = req.method;

  try {
    // ── API ──────────────────────────────────────────────────────────────────

    // GET /api/datos  →  todas las filas (con paginación y búsqueda opcionales)
    if (ruta === "/api/datos" && metodo === "GET") {
      const { headers, rows } = csv.leerCSV();

      const busqueda = (url.searchParams.get("q") || "").toLowerCase().trim();
      const pagina   = Math.max(1, parseInt(url.searchParams.get("pagina")  || "1",  10));
      const porPagina= Math.min(200, Math.max(1, parseInt(url.searchParams.get("por") || "50", 10)));

      let filtradas = rows;
      if (busqueda) {
        filtradas = rows.filter(r =>
          Object.values(r).some(v => v.toLowerCase().includes(busqueda))
        );
      }

      const total  = filtradas.length;
      const inicio = (pagina - 1) * porPagina;
      const pagina_rows = filtradas.slice(inicio, inicio + porPagina);

      return jsonOk(res, { headers, rows: pagina_rows, total, pagina, porPagina });
    }

    // GET /api/columnas  →  lista de columnas
    if (ruta === "/api/columnas" && metodo === "GET") {
      return jsonOk(res, { columnas: csv.obtenerColumnas() });
    }

    // GET /api/sync/estado → estado operativo de la sincronización
    if (ruta === "/api/sync/estado" && metodo === "GET") {
      return jsonOk(res, obtenerEstadoSync());
    }

    // GET /api/sync/resumen → conteo de registros por estado
    if (ruta === "/api/sync/resumen" && metodo === "GET") {
      return jsonOk(res, { resumen: syncController.calcularResumen() });
    }

    // GET /api/sync/ultimos → últimos registros procesados
    if (ruta === "/api/sync/ultimos" && metodo === "GET") {
      return jsonOk(res, { rows: syncController.obtenerUltimosRegistros(20) });
    }

    // POST /api/sync/iniciar → inicia la sincronización en segundo plano
    if (ruta === "/api/sync/iniciar" && metodo === "POST") {
      if (syncActivo()) {
        return jsonError(res, 409, "La sincronización ya está en ejecución.");
      }
      try { sync.obtenerWebhookUrl(); }
      catch (err) { return jsonError(res, 400, err.message); }
      const resultado = iniciarSync("Sincronización iniciada.");
      return jsonAccepted(res, { ok: true, ...resultado, sync: obtenerEstadoSync() });
    }

    // POST /api/sync/pausar → solicita pausa al terminar el registro actual
    if (ruta === "/api/sync/pausar" && metodo === "POST") {
      if (!syncActivo() && syncController.getEstado() !== "running") {
        return jsonError(res, 409, "No hay una sincronización en ejecución.");
      }
      syncController.setPausaSenal(true);
      return jsonOk(res, { ok: true, mensaje: "Pausa solicitada.", sync: obtenerEstadoSync() });
    }

    // POST /api/sync/reanudar → continúa procesando los registros pendientes
    if (ruta === "/api/sync/reanudar" && metodo === "POST") {
      if (syncActivo()) {
        return jsonError(res, 409, "La sincronización ya está en ejecución.");
      }
      try { sync.obtenerWebhookUrl(); }
      catch (err) { return jsonError(res, 400, err.message); }
      const resultado = iniciarSync("Sincronización reanudada.");
      return jsonAccepted(res, { ok: true, ...resultado, sync: obtenerEstadoSync() });
    }

    // POST /api/sync/reintentar-errores → vuelve a pendientes los registros fallidos
    if (ruta === "/api/sync/reintentar-errores" && metodo === "POST") {
      if (syncActivo()) {
        return jsonError(res, 409, "No se pueden reintentar errores mientras la sincronización está en ejecución.");
      }
      const actualizados = syncController.reintentarErrores();
      return jsonOk(res, {
        ok: true,
        mensaje: `${actualizados} registro(s) devuelto(s) a pendiente.`,
        actualizados,
        sync: obtenerEstadoSync(),
      });
    }

    // PUT /api/celda  →  actualizar una celda
    if (ruta === "/api/celda" && metodo === "PUT") {
      const body = await leerBody(req);
      const { identificacion, columna, valor } = body;
      if (!identificacion || !columna || valor === undefined) {
        return jsonError(res, 400, "Se requieren: identificacion, columna, valor");
      }
      csv.actualizarCelda(identificacion, columna, String(valor));
      return jsonOk(res, { ok: true, mensaje: "Celda actualizada correctamente" });
    }

    // POST /api/fila  →  agregar fila
    if (ruta === "/api/fila" && metodo === "POST") {
      const body = await leerBody(req);
      csv.agregarFila(body);
      return jsonOk(res, { ok: true, mensaje: "Fila agregada correctamente" });
    }

    // ── Archivos estáticos ───────────────────────────────────────────────────
    if (ruta === "/" || ruta === "/index.html") {
      return servirArchivo(res, path.join(STATIC_DIR, "index.html"));
    }

    const filePath = resolverArchivoEstatico(ruta);
    if (filePath && fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
      return servirArchivo(res, filePath);
    }

    res.writeHead(404); res.end("Not found");

  } catch (err) {
    console.error("[ERROR]", err.message);
    jsonError(res, 500, err.message);
  }
});

server.listen(PORT, () => {
  console.log(`\n✅  Servidor iniciado → http://localhost:${PORT}`);
  console.log(`   Presiona Ctrl+C para detener.\n`);
});
