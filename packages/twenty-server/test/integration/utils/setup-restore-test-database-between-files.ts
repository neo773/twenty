import { restoreTestDatabase } from 'test/integration/utils/restore-test-database.util';

const RESTORE_TEST_DATABASE_HOOK_TIMEOUT_MS = 60_000;

beforeAll(async () => {
  await restoreTestDatabase();
}, RESTORE_TEST_DATABASE_HOOK_TIMEOUT_MS);
