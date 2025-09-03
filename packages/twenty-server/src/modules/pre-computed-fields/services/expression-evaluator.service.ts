import { Injectable, Logger } from '@nestjs/common';

import { type ObjectMetadataMaps } from 'src/engine/metadata-modules/types/object-metadata-maps';
import { AllStandardFieldIds } from 'src/modules/computed-fields/types/AllStandardFieldIds';
import { Operator } from 'src/modules/computed-fields/types/Operator';
import { type PrimitiveValue } from 'src/modules/computed-fields/types/PrimitiveValue';
import {
  type Condition,
  type ConditionalField,
  type FieldCondition,
  type LogicalCondition,
} from 'src/modules/computed-fields/types/VirtualField';
import { resolveFieldId } from 'src/modules/pre-computed-fields/utils/resolve-field-id.util';
import { resolveStandardFieldId } from 'src/modules/pre-computed-fields/utils/resolve-standard-field-id.util';

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

  generateConditionalSQL(
    conditionalField: ConditionalField,
    objectMetadataMaps: ObjectMetadataMaps,
    tableAlias: string,
  ): string {
    try {
      const sqlCases: string[] = [];

      for (const whenClause of conditionalField.when) {
        const conditionSQL = this.buildConditionSQL(
          whenClause.condition,
          objectMetadataMaps,
          tableAlias,
        );
        const valueSQL = this.formatSQLValue(whenClause.value);

        sqlCases.push(`WHEN ${conditionSQL} THEN ${valueSQL}`);
      }

      const defaultSQL = this.formatSQLValue(conditionalField.default);

      return `CASE ${sqlCases.join(' ')} ELSE ${defaultSQL} END`;
    } catch (error) {
      this.logger.error(
        `Failed to generate conditional SQL: ${error instanceof Error ? error.message : 'Unknown error'}`,
        error instanceof Error ? error.stack : undefined,
      );
      throw new Error(
        `SQL generation failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
    }
  }

  private evaluateCondition(
    condition: Condition,
    recordData: RecordData,
    objectMetadataMaps: ObjectMetadataMaps,
  ): boolean {
    try {
      if (this.isFieldCondition(condition)) {
        return this.evaluateFieldCondition(
          condition,
          recordData,
          objectMetadataMaps,
        );
      }

      if (this.isLogicalCondition(condition)) {
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
    const resolvedField = this.resolveField(
      condition.field,
      objectMetadataMaps,
    );
    const rawFieldValue = recordData[resolvedField.fieldName];
    const fieldValue = this.extractComparableValue(rawFieldValue);
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

  private buildConditionSQL(
    condition: Condition,
    objectMetadataMaps: ObjectMetadataMaps,
    tableAlias: string,
  ): string {
    if (this.isFieldCondition(condition)) {
      return this.buildFieldConditionSQL(
        condition,
        objectMetadataMaps,
        tableAlias,
      );
    }

    if (this.isLogicalCondition(condition)) {
      return this.buildLogicalConditionSQL(
        condition,
        objectMetadataMaps,
        tableAlias,
      );
    }

    throw new Error(`Unknown condition type: ${JSON.stringify(condition)}`);
  }

  private buildFieldConditionSQL(
    condition: FieldCondition,
    objectMetadataMaps: ObjectMetadataMaps,
    tableAlias: string,
  ): string {
    const resolvedField = this.resolveField(
      condition.field,
      objectMetadataMaps,
    );
    const fieldReference = `${tableAlias}.${resolvedField.fieldName}`;
    const formattedValue = this.formatSQLValue(condition.value);

    switch (condition.operator) {
      case Operator.EQ:
        return `${fieldReference} = ${formattedValue}`;
      case Operator.NE:
        return `${fieldReference} != ${formattedValue}`;
      case Operator.GT:
        return `${fieldReference} > ${formattedValue}`;
      case Operator.GTE:
        return `${fieldReference} >= ${formattedValue}`;
      case Operator.LT:
        return `${fieldReference} < ${formattedValue}`;
      case Operator.LTE:
        return `${fieldReference} <= ${formattedValue}`;
      default:
        throw new Error(`Unsupported operator: ${condition.operator}`);
    }
  }

  private buildLogicalConditionSQL(
    condition: LogicalCondition,
    objectMetadataMaps: ObjectMetadataMaps,
    tableAlias: string,
  ): string {
    if (condition.and) {
      const conditionSQLs = condition.and.map((subCondition) =>
        this.buildConditionSQL(subCondition, objectMetadataMaps, tableAlias),
      );

      return `(${conditionSQLs.join(' AND ')})`;
    }

    if (condition.or) {
      const conditionSQLs = condition.or.map((subCondition) =>
        this.buildConditionSQL(subCondition, objectMetadataMaps, tableAlias),
      );

      return `(${conditionSQLs.join(' OR ')})`;
    }

    if (condition.not) {
      const conditionSQL = this.buildConditionSQL(
        condition.not,
        objectMetadataMaps,
        tableAlias,
      );

      return `NOT (${conditionSQL})`;
    }

    throw new Error('Logical condition must have and, or, or not property');
  }

  private resolveField(
    fieldId: AllStandardFieldIds,
    objectMetadataMaps: ObjectMetadataMaps,
  ) {
    const fieldResolution =
      resolveStandardFieldId(fieldId, objectMetadataMaps) ||
      resolveFieldId(fieldId, objectMetadataMaps);

    if (!fieldResolution) {
      throw new Error(`Could not resolve field ID: ${fieldId}`);
    }

    return fieldResolution;
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

  private isFieldCondition(condition: Condition): condition is FieldCondition {
    return 'field' in condition;
  }

  private isLogicalCondition(
    condition: Condition,
  ): condition is LogicalCondition {
    return 'and' in condition || 'or' in condition || 'not' in condition;
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
