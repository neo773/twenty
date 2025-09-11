import { parseVirtualFieldKey } from 'src/modules/virtual-fields/utils/parse-virtual-field-key.util';

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
});