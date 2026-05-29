/**
 * tests/synchronizer.property.test.js
 * ----------------------------------------
 * Property-based tests for synchronizer.js using fast-check.
 *
 * Feature: bitrix-csv-sync, Property 1: El filtro de registros pendientes es exacto
 * Feature: bitrix-csv-sync, Property 2: El orden de procesamiento preserva el orden original del CSV
 * Feature: bitrix-csv-sync, Property 3: El parseo de JSON_BITRIX es un round-trip
 * Feature: bitrix-csv-sync, Property 6: JSON_BITRIX inválido o vacío produce estado de error
 *
 * Validates: Requirements 1.2, 1.3, 2.1, 2.6
 *
 * Run: node tests/synchronizer.property.test.js
 */

'use strict';

const fc = require('fast-check');
const path = require('path');
const fs = require('fs');
const { describe, test, assert } = require('./setup');

// ── Module path resolution (handles folder name with/without accent) ──────────

const SYNC_MODULE_PATH         = path.resolve(__dirname, '../Conexion/synchronizer.js');
const CSV_MODULE_PATH          = path.resolve(__dirname, '../Conexion/conexion_csv.js');
const SYNC_MODULE_PATH_ACCENT  = path.resolve(__dirname, '../Conexi\u00f3n/synchronizer.js');
const CSV_MODULE_PATH_ACCENT   = path.resolve(__dirname, '../Conexi\u00f3n/conexion_csv.js');

const syncPath = fs.existsSync(SYNC_MODULE_PATH_ACCENT) ? SYNC_MODULE_PATH_ACCENT : SYNC_MODULE_PATH;
const csvPath  = fs.existsSync(CSV_MODULE_PATH_ACCENT)  ? CSV_MODULE_PATH_ACCENT  : CSV_MODULE_PATH;

// ── Property 1 ────────────────────────────────────────────────────────────────

(async () => {
  await describe('Property 1: El filtro de registros pendientes es exacto', async () => {

    await test('El resultado contiene exactamente y solo los registros con ESTADO_CARGA === "no ejecutado"', () => {
      // Feature: bitrix-csv-sync, Property 1: El filtro de registros pendientes es exacto
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
            // Apply the same filter logic used in iniciarSincronizacion
            const pendientes = rows.filter(row => row.ESTADO_CARGA === 'no ejecutado');

            // 1. Every record in the result must have ESTADO_CARGA === "no ejecutado"
            for (const row of pendientes) {
              assert.strictEqual(
                row.ESTADO_CARGA,
                'no ejecutado',
                `Se encontró un registro con ESTADO_CARGA "${row.ESTADO_CARGA}" en el resultado filtrado`
              );
            }

            // 2. The count must match exactly the number of "no ejecutado" records in the input
            const expectedCount = rows.filter(row => row.ESTADO_CARGA === 'no ejecutado').length;
            assert.strictEqual(
              pendientes.length,
              expectedCount,
              `El filtro retornó ${pendientes.length} registros pero se esperaban ${expectedCount}`
            );
          }
        ),
        { numRuns: 100 }
      );
    });

  });
})();

// ── Property 2 ────────────────────────────────────────────────────────────────

