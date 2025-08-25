import { Injectable, Logger } from '@nestjs/common';

import { type FolderInfo } from 'src/engine/core-modules/auth/services/create-message-folder.service';
import { type ConnectedAccountWorkspaceEntity } from 'src/modules/connected-account/standard-objects/connected-account.workspace-entity';
import { MESSAGING_GMAIL_EXCLUDED_CATEGORIES } from 'src/modules/messaging/message-import-manager/drivers/gmail/constants/messaging-gmail-excluded-categories';
import { GmailClientProvider } from 'src/modules/messaging/message-import-manager/drivers/gmail/providers/gmail-client.provider';
import { GmailHandleErrorService } from 'src/modules/messaging/message-import-manager/drivers/gmail/services/gmail-handle-error.service';
import { computeGmailCategoryLabelId } from 'src/modules/messaging/message-import-manager/drivers/gmail/utils/compute-gmail-category-label-id.util';

type GmailFolderInfo = FolderInfo;

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
  ): Promise<GmailFolderInfo[]> {
    try {
      const gmailClient =
        await this.gmailClientProvider.getGmailClient(connectedAccount);

      const response = await gmailClient.users.labels.list({
        userId: 'me',
      });

      const labels = response.data.labels || [];

      // Build excluded label IDs using existing utilities
      const excludedCategoryLabelIds = new Set(
        MESSAGING_GMAIL_EXCLUDED_CATEGORIES.map((category) =>
          computeGmailCategoryLabelId(category),
        ),
      );

      // Add other system labels we want to exclude
      const additionalExcludedLabels = new Set([
        'CHAT',
        'SPAM',
        'TRASH',
        'IMPORTANT',
        'STARRED',
        'UNREAD',
        'DRAFT',
      ]);

      const folders: GmailFolderInfo[] = [];

      for (const label of labels) {
        if (!label.name || !label.id) {
          continue;
        }

        // Skip excluded category labels
        if (excludedCategoryLabelIds.has(label.id)) {
          continue;
        }

        // Skip other excluded system labels
        if (additionalExcludedLabels.has(label.id)) {
          continue;
        }

        // Map Gmail label names to standardized folder names
        let folderName = label.name;

        // Handle system labels with standard mapping
        if (label.id === 'INBOX') {
          folderName = 'INBOX';
        } else if (label.id === 'SENT') {
          folderName = 'SENT_ITEMS';
        } else if (label.type === 'system') {
          // For other system labels, use the label ID as folder name
          folderName = label.id;
        }

        folders.push({
          name: folderName,
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

      // await this.gmailHandleErrorService.handleGoogleAPIError(
      //   error,
      //   'gmail',
      //   connectedAccount,
      // );

      // Return default folders as fallback
      return [{ name: 'INBOX' }, { name: 'SENT_ITEMS' }];
    }
  }
}
