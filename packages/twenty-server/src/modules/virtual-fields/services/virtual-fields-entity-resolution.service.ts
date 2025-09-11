import { Injectable, Logger } from '@nestjs/common';

import { type ObjectRecordNonDestructiveEvent } from 'src/engine/core-modules/event-emitter/types/object-record-non-destructive-event';
import { type ObjectMetadataMaps } from 'src/engine/metadata-modules/types/object-metadata-maps';

import { VirtualFieldsFieldDiscoveryService } from 'src/modules/virtual-fields/services/virtual-fields-field-discovery.service';
import { VirtualField } from 'src/modules/virtual-fields/types/VirtualField';
import { getObjectMetadataByName, resolveObjectById } from 'src/modules/virtual-fields/utils/metadata-resolver.util';
import { parseVirtualFieldKey } from 'src/modules/virtual-fields/utils/virtual-field-key.util';


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
        const parsedField = parseVirtualFieldKey(fieldKey);

        if (!parsedField) {
          continue;
        }

        const { objectName, fieldName } = parsedField;
        const objectMetadata = getObjectMetadataByName(
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


  private async findAffectedEntitiesByPath(
    eventObjectName: string,
    eventEntityId: string,
    virtualField: VirtualField,
    objectMetadataMaps: ObjectMetadataMaps,
  ): Promise<string[]> {
    const targetObjectName = resolveObjectById(
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