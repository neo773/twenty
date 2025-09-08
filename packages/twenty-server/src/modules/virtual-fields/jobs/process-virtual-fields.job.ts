import { type ObjectRecordNonDestructiveEvent } from 'src/engine/core-modules/event-emitter/types/object-record-non-destructive-event';
import { Process } from 'src/engine/core-modules/message-queue/decorators/process.decorator';
import { Processor } from 'src/engine/core-modules/message-queue/decorators/processor.decorator';
import { MessageQueue } from 'src/engine/core-modules/message-queue/message-queue.constants';
import { WorkspaceEventBatch } from 'src/engine/workspace-event-emitter/types/workspace-event.type';
import { VirtualFieldsService } from 'src/modules/virtual-fields/services/virtual-fields.service';

@Processor(MessageQueue.entityEventsToDbQueue)
export class ProcessPreComputedFieldsJob {
  constructor(private readonly virtualFieldsService: VirtualFieldsService) {}

  @Process(ProcessPreComputedFieldsJob.name)
  async handle(
    workspaceEventBatch: WorkspaceEventBatch<ObjectRecordNonDestructiveEvent>,
  ): Promise<void> {
    await this.virtualFieldsService.processEventsForComputedFields({
      events: workspaceEventBatch.events,
      workspaceId: workspaceEventBatch.workspaceId,
    });
  }
}
