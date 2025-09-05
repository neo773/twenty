import { Injectable, Logger } from '@nestjs/common';

import { type ObjectRecordNonDestructiveEvent } from 'src/engine/core-modules/event-emitter/types/object-record-non-destructive-event';
import { type ObjectMetadataMaps } from 'src/engine/metadata-modules/types/object-metadata-maps';
import { metadataArgsStorage } from 'src/engine/twenty-orm/storage/metadata-args.storage';
import { TwentyORMGlobalManager } from 'src/engine/twenty-orm/twenty-orm-global.manager';
import { PreComputedFieldDependencies } from 'src/engine/twenty-orm/types/pre-computed-field-dependencies.enum';
import { WorkspaceCacheStorageService } from 'src/engine/workspace-cache-storage/workspace-cache-storage.service';
import { STANDARD_OBJECT_IDS } from 'src/engine/workspace-manager/workspace-sync-metadata/constants/standard-object-ids';
import { standardObjectMetadataDefinitions } from 'src/engine/workspace-manager/workspace-sync-metadata/standard-objects';
import { type PrimitiveValue } from 'src/modules/computed-fields/types/PrimitiveValue';
import {
  type ConditionalField,
  type PathBasedField,
  type VirtualField,
} from 'src/modules/computed-fields/types/VirtualField';
import { ExpressionEvaluatorService } from 'src/modules/pre-computed-fields/services/expression-evaluator.service';
import {
  PathEvaluatorService,
  type PathEvaluatorResult,
} from 'src/modules/pre-computed-fields/services/path-evaluator.service';
import { resolveObjectId } from 'src/modules/pre-computed-fields/utils/resolve-object-id.util';

export type ProcessEventsParams = {
  events: ObjectRecordNonDestructiveEvent[];
  workspaceId: string;
};

type PreComputedFieldMetadata = {
  entityName: string;
  fieldName: string;
  virtualField: VirtualField;
};

type EntityRecord = Record<string, PrimitiveValue>;

type FieldComputationResult = PathEvaluatorResult;

type ExtendedConditionalField = ConditionalField & {
  objectMetadataId: string;
  fieldMetadataId: string;
  dependencies: PreComputedFieldDependencies[];
};

type ExtendedPathBasedField = PathBasedField & {
  objectMetadataId: string;
  fieldMetadataId: string;
  dependencies: PreComputedFieldDependencies[];
};

@Injectable()
export class PreComputedFieldsService {
  private readonly logger = new Logger(PreComputedFieldsService.name);

  constructor(
    private readonly twentyORMGlobalManager: TwentyORMGlobalManager,
    private readonly workspaceCacheStorageService: WorkspaceCacheStorageService,
    private readonly expressionEvaluatorService: ExpressionEvaluatorService,
    private readonly pathEvaluatorService: PathEvaluatorService,
  ) {}

  async processEventsForComputedFields(
    params: ProcessEventsParams,
  ): Promise<void> {
    const { events, workspaceId } = params;

    console.dir(events, { depth: null });

    const computedFields = this.getComputedFieldMetadata();

    if (computedFields.length === 0) {
      return;
    }

    const eventTypes = events.map(
      (event) =>
        event.objectMetadata.nameSingular as PreComputedFieldDependencies,
    );

    const fieldsToProcess = computedFields.filter((field) =>
      field.virtualField?.dependencies?.some((dep) => eventTypes.includes(dep)),
    );

    if (fieldsToProcess.length === 0) {
      return;
    }

    this.logger.log('ComputedFieldsService - Processing fields:', {
      workspaceId,
      fieldsCount: fieldsToProcess.length,
      fields: fieldsToProcess.map((f) => `${f.entityName}.${f.fieldName}`),
    });

    const affectedEntityMap = await this.extractAffectedEntityIds(
      events,
      fieldsToProcess,
      workspaceId,
    );

    for (const [fieldKey, entityIds] of affectedEntityMap.entries()) {
      const field = fieldsToProcess.find(
        (f) => `${f.entityName}.${f.fieldName}` === fieldKey,
      );

      if (!field) continue;

      for (const entityId of entityIds) {
        await this.executeComputedFieldsForEntity({
          entityId,
          workspaceId,
          fieldsToProcess: [field],
        });
      }
    }
  }

  public getComputedFieldMetadata(): PreComputedFieldMetadata[] {
    const computedFields: PreComputedFieldMetadata[] = [];

    for (const entityTarget of standardObjectMetadataDefinitions) {
      const fieldMetadataArray = metadataArgsStorage.filterFields(entityTarget);

      for (const fieldMetadata of fieldMetadataArray) {
        if (fieldMetadata.virtualField) {
          computedFields.push({
            entityName: this.getEntityNameFromTarget(
              fieldMetadata.virtualField.objectMetadataId,
            ),
            fieldName: fieldMetadata.name,
            virtualField: fieldMetadata.virtualField,
          });
        }
      }
    }

    return computedFields;
  }

  private getEntityNameFromTarget(objectMetadataId: string): string {
    for (const [key, value] of Object.entries(STANDARD_OBJECT_IDS)) {
      if (value === objectMetadataId) {
        return key;
      }
    }

    return 'unknown';
  }

