import { buildVirtualFieldKey } from 'src/modules/virtual-fields/utils/build-virtual-field-key.util';

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