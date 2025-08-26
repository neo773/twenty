import { Injectable, Logger } from '@nestjs/common';

import { type ListResponse } from 'imapflow';

import { type FolderInfo } from 'src/engine/core-modules/auth/services/create-message-folder.service';
import { type ConnectedAccountWorkspaceEntity } from 'src/modules/connected-account/standard-objects/connected-account.workspace-entity';
import { ImapClientProvider } from 'src/modules/messaging/message-import-manager/drivers/imap/providers/imap-client.provider';
import { ImapFindSentFolderService } from 'src/modules/messaging/message-import-manager/drivers/imap/services/imap-find-sent-folder.service';
import { MessageFolderName } from 'src/modules/messaging/message-import-manager/drivers/imap/types/folders';

@Injectable()
export class ImapGetAllFoldersService {
  private readonly logger = new Logger(ImapGetAllFoldersService.name);
  private readonly excludedFlags = new Set(['\\Drafts', '\\Trash', '\\Junk']);

  constructor(
    private readonly imapClientProvider: ImapClientProvider,
    private readonly imapFindSentFolderService: ImapFindSentFolderService,
  ) {}

  async getAllFolders(
    connectedAccount: Pick<
      ConnectedAccountWorkspaceEntity,
      'id' | 'provider' | 'connectionParameters' | 'handle'
    >,
  ): Promise<FolderInfo[]> {
    try {
      const client = await this.imapClientProvider.getClient(connectedAccount);

      const mailboxList = await client.list();

      const folders = await this.filterAndMapFolders(mailboxList);

      console.log('------folders------');
      console.dir(folders, { depth: null });
      console.log('------folders------');

      await this.imapClientProvider.closeClient(client);

      return folders;
    } catch (error) {
      this.logger.error(
        `Failed to get IMAP folders for account ${connectedAccount.handle}:`,
        error,
      );

      return [
        {
          name: MessageFolderName.INBOX,
          isSynced: true,
          isSentFolder: false,
        },
        {
          name: MessageFolderName.SENT_ITEMS,
          isSynced: true,
          isSentFolder: true,
        },
      ];
    }
  }

  private async filterAndMapFolders(
    mailboxList: ListResponse[],
  ): Promise<FolderInfo[]> {
    const folders: FolderInfo[] = [];

    for (const mailbox of mailboxList) {
      if (this.shouldExcludeFolder(mailbox)) {
        continue;
      }
      // TODO: mark primary inbox and sent folder as synced
      folders.push({
        name: mailbox.path,
        isSynced: false,
        isSentFolder: false,
      });
    }

    return folders;
  }

  private shouldExcludeFolder(mailbox: ListResponse): boolean {
    if (
      this.excludedFlags.has(mailbox.specialUse) ||
      mailbox.flags?.has('\\Noselect')
    ) {
      return true;
    }

    return false;
  }
}
