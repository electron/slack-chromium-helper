import type { MessageAttachment } from '@slack/types';

export type Unfurler = (url: string) => Promise<MessageAttachment | null>;

export const notNull = <T>(arr: (T | null)[]) => {
  return arr.filter(Boolean) as T[];
};
