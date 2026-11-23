import { withTestDatabaseAdminClient } from 'test/integration/utils/with-test-database-admin-client.util';

export const snapshotTestDatabase = async (): Promise<void> =>
  withTestDatabaseAdminClient(
    async (adminClient, { testDatabaseName, seedDatabaseName }) => {
      const testDatabase = adminClient.escapeIdentifier(testDatabaseName);
      const seedDatabase = adminClient.escapeIdentifier(seedDatabaseName);

      await adminClient.query(
        `DROP DATABASE IF EXISTS ${seedDatabase} WITH (FORCE)`,
      );
      await adminClient.query(
        `ALTER DATABASE ${testDatabase} WITH ALLOW_CONNECTIONS false`,
      );

      try {
        await adminClient.query(
          'SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = $1 AND pid <> pg_backend_pid()',
          [testDatabaseName],
        );
        await adminClient.query(
          `CREATE DATABASE ${seedDatabase} TEMPLATE ${testDatabase}`,
        );
      } finally {
        await adminClient.query(
          `ALTER DATABASE ${testDatabase} WITH ALLOW_CONNECTIONS true`,
        );
      }

      await adminClient.query(
        `ALTER DATABASE ${seedDatabase} WITH ALLOW_CONNECTIONS false`,
      );
    },
  );
