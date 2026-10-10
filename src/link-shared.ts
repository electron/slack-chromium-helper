import { MessageAttachment } from '@slack/bolt';

import { unfurlLink } from './unfurl';
import { Unfurler } from './utils';

// The subset of Bolt's middleware args that the link_shared handler actually
// touches, so tests can drive it with a fake client
export type LinkSharedHandlerArgs = {
  client: {
    chat: {
      unfurl: (args: {
        channel: string;
        ts: string;
        unfurls: Record<string, MessageAttachment>;
      }) => Promise<{ ok?: boolean }>;
    };
  };
  body: {
    event: {
      channel: string;
      message_ts: string;
      links: { url: string }[];
    };
  };
};

export function createLinkSharedHandler(unfurlers: Unfurler[]) {
  return async ({ client, body }: LinkSharedHandlerArgs): Promise<void> => {
    const { message_ts, channel, links } = body.event;

    // Do not unfurl if there are more than three links, we're nice like that
    if (links.length > 3) return;

    const linkUnfurls: Record<string, MessageAttachment> = {};

    // Unfurl all the links at the same time
    await Promise.all(
      links.map(async ({ url }) => {
        const unfurl = await unfurlLink(url, unfurlers);
        if (unfurl) linkUnfurls[url] = unfurl;
      }),
    );

    // Nothing to tell Slack about
    if (Object.keys(linkUnfurls).length === 0) return;

    try {
      const unfurl = await client.chat.unfurl({
        channel,
        ts: message_ts,
        unfurls: linkUnfurls,
      });

      if (!unfurl.ok) {
        console.error('Failed to unfurl', { channel, ts: message_ts, unfurl, linkUnfurls });
      }
    } catch (error) {
      // e.g. cannot_find_message when the message was deleted before we got here
      console.error('Failed to unfurl', { channel, ts: message_ts, error });
    }
  };
}