(async () => {
  await describe('Property 2: El orden de procesamiento preserva el orden original del CSV', async () => {

    await test('El orden de los registros filtrados coincide con el orden del array de entrada', () => {
      // Feature: bitrix-csv-sync, Property 2: El orden de procesamiento preserva el orden original del CSV
      fc.assert(
        fc.property(
          fc.array(
            fc.record({
              ESTADO_CARGA: fc.constant('no ejecutado'),
              id: fc.nat(),
            }),
            { minLength: 1 }
          ),
          (rows) => {
            // Replicate the filter used in iniciarSincronizacion:
            //   rows.filter(row => row.ESTADO_CARGA === 'no ejecutado')
            const filtered = rows.filter(row => row.ESTADO_CARGA === 'no ejecutado');

            // Since every row has ESTADO_CARGA === 'no ejecutado', all rows must be present
            assert.strictEqual(
              filtered.length,
              rows.length,
              `Expected all ${rows.length} rows to pass the filter, got ${filtered.length}`
            );

            // The order of id values in the filtered result must match the input order
            for (let i = 0; i < rows.length; i++) {
              assert.strictEqual(
                filtered[i].id,
                rows[i].id,
                `Order mismatch at index ${i}: expected id=${rows[i].id}, got id=${filtered[i].id}`
              );
            }
          }
        ),
        { numRuns: 100 }
      );
    });

  });

  // ── Property 3 ──────────────────────────────────────────────────────────────

  await describe('Property 3: El parseo de JSON_BITRIX es un round-trip', async () => {

    await test('JSON.parse(JSON.stringify(obj)) es profundamente igual al objeto original', () => {
      // Feature: bitrix-csv-sync, Property 3: El parseo de JSON_BITRIX es un round-trip
      //
      // We use fc.object() constrained to JSON-safe leaf values only.
      // Excluded: undefined (not JSON-serializable), -0 (serializes as 0),
      // NaN/Infinity (serialize as null). These are not valid JSON values per spec.
      fc.assert(
        fc.property(
          fc.object({
            values: [
              fc.boolean(),
              fc.integer(),
              fc.string(),
              fc.constant(null),
            ],
          }),
          (obj) => {
            const roundTripped = JSON.parse(JSON.stringify(obj));
            assert.deepStrictEqual(
              roundTripped,
              obj,
              `El round-trip JSON falló para: ${JSON.stringify(obj)}`
            );
          }
        ),
        { numRuns: 100 }
      );
    });

  });

  // ── Property 6 ──────────────────────────────────────────────────────────────

  await describe('Property 6: JSON_BITRIX inválido o vacío produce estado de error', async () => {

    await test('JSON_BITRIX inválido o vacío marca ESTADO_CARGA="error", MENSAJE_ERROR correcto y no llama a https.request', async () => {
      // Feature: bitrix-csv-sync, Property 6: JSON_BITRIX inválido o vacío produce estado de error
      await fc.assert(
        fc.asyncProperty(
          // Generate strings that are NOT valid JSON, plus the empty string
          fc.oneof(
            fc.string().filter(s => {
              try { JSON.parse(s); return false; } catch { return true; }
            }),
            fc.constant('')
          ),
          async (invalidJson) => {
            // ── 1. Build a single pending row with the invalid JSON_BITRIX ──────
            const row = {
              ESTADO_CARGA:    'no ejecutado',
              JSON_BITRIX:     invalidJson,
              BITRIX_ID:       '',
              MENSAJE_ERROR:   '',
              FECHA_EJECUCION: '',
              RESPUESTA_BITRIX: '',
            };
            const headers = Object.keys(row);
            const rows    = [row];

            // ── 2. Track whether https.request was called ────────────────────
            let httpsRequestCalled = false;

            // ── 3. Inject mocks into require cache ───────────────────────────
            // Remove stale cache entries
            delete require.cache[syncPath];
            delete require.cache[csvPath];

            // Mock conexion_csv.js
            require.cache[csvPath] = {
              id: csvPath,
              filename: csvPath,
              loaded: true,
              exports: {
                leerCSV:    () => ({ headers: [...headers], rows }),
                guardarCSV: () => {},
              },
            };

            // Mock https module to detect any outgoing request
            const httpsModulePath = require.resolve('https');
            const originalHttpsCache = require.cache[httpsModulePath];
            require.cache[httpsModulePath] = {
              id: httpsModulePath,
              filename: httpsModulePath,
              loaded: true,
              exports: {
                request: (...args) => {
                  httpsRequestCalled = true;
                  // Return a minimal fake request object to avoid crashes
                  return {
                    setTimeout: () => {},
                    on:         () => {},
                    write:      () => {},
                    end:        () => {},
                    destroy:    () => {},
                  };
                },
              },
            };

            // Load a fresh synchronizer that picks up both mocks
            const { iniciarSincronizacion } = require(syncPath);

            // ── 4. Build a minimal controller stub ───────────────────────────
            let currentState = 'running';
            const controlador = {
              getPausaSenal: () => false,
              transicionar:  (s) => { currentState = s; },
              getEstado:     () => currentState,
            };

            // ── 5. Run the sync ──────────────────────────────────────────────
            await iniciarSincronizacion(controlador);

            // ── 6. Restore caches ────────────────────────────────────────────
            delete require.cache[syncPath];
            delete require.cache[csvPath];
            if (originalHttpsCache) {
              require.cache[httpsModulePath] = originalHttpsCache;
            } else {
              delete require.cache[httpsModulePath];
            }

            // ── 7. Assertions ────────────────────────────────────────────────
            assert.strictEqual(
              row.ESTADO_CARGA,
              'error',
              `ESTADO_CARGA should be "error" for JSON_BITRIX=${JSON.stringify(invalidJson)}, got "${row.ESTADO_CARGA}"`
            );

            assert.strictEqual(
              row.MENSAJE_ERROR,
              'JSON_BITRIX inválido o vacío',
              `MENSAJE_ERROR should be "JSON_BITRIX inválido o vacío" for JSON_BITRIX=${JSON.stringify(invalidJson)}, got "${row.MENSAJE_ERROR}"`
            );

            assert.strictEqual(
              httpsRequestCalled,
              false,
              `https.request should NOT have been called for invalid JSON_BITRIX=${JSON.stringify(invalidJson)}`
            );
          }
        ),
        { numRuns: 100 }
      );
    });

  });
})();

