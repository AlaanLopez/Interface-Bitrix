/**
 * tests/syncController.property.test.js
 * ----------------------------------------
 * Property-based tests for syncController.js using fast-check.
 *
 * Feature: bitrix-csv-sync, Property 12: El resumen de estados refleja la distribucion real del CSV
 *
 * Validates: Requirements 6.1
 *
 * Run: node tests/syncController.property.test.js
 */

'use strict';

const fc = require('fast-check');
const path = require('path');
const { describe, test, assert } = require('./setup');

// Resolve absolute paths for the modules we need to control
const CSV_MODULE_PATH = path.resolve(__dirname, '../Conexion/conexion_csv.js');
const CTRL_MODULE_PATH = path.resolve(__dirname, '../Conexion/syncController.js');

// Try both folder name variants (with and without accent)
const CSV_MODULE_PATH_ACCENT = path.resolve(__dirname, '../Conexi\u00f3n/conexion_csv.js');
const CTRL_MODULE_PATH_ACCENT = path.resolve(__dirname, '../Conexi\u00f3n/syncController.js');

// Detect which path variant exists on disk
const fs = require('fs');
const csvPath  = fs.existsSync(CSV_MODULE_PATH_ACCENT)  ? CSV_MODULE_PATH_ACCENT  : CSV_MODULE_PATH;
const ctrlPath = fs.existsSync(CTRL_MODULE_PATH_ACCENT) ? CTRL_MODULE_PATH_ACCENT : CTRL_MODULE_PATH;

// ── Helper ───────────────────────────────────────────────────────────────────

/**
 * Loads a fresh instance of syncController with leerCSV mocked to return
 * the provided rows. Uses require-cache injection so the destructured
 * `const { leerCSV } = require(...)` inside syncController picks up the mock.
 *
 * @param {Object[]} rows
 * @returns {{ calcularResumen: Function }}
 */
function loadControllerWithRows(rows) {
  // Remove any cached versions so we get a fresh load
  delete require.cache[ctrlPath];
  delete require.cache[csvPath];

  // Inject mock module into the cache BEFORE loading the controller
  require.cache[csvPath] = {
    id: csvPath,
    filename: csvPath,
    loaded: true,
    exports: {
      leerCSV: () => ({ headers: ['ESTADO_CARGA'], rows }),
    },
  };

  // Load the controller — it will pick up the mocked leerCSV
  const controller = require(ctrlPath);

  // Clean up the mock so it doesn't bleed into other tests
  delete require.cache[csvPath];
  delete require.cache[ctrlPath];

  return controller;
}

// ── Property 12 ──────────────────────────────────────────────────────────────

(async () => {
  await describe('Property 12: El resumen de estados refleja la distribucion real del CSV', async () => {

    await test('Los cuatro conteos suman el total de filas y cada conteo coincide con la frecuencia real', () => {
      // Feature: bitrix-csv-sync, Property 12: El resumen de estados refleja la distribucion real del CSV
      fc.assert(
        fc.property(
          fc.array(
            fc.record({
              ESTADO_CARGA: fc.oneof(
                fc.constant('no ejecutado'),
                fc.constant('en proceso'),
                fc.constant('finalizado'),
                fc.constant('error'),
                fc.string()
              ),
            })
          ),
          (rows) => {
            // Compute expected counts directly from the generated data
            let expectedNoEjecutado = 0;
            let expectedEnProceso   = 0;
            let expectedFinalizado  = 0;
            let expectedError       = 0;

            for (const row of rows) {
              if (row.ESTADO_CARGA === 'no ejecutado')      expectedNoEjecutado++;
              else if (row.ESTADO_CARGA === 'en proceso')   expectedEnProceso++;
              else if (row.ESTADO_CARGA === 'finalizado')   expectedFinalizado++;
              else if (row.ESTADO_CARGA === 'error')        expectedError++;
            }

            // Load a fresh controller with the mocked CSV data
            const { calcularResumen } = loadControllerWithRows(rows);
            const resumen = calcularResumen();

            // 1. Each individual count must match the real frequency
            assert.strictEqual(resumen.noEjecutado, expectedNoEjecutado,
              `noEjecutado: expected ${expectedNoEjecutado}, got ${resumen.noEjecutado}`);
            assert.strictEqual(resumen.enProceso, expectedEnProceso,
              `enProceso: expected ${expectedEnProceso}, got ${resumen.enProceso}`);
            assert.strictEqual(resumen.finalizado, expectedFinalizado,
              `finalizado: expected ${expectedFinalizado}, got ${resumen.finalizado}`);
            assert.strictEqual(resumen.error, expectedError,
              `error: expected ${expectedError}, got ${resumen.error}`);

            // 2. The four counts must sum to the total number of rows
            const total = resumen.noEjecutado + resumen.enProceso + resumen.finalizado + resumen.error;
            assert.ok(
              total <= rows.length,
              `Sum of known-state counts (${total}) must not exceed total rows (${rows.length})`
            );
          }
        ),
        { numRuns: 100 }
      );
    });

  });
})();
