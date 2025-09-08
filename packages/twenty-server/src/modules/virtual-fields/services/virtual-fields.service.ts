import { Injectable, Logger } from '@nestjs/common';

import { type ObjectRecordNonDestructiveEvent } from 'src/engine/core-modules/event-emitter/types/object-record-non-destructive-event';
import { type ObjectMetadataMaps } from 'src/engine/metadata-modules/types/object-metadata-maps';
import { TwentyORMGlobalManager } from 'src/engine/twenty-orm/twenty-orm-global.manager';
import { PreComputedFieldDependencies } from 'src/engine/twenty-orm/types/pre-computed-field-dependencies.enum';
import { WorkspaceCacheStorageService } from 'src/engine/workspace-cache-storage/workspace-cache-storage.service';
import { type PrimitiveValue } from 'src/modules/computed-fields/types/PrimitiveValue';
import {
  type ConditionalField,
  type PathBasedField,
  type VirtualField,
} from 'src/modules/computed-fields/types/VirtualField';
import { VirtualFieldsBatchUpdateService } from 'src/modules/virtual-fields/services/virtual-fields-batch-update.service';
import { VirtualFieldsExpressionEvaluatorService } from 'src/modules/virtual-fields/services/virtual-fields-expression-evaluator.service';
import { VirtualFieldsFieldDiscoveryService } from 'src/modules/virtual-fields/services/virtual-fields-field-discovery.service';
import {
  VirtualFieldsPathEvaluatorService,
  type PathEvaluatorResult,
} from 'src/modules/virtual-fields/services/virtual-fields-path-evaluator.service';
import { resolveObjectId } from 'src/modules/virtual-fields/utils/resolve-object-id.util';

export type ProcessEventsParams = {
  events: ObjectRecordNonDestructiveEvent[];
  workspaceId: string;
};

type PreComputedFieldMetadata = {
  fieldName: string;
  virtualField: VirtualField;
  objectMetadataId: string;
};

type BulkUpdateOperation = {
  entityId: string;
  fieldName: string;
  value: PrimitiveValue;
};

type EntityRecord = Record<string, PrimitiveValue>;

type FieldComputationResult = PathEvaluatorResult;

@Injectable()
export class VirtualFieldsService {
  private readonly logger = new Logger(VirtualFieldsService.name);

  constructor(
    private readonly twentyORMGlobalManager: TwentyORMGlobalManager,
    private readonly workspaceCacheStorageService: WorkspaceCacheStorageService,
    private readonly virtualFieldDiscoveryService: VirtualFieldsFieldDiscoveryService,
    private readonly bulkUpdateService: VirtualFieldsBatchUpdateService,
    private readonly expressionEvaluatorService: VirtualFieldsExpressionEvaluatorService,
    private readonly pathEvaluatorService: VirtualFieldsPathEvaluatorService,
  ) {}

  async processEventsForComputedFields(
    params: ProcessEventsParams,
  ): Promise<void> {
    const { events, workspaceId } = params;

    if (events.length === 0) {
      return;
    }

    const eventsWithVirtualFields = this.filterEventsWithVirtualFields(events);

    if (eventsWithVirtualFields.length === 0) {
      this.logger.debug('No events with virtual fields to process', {
        workspaceId,
        totalEvents: events.length,
      });

      return;
    }

    this.logger.log('Processing events for computed fields', {
      workspaceId,
      totalEvents: events.length,
      eventsWithVirtualFields: eventsWithVirtualFields.length,
    });

    const objectMetadataMaps =
      await this.workspaceCacheStorageService.getObjectMetadataMapsOrThrow(
        workspaceId,
      );

    await this.processBatchWithExistingInfra(
      eventsWithVirtualFields,
      objectMetadataMaps,
      workspaceId,
    );
  }

  private filterEventsWithVirtualFields(
    events: ObjectRecordNonDestructiveEvent[],
  ): ObjectRecordNonDestructiveEvent[] {
    return events.filter((event) =>
      this.virtualFieldDiscoveryService.hasVirtualFields(
        event.objectMetadata.id,
      ),
    );
  }

