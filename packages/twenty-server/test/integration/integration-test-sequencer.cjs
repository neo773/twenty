const path = require('path');

const integrationTestDurations = require('./integration-test-durations.json');

const DEFAULT_DURATION_IN_SECONDS = 4;

const getDurationInSeconds = (test) =>
  integrationTestDurations[
    path.relative(test.context.config.rootDir, test.path)
  ] ?? DEFAULT_DURATION_IN_SECONDS;

const sortByDurationDescending = (tests) =>
  [...tests].sort(
    (testA, testB) =>
      getDurationInSeconds(testB) - getDurationInSeconds(testA) ||
      testA.path.localeCompare(testB.path),
  );

class IntegrationTestSequencer {
  shard(tests, { shardIndex, shardCount }) {
    const shards = Array.from({ length: shardCount }, () => ({
      durationInSeconds: 0,
      tests: [],
    }));

    for (const test of sortByDurationDescending(tests)) {
      const lightestShard = shards.reduce((lightest, shard) =>
        shard.durationInSeconds < lightest.durationInSeconds ? shard : lightest,
      );

      lightestShard.durationInSeconds += getDurationInSeconds(test);
      lightestShard.tests.push(test);
    }

    return shards[shardIndex - 1].tests;
  }

  sort(tests) {
    return sortByDurationDescending(tests);
  }

  cacheResults() {}

  allFailedTests(tests) {
    return tests;
  }
}

module.exports = IntegrationTestSequencer;