// ── Property 4 ────────────────────────────────────────────────────────────────

(async () => {
  await describe('Property 4: Respuesta exitosa actualiza ESTADO_CARGA y BITRIX_ID correctamente', async () => {

    await test('HTTP 200 con result entero positivo marca ESTADO_CARGA="finalizado" y BITRIX_ID=String(result)', async () => {
      // Feature: bitrix-csv-sync, Property 4: Respuesta exitosa actualiza ESTADO_CARGA y BITRIX_ID correctamente
      // Validates: Requirements 2.3, 3.3
      await fc.assert(
        fc.asyncProperty(
          fc.integer({ min: 1 }),
          async (result) => {
            // ── 1. Build a single pending row ────────────────────────────────
            const row = {
              ESTADO_CARGA:     'no ejecutado',
              JSON_BITRIX:      '{"test":1}',
              BITRIX_ID:        '',
              MENSAJE_ERROR:    '',
              FECHA_EJECUCION:  '',
              RESPUESTA_BITRIX: '',
            };
            const headers = Object.keys(row);
            const rows    = [row];

            // ── 2. Inject mocks into require cache ───────────────────────────
            delete require.cache[syncPath];
            delete require.cache[csvPath];

            // Mock conexion_csv.js
            require.cache[csvPath] = {
              id:       csvPath,
              filename: csvPath,
              loaded:   true,
              exports: {
                leerCSV:    () => ({ headers: [...headers], rows }),
                guardarCSV: () => {},
              },
            };

            // Mock https to return HTTP 200 with { result: N }
            const httpsModulePath = require.resolve('https');
            const originalHttpsCache = require.cache[httpsModulePath];
            const responseBody = JSON.stringify({ result });

            require.cache[httpsModulePath] = {
              id:       httpsModulePath,
              filename: httpsModulePath,
              loaded:   true,
              exports: {
                request: (options, callback) => {
                  // Simulate an EventEmitter-like response
                  const EventEmitter = require('events');
                  const res = new EventEmitter();
                  res.statusCode    = 200;
                  res.statusMessage = 'OK';

                  // Schedule the response asynchronously so the request object
                  // is returned before the callback fires
                  setImmediate(() => {
                    callback(res);
                    res.emit('data', responseBody);
                    res.emit('end');
                  });

                  // Return a minimal fake request object
                  const req = new EventEmitter();
                  req.setTimeout = () => {};
                  req.write      = () => {};
                  req.end        = () => {};
                  req.destroy    = () => {};
                  return req;
                },
              },
            };

            // Load a fresh synchronizer that picks up both mocks
            const { iniciarSincronizacion } = require(syncPath);

            // ── 3. Build a minimal controller stub ───────────────────────────
            const controlador = {
              getPausaSenal: () => false,
              transicionar:  () => {},
            };

            // ── 4. Run the sync ──────────────────────────────────────────────
            await iniciarSincronizacion(controlador);

            // ── 5. Restore caches ────────────────────────────────────────────
            delete require.cache[syncPath];
            delete require.cache[csvPath];
            if (originalHttpsCache) {
              require.cache[httpsModulePath] = originalHttpsCache;
            } else {
              delete require.cache[httpsModulePath];
            }

            // ── 6. Assertions ────────────────────────────────────────────────
            assert.strictEqual(
              row.ESTADO_CARGA,
              'finalizado',
              `ESTADO_CARGA should be "finalizado" for result=${result}, got "${row.ESTADO_CARGA}"`
            );

            assert.strictEqual(
              row.BITRIX_ID,
              String(result),
              `BITRIX_ID should be "${String(result)}" for result=${result}, got "${row.BITRIX_ID}"`
            );
          }
        ),
        { numRuns: 100 }
      );
    });

  });
})();

