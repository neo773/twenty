import { Injectable } from '@nestjs/common';

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
import { ConnectedAccountProvider } from 'twenty-shared/types';

export type CreateMessageFoldersInput = {
  workspaceId: string;
  messageChannelId: string;
  manager: WorkspaceEntityManager;
};

export type FolderInfo = {
  name: string;
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

    const isFolderControlEnabled = await this.featureFlagService.isFeatureEnabled(
      FeatureFlagKey.IS_MESSAGE_FOLDER_CONTROL_ENABLED,
      workspaceId,
    );

    const messageFolderRepository =
      await this.twentyORMGlobalManager.getRepositoryForWorkspace<MessageFolderWorkspaceEntity>(
        workspaceId,
        'messageFolder',
      );

    if (!isFolderControlEnabled) {
      // Default behavior: only INBOX and SENT folders
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
    } else {
      // Feature enabled: discover all folders and set appropriate defaults
      await this.createAllDiscoveredFolders({
        workspaceId,
        messageChannelId,
        manager,
      });
    }
  }

  private async createAllDiscoveredFolders(input: CreateMessageFoldersInput): Promise<void> {
    const { workspaceId, messageChannelId, manager } = input;

    // Get the message channel to determine provider
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
      const isSentFolder = this.isSentFolderName(folder.name);
      const isInboxFolder = folder.name.toUpperCase() === 'INBOX';
      const isSynced = isInboxFolder || isSentFolder;

      await messageFolderRepository.save(
        {
          id: v4(),
          messageChannelId,
          name: folder.name,
          syncCursor: '',
          isSynced,
          isSentFolder,
        },
        {},
        manager,
      );
    }
  }

  private async discoverAllFolders(
    messageChannel: MessageChannelWorkspaceEntity,
  ): Promise<Array<{ name: string }>> {
    try {
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
          // Fallback to default folders if provider not supported
          return [
            { name: MessageFolderName.INBOX },
            { name: MessageFolderName.SENT_ITEMS },
          ];
      }
    } catch (error) {
      // Log error and fallback to default folders
      console.error('Failed to discover folders:', error);
      return [
        { name: MessageFolderName.INBOX },
        { name: MessageFolderName.SENT_ITEMS },
      ];
    }
  }

  private isSentFolderName(folderName: string): boolean {
    const sentFolderNames = [
      'SENT',
      'SENT_ITEMS',
      'SENTITEMS',
      'SENT ITEMS',
      'OUTBOX',
      'SENT MAIL',
      'SENT_MAIL',
      'SENTMAIL',
    ];
    return sentFolderNames.includes(folderName.toUpperCase());
  }
}
