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

const PORT      = 3000;
const STATIC_DIR = path.join(__dirname, "public");

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

    const filePath = path.join(STATIC_DIR, ruta);
    if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
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
