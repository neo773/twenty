import {
  type IsFieldReadOnlyByPermissionParams,
  isFieldReadOnlyByPermissions,
} from '@/object-record/record-field/hooks/read-only/utils/internal/isFieldReadOnlyByPermissions';

type IsRecordFieldReadOnlyParams = {
  isRecordReadOnly: boolean;
} & IsFieldReadOnlyByPermissionParams;

export const isRecordFieldReadOnly = ({
  isRecordReadOnly,
  objectPermissions,
  fieldMetadataId,
}: IsRecordFieldReadOnlyParams) => {
  const fieldReadOnlyByPermissions = isFieldReadOnlyByPermissions({
    objectPermissions,
    fieldMetadataId,
  });

  return isRecordReadOnly || fieldReadOnlyByPermissions;
};
