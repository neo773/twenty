import { Module } from '@nestjs/common';

import { MessagingFolderSyncCronCommand } from 'src/modules/messaging/folder-sync-manager/crons/commands/messaging-folder-sync.cron.command';
import { MessagingFolderSyncCronJob } from 'src/modules/messaging/folder-sync-manager/crons/jobs/messaging-folder-sync.cron.job';
import { MessagingFolderSyncJob } from 'src/modules/messaging/folder-sync-manager/jobs/messaging-folder-sync.job';
import { SyncMessageFoldersService } from 'src/modules/messaging/folder-sync-manager/services/sync-message-folders.service';
import { GmailGetAllFoldersService } from 'src/modules/messaging/message-import-manager/drivers/gmail/services/gmail-get-all-folders.service';
import { ImapGetAllFoldersService } from 'src/modules/messaging/message-import-manager/drivers/imap/services/imap-get-all-folders.service';
import { MicrosoftGetAllFoldersService } from 'src/modules/messaging/message-import-manager/drivers/microsoft/services/microsoft-get-all-folders.service';

@Module({
  imports: [],
  providers: [
    SyncMessageFoldersService,
    MessagingFolderSyncJob,
    MessagingFolderSyncCronJob,
    MessagingFolderSyncCronCommand,
    GmailGetAllFoldersService,
    MicrosoftGetAllFoldersService,
    ImapGetAllFoldersService,
  ],
  exports: [SyncMessageFoldersService],
})
export class MessagingFolderSyncManagerModule {}
