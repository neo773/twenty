export const deduplicateByKey = <T>(
  items: T[],
  getKey: (item: T) => string,
): T[] => {
  const seenKeys = new Set<string>();

  return items.filter((item) => {
    const key = getKey(item);

    if (seenKeys.has(key)) {
      return false;
    }
    seenKeys.add(key);

    return true;
  });
};
