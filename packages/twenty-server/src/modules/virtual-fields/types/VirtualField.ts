
import { type AggregateOperations } from 'src/engine/api/graphql/graphql-query-runner/constants/aggregate-operations.constant';
import { AllStandardFieldIds } from 'src/modules/virtual-fields/types/AllStandardFieldIds';
import { AllStandardObjectIds } from 'src/modules/virtual-fields/types/AllStandardObjectIds';
import { Direction } from 'src/modules/virtual-fields/types/Direction';
import { Operator } from 'src/modules/virtual-fields/types/Operator';
import { PrimitiveValue } from 'src/modules/virtual-fields/types/PrimitiveValue';

export type FieldCondition = {
  field: AllStandardFieldIds;
  operator: Operator;
  value: PrimitiveValue;
};

export type LogicalCondition = {
  and?: Condition[];
  or?: Condition[];
  not?: Condition;
};

export type Condition = FieldCondition | LogicalCondition;

export type WhenClause = {
  condition: Condition;
  value: PrimitiveValue;
};

export type ConditionalField = {
  when: WhenClause[];
  default: PrimitiveValue;
};

export type RankingClause = {
  field?: AllStandardFieldIds; // Optional field to rank by. If not specified, ranks by calculation result
  direction: Direction;
  limit: number;
};

export type PathBasedField = {
  path: AllStandardFieldIds[];
  calculation: AggregateOperations;
  where?: Condition;
  rankBy?: RankingClause;
};

export type VirtualField = {
  objectMetadataId: AllStandardObjectIds;
  fieldMetadataId: AllStandardFieldIds;
} & (ConditionalField | PathBasedField);
