import { Injectable, Logger } from '@nestjs/common';

import { ImapClientProvider } from 'src/modules/messaging/message-import-manager/drivers/imap/providers/imap-client.provider';
import { ImapHandleErrorService } from 'src/modules/messaging/message-import-manager/drivers/imap/services/imap-handle-error.service';

@Injectable()
export class ImapGetMessageListService {
  private readonly logger = new Logger(ImapGetMessageListService.name);

  constructor(
    private readonly imapClientProvider: ImapClientProvider,
    private readonly imapHandleErrorService: ImapHandleErrorService,
  ) {}

  async getMessageList(
    messageChannelId: string,
    workspaceId: string,
    cursor?: string,
  ): Promise<{ messageIds: string[]; nextCursor?: string }> {
    try {
      const client = await this.imapClientProvider.getClient(
        workspaceId,
        messageChannelId,
      );

      const lock = await client.getMailboxLock('INBOX');

      try {
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
            messages.push({
              id: message.envelope.messageId,
              date:
                message.envelope.date?.toISOString() ||
                new Date().toISOString(),
            });
          }
        }

        messages.sort(
          (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime(),
        );

        const messageIds = messages.map((message) => message.id);

        const nextCursor =
          messages.length > 0 ? messages[messages.length - 1].date : undefined;

        return {
          messageIds,
          nextCursor,
        };
      } finally {
        lock.release();
      }
    } catch (error) {
      this.logger.error(
        `Error getting message list: ${error.message}`,
        error.stack,
      );

      this.imapHandleErrorService.handleImapMessageListFetchError(error);

      return { messageIds: [] };
    } finally {
      await this.imapClientProvider.closeClient(workspaceId, messageChannelId);
    }
  }
}
