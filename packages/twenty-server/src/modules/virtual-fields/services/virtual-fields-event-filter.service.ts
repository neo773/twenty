import { Injectable, Logger } from '@nestjs/common';

import { type ObjectRecordNonDestructiveEvent } from 'src/engine/core-modules/event-emitter/types/object-record-non-destructive-event';
import { VirtualFieldsDependencyManager } from 'src/modules/virtual-fields/services/virtual-fields-dependency-manager.service';
import { type VirtualFieldDependencyMap } from 'src/modules/virtual-fields/services/virtual-fields-dependency-map.service';

@Injectable()
export class VirtualFieldsEventFilterService {
  private readonly logger = new Logger(VirtualFieldsEventFilterService.name);

  constructor(
    private readonly dependencyManager: VirtualFieldsDependencyManager,
  ) {}

  filterEventsWithAffectedVirtualFields(
    events: ObjectRecordNonDestructiveEvent[],
    dependencyMap: VirtualFieldDependencyMap,
  ): ObjectRecordNonDestructiveEvent[] {
    return events.filter((event) => {
      const affectedFields = this.dependencyManager.getAffectedVirtualFields(
        event.objectMetadata.nameSingular,
        dependencyMap,
      );

      return affectedFields.length > 0;
    });
  }

  getAffectedVirtualFieldsForEvent(
    event: ObjectRecordNonDestructiveEvent,
    dependencyMap: VirtualFieldDependencyMap,
  ): string[] {
    return this.dependencyManager.getAffectedVirtualFields(
      event.objectMetadata.nameSingular,
      dependencyMap,
    );
  }
}