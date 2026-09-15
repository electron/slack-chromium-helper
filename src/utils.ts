import { MessageAttachment } from '@slack/bolt';

export type Unfurler = (url: string) => Promise<MessageAttachment | null>;

export const notNull = <T>(arr: (T | null)[]) => {
  return arr.filter(Boolean) as T[];
};