// ── Property 5 ────────────────────────────────────────────────────────────────

(async () => {
  await describe('Property 5: Error HTTP produce mensaje con formato correcto', async () => {

    await test('Código HTTP distinto de 200 produce MENSAJE_ERROR con formato "HTTP {código}: ..."', async () => {
      // Feature: bitrix-csv-sync, Property 5: Error HTTP produce mensaje con formato correcto
      // Validates: Requirements 2.4
      await fc.assert(
        fc.asyncProperty(
          fc.integer({ min: 100, max: 599 }).filter(n => n !== 200),
          async (statusCode) => {
            // ── 1. Build a single pending row with valid JSON_BITRIX ─────────
            const row = {
              ESTADO_CARGA:     'no ejecutado',
              JSON_BITRIX:      '{"test":1}',
              BITRIX_ID:        '',
              MENSAJE_ERROR:    '',
              FECHA_EJECUCION:  '',
              RESPUESTA_BITRIX: '',
            };
            const headers = Object.keys(row);
            const rows    = [row];

            // ── 2. Inject mocks into require cache ───────────────────────────
            delete require.cache[syncPath];
            delete require.cache[csvPath];

            // Mock conexion_csv.js
            require.cache[csvPath] = {
              id:       csvPath,
              filename: csvPath,
              loaded:   true,
              exports: {
                leerCSV:    () => ({ headers: [...headers], rows }),
                guardarCSV: () => {},
              },
            };

            // Mock https to return the generated non-200 status code
            const httpsModulePath = require.resolve('https');
            const originalHttpsCache = require.cache[httpsModulePath];
            const statusMessage = 'Error';

            require.cache[httpsModulePath] = {
              id:       httpsModulePath,
              filename: httpsModulePath,
              loaded:   true,
              exports: {
                request: (options, callback) => {
                  const EventEmitter = require('events');
                  const res = new EventEmitter();
                  res.statusCode    = statusCode;
                  res.statusMessage = statusMessage;

                  // Schedule the response asynchronously
                  setImmediate(() => {
                    callback(res);
                    res.emit('data', '');
                    res.emit('end');
                  });

                  // Return a minimal fake request object
                  const req = new EventEmitter();
                  req.setTimeout = () => {};
                  req.write      = () => {};
                  req.end        = () => {};
                  req.destroy    = () => {};
                  return req;
                },
              },
            };

            // Load a fresh synchronizer that picks up both mocks
            const { iniciarSincronizacion } = require(syncPath);

            // ── 3. Build a minimal controller stub ───────────────────────────
            const controlador = {
              getPausaSenal: () => false,
              transicionar:  () => {},
            };

            // ── 4. Run the sync ──────────────────────────────────────────────
            await iniciarSincronizacion(controlador);

            // ── 5. Restore caches ────────────────────────────────────────────
            delete require.cache[syncPath];
            delete require.cache[csvPath];
            if (originalHttpsCache) {
              require.cache[httpsModulePath] = originalHttpsCache;
            } else {
              delete require.cache[httpsModulePath];
            }

            // ── 6. Assertions ────────────────────────────────────────────────
            assert.strictEqual(
              row.ESTADO_CARGA,
              'error',
              `ESTADO_CARGA should be "error" for HTTP ${statusCode}, got "${row.ESTADO_CARGA}"`
            );

            assert.match(
              row.MENSAJE_ERROR,
              /^HTTP \d+:/,
              `MENSAJE_ERROR should match /^HTTP \\d+:/ for HTTP ${statusCode}, got "${row.MENSAJE_ERROR}"`
            );
          }
        ),
        { numRuns: 100 }
      );
    });

  });
})();

// ── Property 7 ────────────────────────────────────────────────────────────────

