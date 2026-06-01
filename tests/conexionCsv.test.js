'use strict';

const fs = require('fs');
const path = require('path');
const { describe, test, assert } = require('./setup');

const tmpPath = path.join(__dirname, 'tmp_csv_roundtrip.csv');
process.env.CRM_CSV_PATH = tmpPath;

delete require.cache[path.resolve(__dirname, '../Conexión/conexion_csv.js')];
const csv = require('../Conexión/conexion_csv');

(async () => {
  await describe('CSV: parseo y serialización', async () => {
    await test('lee JSON entrecomillado como JSON válido y preserva separadores internos', () => {
      const contenido = [
        'ID;JSON_BITRIX;NOMBRE',
        '1;"{""fields"":{""TITLE"":""ACME; SUR""}}";"Cliente ""Especial"""',
      ].join('\r\n');

      fs.writeFileSync(tmpPath, contenido, 'latin1');
      const datos = csv.leerCSV();

      assert.strictEqual(datos.rows.length, 1);
      assert.strictEqual(JSON.parse(datos.rows[0].JSON_BITRIX).fields.TITLE, 'ACME; SUR');
      assert.strictEqual(datos.rows[0].NOMBRE, 'Cliente "Especial"');
    });

    await test('guarda campos con comillas y separadores en formato CSV válido', () => {
      const headers = ['ID', 'JSON_BITRIX', 'NOMBRE'];
      const rows = [{
        ID: '2',
        JSON_BITRIX: '{"fields":{"TITLE":"UNO; DOS"}}',
        NOMBRE: 'Cliente "Nuevo"',
      }];

      csv.guardarCSV(headers, rows);
      const datos = csv.leerCSV();

      assert.strictEqual(datos.rows.length, 1);
      assert.strictEqual(JSON.parse(datos.rows[0].JSON_BITRIX).fields.TITLE, 'UNO; DOS');
      assert.strictEqual(datos.rows[0].NOMBRE, 'Cliente "Nuevo"');
    });
  });
})().finally(() => {
  if (fs.existsSync(tmpPath)) fs.unlinkSync(tmpPath);
});
