'use strict';

const { spawnSync } = require('child_process');
const path = require('path');

const tests = [
  'conexionCsv.test.js',
  'syncController.property.test.js',
  'synchronizer.property.test.js',
];

let failed = false;

for (const file of tests) {
  const fullPath = path.join(__dirname, file);
  console.log(`\n== ${file} ==`);

  const result = spawnSync(process.execPath, [fullPath], {
    cwd: path.resolve(__dirname, '..'),
    stdio: 'inherit',
    env: { ...process.env },
  });

  if (result.status !== 0) failed = true;
}

if (failed) process.exitCode = 1;
