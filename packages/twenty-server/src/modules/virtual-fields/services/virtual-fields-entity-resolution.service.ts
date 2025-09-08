import { Injectable, Logger } from '@nestjs/common';

import { type ObjectRecordNonDestructiveEvent } from 'src/engine/core-modules/event-emitter/types/object-record-non-destructive-event';
import { type ObjectMetadataMaps } from 'src/engine/metadata-modules/types/object-metadata-maps';
import { type VirtualField } from 'src/modules/computed-fields/types/VirtualField';
import { VirtualFieldsFieldDiscoveryService } from 'src/modules/virtual-fields/services/virtual-fields-field-discovery.service';
import { resolveObjectId } from 'src/modules/virtual-fields/utils/resolve-object-id.util';

const VIRTUAL_FIELD_KEY_PREFIX = 'virtualField_' as const;

type VirtualFieldMetadata = {
  fieldName: string;
  virtualField: VirtualField;
  objectMetadataId: string;
};

@Injectable()
export class VirtualFieldsEntityResolutionService {
  private readonly logger = new Logger(VirtualFieldsEntityResolutionService.name);

  constructor(
    private readonly virtualFieldDiscoveryService: VirtualFieldsFieldDiscoveryService,
  ) {}

  async groupAffectedFieldsByTargetObject(
    affectedFieldKeys: string[],
    workspaceId: string,
    objectMetadataMaps: ObjectMetadataMaps,
  ): Promise<Map<string, VirtualFieldMetadata[]>> {
    const fieldsToProcessByObject = new Map<
      string,
      VirtualFieldMetadata[]
    >();

    for (const fieldKey of affectedFieldKeys) {
      try {
        const parsedField = this.parseVirtualFieldKey(fieldKey);

        if (!parsedField) {
          continue;
        }

        const { objectName, fieldName } = parsedField;
        const objectMetadata = this.getObjectMetadataByName(
          objectName,
          objectMetadataMaps,
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

  async getAffectedEntityIds(
    event: ObjectRecordNonDestructiveEvent,
    virtualFields: VirtualFieldMetadata[],
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

  private parseVirtualFieldKey(
    fieldKey: string,
  ): { objectName: string; fieldName: string } | null {
    const pattern = new RegExp(`^${VIRTUAL_FIELD_KEY_PREFIX}(.+)_(.+)$`);
    const match = fieldKey.match(pattern);

    return match ? { objectName: match[1], fieldName: match[2] } : null;
  }

  private getObjectMetadataByName(
    objectName: string,
    objectMetadataMaps: ObjectMetadataMaps,
  ) {
    const objectMetadataId = objectMetadataMaps.idByNameSingular[objectName];

    return objectMetadataId ? objectMetadataMaps.byId[objectMetadataId] : null;
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
}