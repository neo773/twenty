import { Injectable, Logger } from '@nestjs/common';

import { FieldMetadataType } from 'twenty-shared/types';

import { type ObjectMetadataMaps } from 'src/engine/metadata-modules/types/object-metadata-maps';
import { Operator } from 'src/modules/computed-fields/types/Operator';
import { type PrimitiveValue } from 'src/modules/computed-fields/types/PrimitiveValue';
import {
  type Condition,
  type ConditionalField,
  type FieldCondition,
  type LogicalCondition,
} from 'src/modules/computed-fields/types/VirtualField';
import { getFieldMetadata } from 'src/modules/pre-computed-fields/utils/getFieldMetadata';
import { isFieldCondition } from 'src/modules/pre-computed-fields/utils/isFieldCondition';
import { isLogicalCondition } from 'src/modules/pre-computed-fields/utils/isLogicalCondition';
import { resolveFieldForCondition } from 'src/modules/pre-computed-fields/utils/resolveFieldForCondition';

type RecordData = Record<string, PrimitiveValue | PrimitiveValue[]>;

@Injectable()
export class ExpressionEvaluatorService {
  private readonly logger = new Logger(ExpressionEvaluatorService.name);

  evaluateConditionalField(
    conditionalField: ConditionalField,
    recordData: RecordData,
    objectMetadataMaps: ObjectMetadataMaps,
  ): PrimitiveValue {
    try {
      for (const whenClause of conditionalField.when) {
        if (
          this.evaluateCondition(
            whenClause.condition,
            recordData,
            objectMetadataMaps,
          )
        ) {
          return whenClause.value;
        }
      }

      return conditionalField.default;
    } catch (error) {
      this.logger.error(
        `Failed to evaluate conditional field: ${error instanceof Error ? error.message : 'Unknown error'}`,
        error instanceof Error ? error.stack : undefined,
      );

      return conditionalField.default;
    }
  }

  private evaluateCondition(
    condition: Condition,
    recordData: RecordData,
    objectMetadataMaps: ObjectMetadataMaps,
  ): boolean {
    try {
      if (isFieldCondition(condition)) {
        return this.evaluateFieldCondition(
          condition,
          recordData,
          objectMetadataMaps,
        );
      }

      if (isLogicalCondition(condition)) {
        return this.evaluateLogicalCondition(
          condition,
          recordData,
          objectMetadataMaps,
        );
      }

      throw new Error(`Unknown condition type: ${JSON.stringify(condition)}`);
    } catch (error) {
      this.logger.warn(
        `Condition evaluation failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );

      return false;
    }
  }

  public evaluateFieldCondition(
    condition: FieldCondition,
    recordData: RecordData,
    objectMetadataMaps: ObjectMetadataMaps,
  ): boolean {
    const resolvedField = resolveFieldForCondition(
      condition.field,
      objectMetadataMaps,
      { shouldThrowOnError: true },
    )!;
    const rawFieldValue = recordData[resolvedField.fieldName];

    // Handle composite fields like currency for in-memory evaluation
    let fieldValue = this.extractComparableValue(rawFieldValue);

    // For currency fields, extract amountMicros for numeric comparisons
    const fieldMetadata = getFieldMetadata(condition.field, objectMetadataMaps);

    if (fieldMetadata && fieldMetadata.type === FieldMetadataType.CURRENCY) {
      // Handle both currency objects and plain numbers (for testing/backward compatibility)
      if (typeof rawFieldValue === 'number') {
        // If it's already a plain number, use it directly
        fieldValue = rawFieldValue;
      } else if (rawFieldValue && typeof rawFieldValue === 'object') {
        const amountMicros = (
          rawFieldValue as unknown as { amountMicros: string | number }
        ).amountMicros;

        // Convert to number since amountMicros might be stored as string (bigint)
        fieldValue =
          typeof amountMicros === 'string'
            ? Number(amountMicros) / 1000000
            : amountMicros;
      }
    }

    const conditionValue = condition.value;

    switch (condition.operator) {
      case Operator.EQ:
        return fieldValue === conditionValue;

      case Operator.NE:
        return fieldValue !== conditionValue;

      case Operator.GT:
      case Operator.GTE:
      case Operator.LT:
      case Operator.LTE:
        return this.evaluateComparisonOperation(
          fieldValue,
          conditionValue,
          condition.operator,
        );

      default:
        throw new Error(`Unsupported operator: ${condition.operator}`);
    }
  }

  private evaluateLogicalCondition(
    condition: LogicalCondition,
    recordData: RecordData,
    objectMetadataMaps: ObjectMetadataMaps,
  ): boolean {
    if (condition.and) {
      return condition.and.every((subCondition) =>
        this.evaluateCondition(subCondition, recordData, objectMetadataMaps),
      );
    }

    if (condition.or) {
      return condition.or.some((subCondition) =>
        this.evaluateCondition(subCondition, recordData, objectMetadataMaps),
      );
    }

    if (condition.not) {
      return !this.evaluateCondition(
        condition.not,
        recordData,
        objectMetadataMaps,
      );
    }

    throw new Error('Logical condition must have and, or, or not property');
  }

  private evaluateComparisonOperation(
    fieldValue: PrimitiveValue,
    conditionValue: PrimitiveValue,
    operator: Operator.GT | Operator.GTE | Operator.LT | Operator.LTE,
  ): boolean {
    if (!this.areComparableValues(fieldValue, conditionValue)) {
      this.logger.warn(
        `Cannot compare ${fieldValue} (${typeof fieldValue}) with ${conditionValue} (${typeof conditionValue})`,
      );

      return false;
    }

    switch (operator) {
      case Operator.GT:
        return fieldValue! > conditionValue!;
      case Operator.GTE:
        return fieldValue! >= conditionValue!;
      case Operator.LT:
        return fieldValue! < conditionValue!;
      case Operator.LTE:
        return fieldValue! <= conditionValue!;
    }
  }

  public formatSQLValue(value: PrimitiveValue): string {
    if (value === null) {
      return 'NULL';
    }

    if (typeof value === 'string') {
      return `'${value.replace(/'/g, "''")}'`;
    }

    if (typeof value === 'number' || typeof value === 'boolean') {
      return String(value);
    }

    if (value instanceof Date) {
      return `'${value.toISOString()}'`;
    }

    throw new Error(
      `Unsupported value type: ${typeof value} (${String(value)})`,
    );
  }

  private areComparableValues(
    left: PrimitiveValue,
    right: PrimitiveValue,
  ): boolean {
    if (left === null || right === null) {
      return false;
    }

    const leftType = typeof left;
    const rightType = typeof right;

    return (
      leftType === rightType ||
      (leftType === 'number' && rightType === 'number') ||
      (left instanceof Date && right instanceof Date)
    );
  }

  private extractComparableValue(
    value: PrimitiveValue | PrimitiveValue[],
  ): PrimitiveValue {
    if (Array.isArray(value)) {
      return value.length > 0 ? value[0] : null;
    }

    return value;
  }
}
