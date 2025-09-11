import { Injectable, Logger } from '@nestjs/common';

import { type ObjectMetadataMaps } from 'src/engine/metadata-modules/types/object-metadata-maps';
import { metadataArgsStorage } from 'src/engine/twenty-orm/storage/metadata-args.storage';
import { standardObjectMetadataDefinitions } from 'src/engine/workspace-manager/workspace-sync-metadata/standard-objects';
import { AllStandardFieldIds } from 'src/modules/computed-fields/types/AllStandardFieldIds';
import {
  type Condition,
  type VirtualField,
} from 'src/modules/computed-fields/types/VirtualField';
import { buildVirtualFieldKey } from 'src/modules/virtual-fields/utils/virtual-field-key.util';
import { resolveField } from 'src/modules/virtual-fields/utils/metadata-resolver.util';

export type VirtualFieldDependencyMap = Record<
  string,
  { dependenciesObjectNameSingular: string[] }
>;

@Injectable()
export class VirtualFieldsDependencyMapService {
  private readonly logger = new Logger(VirtualFieldsDependencyMapService.name);

  constructor() {}

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
            this.logger.log('Found virtual field', {
              entityName: entityTarget.name,
              fieldName: fieldMetadata.name,
              objectMetadataId: fieldMetadata.virtualField.objectMetadataId,
            });

            const objectName = this.getObjectNameFromMetadataId(
              fieldMetadata.virtualField.objectMetadataId,
              objectMetadataMaps,
            );

            if (objectName) {
              const fieldKey = buildVirtualFieldKey(
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
            } else {
              this.logger.warn(
                'Virtual field skipped due to missing object name',
                {
                  entityName: entityTarget.name,
                  fieldName: fieldMetadata.name,
                  objectMetadataId: fieldMetadata.virtualField.objectMetadataId,
                },
              );
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
              const fieldKey = buildVirtualFieldKey(objectName, field.name);

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

  buildDependencyMap(
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


  private extractDependenciesFromVirtualField(
    virtualField: VirtualField,
    objectMetadataMaps: ObjectMetadataMaps,
  ): string[] {
    const dependencies = new Set<string>();

    const sourceObjectName = this.getObjectNameFromMetadataId(
      virtualField.objectMetadataId,
      objectMetadataMaps,
    );

    if (sourceObjectName) {
      dependencies.add(sourceObjectName);
    }

    if ('path' in virtualField) {
      const pathDependencies = this.extractDependenciesFromPath(
        virtualField.path,
        objectMetadataMaps,
      );

      pathDependencies.forEach((dep) => dependencies.add(dep));
    }

    if ('where' in virtualField && virtualField.where) {
      const whereDependencies = this.extractDependenciesFromCondition(
        virtualField.where,
        objectMetadataMaps,
      );

      whereDependencies.forEach((dep) => dependencies.add(dep));
    }

    if ('when' in virtualField) {
      for (const whenClause of virtualField.when) {
        const conditionDependencies = this.extractDependenciesFromCondition(
          whenClause.condition,
          objectMetadataMaps,
        );

        conditionDependencies.forEach((dep) => dependencies.add(dep));
      }
    }

    return Array.from(dependencies);
  }

  private extractDependenciesFromPath(
    path: AllStandardFieldIds[],
    objectMetadataMaps: ObjectMetadataMaps,
  ): string[] {
    // Replace resolveFieldPath with inline mapping
    const resolvedPath = path
      .map(fieldId => resolveField(fieldId, objectMetadataMaps))
      .filter(Boolean);

    if (resolvedPath.length !== path.length) {
      return [];
    }

    return resolvedPath.map((step) => step!.objectName);
  }

  private extractDependenciesFromCondition(
    condition: Condition,
    objectMetadataMaps: ObjectMetadataMaps,
  ): string[] {
    const dependencies = new Set<string>();

    if ('field' in condition) {
      const resolvedField = resolveField(
        condition.field,
        objectMetadataMaps,
      );

      if (resolvedField) {
        dependencies.add(resolvedField.objectName);
      }
    } else if ('and' in condition || 'or' in condition || 'not' in condition) {
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

    if (!objectMetadata) {
      const objectByStandardId = Object.values(objectMetadataMaps.byId).find(
        (obj) => obj?.standardId === objectMetadataId,
      );

      if (objectByStandardId) {
        return objectByStandardId.nameSingular;
      }
    }

    return objectMetadata?.nameSingular ?? null;
  }

}
