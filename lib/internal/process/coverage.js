'use strict';
let coverageConnection = null;
let coverageDirectory;

function writeCoverage() {
  if (!coverageConnection && coverageDirectory) {
    return;
  }

  const { join } = require('path');
  const { mkdirSync, writeFileSync } = require('fs');
  const { threadId } = require('internal/worker');

  const filename = `coverage-${process.pid}-${Date.now()}-${threadId}.json`;
  try {
    mkdirSync(coverageDirectory, { recursive: true });
  } catch (err) {
    if (err.code !== 'EEXIST') {
      console.error(err);
      return;
    }
  }

  const target = join(coverageDirectory, filename);
  try {
    disableAllAsyncHooks();
    let msg;
    coverageConnection._coverageCallback = function(_msg) {
      msg = _msg;
    };
    coverageConnection.dispatch(JSON.stringify({
      id: 3,
      method: 'Profiler.takePreciseCoverage'
    }));
    const coverageInfo = JSON.parse(msg).result;
    writeFileSync(target, JSON.stringify(coverageInfo));
  } catch (err) {
    console.error(err);
  } finally {
    coverageConnection.disconnect();
    coverageConnection = null;
  }
}

function disableAllAsyncHooks() {
  const { getHookArrays } = require('internal/async_hooks');
  const [hooks_array] = getHookArrays();
  hooks_array.forEach((hook) => { hook.disable(); });
}

exports.writeCoverage = writeCoverage;

function setup() {
  const { Connection } = internalBinding('inspector');
  if (!Connection) {
    console.warn('inspector not enabled');
    return;
  }

  coverageConnection = new Connection((res) => {
    if (coverageConnection._coverageCallback) {
      coverageConnection._coverageCallback(res);
    }
  });
  coverageConnection.dispatch(JSON.stringify({
    id: 1,
    method: 'Profiler.enable'
  }));
  coverageConnection.dispatch(JSON.stringify({
    id: 2,
    method: 'Profiler.startPreciseCoverage',
    params: {
      callCount: true,
      detailed: true
    }
  }));

  try {
    const { resolve } = require('path');
    coverageDirectory = process.env.NODE_V8_COVERAGE =
      resolve(process.env.NODE_V8_COVERAGE);
  } catch (err) {
    console.error(err);
  }
}

exports.setup = setup;

function setupExitHooks() {
  const reallyReallyExit = process.reallyExit;
  process.reallyExit = function(code) {
    writeCoverage();
    reallyReallyExit(code);
  };

  process.on('exit', writeCoverage);
}

exports.setupExitHooks = setupExitHooks;
