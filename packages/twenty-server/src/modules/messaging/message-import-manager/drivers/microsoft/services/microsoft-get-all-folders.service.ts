import { Injectable, Logger } from '@nestjs/common';

import { type FolderInfo } from 'src/engine/core-modules/auth/services/create-message-folder.service';
import { type ConnectedAccountWorkspaceEntity } from 'src/modules/connected-account/standard-objects/connected-account.workspace-entity';
import { MicrosoftClientProvider } from 'src/modules/messaging/message-import-manager/drivers/microsoft/providers/microsoft-client.provider';
import { MicrosoftHandleErrorService } from 'src/modules/messaging/message-import-manager/drivers/microsoft/services/microsoft-handle-error.service';
import { MessageFolderName } from 'src/modules/messaging/message-import-manager/drivers/microsoft/types/folders';

type MicrosoftFolderInfo = FolderInfo;

type MicrosoftGraphFolder = {
  id: string;
  displayName: string;
  wellKnownName?: string;
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
  ): Promise<MicrosoftFolderInfo[]> {
    try {
      const microsoftClient =
        await this.microsoftClientProvider.getMicrosoftClient(connectedAccount);

      const response = await microsoftClient
        .api('/me/mailFolders')
        .select('id,displayName,wellKnownName')
        .get();

      const folders = (response.value as MicrosoftGraphFolder[]) || [];

      const folderInfos: MicrosoftFolderInfo[] = [];

      for (const folder of folders) {
        if (!folder.displayName) {
          continue;
        }

        // Map Microsoft folder display names to standardized folder names
        let folderName = folder.displayName;

        // Handle well-known folders with standard mapping
        if (folder.wellKnownName) {
          switch (folder.wellKnownName.toLowerCase()) {
            case 'inbox':
              folderName = MessageFolderName.INBOX;
              break;
            case 'sentitems':
              folderName = MessageFolderName.SENT_ITEMS;
              break;
            case 'drafts':
            case 'junkemail':
            case 'deleteditems':
              // Skip these system folders
              continue;
            default:
              // Use the display name for other well-known folders
              folderName = folder.displayName;
          }
        }

        folderInfos.push({
          name: folderName,
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

      // await this.microsoftHandleErrorService.handleMicrosoftError(error);

      // Return default folders as fallback
      return [
        { name: MessageFolderName.INBOX },
        { name: MessageFolderName.SENT_ITEMS },
      ];
    }
  }
}
