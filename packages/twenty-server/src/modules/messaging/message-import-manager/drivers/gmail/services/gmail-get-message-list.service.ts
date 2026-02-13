import { Injectable, Logger } from '@nestjs/common';

import { batchFetchImplementation } from '@jrmdayn/googleapis-batcher';
import { isNonEmptyString } from '@sniptt/guards';
import { type gmail_v1, google } from 'googleapis';

import { OAuth2ClientManagerService } from 'src/modules/connected-account/oauth2-client-manager/services/oauth2-client-manager.service';
import { type ConnectedAccountWorkspaceEntity } from 'src/modules/connected-account/standard-objects/connected-account.workspace-entity';
import {
  MessageChannelWorkspaceEntity,
  MessageFolderImportPolicy,
} from 'src/modules/messaging/common/standard-objects/message-channel.workspace-entity';
import { type MessageFolderWorkspaceEntity } from 'src/modules/messaging/common/standard-objects/message-folder.workspace-entity';
import {
  MessageImportDriverException,
  MessageImportDriverExceptionCode,
} from 'src/modules/messaging/message-import-manager/drivers/exceptions/message-import-driver.exception';
import { MESSAGING_GMAIL_USERS_MESSAGES_LIST_MAX_RESULT } from 'src/modules/messaging/message-import-manager/drivers/gmail/constants/messaging-gmail-users-messages-list-max-result.constant';
import { GmailGetHistoryService } from 'src/modules/messaging/message-import-manager/drivers/gmail/services/gmail-get-history.service';
import { GmailMessageListFetchErrorHandler } from 'src/modules/messaging/message-import-manager/drivers/gmail/services/gmail-message-list-fetch-error-handler.service';
import { computeGmailExcludeSearchFilter } from 'src/modules/messaging/message-import-manager/drivers/gmail/utils/compute-gmail-exclude-search-filter.util';
import { type GetMessageListsArgs } from 'src/modules/messaging/message-import-manager/types/get-message-lists-args.type';
import { type GetMessageListsResponse } from 'src/modules/messaging/message-import-manager/types/get-message-lists-response.type';

@Injectable()
export class GmailGetMessageListService {
  private readonly logger = new Logger(GmailGetMessageListService.name);
  private readonly gmailBatchRequestMaxSize = 50;
  constructor(
    private readonly gmailGetHistoryService: GmailGetHistoryService,
    private readonly oAuth2ClientManagerService: OAuth2ClientManagerService,
    private readonly gmailMessageListFetchErrorHandler: GmailMessageListFetchErrorHandler,
  ) {}

  private getSyncedFolderExternalIds(
    messageFolders: Pick<
      MessageFolderWorkspaceEntity,
      'name' | 'externalId' | 'isSynced' | 'parentFolderId'
    >[],
  ): string[] {
    return messageFolders
      .filter(
        (folder) => folder.isSynced && isNonEmptyString(folder.externalId),
      )
      .map((folder) => folder.externalId);
  }

  private async getMessagesWithMetadata(
    gmailClient: gmail_v1.Gmail,
    messageIds: string[],
  ): Promise<gmail_v1.Schema$Message[]> {
    const metadataPromises = messageIds.map((messageId) =>
      gmailClient.users.messages
        .get({
          userId: 'me',
          id: messageId,
          format: 'metadata',
          metadataHeaders: [],
        })
        .then((response) => response.data)
        .catch((error) => {
          this.gmailMessageListFetchErrorHandler.handleError(error);

          return null;
        }),
    );

    const metadata = await Promise.all(metadataPromises);

    return metadata.filter(
      (message): message is gmail_v1.Schema$Message => !!message,
    );
  }

  private getLabelChangedMessageIds(
    history: gmail_v1.Schema$History[],
    syncedFolderExternalIds: string[],
  ): { messageIdsAddedByLabel: string[]; messageIdsRemovedByLabel: string[] } {
    const messageIdsAddedByLabel = new Set<string>();
    const messageIdsRemovedByLabel = new Set<string>();

    for (const historyItem of history) {
      const labelsAdded = historyItem.labelsAdded ?? [];
      const labelsRemoved = historyItem.labelsRemoved ?? [];

      for (const labelAdded of labelsAdded) {
        const labelIds = labelAdded.labelIds ?? [];
        const messageId = labelAdded.message?.id;

        if (
          messageId &&
          labelIds.some((labelId) => syncedFolderExternalIds.includes(labelId))
        ) {
          messageIdsAddedByLabel.add(messageId);
        }
      }

      for (const labelRemoved of labelsRemoved) {
        const labelIds = labelRemoved.labelIds ?? [];
        const messageId = labelRemoved.message?.id;

        if (
          messageId &&
          labelIds.some((labelId) => syncedFolderExternalIds.includes(labelId))
        ) {
          messageIdsRemovedByLabel.add(messageId);
        }
      }
    }

    return {
      messageIdsAddedByLabel: Array.from(messageIdsAddedByLabel),
      messageIdsRemovedByLabel: Array.from(messageIdsRemovedByLabel),
    };
  }

