export const buildTableAlias = (objectName: string, step: number): string => {
  return `${objectName}_${step}`;
};
