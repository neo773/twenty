import { Injectable, Logger } from '@nestjs/common';

import { type ConnectedAccountWorkspaceEntity } from 'src/modules/connected-account/standard-objects/connected-account.workspace-entity';
import { ImapClientProvider } from 'src/modules/messaging/message-import-manager/drivers/imap/providers/imap-client.provider';
import {
  ImapMessageProcessorService,
  type MessageFetchResult,
} from 'src/modules/messaging/message-import-manager/drivers/imap/services/imap-message-processor.service';

type ConnectedAccount = Pick<
  ConnectedAccountWorkspaceEntity,
  'id' | 'provider' | 'handle' | 'handleAliases' | 'connectionParameters'
>;

type FetchAllResult = {
  uidsByBatch: number[][];
  batchResults: MessageFetchResult[][];
};

@Injectable()
export class ImapFetchByBatchService {
  private readonly logger = new Logger(ImapFetchByBatchService.name);

  constructor(
    private readonly imapClientProvider: ImapClientProvider,
    private readonly imapMessageProcessorService: ImapMessageProcessorService,
  ) {}

  async fetchAllByBatches(
    uids: number[],
    connectedAccount: ConnectedAccount,
    folder: string,
  ): Promise<FetchAllResult> {
    const operationStartTime = Date.now();
    const batchLimit = 20;
    const batchResults: MessageFetchResult[][] = [];
    const uidsByBatch: number[][] = [];
    let totalProcessedMessages = 0;
    let totalSuccessfulMessages = 0;
    let totalFailedMessages = 0;

    this.logger.log(
      `Starting optimized batch fetch for ${uids.length} messages from folder ${folder}`,
    );

    const clientStartTime = Date.now();
    const client = await this.imapClientProvider.getClient(connectedAccount);
    const clientConnectionTime = Date.now() - clientStartTime;

    this.logger.log(
      `IMAP client connection established in ${clientConnectionTime}ms`,
    );

    try {
      for (let i = 0; i < uids.length; i += batchLimit) {
        const batchStartTime = Date.now();
        const batchUids = uids.slice(i, i + batchLimit);
        const batchNumber = Math.floor(i / batchLimit) + 1;
        const totalBatches = Math.ceil(uids.length / batchLimit);

        uidsByBatch.push(batchUids);

        try {
          const batchResult =
            await this.imapMessageProcessorService.processMessagesByUidsInFolder(
              batchUids,
              folder,
              client,
            );

          batchResults.push(batchResult);

          const batchProcessingTime = Date.now() - batchStartTime;
          const successfulInBatch = batchResult.filter(
            (result) => result.parsed !== null,
          ).length;
          const failedInBatch = batchResult.length - successfulInBatch;

          totalProcessedMessages += batchResult.length;
          totalSuccessfulMessages += successfulInBatch;
          totalFailedMessages += failedInBatch;

          const avgProcessingTimePerMessage =
            batchResult.length > 0
              ? Math.round(batchProcessingTime / batchResult.length)
              : 0;

          this.logger.log(
            `Batch ${batchNumber}/${totalBatches} completed in ${batchProcessingTime}ms - ` +
              `Messages: ${batchUids.length}, Successful: ${successfulInBatch}, Failed: ${failedInBatch}, ` +
              `Avg per message: ${avgProcessingTimePerMessage}ms`,
          );
        } catch (error) {
          const batchProcessingTime = Date.now() - batchStartTime;

          this.logger.error(
            `Batch ${batchNumber}/${totalBatches} failed after ${batchProcessingTime}ms - ` +
              `Error: ${error.message}`,
          );

          const errorResults =
            this.imapMessageProcessorService.createErrorResults(
              batchUids,
              folder,
              error as Error,
            );

          batchResults.push(errorResults);
          totalProcessedMessages += batchUids.length;
          totalFailedMessages += batchUids.length;
        }
      }

      const totalOperationTime = Date.now() - operationStartTime;
      const avgTimePerMessage =
        totalProcessedMessages > 0
          ? Math.round(totalOperationTime / totalProcessedMessages)
          : 0;
      const successRate =
        totalProcessedMessages > 0
          ? Math.round((totalSuccessfulMessages / totalProcessedMessages) * 100)
          : 0;

      this.logger.log(
        `Batch fetch operation completed in ${totalOperationTime}ms - ` +
          `Total messages: ${totalProcessedMessages}, Success rate: ${successRate}%, ` +
          `Avg per message: ${avgTimePerMessage}ms, Connection time: ${clientConnectionTime}ms`,
      );

      return {
        uidsByBatch,
        batchResults,
      };
    } finally {
      if (client) {
        const closeStartTime = Date.now();

        await this.imapClientProvider.closeClient(client);
        const closeTime = Date.now() - closeStartTime;

        this.logger.log(`IMAP client closed in ${closeTime}ms`);
      }
    }
  }
}