  private async extractAffectedEntityIds(
    events: ObjectRecordNonDestructiveEvent[],
    fieldsToProcess: PreComputedFieldMetadata[],
    workspaceId: string,
  ): Promise<Map<string, Set<string>>> {
    const affectedEntityMap = new Map<string, Set<string>>();
    const objectMetadataMaps =
      await this.workspaceCacheStorageService.getObjectMetadataMapsOrThrow(
        workspaceId,
      );

    for (const event of events) {
      for (const field of fieldsToProcess) {
        if (
          field?.virtualField?.dependencies?.includes(
            event.objectMetadata.nameSingular as PreComputedFieldDependencies,
          )
        ) {
          const fieldKey = `${field.entityName}.${field.fieldName}`;

          this.logger.log('Processing dependency:', {
            eventType: event.objectMetadata.nameSingular,
            fieldKey,
            triggerEntityId: event.recordId,
          });

          try {
            const affectedEntityIds = await this.findAffectedEntitiesByPath(
              event.objectMetadata.nameSingular,
              event.recordId,
              field.virtualField,
              objectMetadataMaps,
            );

            if (!affectedEntityMap.has(fieldKey)) {
              affectedEntityMap.set(fieldKey, new Set());
            }

            affectedEntityIds.forEach((id) =>
              affectedEntityMap.get(fieldKey)?.add(id),
            );

            this.logger.log('Found affected entities:', {
              fieldKey,
              count: affectedEntityIds.length,
              entityIds: affectedEntityIds,
            });
          } catch (error) {
            this.logger.error('Error resolving affected entity IDs:', {
              fieldKey,
              error,
            });
          }
        }
      }
    }

    return affectedEntityMap;
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

    if ('path' in virtualField && virtualField.path) {
      return await this.findAffectedEntitiesForPathField(
        eventObjectName,
        eventEntityId,
        virtualField as ExtendedPathBasedField,
      );
    }

    return [];
  }

  private async findAffectedEntitiesForPathField(
    eventObjectName: string,
    eventEntityId: string,
    pathField: ExtendedPathBasedField,
  ): Promise<string[]> {
    this.logger.debug(
      'Path-based affected entity resolution not fully implemented',
      {
        eventObjectName,
        eventEntityId,
        pathLength: pathField.path.length,
      },
    );

    return [];
  }

  public async executeComputedFieldsForEntity(params: {
    entityId: string;
    workspaceId: string;
    fieldsToProcess: PreComputedFieldMetadata[];
  }): Promise<void> {
    const { entityId, workspaceId, fieldsToProcess } = params;

    const objectMetadataMaps =
      await this.workspaceCacheStorageService.getObjectMetadataMapsOrThrow(
        workspaceId,
      );

    for (const field of fieldsToProcess) {
      try {
        const computedResult = await this.computeFieldValue({
          virtualField: field.virtualField,
          entityId,
          workspaceId,
          objectMetadataMaps,
        });

        await this.updateCachedFieldValue({
          entityName: field.entityName,
          entityId,
          fieldName: field.fieldName,
          result: computedResult,
          workspaceId,
        });

        this.logger.log(
          `Updated computed field ${field.entityName}.${field.fieldName} for entity ${entityId}: ${JSON.stringify(computedResult.value)}`,
        );
      } catch (error) {
        this.logger.error(
          `Error executing computed field ${field.entityName}.${field.fieldName}:`,
          error,
        );
      }
    }
  }

  private async computeFieldValue(params: {
    virtualField: VirtualField;
    entityId: string;
    workspaceId: string;
    objectMetadataMaps: ObjectMetadataMaps;
  }): Promise<FieldComputationResult> {
    const { virtualField, entityId, workspaceId, objectMetadataMaps } = params;

    if (this.isConditionalField(virtualField)) {
      return await this.computeConditionalField(
        virtualField as ExtendedConditionalField,
        entityId,
        workspaceId,
        objectMetadataMaps,
      );
    }

    return await this.computePathBasedField(
      virtualField as ExtendedPathBasedField,
      entityId,
      workspaceId,
      objectMetadataMaps,
    );
  }

  private async computeConditionalField(
    conditionalField: ExtendedConditionalField,
    entityId: string,
    workspaceId: string,
    objectMetadataMaps: ObjectMetadataMaps,
  ): Promise<FieldComputationResult> {
    const entityName = this.getEntityNameFromTarget(
      conditionalField.objectMetadataId,
    );

    const repository =
      await this.twentyORMGlobalManager.getRepositoryForWorkspace(
        workspaceId,
        entityName,
        { shouldBypassPermissionChecks: true },
      );

    const record = await repository.findOne({ where: { id: entityId } });

    if (!record) {
      return { value: conditionalField.default, isEntityResult: false };
    }

    const value = this.expressionEvaluatorService.evaluateConditionalField(
      conditionalField,
      record,
      objectMetadataMaps,
    );

    return { value, isEntityResult: false };
  }

  private async computePathBasedField(
    pathField: ExtendedPathBasedField,
    entityId: string,
    workspaceId: string,
    objectMetadataMaps: ObjectMetadataMaps,
  ): Promise<FieldComputationResult> {
    const entityName = this.getEntityNameFromTarget(pathField.objectMetadataId);

    return await this.pathEvaluatorService.evaluatePathBasedField(
      pathField,
      entityId,
      entityName,
      workspaceId,
      objectMetadataMaps,
    );
  }

  private isConditionalField(virtualField: VirtualField): boolean {
    return 'when' in virtualField && 'default' in virtualField;
  }

  private async updateCachedFieldValue(params: {
    entityName: string;
    entityId: string;
    fieldName: string;
    result: FieldComputationResult;
    workspaceId: string;
  }): Promise<void> {
    const { entityName, entityId, fieldName, result, workspaceId } = params;

    const repository =
      await this.twentyORMGlobalManager.getRepositoryForWorkspace(
        workspaceId,
        entityName,
        { shouldBypassPermissionChecks: true },
      );

    let valueToStore: PrimitiveValue;

    if (
      result.isEntityResult &&
      result.value &&
      typeof result.value === 'object'
    ) {
      valueToStore = (result.value as EntityRecord).id || null;
    } else {
      valueToStore = result.value as PrimitiveValue;
    }

    await repository.update(entityId, {
      [fieldName]: valueToStore,
    });
  }
}
