/**
 * tests/setup.js
 * Minimal test runner helper shared by all test files.
 * Uses Node.js built-in `assert` — no external test runner required.
 */

'use strict';

const assert = require('assert');

let suiteQueue = Promise.resolve();

/**
 * Runs a single named test case.
 * @param {string} name  - Human-readable test name.
 * @param {Function} fn  - Synchronous or async test body.
 */
async function test(name, fn) {
  try {
    await fn();
    console.log(`  ✓ ${name}`);
  } catch (err) {
    console.error(`  ✗ ${name}`);
    console.error(`    ${err.message}`);
    process.exitCode = 1;
  }
}

/**
 * Groups related tests under a descriptive label.
 * @param {string} label  - Suite label printed before the tests.
 * @param {Function} fn   - Function that calls `test()` entries.
 */
async function describe(label, fn) {
  const run = suiteQueue.then(async () => {
    console.log(`\n${label}`);
    await fn();
  });

  suiteQueue = run.catch(() => {});
  return run;
}

/**
 * Convenience re-export of Node's assert so test files only need
 * to require this one module.
 */
module.exports = { test, describe, assert };
