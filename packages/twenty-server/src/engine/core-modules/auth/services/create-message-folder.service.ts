import { Injectable } from '@nestjs/common';

import { ConnectedAccountProvider } from 'twenty-shared/types';
import { v4 } from 'uuid';

import { FeatureFlagKey } from 'src/engine/core-modules/feature-flag/enums/feature-flag-key.enum';
import { FeatureFlagService } from 'src/engine/core-modules/feature-flag/services/feature-flag.service';
import { type WorkspaceEntityManager } from 'src/engine/twenty-orm/entity-manager/workspace-entity-manager';
import { TwentyORMGlobalManager } from 'src/engine/twenty-orm/twenty-orm-global.manager';
import { type MessageChannelWorkspaceEntity } from 'src/modules/messaging/common/standard-objects/message-channel.workspace-entity';
import { type MessageFolderWorkspaceEntity } from 'src/modules/messaging/common/standard-objects/message-folder.workspace-entity';
import { GmailGetAllFoldersService } from 'src/modules/messaging/message-import-manager/drivers/gmail/services/gmail-get-all-folders.service';
import { ImapGetAllFoldersService } from 'src/modules/messaging/message-import-manager/drivers/imap/services/imap-get-all-folders.service';
import { MicrosoftGetAllFoldersService } from 'src/modules/messaging/message-import-manager/drivers/microsoft/services/microsoft-get-all-folders.service';
import { MessageFolderName } from 'src/modules/messaging/message-import-manager/drivers/microsoft/types/folders';

export type CreateMessageFoldersInput = {
  workspaceId: string;
  messageChannelId: string;
  manager: WorkspaceEntityManager;
};

export type FolderInfo = {
  name: string;
  isSynced: boolean;
  isSentFolder: boolean;
};

@Injectable()
export class CreateMessageFolderService {
  constructor(
    private readonly twentyORMGlobalManager: TwentyORMGlobalManager,
    private readonly featureFlagService: FeatureFlagService,
    private readonly gmailGetAllFoldersService: GmailGetAllFoldersService,
    private readonly microsoftGetAllFoldersService: MicrosoftGetAllFoldersService,
    private readonly imapGetAllFoldersService: ImapGetAllFoldersService,
  ) {}

  async createMessageFolders(input: CreateMessageFoldersInput): Promise<void> {
    const { workspaceId, messageChannelId, manager } = input;

    const isFolderControlEnabled =
      await this.featureFlagService.isFeatureEnabled(
        FeatureFlagKey.IS_MESSAGE_FOLDER_CONTROL_ENABLED,
        workspaceId,
      );

    const messageFolderRepository =
      await this.twentyORMGlobalManager.getRepositoryForWorkspace<MessageFolderWorkspaceEntity>(
        workspaceId,
        'messageFolder',
      );

    if (isFolderControlEnabled) {
      await this.createAllDiscoveredFolders({
        workspaceId,
        messageChannelId,
        manager,
      });

      return;
    }

    await messageFolderRepository.save(
      {
        id: v4(),
        messageChannelId,
        name: MessageFolderName.INBOX,
        syncCursor: '',
        isSynced: true,
        isSentFolder: false,
      },
      {},
      manager,
    );

    await messageFolderRepository.save(
      {
        id: v4(),
        messageChannelId,
        name: MessageFolderName.SENT_ITEMS,
        syncCursor: '',
        isSynced: true,
        isSentFolder: true,
      },
      {},
      manager,
    );
  }

  private async createAllDiscoveredFolders(
    input: CreateMessageFoldersInput,
  ): Promise<void> {
    const { workspaceId, messageChannelId, manager } = input;

    const messageChannelRepository =
      await this.twentyORMGlobalManager.getRepositoryForWorkspace<MessageChannelWorkspaceEntity>(
        workspaceId,
        'messageChannel',
      );

    const messageChannel = await messageChannelRepository.findOne(
      {
        where: { id: messageChannelId },
        relations: ['connectedAccount'],
      },
      manager,
    );

    if (!messageChannel) {
      throw new Error(`Message channel ${messageChannelId} not found`);
    }

    const folders = await this.discoverAllFolders(messageChannel);
    const messageFolderRepository =
      await this.twentyORMGlobalManager.getRepositoryForWorkspace<MessageFolderWorkspaceEntity>(
        workspaceId,
        'messageFolder',
      );

    for (const folder of folders) {
      await messageFolderRepository.save(
        {
          id: v4(),
          messageChannelId,
          name: folder.name,
          syncCursor: '',
          isSynced: folder.isSynced,
          isSentFolder: folder.isSentFolder,
        },
        {},
        manager,
      );
    }
  }

  private async discoverAllFolders(
    messageChannel: MessageChannelWorkspaceEntity,
  ): Promise<FolderInfo[]> {
    switch (messageChannel.connectedAccount.provider) {
      case ConnectedAccountProvider.GOOGLE:
        return await this.gmailGetAllFoldersService.getAllFolders(
          messageChannel.connectedAccount,
        );
      case ConnectedAccountProvider.MICROSOFT:
        return await this.microsoftGetAllFoldersService.getAllFolders(
          messageChannel.connectedAccount,
        );
      case ConnectedAccountProvider.IMAP_SMTP_CALDAV:
        return await this.imapGetAllFoldersService.getAllFolders(
          messageChannel.connectedAccount,
        );
      default:
        throw new Error(
          `Provider ${messageChannel.connectedAccount.provider} is not supported`,
        );
    }
  }
}
