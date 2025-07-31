import { Injectable, Logger } from '@nestjs/common';

import { ImapFlow } from 'imapflow';

import { ConnectedAccountWorkspaceEntity } from 'src/modules/connected-account/standard-objects/connected-account.workspace-entity';
import { ImapClientProvider } from 'src/modules/messaging/message-import-manager/drivers/imap/providers/imap-client.provider';
import { ImapHandleErrorService } from 'src/modules/messaging/message-import-manager/drivers/imap/services/imap-handle-error.service';
import { MessageFolderName } from 'src/modules/messaging/message-import-manager/drivers/imap/types/folders';
import { findSentMailbox } from 'src/modules/messaging/message-import-manager/drivers/imap/utils/find-sent-mailbox.util';
import { GetMessageListsArgs } from 'src/modules/messaging/message-import-manager/types/get-message-lists-args.type';
import {
  GetMessageListsResponse,
  GetOneMessageListResponse,
} from 'src/modules/messaging/message-import-manager/types/get-message-lists-response.type';

@Injectable()
export class ImapGetMessageListService {
  private readonly logger = new Logger(ImapGetMessageListService.name);

  constructor(
    private readonly imapClientProvider: ImapClientProvider,
    private readonly imapHandleErrorService: ImapHandleErrorService,
  ) {}

  async getMessageLists({
    messageChannel,
    connectedAccount,
    messageFolders,
  }: GetMessageListsArgs): Promise<GetMessageListsResponse> {
    try {
      const client = await this.imapClientProvider.getClient(connectedAccount);
      const result: GetMessageListsResponse = [];

      for (const folder of messageFolders) {
        const mailboxName = await this.getMailboxName(client, folder.name);

        if (!mailboxName) {
          continue;
        }

        try {
          const response = await this.getMessageListForMailboxWithRetry(
            client,
            mailboxName,
            folder.syncCursor,
            connectedAccount,
          );

          result.push({
            ...response,
            folderId: folder.id,
          });
        } catch (error) {
          this.logger.warn(
            `Error fetching from folder ${folder.name} (${mailboxName}): ${error.message}. Continuing with other folders.`,
          );
        }
      }

      return result;
    } catch (error) {
      this.logger.error(
        `Error getting message list: ${error.message}`,
        error.stack,
      );

      this.imapHandleErrorService.handleImapMessageListFetchError(error);

      return [
        {
          messageExternalIds: [],
          nextSyncCursor: messageChannel.syncCursor || '',
          previousSyncCursor: messageChannel.syncCursor,
          messageExternalIdsToDelete: [],
          folderId: undefined,
        },
      ];
    } finally {
      await this.imapClientProvider.closeClient(connectedAccount.id);
    }
  }

  private async getMailboxName(
    client: ImapFlow,
    folderName: string,
  ): Promise<string | null> {
    if (folderName === MessageFolderName.INBOX) {
      return 'INBOX';
    }

    if (folderName === MessageFolderName.SENT_ITEMS) {
      const sentMailbox = await findSentMailbox(client, this.logger);

      if (!sentMailbox) {
        this.logger.warn('SENT folder not found, skipping');

        return null;
      }

      return sentMailbox;
    }

    return folderName;
  }

  private async getMessageListForMailboxWithRetry(
    client: ImapFlow,
    mailbox: string,
    cursor: string | undefined,
    connectedAccount: Pick<
      ConnectedAccountWorkspaceEntity,
      'id' | 'provider' | 'connectionParameters' | 'handle'
    >,
  ): Promise<GetOneMessageListResponse> {
    try {
      return await this.getMessageListForMailbox(client, mailbox, cursor);
    } catch (error) {
      if (error.message === 'Connection not available') {
        this.logger.warn(
          `Retrying with fresh connection for mailbox ${mailbox}`,
        );

        const newClient =
          await this.imapClientProvider.getClient(connectedAccount);

        return await this.getMessageListForMailbox(newClient, mailbox, cursor);
      }

      throw error;
    }
  }

  private async getMessageListForMailbox(
    client: ImapFlow,
    mailbox: string,
    cursor?: string,
  ): Promise<GetOneMessageListResponse> {
    const messages = await this.getMessagesFromMailbox(client, mailbox, cursor);

    messages.sort(
      (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime(),
    );

    const messageExternalIds = messages.map((message) => message.id);

    const nextSyncCursor =
      messages.length > 0 ? messages[messages.length - 1].date : cursor || '';

    return {
      messageExternalIds,
      nextSyncCursor,
      previousSyncCursor: cursor || '',
      messageExternalIdsToDelete: [],
      folderId: undefined,
    };
  }

  private async getMessagesFromMailbox(
    client: ImapFlow,
    mailbox: string,
    cursor?: string,
  ): Promise<{ id: string; date: string }[]> {
    let lock;

    try {
      lock = await client.getMailboxLock(mailbox);

      let searchOptions = {};

      if (cursor) {
        searchOptions = {
          since: new Date(cursor),
        };
      }

      const messages: { id: string; date: string }[] = [];

      for await (const message of client.fetch(searchOptions, {
        envelope: true,
      })) {
        if (message.envelope?.messageId) {
          const messageDate = message.envelope.date
            ? new Date(message.envelope.date)
            : new Date();
          const validDate = isNaN(messageDate.getTime())
            ? new Date()
            : messageDate;

          messages.push({
            id: message.envelope.messageId,
            date: validDate.toISOString(),
          });
        }
      }

      return messages;
    } catch (error) {
      if (error.message === 'Connection not available') {
        this.logger.warn(
          `Connection not available for mailbox ${mailbox}, will retry with fresh connection`,
        );

        throw error;
      }

      this.logger.error(
        `Error fetching from mailbox ${mailbox}: ${error.message}`,
        error.stack,
      );

      return [];
    } finally {
      if (lock) {
        lock.release();
      }
    }
  }
}
