import IORedis from 'ioredis';

import { withTestDatabaseAdminClient } from 'test/integration/utils/with-test-database-admin-client.util';

const REDIS_SCAN_PAGE_SIZE = 1000;

const restorePostgresFromSeed = async (): Promise<void> =>
  withTestDatabaseAdminClient(
    async (adminClient, { testDatabaseName, seedDatabaseName }) => {
      const testDatabase = adminClient.escapeIdentifier(testDatabaseName);
      const seedDatabase = adminClient.escapeIdentifier(seedDatabaseName);

      await adminClient.query(
        `ALTER DATABASE ${testDatabase} WITH ALLOW_CONNECTIONS false`,
      );
      await adminClient.query(
        `DROP DATABASE IF EXISTS ${testDatabase} WITH (FORCE)`,
      );
      await adminClient.query(
        `CREATE DATABASE ${testDatabase} TEMPLATE ${seedDatabase}`,
      );
    },
  );

const deleteRedisKeysOutsideQueues = async (): Promise<void> => {
  const queueKeyPrefix = `${process.env.REDIS_QUEUE_PREFIX ?? 'bull'}:`;
  const redis = new IORedis(process.env.REDIS_URL ?? 'redis://localhost:6379');

  try {
    let cursor = '0';

    do {
      const [nextCursor, keys] = await redis.scan(
        cursor,
        'COUNT',
        REDIS_SCAN_PAGE_SIZE,
      );
      const keysToDelete = keys.filter(
        (key) => !key.startsWith(queueKeyPrefix),
      );

      if (keysToDelete.length > 0) {
        await redis.unlink(...keysToDelete);
      }

      cursor = nextCursor;
    } while (cursor !== '0');
  } finally {
    redis.disconnect();
  }
};

export const restoreTestDatabase = async (): Promise<void> => {
  await restorePostgresFromSeed();
  await deleteRedisKeysOutsideQueues();
};
