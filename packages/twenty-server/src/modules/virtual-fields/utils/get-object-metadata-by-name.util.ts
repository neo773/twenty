import { type ObjectMetadataMaps } from 'src/engine/metadata-modules/types/object-metadata-maps';

export function getObjectMetadataByName(
  objectName: string,
  objectMetadataMaps: ObjectMetadataMaps,
) {
  const objectMetadataId = objectMetadataMaps.idByNameSingular[objectName];

  return objectMetadataId ? objectMetadataMaps.byId[objectMetadataId] : null;
}