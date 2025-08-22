import { Injectable, Logger } from '@nestjs/common';

import { FetchQueryObject, type ImapFlow } from 'imapflow';

@Injectable()
export class ImapMessageFetcherService {
  private readonly logger = new Logger(ImapMessageFetcherService.name);

  public async getAllMessageIds(client: ImapFlow): Promise<string[]> {
    try {
      const fetchQuery: FetchQueryObject = { envelope: true };
      const messages: string[] = [];

      for await (const msg of client.fetch('1:*', fetchQuery, { uid: true })) {
        const messageId = msg.envelope?.messageId ?? '';

        if (messageId) {
          messages.push(messageId);
        }
      }

      return messages;
    } catch (err) {
      this.logger.error(`Error getting all message IDs: ${err.message}`);

      return [];
    }
  }

  public async getMessagesWithUidSearch(
    client: ImapFlow,
    lastSeenUid: number,
    maxUid: number,
  ): Promise<{ id: string; uid: string }[]> {
    try {
      let allUids = await client.search({ all: true }, { uid: true });

      if (!Array.isArray(allUids)) allUids = [];

      const wantedUids = allUids.filter((u) => u > lastSeenUid && u <= maxUid);

      if (wantedUids.length === 0) {
        this.logger.log(
          `No new messages. lastSeenUid=${lastSeenUid}, maxUid=${maxUid}`,
        );

        return [];
      }

      const fetchQuery: FetchQueryObject = { envelope: true };
      const messages: { id: string; uid: string }[] = [];

      this.logger.log(
        `Fetching ${wantedUids.length} messages, UIDs ${wantedUids[0]}..${
          wantedUids[wantedUids.length - 1]
        }`,
      );

      for await (const msg of client.fetch(wantedUids, fetchQuery, {
        uid: true,
      })) {
        const uid = msg.uid ? String(msg.uid) : '';
        const messageId = msg.envelope?.messageId ?? '';

        messages.push({ id: messageId, uid });
      }

      return messages;
    } catch (err) {
      this.logger.error(`Error with UID search: ${err.message}`);
      throw err;
    }
  }

  public async getMessagesWithQresync(
    client: ImapFlow,
    lastSeenUid: number,
    lastModSeq: bigint,
  ): Promise<{ id: string; uid: string }[]> {
    try {
      const vanished = await client.search(
        {
          modseq: lastModSeq + BigInt(1),
          uid: `${lastSeenUid + 1}:*`,
        },
        { uid: true },
      );

      const fetchQuery: FetchQueryObject = { envelope: true };
      const messages: { id: string; uid: string }[] = [];

      if (vanished && Array.isArray(vanished) && vanished.length > 0) {
        this.logger.log(
          `QRESYNC: Fetching ${vanished.length} new/modified messages`,
        );

        for await (const msg of client.fetch(vanished, fetchQuery, {
          uid: true,
        })) {
          const uid = msg.uid ? String(msg.uid) : '';
          const messageId = msg.envelope?.messageId ?? '';

          messages.push({ id: messageId, uid });
        }
      }

      return messages;
    } catch (err) {
      this.logger.error(`Error with QRESYNC: ${err.message}`);
      throw err;
    }
  }
}
