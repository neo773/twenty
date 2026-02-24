import { Logger } from '@nestjs/common';

import { msg } from '@lingui/core/macro';
import { assertIsDefinedOrThrow, isDefined } from 'twenty-shared/utils';
import { Not } from 'typeorm';

import { type WorkspacePreQueryHookInstance } from 'src/engine/api/graphql/workspace-query-runner/workspace-query-hook/interfaces/workspace-query-hook.interface';
import { type UpdateOneResolverArgs } from 'src/engine/api/graphql/workspace-resolver-builder/interfaces/workspace-resolvers-builder.interface';

import { WorkspaceQueryHook } from 'src/engine/api/graphql/workspace-query-runner/workspace-query-hook/decorators/workspace-query-hook.decorator';
import {
  WorkspaceQueryRunnerException,
  WorkspaceQueryRunnerExceptionCode,
} from 'src/engine/api/graphql/workspace-query-runner/workspace-query-runner.exception';
import { type AuthContext } from 'src/engine/core-modules/auth/types/auth-context.type';
import { WorkspaceNotFoundDefaultError } from 'src/engine/core-modules/workspace/workspace.exception';
import { GlobalWorkspaceOrmManager } from 'src/engine/twenty-orm/global-workspace-datasource/global-workspace-orm.manager';
import { buildSystemAuthContext } from 'src/engine/twenty-orm/utils/build-system-auth-context.util';
import {
  MessageChannelPendingGroupEmailsAction,
  MessageChannelSyncStage,
  type MessageChannelWorkspaceEntity,
} from 'src/modules/messaging/common/standard-objects/message-channel.workspace-entity';
import {
  MessageFolderPendingSyncAction,
  type MessageFolderWorkspaceEntity,
} from 'src/modules/messaging/common/standard-objects/message-folder.workspace-entity';

const ONGOING_SYNC_STAGES = [
  MessageChannelSyncStage.MESSAGE_LIST_FETCH_ONGOING,
];

@WorkspaceQueryHook(`messageFolder.updateOne`)
export class MessageFolderUpdateOnePreQueryHook
  implements WorkspacePreQueryHookInstance
{
  private readonly logger = new Logger(
    MessageFolderUpdateOnePreQueryHook.name,
  );

  constructor(
    private readonly globalWorkspaceOrmManager: GlobalWorkspaceOrmManager,
  ) {}

  async execute(
    authContext: AuthContext,
    _objectName: string,
    payload: UpdateOneResolverArgs<MessageFolderWorkspaceEntity>,
  ): Promise<UpdateOneResolverArgs<MessageFolderWorkspaceEntity>> {
    const workspace = authContext.workspace;

    assertIsDefinedOrThrow(workspace, WorkspaceNotFoundDefaultError);

    const systemAuthContext = buildSystemAuthContext(workspace.id);

    return this.globalWorkspaceOrmManager.executeInWorkspaceContext(
      async () => {
        const messageFolderRepository =
          await this.globalWorkspaceOrmManager.getRepository<MessageFolderWorkspaceEntity>(
            workspace.id,
            'messageFolder',
          );

        const messageFolder = await messageFolderRepository.findOne({
          where: { id: payload.id },
          relations: ['messageChannel'],
        });

        if (!isDefined(messageFolder)) {
          throw new WorkspaceQueryRunnerException(
            'Message folder not found',
            WorkspaceQueryRunnerExceptionCode.DATA_NOT_FOUND,
            {
              userFriendlyMessage: msg`Message folder not found`,
            },
          );
        }

        const messageChannel = messageFolder.messageChannel;

        const isSyncOngoing = ONGOING_SYNC_STAGES.includes(
          messageChannel.syncStage,
        );

        const messageFoldersWithPendingActionCount =
          await messageFolderRepository.count({
            where: {
              messageChannelId: messageChannel.id,
              pendingSyncAction: Not(MessageFolderPendingSyncAction.NONE),
            },
          });

        const hasPendingFolderActions =
          messageFoldersWithPendingActionCount > 0;

        const hasPendingGroupEmailsAction =
          messageChannel.pendingGroupEmailsAction !==
          MessageChannelPendingGroupEmailsAction.NONE;

        if (
          isSyncOngoing &&
          (hasPendingFolderActions || hasPendingGroupEmailsAction)
        ) {
          throw new WorkspaceQueryRunnerException(
            'Cannot update message folder while sync is ongoing with pending actions',
            WorkspaceQueryRunnerExceptionCode.INVALID_QUERY_INPUT,
            {
              userFriendlyMessage: msg`Cannot update message folder while sync is ongoing. Please wait for the sync to complete.`,
            },
          );
        }

        const isSyncedChangingToTrue =
          isDefined(payload.data.isSynced) &&
          payload.data.isSynced === true &&
          messageFolder.isSynced === false;

        if (isSyncedChangingToTrue) {
          await messageFolderRepository.update(
            { id: messageFolder.id },
            {
              pendingSyncAction:
                MessageFolderPendingSyncAction.FOLDER_IMPORT,
            },
          );

          this.logger.log(
            `MessageFolderId: ${messageFolder.id} - Marked folder as pending FOLDER_IMPORT`,
          );
        }

        return payload;
      },
      systemAuthContext,
    );
  }
}