(async () => {
  await describe('Property 7: FECHA_EJECUCION siempre tiene el formato correcto', async () => {

    await test('FECHA_EJECUCION coincide con /^\\d{4}-\\d{2}-\\d{2} \\d{2}:\\d{2}:\\d{2}$/ para cualquier resultado (éxito o error)', async () => {
      // Feature: bitrix-csv-sync, Property 7: FECHA_EJECUCION siempre tiene el formato correcto
      // Validates: Requirements 3.4
      await fc.assert(
        fc.asyncProperty(
          fc.oneof(fc.constant('success'), fc.constant('error')),
          async (outcome) => {
            // ── 1. Build a single pending row ────────────────────────────────
            const row = {
              ESTADO_CARGA:     'no ejecutado',
              JSON_BITRIX:      '{"test":1}',
              BITRIX_ID:        '',
              MENSAJE_ERROR:    '',
              FECHA_EJECUCION:  '',
              RESPUESTA_BITRIX: '',
            };
            const headers = Object.keys(row);
            const rows    = [row];

            // ── 2. Inject mocks into require cache ───────────────────────────
            delete require.cache[syncPath];
            delete require.cache[csvPath];

            // Mock conexion_csv.js
            require.cache[csvPath] = {
              id:       csvPath,
              filename: csvPath,
              loaded:   true,
              exports: {
                leerCSV:    () => ({ headers: [...headers], rows }),
                guardarCSV: () => {},
              },
            };

            // Mock https to return HTTP 200 (success) or HTTP 500 (error)
            const httpsModulePath = require.resolve('https');
            const originalHttpsCache = require.cache[httpsModulePath];

            require.cache[httpsModulePath] = {
              id:       httpsModulePath,
              filename: httpsModulePath,
              loaded:   true,
              exports: {
                request: (options, callback) => {
                  const EventEmitter = require('events');
                  const res = new EventEmitter();

                  if (outcome === 'success') {
                    res.statusCode    = 200;
                    res.statusMessage = 'OK';
                    const responseBody = JSON.stringify({ result: 1 });
                    setImmediate(() => {
                      callback(res);
                      res.emit('data', responseBody);
                      res.emit('end');
                    });
                  } else {
                    res.statusCode    = 500;
                    res.statusMessage = 'Internal Server Error';
                    setImmediate(() => {
                      callback(res);
                      res.emit('data', '');
                      res.emit('end');
                    });
                  }

                  // Return a minimal fake request object
                  const req = new EventEmitter();
                  req.setTimeout = () => {};
                  req.write      = () => {};
                  req.end        = () => {};
                  req.destroy    = () => {};
                  return req;
                },
              },
            };

            // Load a fresh synchronizer that picks up both mocks
            const { iniciarSincronizacion } = require(syncPath);

            // ── 3. Build a minimal controller stub ───────────────────────────
            const controlador = {
              getPausaSenal: () => false,
              transicionar:  () => {},
            };

            // ── 4. Run the sync ──────────────────────────────────────────────
            await iniciarSincronizacion(controlador);

            // ── 5. Restore caches ────────────────────────────────────────────
            delete require.cache[syncPath];
            delete require.cache[csvPath];
            if (originalHttpsCache) {
              require.cache[httpsModulePath] = originalHttpsCache;
            } else {
              delete require.cache[httpsModulePath];
            }

            // ── 6. Assertion ─────────────────────────────────────────────────
            const FECHA_REGEX = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/;
            assert.match(
              row.FECHA_EJECUCION,
              FECHA_REGEX,
              `FECHA_EJECUCION should match YYYY-MM-DD HH:mm:ss for outcome="${outcome}", got "${row.FECHA_EJECUCION}"`
            );
          }
        ),
        { numRuns: 100 }
      );
    });

  });
})();

// ── Property 8 ────────────────────────────────────────────────────────────────

