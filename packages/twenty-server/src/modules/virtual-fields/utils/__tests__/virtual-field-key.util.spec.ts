import { buildVirtualFieldKey, parseVirtualFieldKey } from 'src/modules/virtual-fields/utils/virtual-field-key.util';

describe('buildVirtualFieldKey', () => {
  it('should build virtual field key with simple names', () => {
    const result = buildVirtualFieldKey('company', 'customerTier');

    expect(result).toBe('virtualField:company:customerTier');
  });

  it('should build virtual field key with underscores in object name', () => {
    const result = buildVirtualFieldKey('custom_object', 'fieldName');

    expect(result).toBe('virtualField:custom_object:fieldName');
  });

  it('should build virtual field key with underscores in field name', () => {
    const result = buildVirtualFieldKey('company', 'customer_tier_level');

    expect(result).toBe('virtualField:company:customer_tier_level');
  });

  it('should build virtual field key with both names having underscores', () => {
    const result = buildVirtualFieldKey('custom_object_type', 'complex_field_name');

    expect(result).toBe('virtualField:custom_object_type:complex_field_name');
  });
});

describe('parseVirtualFieldKey', () => {
  it('should parse valid virtual field key', () => {
    const fieldKey = 'virtualField:company:customerTier';
    const result = parseVirtualFieldKey(fieldKey);

    expect(result).toEqual({
      objectName: 'company',
      fieldName: 'customerTier',
    });
  });

  it('should parse virtual field key with underscores in object name', () => {
    const fieldKey = 'virtualField:custom_object:fieldName';
    const result = parseVirtualFieldKey(fieldKey);

    expect(result).toEqual({
      objectName: 'custom_object',
      fieldName: 'fieldName',
    });
  });

  it('should parse virtual field key with underscores in field name', () => {
    const fieldKey = 'virtualField:company:customer_tier_level';
    const result = parseVirtualFieldKey(fieldKey);

    expect(result).toEqual({
      objectName: 'company',
      fieldName: 'customer_tier_level',
    });
  });

  it('should return null for invalid format', () => {
    const fieldKey = 'invalid_format';
    const result = parseVirtualFieldKey(fieldKey);

    expect(result).toBeNull();
  });

  it('should return null for key without prefix', () => {
    const fieldKey = 'company:customerTier';
    const result = parseVirtualFieldKey(fieldKey);

    expect(result).toBeNull();
  });

  it('should return null for key with only prefix', () => {
    const fieldKey = 'virtualField:';
    const result = parseVirtualFieldKey(fieldKey);

    expect(result).toBeNull();
  });

  it('should return null for key missing field name', () => {
    const fieldKey = 'virtualField:company:';
    const result = parseVirtualFieldKey(fieldKey);

    expect(result).toBeNull();
  });

  it('should return null for key with too many parts', () => {
    const fieldKey = 'virtualField:company:field:extra';
    const result = parseVirtualFieldKey(fieldKey);

    expect(result).toBeNull();
  });

  it('should return null for key with too few parts', () => {
    const fieldKey = 'virtualField:company';
    const result = parseVirtualFieldKey(fieldKey);

    expect(result).toBeNull();
  });

  describe('buildVirtualFieldKey + parseVirtualFieldKey roundtrip', () => {
    it('should correctly roundtrip simple names', () => {
      const objectName = 'company';
      const fieldName = 'customerTier';
      const key = buildVirtualFieldKey(objectName, fieldName);
      const parsed = parseVirtualFieldKey(key);

      expect(parsed).toEqual({ objectName, fieldName });
    });

    it('should correctly roundtrip complex names', () => {
      const objectName = 'custom_object_type';
      const fieldName = 'complex_field_name_here';
      const key = buildVirtualFieldKey(objectName, fieldName);
      const parsed = parseVirtualFieldKey(key);

      expect(parsed).toEqual({ objectName, fieldName });
    });
  });
});