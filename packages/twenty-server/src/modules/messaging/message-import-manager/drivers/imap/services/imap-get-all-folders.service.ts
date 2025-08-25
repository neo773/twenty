import { Injectable, Logger } from '@nestjs/common';

import { type ImapFlow } from 'imapflow';

import { type FolderInfo } from 'src/engine/core-modules/auth/services/create-message-folder.service';
import { type ConnectedAccountWorkspaceEntity } from 'src/modules/connected-account/standard-objects/connected-account.workspace-entity';
import { ImapClientProvider } from 'src/modules/messaging/message-import-manager/drivers/imap/providers/imap-client.provider';
import { ImapHandleErrorService } from 'src/modules/messaging/message-import-manager/drivers/imap/services/imap-handle-error.service';
import { MessageFolderName } from 'src/modules/messaging/message-import-manager/drivers/imap/types/folders';

type ImapFolderInfo = FolderInfo;

@Injectable()
export class ImapGetAllFoldersService {
  private readonly logger = new Logger(ImapGetAllFoldersService.name);

  constructor(
    private readonly imapClientProvider: ImapClientProvider,
    private readonly imapHandleErrorService: ImapHandleErrorService,
  ) {}

  async getAllFolders(
    connectedAccount: Pick<
      ConnectedAccountWorkspaceEntity,
      'id' | 'provider' | 'connectionParameters' | 'handle'
    >,
  ): Promise<ImapFolderInfo[]> {
    let client: ImapFlow | null = null;

    try {
      client = await this.imapClientProvider.getClient(connectedAccount);

      const list = await client.list();

      this.logger.debug(
        `Available folders: ${list.map((item) => item.path).join(', ')}`,
      );

      const folders: ImapFolderInfo[] = [];

      for (const mailbox of list) {
        if (!mailbox.path) {
          continue;
        }

        // Skip mailboxes with \Noselect flag (cannot contain messages)
        if (mailbox.flags && mailbox.flags.has('\\Noselect')) {
          continue;
        }

        // Skip system folders we don't want to sync based on special-use flags
        if (mailbox.specialUse) {
          if (
            mailbox.specialUse.includes('\\Drafts') ||
            mailbox.specialUse.includes('\\Trash') ||
            mailbox.specialUse.includes('\\Junk')
          ) {
            continue;
          }
        }

        // Map IMAP folder paths to standardized folder names using special-use flags
        let folderName = mailbox.path;

        // Use special-use flags for standardization
        if (mailbox.specialUse) {
          if (mailbox.specialUse.includes('\\Inbox')) {
            folderName = MessageFolderName.INBOX;
          } else if (mailbox.specialUse.includes('\\Sent')) {
            folderName = MessageFolderName.SENT_ITEMS;
          }
          // Keep original path for other special-use folders like \All, \Flagged, etc.
        } else {
          // Fallback to path-based detection for servers without special-use support
          const upperPath = mailbox.path.toUpperCase();

          if (upperPath === 'INBOX') {
            folderName = MessageFolderName.INBOX;
          } else if (
            upperPath.includes('SENT') ||
            upperPath === 'SENT_ITEMS' ||
            upperPath === 'SENTITEMS'
          ) {
            folderName = MessageFolderName.SENT_ITEMS;
          } else if (
            upperPath.includes('DRAFT') ||
            upperPath.includes('TRASH') ||
            upperPath.includes('JUNK') ||
            upperPath.includes('SPAM')
          ) {
            // Skip system folders we don't want to sync
            continue;
          }
        }

        folders.push({
          name: folderName,
        });
      }

      this.logger.log(
        `Found ${folders.length} folders for IMAP account ${connectedAccount.handle}`,
      );

      return folders;
    } catch (error) {
      this.logger.error(
        `Failed to get IMAP folders for account ${connectedAccount.handle}:`,
        error,
      );

      await this.imapHandleErrorService.handleError(
        error,
        'workspaceId',
        'messageChannelId',
      );

      // Return default folders as fallback
      return [
        { name: MessageFolderName.INBOX },
        { name: MessageFolderName.SENT_ITEMS },
      ];
    } finally {
      if (client) {
        await this.imapClientProvider.closeClient(client);
      }
    }
  }
}
