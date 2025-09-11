const VIRTUAL_FIELD_KEY_PREFIX = 'virtualField:' as const;

export function buildVirtualFieldKey(objectName: string, fieldName: string): string {
  return `${VIRTUAL_FIELD_KEY_PREFIX}${objectName}:${fieldName}`;
}

export function parseVirtualFieldKey(
  fieldKey: string,
): { objectName: string; fieldName: string } | null {
  if (!fieldKey.startsWith(VIRTUAL_FIELD_KEY_PREFIX)) {
    return null;
  }

  const parts = fieldKey.split(':');
  
  // Expected format: virtualField:objectName:fieldName
  if (parts.length !== 3) {
    return null;
  }

  const [, objectName, fieldName] = parts;

  if (!objectName || !fieldName) {
    return null;
  }

  return { objectName, fieldName };
}