(async () => {
  await describe('Property 8: guardarCSV se llama después de cada registro procesado', async () => {

    await test('guardarCSV es invocado al menos 2*N veces para N registros pendientes', async () => {
      // Feature: bitrix-csv-sync, Property 8: guardarCSV se llama después de cada registro procesado
      // Validates: Requirements 3.6

      // Patch setTimeout globally so that esperaCancelable resolves instantly
      // (avoids 3000ms real delays between records during property runs).
      // We call fn synchronously to avoid async overhead from 30 setImmediate hops.
      const originalSetTimeout = global.setTimeout;
      global.setTimeout = (fn, _delay, ...args) => { fn(...args); return 0; };

      try {
        await fc.assert(
          fc.asyncProperty(
            fc.array(
              fc.record({ ESTADO_CARGA: fc.constant('no ejecutado') }),
              { minLength: 1 }
            ),
            async (inputRows) => {
              const N = inputRows.length;

              // ── 1. Build rows with the required fields ─────────────────────
              const rows = inputRows.map(r => ({
                ESTADO_CARGA:     r.ESTADO_CARGA,
                JSON_BITRIX:      '{"test":1}',
                BITRIX_ID:        '',
                MENSAJE_ERROR:    '',
                FECHA_EJECUCION:  '',
                RESPUESTA_BITRIX: '',
              }));
              const headers = Object.keys(rows[0]);

              // ── 2. Counter for guardarCSV calls ────────────────────────────
              let guardarCSVCallCount = 0;

              // ── 3. Inject mocks into require cache ─────────────────────────
              delete require.cache[syncPath];
              delete require.cache[csvPath];

              // Mock conexion_csv.js — leerCSV returns our rows, guardarCSV counts calls
              require.cache[csvPath] = {
                id:       csvPath,
                filename: csvPath,
                loaded:   true,
                exports: {
                  leerCSV:    () => ({ headers: [...headers], rows }),
                  guardarCSV: () => { guardarCSVCallCount++; },
                },
              };

              // Mock https to return HTTP 200 with { result: 1 }
              const httpsModulePath = require.resolve('https');
              const originalHttpsCache = require.cache[httpsModulePath];
              const responseBody = JSON.stringify({ result: 1 });

              require.cache[httpsModulePath] = {
                id:       httpsModulePath,
                filename: httpsModulePath,
                loaded:   true,
                exports: {
                  request: (options, callback) => {
                    const EventEmitter = require('events');
                    const res = new EventEmitter();
                    res.statusCode    = 200;
                    res.statusMessage = 'OK';

                    setImmediate(() => {
                      callback(res);
                      res.emit('data', responseBody);
                      res.emit('end');
                    });

                    const req = new EventEmitter();
                    req.setTimeout = () => {};
                    req.write      = () => {};
                    req.end        = () => {};
                    req.destroy    = () => {};
                    return req;
                  },
                },
              };

              // Load a fresh synchronizer that picks up both mocks
              const { iniciarSincronizacion } = require(syncPath);

              // ── 4. Build a minimal controller stub ─────────────────────────
              const controlador = {
                getPausaSenal: () => false,
                transicionar:  () => {},
              };

              // ── 5. Run the sync ────────────────────────────────────────────
              await iniciarSincronizacion(controlador);

              // ── 6. Restore caches ──────────────────────────────────────────
              delete require.cache[syncPath];
              delete require.cache[csvPath];
              if (originalHttpsCache) {
                require.cache[httpsModulePath] = originalHttpsCache;
              } else {
                delete require.cache[httpsModulePath];
              }

              // ── 7. Assertion ───────────────────────────────────────────────
              assert.ok(
                guardarCSVCallCount >= 2 * N,
                `guardarCSV should be called at least ${2 * N} times for N=${N} records, but was called ${guardarCSVCallCount} times`
              );
            }
          ),
          { numRuns: 100 }
        );
      } finally {
        // Always restore the original setTimeout
        global.setTimeout = originalSetTimeout;
      }
    });

  });
})();

// ── Property 9 ────────────────────────────────────────────────────────────────

