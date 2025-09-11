import { Injectable, Logger } from '@nestjs/common';

import { type ObjectRecordNonDestructiveEvent } from 'src/engine/core-modules/event-emitter/types/object-record-non-destructive-event';
import { VirtualFieldDependencyManager } from 'src/modules/virtual-fields/services/virtual-field-dependency-manager.service';

import { type VirtualFieldDependencyMap } from 'src/modules/virtual-fields/types/DependencyMap';

@Injectable()
export class VirtualFieldEventFilter {
  private readonly logger = new Logger(VirtualFieldEventFilter.name);

  constructor(
    private readonly dependencyManager: VirtualFieldDependencyManager,
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