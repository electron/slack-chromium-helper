const express = require('express');

const handleChromiumReviewUnfurl = require('./chromium-review');
const handleChromiumBugUnfurl = require('./crbug');
const handleChromiumSourceUnfurl = require('./crsource');

const app = express();
app.use(require('body-parser').json());

app.post('/slack-event', (req, res) => {
  const type = req.body.type;
  if (type === 'url_verification') {
    return res.send(req.body.challenge);
  } else if (type === 'event_callback') {
    const { team_id, event, token } = req.body;
    handleChromiumLink(team_id, event, token).catch(console.error);
    res.send('');
  } else {
    res.send('');
  }
});

app.listen(process.env.PORT || 8080, () => {
  console.log('App listening');
});

async function handleChromiumLink(teamId, event, token) {
  if (event.type !== 'link_shared') return;

  const { message_ts, channel, links } = event;
  if (!links || !links.length) return;

  const url = links[0].url;
  if (await handleChromiumReviewUnfurl(url, message_ts, channel)) return;
  if (await handleChromiumBugUnfurl(url, message_ts, channel)) return;
  if (await handleChromiumSourceUnfurl(url, message_ts, channel)) return;
}
