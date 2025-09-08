import type { ObjectMetadataMaps } from 'src/engine/metadata-modules/types/object-metadata-maps';
import type { AllStandardFieldIds } from 'src/modules/computed-fields/types/AllStandardFieldIds';
import {
    type FieldResolution,
    type FieldResolutionOptions,
} from 'src/modules/virtual-fields/utils/field-resolution.util';
import { resolveFieldId } from 'src/modules/virtual-fields/utils/resolve-field-id.util';
import { resolveStandardFieldId } from 'src/modules/virtual-fields/utils/resolve-standard-field-id.util';

export const resolveFieldForCondition = (
  fieldId: string | AllStandardFieldIds,
  objectMetadataMaps: ObjectMetadataMaps,
  options: FieldResolutionOptions = {},
): FieldResolution | null => {
  const { shouldThrowOnError = false } = options;

  // Try as standard field ID first
  try {
    const resolvedField = resolveStandardFieldId(
      fieldId as AllStandardFieldIds,
      objectMetadataMaps,
    );

    if (resolvedField) {
      return {
        objectName: resolvedField.objectName,
        fieldName: resolvedField.fieldName,
      };
    }
  } catch {
    // Ignore error, try as regular field ID
  }

  // Try as regular field ID
  try {
    const resolvedField = resolveFieldId(
      fieldId as AllStandardFieldIds,
      objectMetadataMaps,
    );

    if (resolvedField) {
      return {
        objectName: resolvedField.objectName,
        fieldName: resolvedField.fieldName,
      };
    }
  } catch {
    // Ignore error
  }

  if (shouldThrowOnError) {
    throw new Error(`Could not resolve field ID: ${fieldId}`);
  }

  return null;
};
