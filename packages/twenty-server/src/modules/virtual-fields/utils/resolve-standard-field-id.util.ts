import { type ObjectMetadataMaps } from 'src/engine/metadata-modules/types/object-metadata-maps';
import { type AllStandardFieldIds } from 'src/modules/computed-fields/types/AllStandardFieldIds';

export const resolveStandardFieldId = (
  standardFieldId: AllStandardFieldIds,
  objectMetadataMaps: ObjectMetadataMaps,
) => {
  for (const [_, objectMetadata] of Object.entries(objectMetadataMaps.byId)) {
    if (!objectMetadata) continue;

    for (const [_, fieldMetadata] of Object.entries(
      objectMetadata.fieldsById,
    )) {
      if (fieldMetadata.standardId === standardFieldId) {
        return {
          objectName: objectMetadata.nameSingular,
          fieldName: fieldMetadata.name,
          columnName: fieldMetadata.name,
        };
      }
    }
  }
};
