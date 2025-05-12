import { Injectable, Logger } from '@nestjs/common';

import { InjectMessageQueue } from 'src/engine/core-modules/message-queue/decorators/message-queue.decorator';
import { MessageQueue } from 'src/engine/core-modules/message-queue/message-queue.constants';
import { MessageQueueService } from 'src/engine/core-modules/message-queue/services/message-queue.service';
import { MessageDirection } from 'src/modules/messaging/common/enums/message-direction.enum';
import { ImapClientProvider } from 'src/modules/messaging/message-import-manager/drivers/imap/providers/imap-client.provider';
import { ImapHandleErrorService } from 'src/modules/messaging/message-import-manager/drivers/imap/services/imap-handle-error.service';
import { Message } from 'src/modules/messaging/message-import-manager/types/message';

@Injectable()
export class ImapGetMessagesService {
  private readonly logger = new Logger(ImapGetMessagesService.name);

  constructor(
    private readonly imapClientProvider: ImapClientProvider,
    private readonly imapHandleErrorService: ImapHandleErrorService,
    @InjectMessageQueue(MessageQueue.messagingQueue)
    private readonly messageQueueService: MessageQueueService,
  ) {}

  async getMessages(
    messageIds: string[],
    workspaceId: string,
    messageChannelId: string,
  ): Promise<Message[]> {
    if (!messageIds.length) {
      return [];
    }

    try {
      // Get IMAP client
      const client = await this.imapClientProvider.getClient(
        workspaceId,
        messageChannelId,
      );

      // Open the inbox with a lock
      const lock = await client.getMailboxLock('INBOX');

      try {
        const messages: Message[] = [];

        // Process each message ID
        for (const messageId of messageIds) {
          try {
            // Search for messages by Message-ID header
            const results = await client.search({
              header: {
                'message-id': messageId,
              },
            });

            if (!results.length) {
              this.logger.debug(`Message with ID ${messageId} not found`);
              continue;
            }

            // Get the first matching message (there should only be one with the same Message-ID)
            const seq = results[0];

            // Fetch the full message
            const fetchResult = await client.fetchOne(seq.toString(), {
              source: true, // Get the raw source
              envelope: true, // Get headers
            });

            if (!fetchResult) {
              this.logger.debug(`Failed to fetch message with ID ${messageId}`);
              continue;
            }

            // Parse raw message content
            const rawContent = fetchResult.source?.toString() || '';

            // Create message object that conforms to the Message type
            const message: Message = {
              externalId: messageId,
              messageThreadExternalId: messageId, // Use message ID as thread ID
              headerMessageId: messageId, // Required field for Message type
              subject: fetchResult.envelope?.subject || '',
              text: this.extractSnippet(rawContent),
              receivedAt: new Date(fetchResult.envelope?.date || new Date()),
              direction: MessageDirection.INCOMING,
              attachments: [],
            };

            messages.push(message);
          } catch (messageError) {
            this.logger.error(
              `Error fetching message ${messageId}: ${messageError.message}`,
              messageError.stack,
            );
            // Use the specific error handling for single message errors
            this.imapHandleErrorService.handleImapMessagesImportError(
              messageError,
              messageId,
            );
          }
        }

        return messages;
      } finally {
        // Release the mailbox lock
        lock.release();
      }
    } catch (error) {
      this.logger.error(
        `Error getting messages: ${error.message}`,
        error.stack,
      );

      // Use a generic error handling approach for the entire batch
      throw error;
    } finally {
      // Close the client to free up resources
      await this.imapClientProvider.closeClient(workspaceId, messageChannelId);
    }
  }

  private extractSnippet(rawContent: string): string {
    // Simple function to extract a snippet from the raw content
    // In practice, you might want to use more sophisticated parsing
    const bodyStart = rawContent.indexOf('\r\n\r\n');

    if (bodyStart !== -1) {
      const bodyText = rawContent.substring(bodyStart + 4);

      return bodyText
        .substring(0, 100)
        .replace(/[\r\n\t]+/g, ' ')
        .trim();
    }

    return '';
  }
}
