import { Injectable, Logger } from '@nestjs/common';

import { type ObjectLiteral } from 'typeorm';

import { type WorkspaceRepository } from 'src/engine/twenty-orm/repository/workspace.repository';
import { type PrimitiveValue } from 'src/modules/computed-fields/types/PrimitiveValue';

type BulkUpdateOperation = {
  entityId: string;
  fieldName: string;
  value: PrimitiveValue;
};

@Injectable()
export class VirtualFieldsBatchUpdateService {
  private readonly logger = new Logger(VirtualFieldsBatchUpdateService.name);

  async executeBatchUpdates<T extends ObjectLiteral>(
    repository: WorkspaceRepository<T>,
    updateOperations: BulkUpdateOperation[],
  ): Promise<void> {
    if (updateOperations.length === 0) {
      return;
    }

    const updatesByEntity = new Map<string, Record<string, PrimitiveValue>>();

    for (const operation of updateOperations) {
      if (!updatesByEntity.has(operation.entityId)) {
        updatesByEntity.set(operation.entityId, {});
      }
      updatesByEntity.get(operation.entityId)![operation.fieldName] =
        operation.value;
    }

    for (const [entityId, updates] of updatesByEntity.entries()) {
      try {
        await repository.update(entityId, updates as Partial<T>);

        this.logger.debug('Updated computed fields for entity', {
          entityId,
          fields: Object.keys(updates),
          values: Object.values(updates),
        });
      } catch (error) {
        this.logger.error('Error updating entity', {
          entityId,
          updates,
          error,
        });
      }
    }

    this.logger.log('Completed bulk updates', {
      operationsProcessed: updateOperations.length,
      entitiesUpdated: updatesByEntity.size,
    });
  }
}
