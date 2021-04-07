import { App } from '@slack/bolt';

import { handleChromiumReviewUnfurl } from './chromium-review';
import { handleChromiumBugUnfurl } from './crbug';
import { handleChromiumSourceUnfurl } from './crsource';

const app = new App({
  token: process.env.SLACK_TOKEN,
  signingSecret: process.env.SLACK_SIGNING_SECRET,
});

app.event('link_shared', async ({ client, body }) => {
  const { message_ts, channel, links } = body.event;

  // Do not unfurl if there are more than three links, we're nice like that
  if (links.length > 3) return;

  for (const { url } of links) {
    if (await handleChromiumReviewUnfurl(url, message_ts, channel, client)) return;
    if (await handleChromiumBugUnfurl(url, message_ts, channel, client)) return;
    if (await handleChromiumSourceUnfurl(url, message_ts, channel, client)) return;
  }
});

app.start(process.env.PORT ? parseInt(process.env.PORT, 10) : 8080).then(() => {
  console.log('Chromium Unfurler listening...');
});
