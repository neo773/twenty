import dns from 'node:dns';
import net from 'node:net';

import nodeFetch from 'node-fetch';
import { type JestConfigWithTsJest } from 'ts-jest';
import 'tsconfig-paths/register';

import { rawDataSource } from 'src/database/typeorm/raw/raw.datasource';
import { JwtKeyManagerService } from 'src/engine/core-modules/jwt/services/jwt-key-manager.service';
import { WorkspaceCacheService } from 'src/engine/workspace-cache/services/workspace-cache.service';
import { SEED_APPLE_WORKSPACE_ID } from 'src/engine/workspace-manager/dev-seeder/core/constants/seeder-workspaces.constant';
import { getWorkflowPrefillIds } from 'src/engine/workspace-manager/standard-objects-prefill-data/utils/prefill-workflows.util';

import { createApp } from './create-app';
import { createWorkflowTestServices } from './create-workflow-test-services';
import { debugTraceUnhandledPgClientErrors } from './debug-trace-unhandled-pg-client-errors.util';
import { snapshotTestDatabase } from './snapshot-test-database.util';
import {
  closeQueueConnections,
  waitForAllJobsToFinish,
} from './wait-for-all-jobs-to-finish.util';
import { waitForTestDatabaseReset } from './wait-for-test-database-reset.util';

const deactivateSeededCreateCompanyWorkflowVersion = async () => {
  const { coreCreateCompanyWorkflowVersionId } = getWorkflowPrefillIds(
    SEED_APPLE_WORKSPACE_ID,
  );

  await rawDataSource.query(
    `UPDATE core."workflowVersion" SET status = 'DEACTIVATED' WHERE id = $1 AND status = 'ACTIVE'`,
    [coreCreateCompanyWorkflowVersionId],
  );
};

export default async (_: unknown, projectConfig: JestConfigWithTsJest) => {
  // Happy Eyeballs swaps the TCP handle under a connecting localhost socket and
  // msw's passthrough keeps the stale one (mswjs/interceptors#753): read EINVAL.
  // Resolving IPv4 first keeps localhost reachable without the fallback.
  dns.setDefaultResultOrder('ipv4first');
  net.setDefaultAutoSelectFamily(false);

  // node-fetch rides node:http, which msw patches; native undici fetch
  // escapes interception.
  // @ts-expect-error node-fetch's types differ from the lib.dom fetch it replaces at runtime
  globalThis.fetch = nodeFetch;

  debugTraceUnhandledPgClientErrors();

  await waitForTestDatabaseReset();
  await rawDataSource.initialize();
  await deactivateSeededCreateCompanyWorkflowVersion();

  const app = await createApp({});

  if (!projectConfig.globals) {
    throw new Error('No globals found in project config');
  }

  await app
    .get(WorkspaceCacheService)
    .invalidateAndRecompute(SEED_APPLE_WORKSPACE_ID, [
      'flatWorkflowVersionMaps',
      'workflowAutomatedTriggerMaps',
    ]);

  await app.listen(projectConfig.globals.APP_PORT as number);

  if (process.env.INTEGRATION_TEST_RESTORE_DATABASE_BETWEEN_FILES === 'true') {
    await app.get(JwtKeyManagerService).getCurrentSigningKey();
    await waitForAllJobsToFinish();
    await closeQueueConnections();
    await snapshotTestDatabase();
  }

  global.app = app;
  global.workflowTestServices = createWorkflowTestServices(app);
  global.testDataSource = rawDataSource;
  global.jobDrainState = { lastStalledFingerprint: null };
};
