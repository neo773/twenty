import { Injectable, Logger } from '@nestjs/common';

import { type FolderInfo } from 'src/engine/core-modules/auth/services/create-message-folder.service';
import { type ConnectedAccountWorkspaceEntity } from 'src/modules/connected-account/standard-objects/connected-account.workspace-entity';
import { MicrosoftClientProvider } from 'src/modules/messaging/message-import-manager/drivers/microsoft/providers/microsoft-client.provider';
import { MicrosoftHandleErrorService } from 'src/modules/messaging/message-import-manager/drivers/microsoft/services/microsoft-handle-error.service';
import { MessageFolderName } from 'src/modules/messaging/message-import-manager/drivers/microsoft/types/folders';

type MicrosoftGraphFolder = {
  id: string;
  displayName: string;
};

@Injectable()
export class MicrosoftGetAllFoldersService {
  private readonly logger = new Logger(MicrosoftGetAllFoldersService.name);

  constructor(
    private readonly microsoftClientProvider: MicrosoftClientProvider,
    private readonly microsoftHandleErrorService: MicrosoftHandleErrorService,
  ) {}

  async getAllFolders(
    connectedAccount: Pick<
      ConnectedAccountWorkspaceEntity,
      'refreshToken' | 'id' | 'handle'
    >,
  ): Promise<FolderInfo[]> {
    try {
      const microsoftClient =
        await this.microsoftClientProvider.getMicrosoftClient(connectedAccount);

      const response = await microsoftClient
        .api('/me/mailFolders')
        .get()
        .catch((error) => {
          this.logger.error(
            `Connected account ${connectedAccount.id}: Error fetching folders: ${error.message}`,
          );

          return { value: [] };
        });

      console.dir(response, { depth: null });
      const folders = (response.value as MicrosoftGraphFolder[]) || [];
      const folderInfos: FolderInfo[] = [];

      for (const folder of folders) {
        if (!folder.displayName) {
          continue;
        }

        if (this.shouldExcludeFolder(folder.displayName)) {
          continue;
        }

        folderInfos.push({
          name: folder.displayName,
          isSynced: folder.displayName === MessageFolderName.INBOX,
          isSentFolder: false,
        });
      }

      this.logger.log(
        `Found ${folderInfos.length} folders for Microsoft account ${connectedAccount.handle}`,
      );

      return folderInfos;
    } catch (error) {
      this.logger.error(
        `Failed to get Microsoft folders for account ${connectedAccount.handle}:`,
        error,
      );

      throw error;
    }
  }

  private shouldExcludeFolder(displayName: string): boolean {
    const lowerName = displayName.toLowerCase();
    const excludedFolders = ['drafts', 'junk email', 'deleted items', 'trash'];

    return excludedFolders.some((excluded) => lowerName.includes(excluded));
  }
}
