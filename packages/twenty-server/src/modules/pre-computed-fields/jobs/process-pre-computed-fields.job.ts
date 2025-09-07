import { type ObjectRecordNonDestructiveEvent } from 'src/engine/core-modules/event-emitter/types/object-record-non-destructive-event';
import { Process } from 'src/engine/core-modules/message-queue/decorators/process.decorator';
import { Processor } from 'src/engine/core-modules/message-queue/decorators/processor.decorator';
import { MessageQueue } from 'src/engine/core-modules/message-queue/message-queue.constants';
import { TwentyORMGlobalManager } from 'src/engine/twenty-orm/twenty-orm-global.manager';
import { WorkspaceEventBatch } from 'src/engine/workspace-event-emitter/types/workspace-event.type';
import { PreComputedFieldsService } from 'src/modules/pre-computed-fields/services/pre-computed-fields.service';

@Processor(MessageQueue.entityEventsToDbQueue)
export class ProcessPreComputedFieldsJob {
  constructor(
    private readonly preComputedFieldsService: PreComputedFieldsService,
    private readonly twentyORMGlobalManager: TwentyORMGlobalManager,
  ) {}

  @Process(ProcessPreComputedFieldsJob.name)
  async handle(
    workspaceEventBatch: WorkspaceEventBatch<ObjectRecordNonDestructiveEvent>,
  ): Promise<void> {
    await this.preComputedFieldsService.processEventsForComputedFields({
      events: workspaceEventBatch.events,
      workspaceId: workspaceEventBatch.workspaceId,
    });
  }
}