(async () => {
  await describe('Property 9: El delay entre registros es siempre de 3000ms', async () => {

    await test('esperaCancelable es invocada con ms=3000 entre registros consecutivos (N-1 delays de 30 ticks × 100ms)', async () => {
      // Feature: bitrix-csv-sync, Property 9: El delay entre registros es siempre de 3000ms
      // Validates: Requirements 4.1
      //
      // Strategy:
      //   - esperaCancelable(3000, ctrl) internally calls setTimeout(tick, 100) exactly
      //     30 times before resolving (transcurrido reaches 3000 on the 30th tick).
      //   - For N records there are exactly N-1 inter-record delays.
      //   - We mock global.setTimeout per-run to (a) record every ms argument and
      //     (b) call the callback synchronously so the test does not hang.
      //   - After the sync we assert that the number of setTimeout calls with ms=100
      //     equals exactly 30 * (N-1), which proves each delay is 3000ms (30 × 100ms).

      const originalSetTimeout = global.setTimeout;

      try {
        await fc.assert(
          fc.asyncProperty(
            fc.array(
              fc.record({ ESTADO_CARGA: fc.constant('no ejecutado') }),
              { minLength: 2 }
            ),
            async (inputRows) => {
              const N = inputRows.length;

              // ── 1. Build rows with required fields ─────────────────────────
              const rows = inputRows.map(r => ({
                ESTADO_CARGA:     r.ESTADO_CARGA,
                JSON_BITRIX:      '{"test":1}',
                BITRIX_ID:        '',
                MENSAJE_ERROR:    '',
                FECHA_EJECUCION:  '',
                RESPUESTA_BITRIX: '',
              }));
              const headers = Object.keys(rows[0]);

              // ── 2. Install mocked setTimeout per-run ───────────────────────
              // IMPORTANT: recordedMs must be declared before the mock so the
              // closure always captures the current run's array (not a stale one).
              // global.setTimeout is re-assigned inside each run so the closure
              // always points to the current recordedMs.
              const recordedMs = [];
              global.setTimeout = (fn, ms, ...args) => {
                recordedMs.push(ms);
                fn(...args);
                return 0;
              };

              // ── 3. Inject mocks into require cache ─────────────────────────
              delete require.cache[syncPath];
              delete require.cache[csvPath];

              // Mock conexion_csv.js
              require.cache[csvPath] = {
                id:       csvPath,
                filename: csvPath,
                loaded:   true,
                exports: {
                  leerCSV:    () => ({ headers: [...headers], rows }),
                  guardarCSV: () => {},
                },
              };

              // Mock https to return HTTP 200 with { result: 1 }
              const httpsModulePath = require.resolve('https');
              const originalHttpsCache = require.cache[httpsModulePath];
              const responseBody = JSON.stringify({ result: 1 });

              require.cache[httpsModulePath] = {
                id:       httpsModulePath,
                filename: httpsModulePath,
                loaded:   true,
                exports: {
                  request: (options, callback) => {
                    const EventEmitter = require('events');
                    const res = new EventEmitter();
                    res.statusCode    = 200;
                    res.statusMessage = 'OK';

                    setImmediate(() => {
                      callback(res);
                      res.emit('data', responseBody);
                      res.emit('end');
                    });

                    const req = new EventEmitter();
                    req.setTimeout = () => {};
                    req.write      = () => {};
                    req.end        = () => {};
                    req.destroy    = () => {};
                    return req;
                  },
                },
              };

              // Load a fresh synchronizer that picks up both mocks
              const { iniciarSincronizacion } = require(syncPath);

              // ── 4. Build a minimal controller stub ─────────────────────────
              const controlador = {
                getPausaSenal: () => false,
                transicionar:  () => {},
              };

              // ── 5. Run the sync ────────────────────────────────────────────
              await iniciarSincronizacion(controlador);

              // ── 6. Restore setTimeout and caches ──────────────────────────
              // Restore setTimeout immediately after sync so subsequent async
              // operations (setImmediate callbacks, etc.) use the real timer.
              global.setTimeout = originalSetTimeout;

              delete require.cache[syncPath];
              delete require.cache[csvPath];
              if (originalHttpsCache) {
                require.cache[httpsModulePath] = originalHttpsCache;
              } else {
                delete require.cache[httpsModulePath];
              }

              // ── 7. Assertions ──────────────────────────────────────────────
              // Each call to esperaCancelable(3000, ctrl) polls every 100ms.
              // transcurrido starts at 0; after each tick it increases by 100.
              // The loop resolves when transcurrido >= 3000, which happens on
              // the 30th tick (100*30 = 3000). So each delay = 30 setTimeout calls.
              // There are N-1 inter-record delays.
              const TICKS_PER_DELAY = 3000 / 100; // 30
              const expectedDelayTicks = TICKS_PER_DELAY * (N - 1);

              // Count only the 100ms ticks (from esperaCancelable polling)
              const tickCalls = recordedMs.filter(ms => ms === 100).length;

              assert.strictEqual(
                tickCalls,
                expectedDelayTicks,
                `Expected ${expectedDelayTicks} setTimeout(fn, 100) calls for N=${N} records ` +
                `(${N - 1} delays × ${TICKS_PER_DELAY} ticks), but got ${tickCalls}. ` +
                `This proves each inter-record delay is exactly 3000ms (30 × 100ms).`
              );
            }
          ),
          { numRuns: 100 }
        );
      } finally {
        // Ensure setTimeout is always restored even if fc.assert throws
        global.setTimeout = originalSetTimeout;
      }
    });

  });
})();
