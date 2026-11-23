import { Client } from 'pg';

type TestDatabaseNames = {
  testDatabaseName: string;
  seedDatabaseName: string;
};

export const withTestDatabaseAdminClient = async <TResult>(
  callback: (
    adminClient: Client,
    testDatabaseNames: TestDatabaseNames,
  ) => Promise<TResult>,
): Promise<TResult> => {
  const databaseUrl = new URL(process.env.PG_DATABASE_URL as string);
  const testDatabaseName = decodeURIComponent(databaseUrl.pathname.slice(1));

  databaseUrl.pathname = '/postgres';

  const adminClient = new Client({ connectionString: databaseUrl.toString() });

  await adminClient.connect();

  try {
    return await callback(adminClient, {
      testDatabaseName,
      seedDatabaseName: `${testDatabaseName}_seed`,
    });
  } finally {
    await adminClient.end();
  }
};
