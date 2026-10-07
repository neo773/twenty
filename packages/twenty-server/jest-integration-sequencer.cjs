const fs = require('fs');
const path = require('path');

const Sequencer = require('@jest/test-sequencer').default;

const FALLBACK_DURATION_MS = 1;

const toRelativePath = (rootDirectory, testPath) =>
  path.relative(rootDirectory, testPath).split(path.sep).join('/');

const compareStrings = (stringA, stringB) => {
  if (stringA < stringB) {
    return -1;
  }

  return stringA > stringB ? 1 : 0;
};

const listJsonFiles = (directory) =>
  fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const entryPath = path.join(directory, entry.name);

    if (entry.isDirectory()) {
      return listJsonFiles(entryPath);
    }

    return entry.name.endsWith('.json') ? [entryPath] : [];
  });

const readJsonObject = (file) => {
  try {
    const parsed = JSON.parse(fs.readFileSync(file, 'utf8'));

    return parsed !== null && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
};

const readRecordedDurations = (directory) => {
  const durations = new Map();

  if (!directory || !fs.existsSync(directory)) {
    return durations;
  }

  for (const file of listJsonFiles(directory)) {
    for (const [relativePath, durationMs] of Object.entries(
      readJsonObject(file),
    )) {
      if (Number.isFinite(durationMs) && durationMs > 0) {
        durations.set(
          relativePath,
          Math.max(durations.get(relativePath) ?? 0, Math.round(durationMs)),
        );
      }
    }
  }

  return durations;
};

const getMedianDuration = (durations) => {
  const sortedDurations = [...durations.values()].sort(
    (durationA, durationB) => durationA - durationB,
  );

  return sortedDurations.length === 0
    ? FALLBACK_DURATION_MS
    : sortedDurations[Math.floor(sortedDurations.length / 2)];
};

class IntegrationTestSequencer extends Sequencer {
  shard(tests, { shardIndex, shardCount }) {
    const durations = readRecordedDurations(
      process.env.INTEGRATION_TEST_DURATIONS_DIR,
    );
    const defaultDurationMs = getMedianDuration(durations);

    const testsByDescendingDuration = tests
      .map((test) => {
        const relativePath = toRelativePath(
          test.context.config.rootDir,
          test.path,
        );

        return {
          test,
          relativePath,
          durationMs: durations.get(relativePath) ?? defaultDurationMs,
        };
      })
      .sort(
        (weightedTestA, weightedTestB) =>
          weightedTestB.durationMs - weightedTestA.durationMs ||
          compareStrings(weightedTestA.relativePath, weightedTestB.relativePath),
      );

    const shardLoadsMs = new Array(shardCount).fill(0);
    const shardTests = [];

    for (const { test, durationMs } of testsByDescendingDuration) {
      const lightestShard = shardLoadsMs.indexOf(Math.min(...shardLoadsMs));

      shardLoadsMs[lightestShard] += durationMs;

      if (lightestShard === shardIndex - 1) {
        shardTests.push(test);
      }
    }

    return shardTests;
  }

  cacheResults(tests, results) {
    super.cacheResults(tests, results);

    const outputFile = process.env.INTEGRATION_TEST_DURATIONS_OUTPUT_FILE;

    if (!outputFile || tests.length === 0) {
      return;
    }

    try {
      const rootDirectory = tests[0].context.config.rootDir;
      const durations = {};

      for (const testResult of results.testResults) {
        const durationMs =
          testResult.perfStats?.runtime ??
          testResult.perfStats?.end - testResult.perfStats?.start;

        if (
          !testResult.skipped &&
          Number.isFinite(durationMs) &&
          durationMs > 0
        ) {
          durations[toRelativePath(rootDirectory, testResult.testFilePath)] =
            Math.round(durationMs);
        }
      }

      fs.mkdirSync(path.dirname(outputFile), { recursive: true });
      fs.writeFileSync(outputFile, JSON.stringify(durations));
    } catch (error) {
      process.stderr.write(
        `Could not record integration test durations: ${error}\n`,
      );
    }
  }
}

module.exports = IntegrationTestSequencer;
