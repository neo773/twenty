import { Injectable, Logger } from '@nestjs/common';

import { type ConnectedAccountWorkspaceEntity } from 'src/modules/connected-account/standard-objects/connected-account.workspace-entity';
import { MessageFolderWorkspaceEntity } from 'src/modules/messaging/common/standard-objects/message-folder.workspace-entity';
import { MicrosoftClientProvider } from 'src/modules/messaging/message-import-manager/drivers/microsoft/providers/microsoft-client.provider';
import { MicrosoftHandleErrorService } from 'src/modules/messaging/message-import-manager/drivers/microsoft/services/microsoft-handle-error.service';
import { MessageFolderName } from 'src/modules/messaging/message-import-manager/drivers/microsoft/types/folders';

type MicrosoftGraphFolder = {
  id: string;
  displayName: string;
};

type MessageFolder = Pick<
  MessageFolderWorkspaceEntity,
  'name' | 'isSynced' | 'isSentFolder' | 'externalId'
>;

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
  ): Promise<MessageFolder[]> {
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
      const folderInfos: MessageFolder[] = [];

      for (const folder of folders) {
        if (!folder.displayName) {
          continue;
        }

        if (this.shouldExcludeFolder(folder.displayName)) {
          continue;
        }

        folderInfos.push({
          externalId: folder.id,
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
