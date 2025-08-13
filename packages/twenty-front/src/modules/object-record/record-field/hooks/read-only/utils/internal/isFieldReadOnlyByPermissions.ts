import { isFieldReadOnlyBySystem } from '@/object-record/record-field/hooks/read-only/utils/internal/isFieldReadOnlyBySystem';
import { isObjectReadOnly } from '@/object-record/record-field/hooks/read-only/utils/isObjectReadOnly';
import { type ObjectPermission } from '~/generated/graphql';

export type IsFieldReadOnlyByPermissionParams = {
  objectPermissions: ObjectPermission;
  fieldMetadataId: string;
};

export const isFieldReadOnlyByPermissions = ({
  objectPermissions,
  fieldMetadataId,
}: IsFieldReadOnlyByPermissionParams) => {
  if (isObjectReadOnly({ objectPermissions }) === true) {
    return true;
  }

  const fieldMetadataIsRestrictedForUpdate =
    objectPermissions.restrictedFields[fieldMetadataId]?.canUpdate === false;

  // Get the canEditInUI value from field permissions
  const canEditInUI =
    objectPermissions.restrictedFields[fieldMetadataId]?.canEditInUI;

  // Check if field is read-only by system using the clean permission
  const fieldReadOnlyBySystem = isFieldReadOnlyBySystem({ canEditInUI });

  return fieldMetadataIsRestrictedForUpdate || fieldReadOnlyBySystem;
};
