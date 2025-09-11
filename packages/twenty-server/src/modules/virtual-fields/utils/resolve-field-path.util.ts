import { type ObjectMetadataMaps } from 'src/engine/metadata-modules/types/object-metadata-maps';
import { type AllStandardFieldIds } from 'src/modules/computed-fields/types/AllStandardFieldIds';

import { resolveField } from './metadata-resolver.util';

export const resolveFieldPath = (
  path: AllStandardFieldIds[],
  objectMetadataMaps: ObjectMetadataMaps,
) => {
  const resolvedPath: Array<{ objectName: string; fieldName: string }> = [];

  for (const fieldId of path) {
    const resolution = resolveField(fieldId, objectMetadataMaps);

    if (!resolution) {
      return null;
    }

    resolvedPath.push(resolution);
  }

  return resolvedPath;
};
