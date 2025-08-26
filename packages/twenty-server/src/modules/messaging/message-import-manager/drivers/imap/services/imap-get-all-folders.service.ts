import { Injectable, Logger } from '@nestjs/common';

import { isDefined } from 'class-validator';
import { ImapFlow, type ListResponse } from 'imapflow';

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

      const folders = await this.filterAndMapFolders(client, mailboxList);

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

      throw error;
    }
  }

  private async filterAndMapFolders(
    client: ImapFlow,
    mailboxList: ListResponse[],
  ): Promise<FolderInfo[]> {
    const folders: FolderInfo[] = [];

    for (const mailbox of mailboxList) {
      if (this.shouldExcludeFolder(mailbox)) {
        continue;
      }

      const sentFolder =
        await this.imapFindSentFolderService.findSentFolder(client);

      const isSentFolder = isDefined(sentFolder);
      const isInboxFolder = await this.isInboxFolder(mailbox);

      folders.push({
        name: mailbox.path,
        isSynced: isInboxFolder || isSentFolder,
        isSentFolder: isSentFolder,
      });
    }

    return folders;
  }

  private async isInboxFolder(mailbox: ListResponse): Promise<boolean> {
    if (
      mailbox.path.toLowerCase() === MessageFolderName.INBOX ||
      mailbox.specialUse === '\\Inbox'
    ) {
      return true;
    }

    return false;
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
