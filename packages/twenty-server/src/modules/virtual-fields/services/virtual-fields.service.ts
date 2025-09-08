import { Injectable, Logger } from '@nestjs/common';

import { type ObjectRecordNonDestructiveEvent } from 'src/engine/core-modules/event-emitter/types/object-record-non-destructive-event';
import { type ObjectMetadataMaps } from 'src/engine/metadata-modules/types/object-metadata-maps';
import { TwentyORMGlobalManager } from 'src/engine/twenty-orm/twenty-orm-global.manager';
import { WorkspaceCacheStorageService } from 'src/engine/workspace-cache-storage/workspace-cache-storage.service';
import { type PrimitiveValue } from 'src/modules/computed-fields/types/PrimitiveValue';
import {
  type ConditionalField,
  type PathBasedField,
  type VirtualField,
} from 'src/modules/computed-fields/types/VirtualField';
import { VirtualFieldsBatchUpdateService } from 'src/modules/virtual-fields/services/virtual-fields-batch-update.service';
import { VirtualFieldsCacheService } from 'src/modules/virtual-fields/services/virtual-fields-cache.service';
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
    private readonly virtualFieldsCacheService: VirtualFieldsCacheService,
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

    const objectMetadataMaps =
      await this.workspaceCacheStorageService.getObjectMetadataMapsOrThrow(
        workspaceId,
      );

    const dependencyMap =
      await this.virtualFieldsCacheService.getDependencyMapForWorkspace(
        workspaceId,
        objectMetadataMaps,
      );

    const eventsWithAffectedVirtualFields =
      this.filterEventsWithAffectedVirtualFields(events, dependencyMap);

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

  private filterEventsWithAffectedVirtualFields(
    events: ObjectRecordNonDestructiveEvent[],
    dependencyMap: Record<string, { dependenciesObjectNameSingular: string[] }>,
  ): ObjectRecordNonDestructiveEvent[] {
    return events.filter((event) => {
      const affectedFields =
        this.virtualFieldsCacheService.getVirtualFieldsAffectedByObjectChange(
          event.objectMetadata.nameSingular,
          dependencyMap,
        );

      return affectedFields.length > 0;
    });
  }

  private async processBatchWithDependencyFiltering(
    events: ObjectRecordNonDestructiveEvent[],
    dependencyMap: Record<string, { dependenciesObjectNameSingular: string[] }>,
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
    dependencyMap: Record<string, { dependenciesObjectNameSingular: string[] }>,
    objectMetadataMaps: ObjectMetadataMaps,
    workspaceId: string,
  ): Promise<void> {
    const eventObjectName = events[0]?.objectMetadata.nameSingular;

    if (!eventObjectName) {
      return;
    }

    const affectedVirtualFields =
      this.virtualFieldsCacheService.getVirtualFieldsAffectedByObjectChange(
        eventObjectName,
        dependencyMap,
      );

    if (affectedVirtualFields.length === 0) {
      this.logger.debug('No virtual fields affected by object changes', {
        objectMetadataId,
        eventObjectName,
      });

      return;
    }

    this.logger.log('Processing virtual fields affected by object changes', {
      objectMetadataId,
      eventObjectName,
      affectedVirtualFields: affectedVirtualFields.length,
      eventCount: events.length,
    });

    const fieldsToProcessByObject =
      await this.groupAffectedFieldsByTargetObject(
        affectedVirtualFields,
        workspaceId,
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

  private async groupAffectedFieldsByTargetObject(
    affectedFieldKeys: string[],
    workspaceId: string,
  ): Promise<Map<string, PreComputedFieldMetadata[]>> {
    const fieldsToProcessByObject = new Map<
      string,
      PreComputedFieldMetadata[]
    >();

    for (const fieldKey of affectedFieldKeys) {
      try {
        const parsedField = this.parseVirtualFieldKey(fieldKey);

        if (!parsedField) {
          continue;
        }

        const { objectName, fieldName } = parsedField;
        const objectMetadata = await this.getObjectMetadataByName(
          objectName,
          workspaceId,
        );

        if (!objectMetadata) {
          continue;
        }

        const virtualFields =
          await this.virtualFieldDiscoveryService.getVirtualFieldsForObjectMetadata(
            objectMetadata.id,
            workspaceId,
          );

        const matchingField = virtualFields.find(
          (vf) => vf.fieldName === fieldName,
        );

        if (matchingField) {
          if (!fieldsToProcessByObject.has(objectMetadata.id)) {
            fieldsToProcessByObject.set(objectMetadata.id, []);
          }
          fieldsToProcessByObject.get(objectMetadata.id)!.push(matchingField);
        }
      } catch (error) {
        this.logger.error('Error processing affected field', {
          fieldKey,
          error,
        });
      }
    }

    return fieldsToProcessByObject;
  }

  private parseVirtualFieldKey(
    fieldKey: string,
  ): { objectName: string; fieldName: string } | null {
    const match = fieldKey.match(/^virtualField_(.+)_(.+)$/);

    return match ? { objectName: match[1], fieldName: match[2] } : null;
  }

  private async getObjectMetadataByName(
    objectName: string,
    workspaceId: string,
  ) {
    const objectMetadataMaps =
      await this.workspaceCacheStorageService.getObjectMetadataMapsOrThrow(
        workspaceId,
      );
    const objectMetadataId = objectMetadataMaps.idByNameSingular[objectName];

    return objectMetadataId ? objectMetadataMaps.byId[objectMetadataId] : null;
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
