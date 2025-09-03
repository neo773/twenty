export const buildColumnReference = (
  tableAlias: string,
  fieldName: string,
): string => {
  return `${tableAlias}.${fieldName}`;
};
