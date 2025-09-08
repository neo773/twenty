import { type ObjectMetadataMaps } from 'src/engine/metadata-modules/types/object-metadata-maps';
import { type AllStandardFieldIds } from 'src/modules/computed-fields/types/AllStandardFieldIds';

export const resolveFieldId = (
  fieldId: AllStandardFieldIds,
  objectMetadataMaps: ObjectMetadataMaps,
) => {
  for (const [_, objectMetadata] of Object.entries(objectMetadataMaps.byId)) {
    if (!objectMetadata) continue;

    for (const [fieldMetadataId, fieldMetadata] of Object.entries(
      objectMetadata.fieldsById,
    )) {
      if (fieldMetadataId === fieldId) {
        return {
          objectName: objectMetadata.nameSingular,
          fieldName: fieldMetadata.name,
          columnName: fieldMetadata.name,
        };
      }
    }
  }

  return null;
};
