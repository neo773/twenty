import { Logger } from '@nestjs/common';

import { msg } from '@lingui/core/macro';
import { assertIsDefinedOrThrow, isDefined } from 'twenty-shared/utils';

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
import { MessageChannelSyncStage } from 'src/modules/messaging/common/standard-objects/message-channel.workspace-entity';
import {
  MessageFolderPendingSyncAction,
  type MessageFolderWorkspaceEntity,
} from 'src/modules/messaging/common/standard-objects/message-folder.workspace-entity';

@WorkspaceQueryHook(`messageFolder.updateOne`)
export class MessageFolderUpdateOnePreQueryHook
  implements WorkspacePreQueryHookInstance
{
  private readonly logger = new Logger(MessageFolderUpdateOnePreQueryHook.name);

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

        const isSyncOngoing =
          messageFolder.messageChannel.syncStage ===
          MessageChannelSyncStage.MESSAGE_LIST_FETCH_ONGOING;

        if (
          isSyncOngoing &&
          messageFolder.pendingSyncAction !==
            MessageFolderPendingSyncAction.NONE
        ) {
          throw new WorkspaceQueryRunnerException(
            'Cannot update message folder while sync is ongoing with pending actions',
            WorkspaceQueryRunnerExceptionCode.INVALID_QUERY_INPUT,
            {
              userFriendlyMessage: msg`Cannot update message folder while sync is ongoing. Please wait for the sync to complete.`,
            },
          );
        }

        const hasCompletedConfiguration =
          messageFolder.messageChannel.syncStage !==
          MessageChannelSyncStage.PENDING_CONFIGURATION;

        if (!hasCompletedConfiguration) {
          return payload;
        }

        const isSyncedChanged =
          isDefined(payload.data.isSynced) &&
          payload.data.isSynced !== messageFolder.isSynced;

        const isSyncedEnabled = isSyncedChanged && payload.data.isSynced;

        if (isSyncedEnabled) {
          this.logger.log(
            `MessageFolderId: ${messageFolder.id} - Setting pending folder import action`,
          );

          payload.data.pendingSyncAction =
            MessageFolderPendingSyncAction.FOLDER_IMPORT;
        }

        return payload;
      },
      systemAuthContext,
    );
  }
}
