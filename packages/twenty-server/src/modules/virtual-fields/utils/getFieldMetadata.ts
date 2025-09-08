import type { ObjectMetadataMaps } from 'src/engine/metadata-modules/types/object-metadata-maps';
import type { AllStandardFieldIds } from 'src/modules/computed-fields/types/AllStandardFieldIds';

export const getFieldMetadata = (
  fieldId: string | AllStandardFieldIds,
  objectMetadataMaps: ObjectMetadataMaps,
) => {
  // Try to find the field metadata from the object metadata maps
  for (const [_, objectMetadata] of Object.entries(objectMetadataMaps.byId)) {
    if (!objectMetadata) continue;

    // First try to find by standardId (similar to resolveStandardFieldId)
    for (const [_, fieldMetadata] of Object.entries(
      objectMetadata.fieldsById,
    )) {
      if (fieldMetadata.standardId === fieldId) {
        return fieldMetadata;
      }
    }

    // Then try to find by field metadata ID directly (similar to resolveFieldId)
    for (const [fieldMetadataId, fieldMetadata] of Object.entries(
      objectMetadata.fieldsById,
    )) {
      if (fieldMetadataId === fieldId) {
        return fieldMetadata;
      }
    }
  }

  return null;
};
