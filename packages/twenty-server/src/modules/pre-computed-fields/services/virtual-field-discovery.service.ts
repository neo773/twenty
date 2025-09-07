import { Injectable } from '@nestjs/common';

import { metadataArgsStorage } from 'src/engine/twenty-orm/storage/metadata-args.storage';
import { PreComputedFieldDependencies } from 'src/engine/twenty-orm/types/pre-computed-field-dependencies.enum';
import { STANDARD_OBJECT_IDS } from 'src/engine/workspace-manager/workspace-sync-metadata/constants/standard-object-ids';
import { standardObjectMetadataDefinitions } from 'src/engine/workspace-manager/workspace-sync-metadata/standard-objects';
import { type VirtualField } from 'src/modules/computed-fields/types/VirtualField';

type PreComputedFieldMetadata = {
  fieldName: string;
  virtualField: VirtualField;
  objectMetadataId: string;
};

@Injectable()
export class VirtualFieldDiscoveryService {
  hasVirtualFields(objectMetadataId: string): boolean {
    const entityTarget =
      this.findEntityTargetByObjectMetadataId(objectMetadataId);

    if (!entityTarget) {
      return false;
    }

    const fieldMetadataArray = metadataArgsStorage.filterFields(entityTarget);

    return fieldMetadataArray.some((field) => field.virtualField);
  }

  getVirtualFieldsForObjectMetadata(
    objectMetadataId: string,
  ): PreComputedFieldMetadata[] {
    const entityTarget =
      this.findEntityTargetByObjectMetadataId(objectMetadataId);

    if (!entityTarget) {
      return [];
    }

    const fieldMetadataArray = metadataArgsStorage.filterFields(entityTarget);

    return fieldMetadataArray
      .filter((field) => field.virtualField)
      .map((field) => ({
        fieldName: field.name,
        virtualField: field.virtualField!,
        objectMetadataId: field.virtualField!.objectMetadataId,
      }));
  }

  fieldNeedsProcessing(
    field: PreComputedFieldMetadata,
    eventTypes: PreComputedFieldDependencies[],
  ): boolean {
    return (
      field.virtualField.dependencies?.some((dep) =>
        eventTypes.includes(dep),
      ) ?? false
    );
  }

  getEntityNameFromTarget(objectMetadataId: string): string {
    for (const [key, value] of Object.entries(STANDARD_OBJECT_IDS)) {
      if (value === objectMetadataId) {
        return key;
      }
    }

    return 'unknown';
  }

  private findEntityTargetByObjectMetadataId(
    objectMetadataId: string,
  ): Function | null {
    for (const entityTarget of standardObjectMetadataDefinitions) {
      const fieldMetadataArray = metadataArgsStorage.filterFields(entityTarget);

      for (const fieldMetadata of fieldMetadataArray) {
        if (fieldMetadata.virtualField?.objectMetadataId === objectMetadataId) {
          return entityTarget;
        }
      }
    }

    return null;
  }
}
