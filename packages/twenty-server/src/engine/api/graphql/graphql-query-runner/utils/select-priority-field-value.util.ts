import { getPriorityValue } from 'src/engine/api/graphql/graphql-query-runner/utils/get-priority-value.util';

export const selectPriorityFieldValue = <T>(
  recordsWithValues: { value: T; recordId: string }[],
  priorityRecordId: string,
): T | null => {
  return getPriorityValue(recordsWithValues, priorityRecordId);
};
