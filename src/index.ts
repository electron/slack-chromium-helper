import { App, MessageAttachment } from '@slack/bolt';

import { handleChromiumReviewUnfurl } from './chromium-review';
import { handleChromiumBugUnfurl } from './crbug';
import { handleChromiumSourceUnfurl } from './crsource';
import { getInstallation, storeInstallation } from './db';
import { notNull } from './utils';

const app = new App({
  signingSecret: process.env.SLACK_SIGNING_SECRET,
  clientId: process.env.SLACK_CLIENT_ID,
  clientSecret: process.env.SLACK_CLIENT_SECRET,
  stateSecret: process.env.SLACK_STATE_SECRET,
  scopes: ['links:read', 'links:write'],
  installationStore: {
    storeInstallation: async (installation) => {
      await storeInstallation(installation);
    },
    fetchInstallation: async (installQuery) => {
      const install = await getInstallation(
        installQuery.teamId || null,
        installQuery.enterpriseId || null,
      );
      if (!install) {
        throw new Error(
          `Failed to get install for query: ${installQuery.teamId}/${installQuery.enterpriseId}`,
        );
      }
      return install;
    },
  },
});

app.event('link_shared', async ({ client, body }) => {
  const { message_ts, channel, links } = body.event;

  // Do not unfurl if there are more than three links, we're nice like that
  if (links.length > 3) return;

  const linkUnfurls: Record<string, MessageAttachment> = {};

  // Unfurl all the links at the same time
  await Promise.all(
    links.map(async ({ url }) => {
      const unfurls = await Promise.all([
        handleChromiumReviewUnfurl(url),
        handleChromiumBugUnfurl(url),
        handleChromiumSourceUnfurl(url),
      ]);
      const validUnfurls = notNull(unfurls);
      if (validUnfurls.length > 1) {
        console.error('More than one unfurler responded to a given URL', { url });
      } else if (validUnfurls.length === 1) {
        linkUnfurls[url] = validUnfurls[0];
      }
    }),
  );

  const unfurl = await client.chat.unfurl({
    channel,
    ts: message_ts,
    unfurls: linkUnfurls,
  });

  if (!unfurl.ok) {
    console.error('Failed to unfurl', { unfurl, linkUnfurls });
  }
});

app.start(process.env.PORT ? parseInt(process.env.PORT, 10) : 8080).then((server) => {
  console.log('Chromium Unfurler listening...');
});
