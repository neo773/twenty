import { type ObjectMetadataMaps } from 'src/engine/metadata-modules/types/object-metadata-maps';
import { type AllStandardObjectIds } from 'src/modules/computed-fields/types/AllStandardObjectIds';

export const resolveObjectId = (
  objectId: AllStandardObjectIds,
  objectMetadataMaps: ObjectMetadataMaps,
): string | null => {
  const objectMetadata = objectMetadataMaps.byId[objectId];

  return objectMetadata?.nameSingular || null;
};
