import { Injectable, Logger } from '@nestjs/common';

import { ImapFlow, type ListResponse } from 'imapflow';
import { isDefined } from 'twenty-shared/utils';

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

  public async getAllFolders(
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
    const sentFolderPath =
      await this.imapFindSentFolderService.findSentFolder(client);

    if (isDefined(sentFolderPath)) {
      folders.push({
        name: sentFolderPath,
        isSynced: true,
        isSentFolder: true,
      });
    }

    const validMailboxes = mailboxList.filter((mailbox) =>
      this.isValidMailbox(mailbox, folders),
    );

    for (const mailbox of validMailboxes) {
      const isInbox = await this.isInboxFolder(mailbox);

      folders.push({
        name: mailbox.path,
        isSynced: isInbox,
        isSentFolder: false,
      });
    }

    return folders;
  }

  private isValidMailbox(
    mailbox: ListResponse,
    existingFolders: FolderInfo[],
  ): boolean {
    if (this.shouldExcludeFolder(mailbox)) {
      return false;
    }

    const isDuplicate = existingFolders.some(
      (folder) => folder.name === mailbox.path,
    );

    return !isDuplicate;
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
