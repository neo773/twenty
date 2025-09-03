import { type ObjectMetadataMaps } from 'src/engine/metadata-modules/types/object-metadata-maps';
import {
  COMPANY_STANDARD_FIELD_IDS,
  PERSON_STANDARD_FIELD_IDS,
} from 'src/engine/workspace-manager/workspace-sync-metadata/constants/standard-field-ids';
import { STANDARD_OBJECT_IDS } from 'src/engine/workspace-manager/workspace-sync-metadata/constants/standard-object-ids';
import { buildColumnReference } from 'src/modules/pre-computed-fields/utils/build-column-reference.util';
import { buildTableAlias } from 'src/modules/pre-computed-fields/utils/build-table-alias.util';
import { resolveFieldId } from 'src/modules/pre-computed-fields/utils/resolve-field-id.util';
import { resolveFieldPath } from 'src/modules/pre-computed-fields/utils/resolve-field-path.util';
import { resolveObjectId } from 'src/modules/pre-computed-fields/utils/resolve-object-id.util';

describe('FieldIdResolverUtil', () => {
  let mockObjectMetadataMaps: ObjectMetadataMaps;

  beforeEach(() => {
    mockObjectMetadataMaps = {
      byId: {
        [STANDARD_OBJECT_IDS.company]: {
          id: STANDARD_OBJECT_IDS.company,
          nameSingular: 'company',
          namePlural: 'companies',
          fieldsById: {
            [COMPANY_STANDARD_FIELD_IDS.name]: {
              id: COMPANY_STANDARD_FIELD_IDS.name,
              name: 'name',
              type: 'TEXT',
            },
            [COMPANY_STANDARD_FIELD_IDS.people]: {
              id: COMPANY_STANDARD_FIELD_IDS.people,
              name: 'people',
              type: 'RELATION',
            },
            [COMPANY_STANDARD_FIELD_IDS.annualRecurringRevenue]: {
              id: COMPANY_STANDARD_FIELD_IDS.annualRecurringRevenue,
              name: 'annualRecurringRevenue',
              type: 'CURRENCY',
            },
          },
        },
        [STANDARD_OBJECT_IDS.person]: {
          id: STANDARD_OBJECT_IDS.person,
          nameSingular: 'person',
          namePlural: 'people',
          fieldsById: {
            [PERSON_STANDARD_FIELD_IDS.name]: {
              id: PERSON_STANDARD_FIELD_IDS.name,
              name: 'name',
              type: 'FULL_NAME',
            },
            [PERSON_STANDARD_FIELD_IDS.company]: {
              id: PERSON_STANDARD_FIELD_IDS.company,
              name: 'company',
              type: 'RELATION',
            },
          },
        },
      },
      byNameSingular: {},
    } as unknown as ObjectMetadataMaps;
  });

  describe('resolveFieldId', () => {
    it('should resolve field ID to field metadata', () => {
      const result = resolveFieldId(
        COMPANY_STANDARD_FIELD_IDS.name,
        mockObjectMetadataMaps,
      );

      expect(result).toEqual({
        objectName: 'company',
        fieldName: 'name',
        columnName: 'name',
      });
    });

    it('should resolve field ID from different object', () => {
      const result = resolveFieldId(
        PERSON_STANDARD_FIELD_IDS.name,
        mockObjectMetadataMaps,
      );

      expect(result).toEqual({
        objectName: 'person',
        fieldName: 'name',
        columnName: 'name',
      });
    });

    it('should return null for unknown field ID', () => {
      const result = resolveFieldId(
        'unknown-field-id' as any,
        mockObjectMetadataMaps,
      );

      expect(result).toBeNull();
    });

    it('should handle complex field names', () => {
      const result = resolveFieldId(
        COMPANY_STANDARD_FIELD_IDS.annualRecurringRevenue,
        mockObjectMetadataMaps,
      );

      expect(result).toEqual({
        objectName: 'company',
        fieldName: 'annualRecurringRevenue',
        columnName: 'annualRecurringRevenue',
      });
    });
  });

  describe('resolveObjectId', () => {
    it('should resolve object ID to object name', () => {
      const result = resolveObjectId(
        STANDARD_OBJECT_IDS.company,
        mockObjectMetadataMaps,
      );

      expect(result).toBe('company');
    });

    it('should resolve different object IDs', () => {
      const result = resolveObjectId(
        STANDARD_OBJECT_IDS.person,
        mockObjectMetadataMaps,
      );

      expect(result).toBe('person');
    });

    it('should return null for unknown object ID', () => {
      const result = resolveObjectId(
        'unknown-object-id' as any,
        mockObjectMetadataMaps,
      );

      expect(result).toBeNull();
    });
  });

  describe('resolveFieldPath', () => {
    it('should resolve simple field path', () => {
      const path = [COMPANY_STANDARD_FIELD_IDS.name];

      const result = resolveFieldPath(path, mockObjectMetadataMaps);

      expect(result).toEqual([
        {
          objectName: 'company',
          fieldName: 'name',
        },
      ]);
    });

    it('should resolve multi-field path', () => {
      const path = [
        COMPANY_STANDARD_FIELD_IDS.people,
        PERSON_STANDARD_FIELD_IDS.name,
      ];

      const result = resolveFieldPath(path, mockObjectMetadataMaps);

      expect(result).toEqual([
        {
          objectName: 'company',
          fieldName: 'people',
        },
        {
          objectName: 'person',
          fieldName: 'name',
        },
      ]);
    });

    it('should return null if any field in path cannot be resolved', () => {
      const path = [COMPANY_STANDARD_FIELD_IDS.name, 'unknown-field-id' as any];

      const result = resolveFieldPath(path, mockObjectMetadataMaps);

      expect(result).toBeNull();
    });

    it('should handle empty path', () => {
      const path: any[] = [];

      const result = resolveFieldPath(path, mockObjectMetadataMaps);

      expect(result).toEqual([]);
    });
  });

  describe('buildTableAlias', () => {
    it('should build table alias with step number', () => {
      const result = buildTableAlias('company', 1);

      expect(result).toBe('company_1');
    });

    it('should handle different object names and steps', () => {
      expect(buildTableAlias('person', 2)).toBe('person_2');
      expect(buildTableAlias('opportunity', 0)).toBe('opportunity_0');
      expect(buildTableAlias('calendarEvent', 5)).toBe('calendarEvent_5');
    });

    it('should handle object names with special characters', () => {
      const result = buildTableAlias('custom_object', 1);

      expect(result).toBe('custom_object_1');
    });
  });

  describe('buildColumnReference', () => {
    it('should build column reference with table alias and field name', () => {
      const result = buildColumnReference('company', 'name');

      expect(result).toBe('company.name');
    });

    it('should handle different aliases and field names', () => {
      expect(buildColumnReference('person_1', 'email')).toBe('person_1.email');

      expect(buildColumnReference('opp_2', 'amount')).toBe('opp_2.amount');
    });

    it('should handle complex field names', () => {
      const result = buildColumnReference(
        'company_1',
        'annualRecurringRevenue',
      );

      expect(result).toBe('company_1.annualRecurringRevenue');
    });
  });

  describe('Integration Tests', () => {
    it('should resolve field path and build aliases correctly', () => {
      const path = [
        COMPANY_STANDARD_FIELD_IDS.people,
        PERSON_STANDARD_FIELD_IDS.company,
      ];

      const resolvedPath = resolveFieldPath(path, mockObjectMetadataMaps);

      expect(resolvedPath).not.toBeNull();

      if (resolvedPath) {
        const aliases = resolvedPath.map((step, index) =>
          buildTableAlias(step.objectName, index),
        );

        expect(aliases).toEqual(['company_0', 'person_1']);

        const columnRefs = resolvedPath.map((step, index) =>
          buildColumnReference(aliases[index], step.fieldName),
        );

        expect(columnRefs).toEqual(['company_0.people', 'person_1.company']);
      }
    });

    it('should handle complex relationship path', () => {
      const path = [
        COMPANY_STANDARD_FIELD_IDS.people,
        PERSON_STANDARD_FIELD_IDS.company,
        COMPANY_STANDARD_FIELD_IDS.name,
      ];

      const resolvedPath = resolveFieldPath(path, mockObjectMetadataMaps);

      expect(resolvedPath).toEqual([
        { objectName: 'company', fieldName: 'people' },
        { objectName: 'person', fieldName: 'company' },
        { objectName: 'company', fieldName: 'name' },
      ]);
    });
  });

  describe('Edge Cases', () => {
    it('should handle empty object metadata maps', () => {
      const emptyMaps: ObjectMetadataMaps = {
        byId: {},
        idByNameSingular: {},
      };

      const result = resolveFieldId(COMPANY_STANDARD_FIELD_IDS.name, emptyMaps);

      expect(result).toBeNull();
    });

    it('should handle object without fields', () => {
      const mapsWithoutFields: ObjectMetadataMaps = {
        byId: {
          [STANDARD_OBJECT_IDS.company]: {
            id: STANDARD_OBJECT_IDS.company,
            nameSingular: 'company',
            namePlural: 'companies',
            fieldsById: {},
          },
        },
        byNameSingular: {},
      } as unknown as ObjectMetadataMaps;

      const result = resolveFieldId(
        COMPANY_STANDARD_FIELD_IDS.name,
        mapsWithoutFields,
      );

      expect(result).toBeNull();
    });

    it('should handle malformed object metadata', () => {
      const malformedMaps: ObjectMetadataMaps = {
        byId: {
          [STANDARD_OBJECT_IDS.company]: null as any,
        },
        idByNameSingular: {},
      };

      const result = resolveFieldId(
        COMPANY_STANDARD_FIELD_IDS.name,
        malformedMaps,
      );

      expect(result).toBeNull();
    });
  });
});
