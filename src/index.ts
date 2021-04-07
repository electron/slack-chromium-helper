import * as express from 'express';

import { handleChromiumReviewUnfurl } from './chromium-review';
import { handleChromiumBugUnfurl } from './crbug';
import { handleChromiumSourceUnfurl } from './crsource';

const app = express();
app.use(require('body-parser').json());

app.post('/slack-event', (req, res) => {
  const type = req.body.type;
  if (type === 'url_verification') {
    return res.send(req.body.challenge);
  } else if (type === 'event_callback') {
    const { team_id, event } = req.body;
    handleChromiumLink(team_id, event).catch(console.error);
    res.send('');
  } else {
    res.send('');
  }
});

app.listen(process.env.PORT || 8080, () => {
  console.log('App listening');
});

type SlackEvent = {
  message_ts: string;
  type: string;
  channel: string;
  links: { url: string }[];
};

async function handleChromiumLink(teamId: string, event: SlackEvent) {
  if (event.type !== 'link_shared') return;

  const { message_ts, channel, links } = event;
  if (!links || !links.length) return;

  const url = links[0].url;
  if (await handleChromiumReviewUnfurl(url, message_ts, channel)) return;
  if (await handleChromiumBugUnfurl(url, message_ts, channel)) return;
  if (await handleChromiumSourceUnfurl(url, message_ts, channel)) return;
}
