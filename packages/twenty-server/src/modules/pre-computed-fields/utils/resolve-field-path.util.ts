import { type ObjectMetadataMaps } from 'src/engine/metadata-modules/types/object-metadata-maps';
import { type AllStandardFieldIds } from 'src/modules/computed-fields/types/AllStandardFieldIds';

import { resolveFieldId } from './resolve-field-id.util';
import { resolveStandardFieldId } from './resolve-standard-field-id.util';

export const resolveFieldPath = (
  path: AllStandardFieldIds[],
  objectMetadataMaps: ObjectMetadataMaps,
) => {
  const resolvedPath: Array<{ objectName: string; fieldName: string }> = [];

  for (const fieldId of path) {
    let resolution =
      resolveStandardFieldId(fieldId, objectMetadataMaps) ??
      resolveFieldId(fieldId, objectMetadataMaps);

    if (!resolution) {
      return null;
    }

    resolvedPath.push({
      objectName: resolution.objectName,
      fieldName: resolution.fieldName,
    });
  }

  return resolvedPath;
};
