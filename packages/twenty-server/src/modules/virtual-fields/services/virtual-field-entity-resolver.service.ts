import { Injectable, Logger } from '@nestjs/common';

import { type ObjectRecordNonDestructiveEvent } from 'src/engine/core-modules/event-emitter/types/object-record-non-destructive-event';
import { type ObjectMetadataMaps } from 'src/engine/metadata-modules/types/object-metadata-maps';

import { VirtualFieldDiscoveryService } from 'src/modules/virtual-fields/services/virtual-field-discovery.service';
import { VirtualField } from 'src/modules/virtual-fields/types/VirtualField';
import { resolveObjectById } from 'src/modules/virtual-fields/utils/metadata-resolver.util';

type VirtualFieldMetadata = {
  fieldName: string;
  virtualField: VirtualField;
  objectMetadataId: string;
};

@Injectable()
export class VirtualFieldEntityResolver {
  private readonly logger = new Logger(VirtualFieldEntityResolver.name);

  constructor(
    private readonly virtualFieldDiscoveryService: VirtualFieldDiscoveryService,
  ) {}



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