import { Injectable, Logger } from '@nestjs/common';

import { ImapFlow } from 'imapflow';
import { AddressObject, ParsedMail, simpleParser } from 'mailparser';

import { InjectMessageQueue } from 'src/engine/core-modules/message-queue/decorators/message-queue.decorator';
import { MessageQueue } from 'src/engine/core-modules/message-queue/message-queue.constants';
import { MessageQueueService } from 'src/engine/core-modules/message-queue/services/message-queue.service';
import { MessageDirection } from 'src/modules/messaging/common/enums/message-direction.enum';
import { ImapClientProvider } from 'src/modules/messaging/message-import-manager/drivers/imap/providers/imap-client.provider';
import { ImapHandleErrorService } from 'src/modules/messaging/message-import-manager/drivers/imap/services/imap-handle-error.service';
import { sanitizeString } from 'src/modules/messaging/message-import-manager/drivers/imap/utils/sanitize-string.util';
import { EmailAddress } from 'src/modules/messaging/message-import-manager/types/email-address';
import { MessageWithParticipants } from 'src/modules/messaging/message-import-manager/types/message';
import { formatAddressObjectAsParticipants } from 'src/modules/messaging/message-import-manager/utils/format-address-object-as-participants.util';

type AddressType = 'from' | 'to' | 'cc' | 'bcc';

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
  ): Promise<MessageWithParticipants[]> {
    if (!messageIds.length) {
      return [];
    }

    try {
      const client = await this.imapClientProvider.getClient(
        workspaceId,
        messageChannelId,
      );

      const lock = await client.getMailboxLock('INBOX');
      const messages: MessageWithParticipants[] = [];

      try {
        for (const messageId of messageIds) {
          try {
            const message = await this.fetchAndParseMessage(messageId, client);

            if (message) {
              messages.push(message);
            }
          } catch (messageError) {
            this.handleSingleMessageError(messageError, messageId);
          }
        }

        return messages;
      } finally {
        lock.release();
      }
    } catch (error) {
      this.logger.error(
        `Error getting messages: ${error.message}`,
        error.stack,
      );
      throw error;
    } finally {
      await this.imapClientProvider.closeClient(workspaceId, messageChannelId);
    }
  }

  private async fetchAndParseMessage(
    messageId: string,
    client: ImapFlow,
  ): Promise<MessageWithParticipants | null> {
    const results = await client.search({
      header: {
        'message-id': messageId,
      },
    });

    if (!results.length) {
      this.logger.debug(`Message with ID ${messageId} not found`);

      return null;
    }

    const seq = results[0];
    const fetchResult = await client.fetchOne(seq.toString(), {
      source: true,
      envelope: true,
    });

    if (!fetchResult) {
      this.logger.debug(`Failed to fetch message with ID ${messageId}`);

      return null;
    }

    const rawContent = fetchResult.source?.toString() || '';
    const parsed = await simpleParser(rawContent);

    return this.createMessageFromParsedMail(parsed, messageId);
  }

  private createMessageFromParsedMail(
    parsed: ParsedMail,
    messageId: string,
  ): MessageWithParticipants {
    const participants = this.extractAllParticipants(parsed);
    const attachments = this.extractAttachments(parsed);

    return {
      externalId: messageId,
      messageThreadExternalId: messageId,
      headerMessageId: messageId,
      subject: parsed.subject || '',
      text: sanitizeString(parsed.text || ''),
      receivedAt: parsed.date || new Date(),
      direction: MessageDirection.INCOMING,
      attachments,
      participants,
    };
  }

  private extractAllParticipants(parsed: ParsedMail) {
    const fromAddresses = this.extractAddresses(
      parsed.from as AddressObject | undefined,
      'from',
    );
    const toAddresses = this.extractAddresses(
      parsed.to as AddressObject | undefined,
      'to',
    );
    const ccAddresses = this.extractAddresses(
      parsed.cc as AddressObject | undefined,
      'cc',
    );
    const bccAddresses = this.extractAddresses(
      parsed.bcc as AddressObject | undefined,
      'bcc',
    );

    return [
      ...formatAddressObjectAsParticipants(fromAddresses, 'from'),
      ...formatAddressObjectAsParticipants(toAddresses, 'to'),
      ...formatAddressObjectAsParticipants(ccAddresses, 'cc'),
      ...formatAddressObjectAsParticipants(bccAddresses, 'bcc'),
    ];
  }

  private extractAddresses(
    addressObject: AddressObject | undefined,
    _type: AddressType,
  ): EmailAddress[] {
    const addresses: EmailAddress[] = [];

    if (addressObject && 'value' in addressObject) {
      for (const addr of addressObject.value) {
        if (addr.address) {
          addresses.push({
            address: addr.address,
            name: addr.name || '',
          });
        }
      }
    }

    return addresses;
  }

  private extractAttachments(parsed: ParsedMail) {
    return (parsed.attachments || []).map((attachment) => ({
      filename: attachment.filename || 'unnamed-attachment',
    }));
  }

  private handleSingleMessageError(error: Error, messageId: string): void {
    this.logger.error(
      `Error fetching message ${messageId}: ${error.message}`,
      error.stack,
    );
    this.imapHandleErrorService.handleImapMessagesImportError(error, messageId);
  }
}
