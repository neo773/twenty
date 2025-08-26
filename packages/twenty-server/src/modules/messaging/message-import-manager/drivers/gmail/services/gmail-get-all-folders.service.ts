import { Injectable, Logger } from '@nestjs/common';

import { type FolderInfo } from 'src/engine/core-modules/auth/services/create-message-folder.service';
import { type ConnectedAccountWorkspaceEntity } from 'src/modules/connected-account/standard-objects/connected-account.workspace-entity';
import { MESSAGING_GMAIL_EXCLUDED_CATEGORIES } from 'src/modules/messaging/message-import-manager/drivers/gmail/constants/messaging-gmail-excluded-categories';
import { GmailClientProvider } from 'src/modules/messaging/message-import-manager/drivers/gmail/providers/gmail-client.provider';
import { GmailHandleErrorService } from 'src/modules/messaging/message-import-manager/drivers/gmail/services/gmail-handle-error.service';
import { computeGmailCategoryLabelId } from 'src/modules/messaging/message-import-manager/drivers/gmail/utils/compute-gmail-category-label-id.util';

@Injectable()
export class GmailGetAllFoldersService {
  private readonly logger = new Logger(GmailGetAllFoldersService.name);

  constructor(
    private readonly gmailClientProvider: GmailClientProvider,
    private readonly gmailHandleErrorService: GmailHandleErrorService,
  ) {}

  async getAllFolders(
    connectedAccount: Pick<
      ConnectedAccountWorkspaceEntity,
      'provider' | 'refreshToken' | 'id' | 'handle'
    >,
  ): Promise<FolderInfo[]> {
    try {
      const gmailClient =
        await this.gmailClientProvider.getGmailClient(connectedAccount);

      const response = await gmailClient.users.labels
        .list({ userId: 'me' })
        .catch((error) => {
          this.logger.error(
            `Connected account ${connectedAccount.id}: Error fetching labels: ${error.message}`,
          );

          this.gmailHandleErrorService.handleGmailMessageListFetchError(error);

          return { data: { labels: [] } };
        });

      const labels = response.data.labels || [];

      const excludedCategoryLabelIds = new Set(
        MESSAGING_GMAIL_EXCLUDED_CATEGORIES.map(computeGmailCategoryLabelId),
      );

      const folders: FolderInfo[] = [];

      for (const label of labels) {
        if (!label.name || !label.id) {
          continue;
        }

        if (excludedCategoryLabelIds.has(label.id)) {
          continue;
        }

        folders.push({
          name: label.name,
          isSynced: label.id === 'INBOX' || label.id === 'SENT',
          isSentFolder: label.id === 'SENT',
        });
      }

      this.logger.log(
        `Found ${folders.length} folders for Gmail account ${connectedAccount.handle}`,
      );

      return folders;
    } catch (error) {
      this.logger.error(
        `Failed to get Gmail folders for account ${connectedAccount.handle}:`,
        error,
      );

      throw error;
    }
  }
}
