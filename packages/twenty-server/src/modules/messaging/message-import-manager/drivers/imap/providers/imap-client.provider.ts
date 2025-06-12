import { Injectable, Logger } from '@nestjs/common';

import { ImapFlow } from 'imapflow';
import { ConnectedAccountProvider } from 'twenty-shared/types';

import { TwentyORMGlobalManager } from 'src/engine/twenty-orm/twenty-orm-global.manager';
import { ConnectedAccountWorkspaceEntity } from 'src/modules/connected-account/standard-objects/connected-account.workspace-entity';
import { MessageChannelWorkspaceEntity } from 'src/modules/messaging/common/standard-objects/message-channel.workspace-entity';

interface ImapClientInstance {
  client: ImapFlow;
  isReady: boolean;
}

@Injectable()
export class ImapClientProvider {
  private readonly logger = new Logger(ImapClientProvider.name);
  private clientInstances: Map<string, ImapClientInstance> = new Map();

  constructor(
    private readonly twentyORMGlobalManager: TwentyORMGlobalManager,
  ) {}

  async getClient(
    workspaceId: string,
    messageChannelId: string,
  ): Promise<ImapFlow> {
    const cacheKey = `${workspaceId}-${messageChannelId}`;

    if (this.clientInstances.has(cacheKey)) {
      const instance = this.clientInstances.get(cacheKey);

      if (instance?.isReady) {
        return instance.client;
      }
    }

    const messageChannelRepository =
      await this.twentyORMGlobalManager.getRepositoryForWorkspace<MessageChannelWorkspaceEntity>(
        workspaceId,
        'messageChannel',
      );

    const messageChannel = await messageChannelRepository.findOneOrFail({
      where: { id: messageChannelId },
    });

    const connectedAccountRepository =
      await this.twentyORMGlobalManager.getRepositoryForWorkspace<ConnectedAccountWorkspaceEntity>(
        workspaceId,
        'connectedAccount',
      );

    const connectedAccount = await connectedAccountRepository.findOneOrFail({
      where: { id: messageChannel.connectedAccountId },
    });

    if (connectedAccount.provider !== ConnectedAccountProvider.IMAP) {
      throw new Error('Connected account is not an IMAP provider');
    }

    interface ImapConnectionParams {
      imapServer?: string;
      imapPort?: number;
      imapEncryption?: string;
      imapPassword?: string;
    }

    const customConnectionParams: ImapConnectionParams =
      (connectedAccount.customConnectionParams as ImapConnectionParams) || {};

    const client = new ImapFlow({
      host: customConnectionParams.imapServer || '',
      port: customConnectionParams.imapPort || 993,
      secure: customConnectionParams.imapEncryption === 'SSL',
      auth: {
        user: connectedAccount.handle,
        pass: customConnectionParams.imapPassword || '',
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

      this.clientInstances.set(cacheKey, {
        client,
        isReady: true,
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

  async closeClient(
    workspaceId: string,
    messageChannelId: string,
  ): Promise<void> {
    const cacheKey = `${workspaceId}-${messageChannelId}`;
    const instance = this.clientInstances.get(cacheKey);

    if (instance) {
      try {
        await instance.client.logout();
      } catch (error) {
        this.logger.error(
          `Error closing IMAP connection: ${error.message}`,
          error.stack,
        );
      } finally {
        this.clientInstances.delete(cacheKey);
      }
    }
  }
}
