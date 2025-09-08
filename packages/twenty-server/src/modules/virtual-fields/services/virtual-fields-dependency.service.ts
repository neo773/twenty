import { Injectable, Logger } from '@nestjs/common';

import { type ObjectMetadataMaps } from 'src/engine/metadata-modules/types/object-metadata-maps';
import { metadataArgsStorage } from 'src/engine/twenty-orm/storage/metadata-args.storage';
import { standardObjectMetadataDefinitions } from 'src/engine/workspace-manager/workspace-sync-metadata/standard-objects';
import { AllStandardFieldIds } from 'src/modules/computed-fields/types/AllStandardFieldIds';
import {
  type Condition,
  type ConditionalField,
  type PathBasedField,
  type VirtualField,
} from 'src/modules/computed-fields/types/VirtualField';
import { VirtualFieldsFieldDiscoveryService } from 'src/modules/virtual-fields/services/virtual-fields-field-discovery.service';
import { isFieldCondition } from 'src/modules/virtual-fields/utils/isFieldCondition';
import { isLogicalCondition } from 'src/modules/virtual-fields/utils/isLogicalCondition';
import { resolveFieldPath } from 'src/modules/virtual-fields/utils/resolve-field-path.util';
import { resolveFieldForCondition } from 'src/modules/virtual-fields/utils/resolveFieldForCondition';

export type VirtualFieldDependencyMap = Record<
  string,
  { dependenciesObjectNameSingular: string[] }
>;

@Injectable()
export class VirtualFieldsDependencyService {
  private readonly logger = new Logger(VirtualFieldsDependencyService.name);

  constructor(
    private readonly virtualFieldsFieldDiscoveryService: VirtualFieldsFieldDiscoveryService,
  ) {}

  buildDependencyMapFromSystemFields(
    objectMetadataMaps: ObjectMetadataMaps,
  ): VirtualFieldDependencyMap {
    const dependencyMap: VirtualFieldDependencyMap = {};

    for (const entityTarget of standardObjectMetadataDefinitions) {
      try {
        const fieldMetadataArray =
          metadataArgsStorage.filterFields(entityTarget);

        for (const fieldMetadata of fieldMetadataArray) {
          if (fieldMetadata.virtualField) {
            const objectName = this.getObjectNameFromMetadataId(
              fieldMetadata.virtualField.objectMetadataId,
              objectMetadataMaps,
            );

            if (objectName) {
              const fieldKey = this.buildFieldKey(
                objectName,
                fieldMetadata.name,
              );

              const dependencies = this.extractDependenciesFromVirtualField(
                fieldMetadata.virtualField,
                objectMetadataMaps,
              );

              dependencyMap[fieldKey] = {
                dependenciesObjectNameSingular: dependencies,
              };
            }
          }
        }
      } catch (error) {
        this.logger.error('Error processing system virtual fields for entity', {
          entityTarget: entityTarget.name,
          error,
        });
      }
    }

    return dependencyMap;
  }

  buildDependencyMapFromCustomFields(
    objectMetadataMaps: ObjectMetadataMaps,
  ): VirtualFieldDependencyMap {
    const dependencyMap: VirtualFieldDependencyMap = {};

    try {
      for (const objectMetadata of Object.values(objectMetadataMaps.byId)) {
        for (const field of Object.values(objectMetadata?.fieldsById ?? {})) {
          if (field.virtualField) {
            const objectName = this.getObjectNameFromMetadataId(
              field.virtualField.objectMetadataId,
              objectMetadataMaps,
            );

            if (objectName) {
              const fieldKey = this.buildFieldKey(objectName, field.name);

              const dependencies = this.extractDependenciesFromVirtualField(
                field.virtualField,
                objectMetadataMaps,
              );

              dependencyMap[fieldKey] = {
                dependenciesObjectNameSingular: dependencies,
              };
            }
          }
        }
      }
    } catch (error) {
      this.logger.error('Error processing custom virtual fields', { error });
    }

    return dependencyMap;
  }

  buildCompleteDependencyMap(
    objectMetadataMaps: ObjectMetadataMaps,
  ): VirtualFieldDependencyMap {
    const systemFieldsMap =
      this.buildDependencyMapFromSystemFields(objectMetadataMaps);
    const customFieldsMap =
      this.buildDependencyMapFromCustomFields(objectMetadataMaps);

    return {
      ...systemFieldsMap,
      ...customFieldsMap,
    };
  }

