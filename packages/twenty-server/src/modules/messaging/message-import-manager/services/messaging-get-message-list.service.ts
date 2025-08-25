import { Injectable, Logger } from '@nestjs/common';

import { ConnectedAccountProvider } from 'twenty-shared/types';

import { type MessageChannelWorkspaceEntity } from 'src/modules/messaging/common/standard-objects/message-channel.workspace-entity';
import { GmailGetMessageListService } from 'src/modules/messaging/message-import-manager/drivers/gmail/services/gmail-get-message-list.service';
import { ImapGetMessageListService } from 'src/modules/messaging/message-import-manager/drivers/imap/services/imap-get-message-list.service';
import { MicrosoftGetMessageListService } from 'src/modules/messaging/message-import-manager/drivers/microsoft/services/microsoft-get-message-list.service';
import {
  MessageImportException,
  MessageImportExceptionCode,
} from 'src/modules/messaging/message-import-manager/exceptions/message-import.exception';
import { type GetMessageListsResponse } from 'src/modules/messaging/message-import-manager/types/get-message-lists-response.type';

@Injectable()
export class MessagingGetMessageListService {
  private readonly logger = new Logger(MessagingGetMessageListService.name);

  constructor(
    private readonly gmailGetMessageListService: GmailGetMessageListService,
    private readonly microsoftGetMessageListService: MicrosoftGetMessageListService,
    private readonly imapGetMessageListService: ImapGetMessageListService,
  ) {}

  public async getMessageLists(
    messageChannel: MessageChannelWorkspaceEntity,
  ): Promise<GetMessageListsResponse> {
    // Filter message folders to only include synced ones
    const syncedMessageFolders = messageChannel.messageFolders.filter(
      (folder) => folder.isSynced,
    );

    if (syncedMessageFolders.length === 0) {
      this.logger.warn(
        `No synced folders found for message channel ${messageChannel.id}`,
      );

      return [];
    }

    switch (messageChannel.connectedAccount.provider) {
      case ConnectedAccountProvider.GOOGLE:
        return await this.gmailGetMessageListService.getMessageLists({
          messageChannel,
          connectedAccount: messageChannel.connectedAccount,
          messageFolders: syncedMessageFolders,
        });
      case ConnectedAccountProvider.MICROSOFT:
        return this.microsoftGetMessageListService.getMessageLists({
          messageChannel,
          connectedAccount: messageChannel.connectedAccount,
          messageFolders: syncedMessageFolders,
        });
      case ConnectedAccountProvider.IMAP_SMTP_CALDAV: {
        return await this.imapGetMessageListService.getMessageLists({
          messageChannel,
          connectedAccount: messageChannel.connectedAccount,
          messageFolders: syncedMessageFolders,
        });
      }
      default:
        throw new MessageImportException(
          `Provider ${messageChannel.connectedAccount.provider} is not supported`,
          MessageImportExceptionCode.PROVIDER_NOT_SUPPORTED,
        );
    }
  }
}
