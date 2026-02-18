export function nextId(prefix: string, existingNames: string[]): string {
  const nums = existingNames
    .map((name) => name.match(new RegExp(`^${prefix}_(\\d{4})$`))?.[1])
    .filter((value): value is string => Boolean(value))
    .map((value) => Number(value));

  const nextNum = (nums.length ? Math.max(...nums) : 0) + 1;
  return `${prefix}_${String(nextNum).padStart(4, "0")}`;
}
