import type {
  Condition,
  LogicalCondition,
} from 'src/modules/computed-fields/types/VirtualField';

export const isLogicalCondition = (
  condition: Condition,
): condition is LogicalCondition => {
  return 'and' in condition || 'or' in condition || 'not' in condition;
};
