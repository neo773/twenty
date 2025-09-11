import { type ObjectMetadataMaps } from 'src/engine/metadata-modules/types/object-metadata-maps';
import { getObjectMetadataMapItemByNameSingular } from 'src/engine/metadata-modules/utils/get-object-metadata-map-item-by-name-singular.util';
import { type AllStandardFieldIds } from 'src/modules/computed-fields/types/AllStandardFieldIds';
import { type AllStandardObjectIds } from 'src/modules/computed-fields/types/AllStandardObjectIds';

export type FieldResolution = {
  objectName: string;
  fieldName: string;
};

export type FieldResolutionOptions = {
  shouldThrowOnError?: boolean;
};

/**
 * Resolves field by standardId across all objects in metadata maps
 * This is needed for virtual fields that reference fields by standard ID
 */
export function resolveFieldByStandardId(
  standardFieldId: AllStandardFieldIds,
  objectMetadataMaps: ObjectMetadataMaps,
): FieldResolution | null {
  for (const objectMetadata of Object.values(objectMetadataMaps.byId)) {
    if (!objectMetadata) continue;

    for (const fieldMetadata of Object.values(objectMetadata.fieldsById)) {
      if (fieldMetadata.standardId === standardFieldId) {
        return {
          objectName: objectMetadata.nameSingular,
          fieldName: fieldMetadata.name,
        };
      }
    }
  }

  return null;
}

/**
 * Resolves field by field metadata ID using optimized engine lookups
 */
export function resolveFieldById(
  fieldId: string,
  objectMetadataMaps: ObjectMetadataMaps,
): FieldResolution | null {
  // More efficient: iterate over objects and check fieldsById directly
  for (const objectMetadata of Object.values(objectMetadataMaps.byId)) {
    if (!objectMetadata) continue;

    const fieldMetadata = objectMetadata.fieldsById[fieldId];
    if (fieldMetadata) {
      return {
        objectName: objectMetadata.nameSingular,
        fieldName: fieldMetadata.name,
      };
    }
  }

  return null;
}

/**
 * Unified field resolver that tries both standard ID and field ID
 * Replaces resolveFieldForCondition
 */
export function resolveField(
  fieldId: string | AllStandardFieldIds,
  objectMetadataMaps: ObjectMetadataMaps,
  options: FieldResolutionOptions = {},
): FieldResolution | null {
  const { shouldThrowOnError = false } = options;

  // Try as standard field ID first
  const resolvedByStandardId = resolveFieldByStandardId(
    fieldId as AllStandardFieldIds,
    objectMetadataMaps,
  );

  if (resolvedByStandardId) {
    return resolvedByStandardId;
  }

  // Try as regular field ID
  const resolvedById = resolveFieldById(fieldId, objectMetadataMaps);

  if (resolvedById) {
    return resolvedById;
  }

  if (shouldThrowOnError) {
    throw new Error(`Could not resolve field ID: ${fieldId}`);
  }

  return null;
}

/**
 * Resolves object by standard ID or direct ID using engine utilities
 * Replaces resolve-object-id.util
 */
export function resolveObjectById(
  objectId: AllStandardObjectIds,
  objectMetadataMaps: ObjectMetadataMaps,
): string | null {
  // Try direct lookup first
  const objectMetadata = objectMetadataMaps.byId[objectId];

  if (objectMetadata) {
    return objectMetadata.nameSingular;
  }

  // Try by standard ID
  for (const obj of Object.values(objectMetadataMaps.byId)) {
    if (obj?.standardId === objectId) {
      return obj.nameSingular;
    }
  }

  return null;
}

/**
 * Gets field metadata using optimized lookups
 * Reuses existing resolution functions to avoid code duplication
 */
export function getFieldMetadata(
  fieldId: string | AllStandardFieldIds,
  objectMetadataMaps: ObjectMetadataMaps,
) {
  // First try to resolve the field to get the object context
  const fieldResolution = resolveField(fieldId, objectMetadataMaps);
  
  if (!fieldResolution) {
    return null;
  }

  // Get the object metadata
  const objectMetadata = getObjectMetadataMapItemByNameSingular(
    objectMetadataMaps,
    fieldResolution.objectName,
  );

  if (!objectMetadata) {
    return null;
  }

  // Look up by field name in the object's fieldIdByName map, then get metadata
  const resolvedFieldId = objectMetadata.fieldIdByName[fieldResolution.fieldName];
  
  return resolvedFieldId ? objectMetadata.fieldsById[resolvedFieldId] : null;
}

/**
 * Gets object metadata by name using engine utility
 * Replaces get-object-metadata-by-name.util
 */
export function getObjectMetadataByName(
  objectName: string,
  objectMetadataMaps: ObjectMetadataMaps,
) {
  return getObjectMetadataMapItemByNameSingular(objectMetadataMaps, objectName);
}