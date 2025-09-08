import { Injectable, Logger } from '@nestjs/common';

import { type ObjectRecordNonDestructiveEvent } from 'src/engine/core-modules/event-emitter/types/object-record-non-destructive-event';
import { type ObjectMetadataMaps } from 'src/engine/metadata-modules/types/object-metadata-maps';
import { TwentyORMGlobalManager } from 'src/engine/twenty-orm/twenty-orm-global.manager';
import { WorkspaceCacheStorageService } from 'src/engine/workspace-cache-storage/workspace-cache-storage.service';
import { PrimitiveValue } from 'src/modules/computed-fields/types/PrimitiveValue';
import { type VirtualField } from 'src/modules/computed-fields/types/VirtualField';
import { VirtualFieldsBatchUpdateService } from 'src/modules/virtual-fields/services/virtual-fields-batch-update.service';
import { VirtualFieldsComputationService } from 'src/modules/virtual-fields/services/virtual-fields-computation.service';
import { VirtualFieldsDependencyManager } from 'src/modules/virtual-fields/services/virtual-fields-dependency-manager.service';
import { VirtualFieldDependencyMap } from 'src/modules/virtual-fields/services/virtual-fields-dependency-map.service';
import { VirtualFieldsEntityResolutionService } from 'src/modules/virtual-fields/services/virtual-fields-entity-resolution.service';
import { VirtualFieldsEventFilterService } from 'src/modules/virtual-fields/services/virtual-fields-event-filter.service';
import { VirtualFieldsFieldDiscoveryService } from 'src/modules/virtual-fields/services/virtual-fields-field-discovery.service';

export type ProcessEventsParams = {
  events: ObjectRecordNonDestructiveEvent[];
  workspaceId: string;
};

type VirtualFieldMetadata = {
  fieldName: string;
  virtualField: VirtualField;
  objectMetadataId: string;
};

type BatchUpdateOperation = {
  entityId: string;
  fieldName: string;
  value: PrimitiveValue;
};

@Injectable()
export class VirtualFieldsService {
  private readonly logger = new Logger(VirtualFieldsService.name);

  constructor(
    private readonly twentyORMGlobalManager: TwentyORMGlobalManager,
    private readonly workspaceCacheStorageService: WorkspaceCacheStorageService,
    private readonly virtualFieldDiscoveryService: VirtualFieldsFieldDiscoveryService,
    private readonly dependencyManager: VirtualFieldsDependencyManager,
    private readonly bulkUpdateService: VirtualFieldsBatchUpdateService,
    private readonly eventFilterService: VirtualFieldsEventFilterService,
    private readonly entityResolutionService: VirtualFieldsEntityResolutionService,
    private readonly computationService: VirtualFieldsComputationService,
  ) {}

  async processEventsForComputedFields(
    params: ProcessEventsParams,
  ): Promise<void> {
    const { events, workspaceId } = params;

    this.logger.debug('Processing events for computed fields - entry point', {
      workspaceId,
      eventCount: events.length,
    });

    if (events.length === 0) {
      return;
    }

    const objectMetadataMaps =
      await this.workspaceCacheStorageService.getObjectMetadataMapsOrThrow(
        workspaceId,
      );

    this.logger.log('Retrieved object metadata maps', {
      workspaceId,
      objectCount: Object.keys(objectMetadataMaps.byId).length,
    });

    const dependencyMap = await this.dependencyManager.getDependencyMap(
      workspaceId,
      objectMetadataMaps,
    );

    this.logger.log('Retrieved dependency map', {
      workspaceId,
      dependencyCount: Object.keys(dependencyMap).length,
    });

    const eventsWithAffectedVirtualFields =
      this.eventFilterService.filterEventsWithAffectedVirtualFields(
        events,
        dependencyMap,
      );

    if (eventsWithAffectedVirtualFields.length === 0) {
      this.logger.debug('No events affect virtual fields', {
        workspaceId,
        totalEvents: events.length,
      });

      return;
    }

    this.logger.log('Processing events for computed fields', {
      workspaceId,
      totalEvents: events.length,
      eventsWithAffectedVirtualFields: eventsWithAffectedVirtualFields.length,
    });

    await this.processBatchWithDependencyFiltering(
      eventsWithAffectedVirtualFields,
      dependencyMap,
      objectMetadataMaps,
      workspaceId,
    );
  }

