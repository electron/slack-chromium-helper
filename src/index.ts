import { App } from '@slack/bolt';

import { handleChromiumReviewUnfurl } from './chromium-review';
import { handleChromiumBugUnfurl } from './crbug';
import { handleChromiumSourceUnfurl } from './crsource';
import { getInstallation, storeInstallation } from './db';
import { handleChromiumIssueUnfurl } from './crissue';
import { createLinkSharedHandler } from './link-shared';

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

// Bolt's default error handler rethrows, and the HTTP receiver then tries to
// write a 500 on a response that was already acked with a 200. That surfaces as
// an uncaught ERR_HTTP_HEADERS_SENT and takes the whole process down, so log
// and move on instead.
app.error(async (error) => {
  console.error('Unhandled error while processing a Slack event', error);
});

app.event(
  'link_shared',
  createLinkSharedHandler([
    handleChromiumReviewUnfurl,
    handleChromiumBugUnfurl,
    handleChromiumSourceUnfurl,
    handleChromiumIssueUnfurl,
  ]),
);

app.start(process.env.PORT ? parseInt(process.env.PORT, 10) : 8080).then((server) => {
  console.log('Chromium Unfurler listening...');
});