  private async getReplyMessageIdsFromSyncedThreads(
    gmailClient: gmail_v1.Gmail,
    messagesAddedByHistory: string[],
    syncedFolderExternalIds: string[],
  ): Promise<string[]> {
    if (
      messagesAddedByHistory.length === 0 ||
      syncedFolderExternalIds.length === 0
    ) {
      return [];
    }

    const messagesMetadata = await this.getMessagesWithMetadata(
      gmailClient,
      messagesAddedByHistory,
    );

    const threadIds = Array.from(
      new Set(
        messagesMetadata
          .map((message) => message.threadId)
          .filter(isNonEmptyString),
      ),
    );

    const threadPromises = threadIds.map((threadId) =>
      gmailClient.users.threads
        .get({
          userId: 'me',
          id: threadId,
          format: 'metadata',
          metadataHeaders: [],
        })
        .then((response) => response.data)
        .catch((error) => {
          this.gmailMessageListFetchErrorHandler.handleError(error);

          return null;
        }),
    );

    const threads = (await Promise.all(threadPromises)).filter(
      (thread): thread is gmail_v1.Schema$Thread => !!thread,
    );

    const syncedThreadIds = new Set(
      threads
        .filter((thread) =>
          (thread.messages ?? []).some((threadMessage) =>
            (threadMessage.labelIds ?? []).some((labelId) =>
              syncedFolderExternalIds.includes(labelId),
            ),
          ),
        )
        .map((thread) => thread.id)
        .filter(isNonEmptyString),
    );

    return messagesMetadata
      .filter((message) => {
        const messageLabelIds = message.labelIds ?? [];

        const isInSyncedFolder = messageLabelIds.some((labelId) =>
          syncedFolderExternalIds.includes(labelId),
        );

        return isInSyncedFolder || syncedThreadIds.has(message.threadId ?? '');
      })
      .map((message) => message.id)
      .filter(isNonEmptyString);
  }

  private async getMessageListWithoutCursor(
    connectedAccount: Pick<
      ConnectedAccountWorkspaceEntity,
      'provider' | 'accessToken' | 'refreshToken' | 'id' | 'handle'
    >,
    messageFolders: Pick<
      MessageFolderWorkspaceEntity,
      'name' | 'externalId' | 'isSynced' | 'parentFolderId'
    >[],
    messageChannel: Pick<
      MessageChannelWorkspaceEntity,
      'messageFolderImportPolicy'
    >,
  ): Promise<GetMessageListsResponse> {
    const oAuth2Client =
      await this.oAuth2ClientManagerService.getGoogleOAuth2Client(
        connectedAccount,
      );
    const batchedFetchImplementation = batchFetchImplementation({
      maxBatchSize: this.gmailBatchRequestMaxSize,
    });

    const gmailClient = google.gmail({
      version: 'v1',
      auth: oAuth2Client,
      fetchImplementation: batchedFetchImplementation,
    });

    let pageToken: string | undefined;
    let hasMoreMessages = true;

    const messageExternalIds: string[] = [];

    const excludedSearchFilter = computeGmailExcludeSearchFilter(
      messageFolders,
      messageChannel.messageFolderImportPolicy,
    );

    while (hasMoreMessages) {
      const messageList = await gmailClient.users.messages
        .list({
          userId: 'me',
          maxResults: MESSAGING_GMAIL_USERS_MESSAGES_LIST_MAX_RESULT,
          pageToken,
          q: excludedSearchFilter,
        })
        .catch((error) => {
          this.logger.error(
            `Connected account ${connectedAccount.id}: Error fetching message list: ${error.message}`,
          );
          this.logger.error(
            `Connected account ${connectedAccount.id}: Error fetching message list: ${JSON.stringify(error)}`,
          );

          this.gmailMessageListFetchErrorHandler.handleError(error);

          return {
            data: {
              messages: [],
              nextPageToken: undefined,
            },
          };
        });

      const { messages } = messageList.data;
      const hasMessages = messages && messages.length > 0;

      if (!hasMessages) {
        break;
      }

      pageToken = messageList.data.nextPageToken ?? undefined;
      hasMoreMessages = !!pageToken;

      // @ts-expect-error legacy noImplicitAny
      messageExternalIds.push(...messages.map((message) => message.id));
    }

    if (messageExternalIds.length === 0) {
      return [
        {
          messageExternalIds,
          nextSyncCursor: '',
          previousSyncCursor: '',
          messageExternalIdsToDelete: [],
          folderId: undefined,
        },
      ];
    }

    const firstMessageExternalId = messageExternalIds[0];
    const firstMessageContent = await gmailClient.users.messages
      .get({
        userId: 'me',
        id: firstMessageExternalId,
      })
      .catch((error) => {
        this.gmailMessageListFetchErrorHandler.handleError(error);
      });

    const nextSyncCursor = firstMessageContent?.data?.historyId;

    if (!nextSyncCursor) {
      throw new MessageImportDriverException(
        `No historyId found for message ${firstMessageExternalId} for connected account ${connectedAccount.id}`,
        MessageImportDriverExceptionCode.NO_NEXT_SYNC_CURSOR,
      );
    }

    return [
      {
        messageExternalIds,
        nextSyncCursor,
        previousSyncCursor: '',
        messageExternalIdsToDelete: [],
        folderId: undefined,
      },
    ];
  }

