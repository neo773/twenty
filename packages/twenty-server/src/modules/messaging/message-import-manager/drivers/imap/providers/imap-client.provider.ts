import { Injectable, Logger } from '@nestjs/common';

import { ImapFlow } from 'imapflow';
import { ConnectedAccountProvider } from 'twenty-shared/types';
import { isDefined } from 'twenty-shared/utils';

import { ImapSmtpCaldavParams } from 'src/engine/core-modules/imap-smtp-caldav-connection/types/imap-smtp-caldav-connection.type';
import { ConnectedAccountWorkspaceEntity } from 'src/modules/connected-account/standard-objects/connected-account.workspace-entity';

interface ImapClientInstance {
  client: ImapFlow;
  isReady: boolean;
  lastHealthCheck?: Date;
}

@Injectable()
export class ImapClientProvider {
  private readonly logger = new Logger(ImapClientProvider.name);
  private readonly clientInstances = new Map<string, ImapClientInstance>();
  private readonly HEALTH_CHECK_INTERVAL = 5 * 60 * 1000;

  constructor() {}

  async getClient(
    connectedAccount: Pick<
      ConnectedAccountWorkspaceEntity,
      'id' | 'provider' | 'connectionParameters' | 'handle'
    >,
  ): Promise<ImapFlow> {
    if (
      connectedAccount.provider !== ConnectedAccountProvider.IMAP_SMTP_CALDAV ||
      !isDefined(connectedAccount.connectionParameters?.IMAP)
    ) {
      throw new Error('Connected account is not an IMAP provider');
    }

    const cacheKey = `${connectedAccount.id}`;
    const existingInstance = this.clientInstances.get(cacheKey);
    const isHealthyConnection =
      existingInstance?.isReady &&
      (await this.isConnectionHealthy(existingInstance));

    if (isHealthyConnection) {
      return existingInstance.client;
    }

    if (existingInstance) {
      this.logger.warn(
        `Removing unhealthy IMAP connection for ${connectedAccount.handle}`,
      );
      await this.cleanupInstance(existingInstance);
      this.clientInstances.delete(cacheKey);
    }

    const connectionParameters: ImapSmtpCaldavParams =
      (connectedAccount.connectionParameters as unknown as ImapSmtpCaldavParams) ||
      {};

    const client = new ImapFlow({
      host: connectionParameters.IMAP?.host || '',
      port: connectionParameters.IMAP?.port || 993,
      secure: connectionParameters.IMAP?.secure,
      auth: {
        user: connectedAccount.handle,
        pass: connectionParameters.IMAP?.password || '',
      },
      logger: false,
      tls: {
        rejectUnauthorized: false,
      },
    });

    try {
      await client.connect();

      this.logger.log(
        `Connected to IMAP server for ${connectedAccount.handle}`,
      );

      try {
        const mailboxes = await client.list();

        this.logger.log(
          `Available mailboxes for ${connectedAccount.handle}: ${mailboxes.map((m) => m.path).join(', ')}`,
        );
      } catch (error) {
        this.logger.warn(`Failed to list mailboxes: ${error.message}`);
      }

      this.clientInstances.set(cacheKey, {
        client,
        isReady: true,
        lastHealthCheck: new Date(),
      });

      return client;
    } catch (error) {
      this.logger.error(
        `Failed to connect to IMAP server: ${error.message}`,
        error.stack,
      );
      throw error;
    }
  }

  async closeClient(connectedAccountId: string): Promise<void> {
    const cacheKey = `${connectedAccountId}`;
    const instance = this.clientInstances.get(cacheKey);

    if (instance?.isReady) {
      await this.cleanupInstance(instance);
      this.clientInstances.delete(cacheKey);
    }
  }

  private async isConnectionHealthy(
    instance: ImapClientInstance,
  ): Promise<boolean> {
    try {
      if (instance.lastHealthCheck) {
        const timeSinceLastCheck =
          Date.now() - instance.lastHealthCheck.getTime();

        if (timeSinceLastCheck < this.HEALTH_CHECK_INTERVAL) {
          return true;
        }
      }

      if (!instance.client.usable) {
        return false;
      }

      await instance.client.getQuota();

      instance.lastHealthCheck = new Date();

      return true;
    } catch (error) {
      this.logger.warn(`IMAP connection health check failed: ${error.message}`);

      return false;
    }
  }

  private async cleanupInstance(instance: ImapClientInstance): Promise<void> {
    try {
      await instance.client.logout();
      this.logger.log('Closed IMAP client');
    } catch (error) {
      this.logger.error(`Error closing IMAP client: ${error.message}`);
    }
  }
}