  private async processBatchWithDependencyFiltering(
    events: ObjectRecordNonDestructiveEvent[],
    dependencyMap: VirtualFieldDependencyMap,
    objectMetadataMaps: ObjectMetadataMaps,
    workspaceId: string,
  ): Promise<void> {
    const eventsByObjectId = new Map<
      string,
      ObjectRecordNonDestructiveEvent[]
    >();

    for (const event of events) {
      const objectId = event.objectMetadata.id;

      if (!eventsByObjectId.has(objectId)) {
        eventsByObjectId.set(objectId, []);
      }
      eventsByObjectId.get(objectId)!.push(event);
    }

    for (const [objectId, objectEvents] of eventsByObjectId.entries()) {
      try {
        await this.processEventsForObjectTypeWithDependencies(
          objectEvents,
          objectId,
          dependencyMap,
          objectMetadataMaps,
          workspaceId,
        );
      } catch (error) {
        this.logger.error('Error processing events for object type', {
          objectId,
          eventCount: objectEvents.length,
          error,
        });
      }
    }
  }

  private async processEventsForObjectTypeWithDependencies(
    events: ObjectRecordNonDestructiveEvent[],
    objectMetadataId: string,
    dependencyMap: VirtualFieldDependencyMap,
    objectMetadataMaps: ObjectMetadataMaps,
    workspaceId: string,
  ): Promise<void> {
    const eventObjectName = events[0]?.objectMetadata.nameSingular;

    if (!eventObjectName) {
      return;
    }

    const affectedVirtualFields =
      this.eventFilterService.getAffectedVirtualFieldsForEvent(
        events[0],
        dependencyMap,
      );

    if (affectedVirtualFields.length === 0) {
      this.logger.debug('No virtual fields affected by object changes', {
        objectMetadataId,
        eventObjectName,
      });

      return;
    }

    const fieldsToProcessByObject =
      await this.entityResolutionService.groupAffectedFieldsByTargetObject(
        affectedVirtualFields,
        workspaceId,
        objectMetadataMaps,
      );

    for (const [
      targetObjectId,
      virtualFields,
    ] of fieldsToProcessByObject.entries()) {
      try {
        await this.bulkProcessVirtualFields(
          events,
          virtualFields,
          objectMetadataMaps,
          workspaceId,
        );
      } catch (error) {
        this.logger.error('Error processing virtual fields for target object', {
          targetObjectId,
          fieldCount: virtualFields.length,
          error,
        });
      }
    }
  }

  private async bulkProcessVirtualFields(
    events: ObjectRecordNonDestructiveEvent[],
    virtualFields: VirtualFieldMetadata[],
    objectMetadataMaps: ObjectMetadataMaps,
    workspaceId: string,
  ): Promise<void> {
    const entityName =
      this.virtualFieldDiscoveryService.getEntityNameFromTarget(
        virtualFields[0].objectMetadataId,
      );

    const repository =
      await this.twentyORMGlobalManager.getRepositoryForWorkspace(
        workspaceId,
        entityName,
        { shouldBypassPermissionChecks: true },
      );

    const batchUpdateOperations: BatchUpdateOperation[] = [];

    for (const event of events) {
      try {
        const affectedEntityIds =
          await this.entityResolutionService.getAffectedEntityIds(
            event,
            virtualFields,
            objectMetadataMaps,
          );

        for (const entityId of affectedEntityIds) {
          for (const field of virtualFields) {
            try {
              const computedResult =
                await this.computationService.computeFieldValue({
                  virtualField: field.virtualField,
                  entityId,
                  workspaceId,
                  objectMetadataMaps,
                });

              const valueToStore =
                this.computationService.extractStorableValue(computedResult);

              batchUpdateOperations.push({
                entityId,
                fieldName: field.fieldName,
                value: valueToStore,
              });
            } catch (error) {
              this.logger.error('Error computing field value', {
                entityId,
                fieldName: field.fieldName,
                error,
              });
            }
          }
        }
      } catch (error) {
        this.logger.error('Error processing event for bulk updates', {
          eventId: event.recordId,
          objectType: event.objectMetadata.nameSingular,
          error,
        });
      }
    }

    if (batchUpdateOperations.length > 0) {
      await this.bulkUpdateService.executeBatchUpdates(
        repository,
        batchUpdateOperations,
      );
    }
  }
}