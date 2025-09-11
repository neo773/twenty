import { type ObjectMetadataMaps } from 'src/engine/metadata-modules/types/object-metadata-maps';
import { getObjectMetadataByName } from 'src/modules/virtual-fields/utils/get-object-metadata-by-name.util';

describe('getObjectMetadataByName', () => {
  const mockObjectMetadataMaps: ObjectMetadataMaps = {
    byId: {
      'company-id': {
        id: 'company-id',
        nameSingular: 'company',
        namePlural: 'companies',
        isCustom: false,
        isRemote: false,
        isActive: true,
        isSystem: false,
        createdAt: new Date(),
        updatedAt: new Date(),
        labelSingular: 'Company',
        labelPlural: 'Companies',
        description: 'A company',
        icon: 'IconBuildingSkyscraper',
        labelIdentifierFieldMetadataId: 'name-field-id',
        imageIdentifierFieldMetadataId: null,
        indexMetadatas: [],
        fields: [],
        fieldsById: {},
        fieldIdByJoinColumnName: {},
        fieldIdByName: {},
      },
    },
    idByNameSingular: {
      company: 'company-id',
    },
  } as unknown as ObjectMetadataMaps;

  it('should return object metadata for valid object name', () => {
    const result = getObjectMetadataByName('company', mockObjectMetadataMaps);

    expect(result).toEqual(mockObjectMetadataMaps.byId['company-id']);
  });

  it('should return null for non-existent object name', () => {
    const result = getObjectMetadataByName(
      'nonExistent',
      mockObjectMetadataMaps,
    );

    expect(result).toBeNull();
  });

  it('should return null for empty object name', () => {
    const result = getObjectMetadataByName('', mockObjectMetadataMaps);

    expect(result).toBeNull();
  });
});