  getVirtualFieldsAffectedByObject(
    objectNameSingular: string,
    dependencyMap: VirtualFieldDependencyMap,
  ): string[] {
    const affectedFields: string[] = [];

    for (const [fieldKey, dependencies] of Object.entries(dependencyMap)) {
      if (
        dependencies.dependenciesObjectNameSingular.includes(objectNameSingular)
      ) {
        affectedFields.push(fieldKey);
      }
    }

    return affectedFields;
  }

  private extractDependenciesFromVirtualField(
    virtualField: VirtualField,
    objectMetadataMaps: ObjectMetadataMaps,
  ): string[] {
    const dependencies = new Set<string>();

    if (this.isPathBasedField(virtualField)) {
      const pathDependencies = this.extractDependenciesFromPath(
        virtualField.path,
        objectMetadataMaps,
      );

      pathDependencies.forEach((dep) => dependencies.add(dep));

      if (virtualField.where) {
        const whereDependencies = this.extractDependenciesFromCondition(
          virtualField.where,
          objectMetadataMaps,
        );

        whereDependencies.forEach((dep) => dependencies.add(dep));
      }
    }

    if (this.isConditionalField(virtualField)) {
      for (const whenClause of virtualField.when) {
        const conditionDependencies = this.extractDependenciesFromCondition(
          whenClause.condition,
          objectMetadataMaps,
        );

        conditionDependencies.forEach((dep) => dependencies.add(dep));
      }

      const sourceObjectName = this.getObjectNameFromMetadataId(
        virtualField.objectMetadataId,
        objectMetadataMaps,
      );

      if (sourceObjectName) {
        dependencies.add(sourceObjectName);
      }
    }

    return Array.from(dependencies);
  }

  private extractDependenciesFromPath(
    path: AllStandardFieldIds[],
    objectMetadataMaps: ObjectMetadataMaps,
  ): string[] {
    const resolvedPath = resolveFieldPath(path, objectMetadataMaps);

    if (!resolvedPath) {
      return [];
    }

    return resolvedPath.map((step) => step.objectName);
  }

  private extractDependenciesFromCondition(
    condition: Condition,
    objectMetadataMaps: ObjectMetadataMaps,
  ): string[] {
    const dependencies = new Set<string>();

    if (isFieldCondition(condition)) {
      const resolvedField = resolveFieldForCondition(
        condition.field,
        objectMetadataMaps,
      );

      if (resolvedField) {
        dependencies.add(resolvedField.objectName);
      }
    } else if (isLogicalCondition(condition)) {
      if (condition.and) {
        for (const subCondition of condition.and) {
          const subDependencies = this.extractDependenciesFromCondition(
            subCondition,
            objectMetadataMaps,
          );

          subDependencies.forEach((dep) => dependencies.add(dep));
        }
      }
      if (condition.or) {
        for (const subCondition of condition.or) {
          const subDependencies = this.extractDependenciesFromCondition(
            subCondition,
            objectMetadataMaps,
          );

          subDependencies.forEach((dep) => dependencies.add(dep));
        }
      }
      if (condition.not) {
        const subDependencies = this.extractDependenciesFromCondition(
          condition.not,
          objectMetadataMaps,
        );

        subDependencies.forEach((dep) => dependencies.add(dep));
      }
    }

    return Array.from(dependencies);
  }

  private getObjectNameFromMetadataId(
    objectMetadataId: string,
    objectMetadataMaps: ObjectMetadataMaps,
  ): string | null {
    const objectMetadata = objectMetadataMaps.byId[objectMetadataId];

    return objectMetadata?.nameSingular ?? null;
  }

  private buildFieldKey(objectName: string, fieldName: string): string {
    return `virtualField_${objectName}_${fieldName}`;
  }

  private isPathBasedField(
    virtualField: VirtualField,
  ): virtualField is VirtualField & PathBasedField {
    return 'path' in virtualField && 'calculation' in virtualField;
  }

  private isConditionalField(
    virtualField: VirtualField,
  ): virtualField is VirtualField & ConditionalField {
    return 'when' in virtualField && 'default' in virtualField;
  }
}
