import { Injectable, Logger } from '@nestjs/common';

import { type ObjectMetadataMaps } from 'src/engine/metadata-modules/types/object-metadata-maps';
import { TwentyORMGlobalManager } from 'src/engine/twenty-orm/twenty-orm-global.manager';
import { type PrimitiveValue } from 'src/modules/computed-fields/types/PrimitiveValue';
import {
  type ConditionalField,
  type PathBasedField,
  type VirtualField,
} from 'src/modules/computed-fields/types/VirtualField';
import { evaluateConditionalField } from 'src/modules/virtual-fields/utils/evaluate-virtual-field-conditions.util';
import { VirtualFieldsFieldDiscoveryService } from 'src/modules/virtual-fields/services/virtual-fields-field-discovery.service';
import {
  VirtualFieldsPathEvaluatorService,
  type PathEvaluatorResult,
} from 'src/modules/virtual-fields/services/virtual-fields-path-evaluator.service';

type FieldComputationResult = PathEvaluatorResult;
type EntityRecord = Record<string, PrimitiveValue>;

@Injectable()
export class VirtualFieldsComputationService {
  private readonly logger = new Logger(VirtualFieldsComputationService.name);

  constructor(
    private readonly twentyORMGlobalManager: TwentyORMGlobalManager,
    private readonly virtualFieldDiscoveryService: VirtualFieldsFieldDiscoveryService,
    private readonly pathEvaluatorService: VirtualFieldsPathEvaluatorService,
  ) {}

  async computeFieldValue(params: {
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

  extractStorableValue(computedResult: FieldComputationResult): PrimitiveValue {
    if (
      computedResult.isEntityResult &&
      computedResult.value &&
      typeof computedResult.value === 'object'
    ) {
      return (computedResult.value as EntityRecord).id || null;
    }

    return computedResult.value as PrimitiveValue;
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

    const value = evaluateConditionalField(
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