  private async processBatchWithExistingInfra(
    events: ObjectRecordNonDestructiveEvent[],
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
        await this.processEventsForObjectType(
          objectEvents,
          objectId,
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

  private async processEventsForObjectType(
    events: ObjectRecordNonDestructiveEvent[],
    objectMetadataId: string,
    objectMetadataMaps: ObjectMetadataMaps,
    workspaceId: string,
  ): Promise<void> {
    const virtualFields =
      await this.virtualFieldDiscoveryService.getVirtualFieldsForObjectMetadata(
        objectMetadataId,
        workspaceId,
      );

    if (virtualFields.length === 0) {
      return;
    }

    const eventTypes = events.map(
      (event) =>
        event.objectMetadata.nameSingular as PreComputedFieldDependencies,
    );

    const fieldsToProcess = virtualFields.filter((field) =>
      this.virtualFieldDiscoveryService.fieldNeedsProcessing(field, eventTypes),
    );

    if (fieldsToProcess.length === 0) {
      this.logger.debug('No fields need processing for object type', {
        objectMetadataId,
        virtualFieldsCount: virtualFields.length,
      });

      return;
    }

    this.logger.log('Processing virtual fields for object type', {
      objectMetadataId,
      fieldsToProcess: fieldsToProcess.length,
      eventCount: events.length,
    });

    await this.bulkProcessVirtualFields(
      events,
      fieldsToProcess,
      objectMetadataMaps,
      workspaceId,
    );
  }

  private async bulkProcessVirtualFields(
    events: ObjectRecordNonDestructiveEvent[],
    virtualFields: PreComputedFieldMetadata[],
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

    const bulkUpdateOperations: BulkUpdateOperation[] = [];

    for (const event of events) {
      try {
        const affectedEntityIds = await this.getAffectedEntityIds(
          event,
          virtualFields,
          objectMetadataMaps,
        );

        for (const entityId of affectedEntityIds) {
          for (const field of virtualFields) {
            try {
              const computedResult = await this.computeFieldValue({
                virtualField: field.virtualField,
                entityId,
                workspaceId,
                objectMetadataMaps,
              });

              let valueToStore: PrimitiveValue;

              if (
                computedResult.isEntityResult &&
                computedResult.value &&
                typeof computedResult.value === 'object'
              ) {
                valueToStore =
                  (computedResult.value as EntityRecord).id || null;
              } else {
                valueToStore = computedResult.value as PrimitiveValue;
              }

              bulkUpdateOperations.push({
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

    if (bulkUpdateOperations.length > 0) {
      await this.bulkUpdateService.executeBatchUpdates(
        repository,
        bulkUpdateOperations,
      );
    }
  }

  private async getAffectedEntityIds(
    event: ObjectRecordNonDestructiveEvent,
    virtualFields: PreComputedFieldMetadata[],
    objectMetadataMaps: ObjectMetadataMaps,
  ): Promise<string[]> {
    const affectedEntityIds = new Set<string>();

    for (const field of virtualFields) {
      try {
        const entityIds = await this.findAffectedEntitiesByPath(
          event.objectMetadata.nameSingular,
          event.recordId,
          field.virtualField,
          objectMetadataMaps,
        );

        entityIds.forEach((id) => affectedEntityIds.add(id));
      } catch (error) {
        this.logger.error('Error finding affected entities for field', {
          fieldName: field.fieldName,
          eventId: event.recordId,
          error,
        });
      }
    }

    return Array.from(affectedEntityIds);
  }

  private async findAffectedEntitiesByPath(
    eventObjectName: string,
    eventEntityId: string,
    virtualField: VirtualField,
    objectMetadataMaps: ObjectMetadataMaps,
  ): Promise<string[]> {
    const targetObjectName = resolveObjectId(
      virtualField.objectMetadataId,
      objectMetadataMaps,
    );

    if (!targetObjectName) {
      return [];
    }

    if (eventObjectName === targetObjectName) {
      return [eventEntityId];
    }

    return [];
  }

  private async computeFieldValue(params: {
    virtualField: VirtualField;
    entityId: string;
    workspaceId: string;
    objectMetadataMaps: ObjectMetadataMaps;
  }): Promise<FieldComputationResult> {
    const { virtualField, entityId, workspaceId, objectMetadataMaps } = params;

    if ('when' in virtualField && 'default' in virtualField) {
      return await this.computeConditionalField(
        virtualField,
        entityId,
        workspaceId,
        objectMetadataMaps,
      );
    }

    return await this.computePathBasedField(
      virtualField,
      entityId,
      workspaceId,
      objectMetadataMaps,
    );
  }

  private async computeConditionalField(
    virtualField: VirtualField,
    entityId: string,
    workspaceId: string,
    objectMetadataMaps: ObjectMetadataMaps,
  ): Promise<FieldComputationResult> {
    const entityName =
      this.virtualFieldDiscoveryService.getEntityNameFromTarget(
        virtualField.objectMetadataId,
      );

    const repository =
      await this.twentyORMGlobalManager.getRepositoryForWorkspace(
        workspaceId,
        entityName,
        { shouldBypassPermissionChecks: true },
      );

    const record = await repository.findOne({ where: { id: entityId } });

    if (!record) {
      return {
        value: (virtualField as ConditionalField).default,
        isEntityResult: false,
      };
    }

    const value = this.expressionEvaluatorService.evaluateConditionalField(
      virtualField as ConditionalField,
      record,
      objectMetadataMaps,
    );

    return { value, isEntityResult: false };
  }

  private async computePathBasedField(
    virtualField: VirtualField,
    entityId: string,
    workspaceId: string,
    objectMetadataMaps: ObjectMetadataMaps,
  ): Promise<FieldComputationResult> {
    const entityName =
      this.virtualFieldDiscoveryService.getEntityNameFromTarget(
        virtualField.objectMetadataId,
      );

    return await this.pathEvaluatorService.evaluatePathBasedField(
      virtualField as PathBasedField,
      entityId,
      entityName,
      workspaceId,
      objectMetadataMaps,
    );
  }
}
