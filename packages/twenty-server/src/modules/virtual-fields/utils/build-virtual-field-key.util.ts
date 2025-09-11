export function buildVirtualFieldKey(objectName: string, fieldName: string): string {
  return `virtualField:${objectName}:${fieldName}`;
}