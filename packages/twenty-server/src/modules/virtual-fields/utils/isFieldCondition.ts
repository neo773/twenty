import type {
  Condition,
  FieldCondition,
} from 'src/modules/computed-fields/types/VirtualField';

export const isFieldCondition = (
  condition: Condition,
): condition is FieldCondition => {
  return 'field' in condition;
};