  public async getMessageLists({
    messageChannel,
    connectedAccount,
    messageFolders,
  }: GetMessageListsArgs): Promise<GetMessageListsResponse> {
    if (
      messageChannel.messageFolderImportPolicy ===
      MessageFolderImportPolicy.SELECTED_FOLDERS
    ) {
      const foldersToSync = messageFolders.filter((folder) => folder.isSynced);

      if (foldersToSync.length === 0) {
        this.logger.warn(
          `Connected account ${connectedAccount.id} Message Channel: ${messageChannel.id}: No folders to process`,
        );

        return [];
      }
    }

    const oAuth2Client =
      await this.oAuth2ClientManagerService.getGoogleOAuth2Client(
        connectedAccount,
      );
    const batchedFetchImplementation = batchFetchImplementation({
      maxBatchSize: this.gmailBatchRequestMaxSize,
    });

    const gmailClient = google.gmail({
      version: 'v1',
      auth: oAuth2Client,
      fetchImplementation: batchedFetchImplementation,
    });

    if (!isNonEmptyString(messageChannel.syncCursor)) {
      return this.getMessageListWithoutCursor(
        connectedAccount,
        messageFolders,
        messageChannel,
      );
    }

    const { history, historyId: nextSyncCursor } =
      await this.gmailGetHistoryService.getHistory(
        gmailClient,
        messageChannel.syncCursor,
        ['messageAdded', 'messageDeleted', 'labelAdded', 'labelRemoved'],
      );

    const {
      messagesAdded: historyMessagesAdded,
      messagesDeleted: historyMessagesDeleted,
    } = await this.gmailGetHistoryService.getMessageIdsFromHistory(history);

    const syncedFolderExternalIds =
      this.getSyncedFolderExternalIds(messageFolders);

    const { messageIdsAddedByLabel, messageIdsRemovedByLabel } =
      this.getLabelChangedMessageIds(history, syncedFolderExternalIds);

    const replyMessageIds =
      messageChannel.messageFolderImportPolicy ===
      MessageFolderImportPolicy.SELECTED_FOLDERS
        ? await this.getReplyMessageIdsFromSyncedThreads(
            gmailClient,
            historyMessagesAdded,
            syncedFolderExternalIds,
          )
        : [];

    const messagesAdded = Array.from(
      new Set([
        ...historyMessagesAdded,
        ...messageIdsAddedByLabel,
        ...replyMessageIds,
      ]),
    );

    const messagesDeleted = Array.from(
      new Set([...historyMessagesDeleted, ...messageIdsRemovedByLabel]),
    ).filter((messageId) => !messagesAdded.includes(messageId));

    if (!nextSyncCursor) {
      throw new MessageImportDriverException(
        `No nextSyncCursor found for connected account ${connectedAccount.id}`,
        MessageImportDriverExceptionCode.NO_NEXT_SYNC_CURSOR,
      );
    }

    return [
      {
        messageExternalIds: messagesAdded,
        messageExternalIdsToDelete: messagesDeleted,
        previousSyncCursor: messageChannel.syncCursor,
        nextSyncCursor,
        folderId: undefined,
      },
    ];
  }
}
