import { isRecordFieldReadOnly } from '../isRecordFieldReadOnly';

describe('isRecordFieldReadOnly', () => {
  const mockObjectPermissions = {
    canReadObjectRecords: true,
    canUpdateObjectRecords: true,
    restrictedFields: {
      field1: { canUpdate: false, canEditInUI: false },
      field2: { canUpdate: true, canEditInUI: null },
    },
  };

  it('should return true when record is read only', () => {
    const result = isRecordFieldReadOnly({
      isRecordReadOnly: true,
      objectPermissions: mockObjectPermissions,
      fieldMetadataId: 'field1',
    });

    expect(result).toBe(true);
  });

  it('should return true when field cannot be updated', () => {
    const result = isRecordFieldReadOnly({
      isRecordReadOnly: false,
      objectPermissions: mockObjectPermissions,
      fieldMetadataId: 'field1',
    });

    expect(result).toBe(true);
  });

  it('should return false when field can be updated and record is not read only', () => {
    const result = isRecordFieldReadOnly({
      isRecordReadOnly: false,
      objectPermissions: mockObjectPermissions,
      fieldMetadataId: 'field2',
    });

    expect(result).toBe(false);
  });

  it('should return true when canEditInUI is false', () => {
    const result = isRecordFieldReadOnly({
      isRecordReadOnly: false,
      objectPermissions: {
        ...mockObjectPermissions,
        restrictedFields: {
          field1: { canUpdate: true, canEditInUI: false },
        },
      },
      fieldMetadataId: 'field1',
    });

    expect(result).toBe(true);
  });

  it('should return false when canEditInUI is null', () => {
    const result = isRecordFieldReadOnly({
      isRecordReadOnly: false,
      objectPermissions: {
        ...mockObjectPermissions,
        restrictedFields: {
          field1: { canUpdate: true, canEditInUI: null },
        },
      },
      fieldMetadataId: 'field1',
    });

    expect(result).toBe(false);
  });
});
