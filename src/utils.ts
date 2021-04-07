export const notNull = <T>(arr: (T | null)[]) => {
  return arr.filter(Boolean) as T[];
};
