import { Injectable, Logger } from '@nestjs/common';

import { type ComputeFieldContext } from 'src/engine/twenty-orm/interfaces/compute-field-context.interface';

import { type ObjectRecordNonDestructiveEvent } from 'src/engine/core-modules/event-emitter/types/object-record-non-destructive-event';
import { metadataArgsStorage } from 'src/engine/twenty-orm/storage/metadata-args.storage';
import { TwentyORMGlobalManager } from 'src/engine/twenty-orm/twenty-orm-global.manager';
import { type PreComputedFieldDependencies } from 'src/engine/twenty-orm/types/pre-computed-field-dependencies.enum';
import { type PreComputedFieldFunction } from 'src/engine/twenty-orm/utils/define-compute-function.util';
import { WorkspaceCacheStorageService } from 'src/engine/workspace-cache-storage/workspace-cache-storage.service';
import { standardObjectMetadataDefinitions } from 'src/engine/workspace-manager/workspace-sync-metadata/standard-objects';
import { RelationsService } from 'src/modules/pre-computed-fields/relation.service';

export type ProcessEventsParams = {
  events: ObjectRecordNonDestructiveEvent[];
  workspaceId: string;
};

type PreComputedFieldMetadata = {
  entityName: string;
  fieldName: string;
  computeFunction: PreComputedFieldFunction;
};

@Injectable()
export class PreComputedFieldsService {
  private readonly logger = new Logger(PreComputedFieldsService.name);
  private readonly relationsService: RelationsService;

  constructor(
    private readonly twentyORMGlobalManager: TwentyORMGlobalManager,
    private readonly workspaceCacheStorageService: WorkspaceCacheStorageService,
  ) {
    this.relationsService = new RelationsService(
      this.twentyORMGlobalManager,
      this.workspaceCacheStorageService,
    );
  }

  async processEventsForComputedFields(
    params: ProcessEventsParams,
  ): Promise<void> {
    const { events, workspaceId } = params;

    console.dir(events, { depth: null });

    // Get all computed field metadata from the decorator storage
    const computedFields = this.getComputedFieldMetadata();

    if (computedFields.length === 0) {
      return;
    }

    // Extract event types that occurred
    const eventTypes = events.map(
      (event) =>
        event.objectMetadata.nameSingular as PreComputedFieldDependencies,
    );

    // Filter computed fields that have dependencies matching the event types
    const fieldsToProcess = computedFields.filter((field) =>
      field.computeFunction.dependencies.some((dep) =>
        eventTypes.includes(dep),
      ),
    );

    if (fieldsToProcess.length === 0) {
      return;
    }

    this.logger.log('ComputedFieldsService - Processing fields:', {
      workspaceId,
      fieldsCount: fieldsToProcess.length,
      fields: fieldsToProcess.map((f) => `${f.entityName}.${f.fieldName}`),
    });

    // Get affected entity IDs from events using relations service
    const affectedEntityMap = await this.extractAffectedEntityIds(
      events,
      fieldsToProcess,
      workspaceId,
    );

    // Execute compute functions for each affected entity
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

  private getComputedFieldMetadata(): PreComputedFieldMetadata[] {
    const computedFields: PreComputedFieldMetadata[] = [];

    // Iterate through all standard object definitions to find computed fields
    for (const entityTarget of standardObjectMetadataDefinitions) {
      const fieldMetadataArray = metadataArgsStorage.filterFields(entityTarget);

      for (const fieldMetadata of fieldMetadataArray) {
        if (fieldMetadata.preComputedFieldFunction) {
          computedFields.push({
            entityName: this.getEntityNameFromTarget(fieldMetadata.target),
            fieldName: fieldMetadata.name,
            computeFunction: fieldMetadata.preComputedFieldFunction,
          });
        }
      }
    }

    return computedFields;
  }

  // eslint-disable-next-line @typescript-eslint/ban-types
  private getEntityNameFromTarget(target: Function): string {
    // Convert class name to entity name following existing patterns
    // e.g., PersonWorkspaceEntity -> person
    const className = target.name;

    return className
      .replace('WorkspaceEntity', '')
      .replace(/([A-Z])/g, (match, letter, index) =>
        index === 0 ? letter.toLowerCase() : `-${letter.toLowerCase()}`,
      )
      .replace(/^-/, '');
  }

  private async extractAffectedEntityIds(
    events: ObjectRecordNonDestructiveEvent[],
    fieldsToProcess: PreComputedFieldMetadata[],
    workspaceId: string,
  ): Promise<Map<string, Set<string>>> {
    const affectedEntityMap = new Map<string, Set<string>>();

    for (const event of events) {
      for (const field of fieldsToProcess) {
        // Check if this field depends on the event type
        if (
          field.computeFunction.dependencies.includes(
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
            // Use relations service to find affected entities dynamically
            const affectedEntityIds =
              await this.relationsService.findRelatedEntities({
                sourceObjectName: event.objectMetadata.nameSingular,
                sourceEntityId: event.recordId,
                targetObjectName: field.entityName,
                workspaceId,
              });

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

  private async executeComputedFieldsForEntity(params: {
    entityId: string;
    workspaceId: string;
    fieldsToProcess: PreComputedFieldMetadata[];
  }): Promise<void> {
    const { entityId, workspaceId, fieldsToProcess } = params;

    // Create compute context
    const context: ComputeFieldContext = {
      entityId,
      workspaceId,
      twentyORMManager: this.twentyORMGlobalManager,
      triggerEventEntityId: entityId,
    };

    // Execute each compute function and update the cached value
    for (const field of fieldsToProcess) {
      try {
        const computedValue =
          await field.computeFunction.computeFunction(context);

        // Update the cached value in the database
        await this.updateCachedFieldValue({
          entityName: field.entityName,
          entityId,
          fieldName: field.fieldName,
          value: computedValue,
          workspaceId,
        });

        this.logger.log(
          `Updated computed field ${field.entityName}.${field.fieldName} for entity ${entityId}`,
        );
      } catch (error) {
        this.logger.error(
          `Error executing computed field ${field.entityName}.${field.fieldName}:`,
          error,
        );
      }
    }
  }

  private async updateCachedFieldValue(params: {
    entityName: string;
    entityId: string;
    fieldName: string;
    value: Record<string, unknown> | string | number | boolean | null;
    workspaceId: string;
  }): Promise<void> {
    const { entityName, entityId, fieldName, value, workspaceId } = params;

    const repository =
      await this.twentyORMGlobalManager.getRepositoryForWorkspace(
        workspaceId,
        entityName,
        { shouldBypassPermissionChecks: true },
      );

    await repository.update(entityId, {
      [fieldName]: value,
    });
  }
}
