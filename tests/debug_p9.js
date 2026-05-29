'use strict';
const path = require('path');
const fs = require('fs');

const syncPathAccent = path.resolve(__dirname, '../Conexi\u00f3n/synchronizer.js');
const csvPathAccent  = path.resolve(__dirname, '../Conexi\u00f3n/conexion_csv.js');
const syncPath = fs.existsSync(syncPathAccent) ? syncPathAccent : path.resolve(__dirname, '../Conexion/synchronizer.js');
const csvPath  = fs.existsSync(csvPathAccent)  ? csvPathAccent  : path.resolve(__dirname, '../Conexion/conexion_csv.js');

const rows = [
  { ESTADO_CARGA: 'no ejecutado', JSON_BITRIX: '{"test":1}', BITRIX_ID: '', MENSAJE_ERROR: '', FECHA_EJECUCION: '', RESPUESTA_BITRIX: '' },
  { ESTADO_CARGA: 'no ejecutado', JSON_BITRIX: '{"test":1}', BITRIX_ID: '', MENSAJE_ERROR: '', FECHA_EJECUCION: '', RESPUESTA_BITRIX: '' },
];
const headers = Object.keys(rows[0]);

const recordedMs = [];
const origSetTimeout = global.setTimeout;
global.setTimeout = (fn, ms, ...args) => {
  recordedMs.push(ms);
  fn(...args);
  return 0;
};

delete require.cache[syncPath];
delete require.cache[csvPath];

require.cache[csvPath] = {
  id: csvPath, filename: csvPath, loaded: true,
  exports: {
    leerCSV:    () => ({ headers: [...headers], rows }),
    guardarCSV: () => {},
  },
};

const httpsPath = require.resolve('https');
const origHttps = require.cache[httpsPath];
require.cache[httpsPath] = {
  id: httpsPath, filename: httpsPath, loaded: true,
  exports: {
    request: (opts, cb) => {
      const EE = require('events');
      const res = new EE();
      res.statusCode = 200;
      res.statusMessage = 'OK';
      setImmediate(() => {
        cb(res);
        res.emit('data', JSON.stringify({ result: 1 }));
        res.emit('end');
      });
      const req = new EE();
      req.setTimeout = () => {};
      req.write = () => {};
      req.end = () => {};
      req.destroy = () => {};
      return req;
    },
  },
};

const { iniciarSincronizacion } = require(syncPath);
const ctrl = { getPausaSenal: () => false, transicionar: () => {} };

iniciarSincronizacion(ctrl).then(() => {
  global.setTimeout = origSetTimeout;
  console.log('recordedMs:', JSON.stringify(recordedMs));
  console.log('count of 100ms calls:', recordedMs.filter(m => m === 100).length);
  console.log('unique ms values:', [...new Set(recordedMs)]);
  console.log('total calls:', recordedMs.length);
});
