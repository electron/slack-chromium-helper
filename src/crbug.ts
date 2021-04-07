import fetch from 'node-fetch';

import { Policy, ConstantBackoff } from 'cockatiel';

function parseBugIdentifier(url: string) {
  const parsed = new URL(url);
  if (parsed.host === 'bugs.chromium.org') {
    // https://bugs.chromium.org/p/chromium/issues/detail?id=1195924
    const number = parseInt(parsed.searchParams.get('id') || '', 10);
    if (isNaN(number)) return null;

    const match = /^https:\/\/bugs\.chromium\.org\/p\/([a-z0-9]+)\/issues\/detail/g.exec(url);
    if (!match) return null;

    return {
      project: match[1],
      number,
    };
  } else if (parsed.host === 'crbug.com') {
    // https://crbug.com/12345
    const number = parseInt(parsed.pathname.slice(1), 10);
    if (isNaN(number)) return null;

    return {
      project: 'chromium',
      number,
    };
  }

  return null;
}

const retry = Policy.handleAll().retry().attempts(3).backoff(new ConstantBackoff(250));

async function getMonorailToken() {
  return retry.execute(async () => {
    const url = 'https://bugs.chromium.org/p/chromium';
    const result = await fetch(url);
    const text = await result.text();
    const rgxResult = /.*'token': '([\w\d_-]*)',.*/gi.exec(text);

    if (!rgxResult) {
      throw new Error(`Could not find token in ${url}`);
    }

    return rgxResult[1];
  });
}

async function getMonorailHeaders() {
  return {
    accept: 'application/json',
    'content-type': 'application/json',
    'x-xsrf-token': await getMonorailToken(),
  };
}

type MonorailIssue = {
  statusRef: {
    meansOpen: boolean;
  };
  reporterRef: {
    displayName: string;
    userId: number;
  };
  projectName: string;
  localId: number;
  summary: string;
  openedTimestamp: number;
  componentRefs?: {
    path: string;
  }[];
  labelRefs?: {
    label: string;
  }[];
};
type MonorailComments = {
  content: string;
}[];

export async function handleChromiumBugUnfurl(url: string, message_ts: string, channel: string) {
  const bugIdentifier = parseBugIdentifier(url);
  if (!bugIdentifier) return false;

  const headers = await getMonorailHeaders();
  const monorailQuery = JSON.stringify({
    issueRef: {
      localId: bugIdentifier.number,
      projectName: bugIdentifier.project,
    },
  });
  const response = fetch('https://bugs.chromium.org/prpc/monorail.Issues/GetIssue', {
    method: 'POST',
    headers,
    body: monorailQuery,
  });
  const commentResponse = fetch('https://bugs.chromium.org/prpc/monorail.Issues/ListComments', {
    method: 'POST',
    headers,
    body: monorailQuery,
  });
  if ((await response).status !== 200) return false;
  if ((await commentResponse).status !== 200) return false;

  const { issue }: { issue: MonorailIssue } = JSON.parse((await (await response).text()).slice(4));
  const { comments }: { comments: MonorailComments } = JSON.parse(
    (await (await commentResponse).text()).slice(4),
  );

  const unfurl = await fetch('https://slack.com/api/chat.unfurl', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.SLACK_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      channel,
      ts: message_ts,
      unfurls: {
        [url]: {
          color: issue.statusRef.meansOpen ? '#36B37E' : '#FF5630',
          author_name: issue.reporterRef.displayName,
          // author_icon: owner.avatars && owner.avatars.length ? owner.avatars[owner.avatars.length - 1].url : ':void',
          author_link: `https://bugs.chromium.org/u/${issue.reporterRef.userId}/`,
          fallback: `[${issue.projectName}] #${issue.localId} ${issue.summary}`,
          title: `#${issue.localId} ${issue.summary}`,
          title_link: url,
          footer_icon: 'https://bugs.chromium.org/static/images/monorail.ico',
          text: comments[0].content,
          footer: `<https://bugs.chromium.org/p/${issue.projectName}|crbug/${issue.projectName}>`,
          ts: issue.openedTimestamp * 1000,
          fields: [
            issue.componentRefs && issue.componentRefs.length
              ? {
                  title: 'Components',
                  value: issue.componentRefs
                    .map(
                      (ref) =>
                        `• <https://bugs.chromium.org/p/${
                          issue.projectName
                        }/issues/list?q=component%3A${encodeURIComponent(
                          ref.path,
                        )}|\`${ref.path.replace(/>/g, '→')}\`>`,
                    )
                    .join('\n'),
                  short: true,
                }
              : null,
            issue.labelRefs && issue.labelRefs.length
              ? {
                  title: 'Labels',
                  value: issue.labelRefs
                    .map(
                      (ref) =>
                        `• <https://bugs.chromium.org/p/${
                          issue.projectName
                        }/issues/list?q=label%3A${encodeURIComponent(ref.label)}|\`${ref.label}\`>`,
                    )
                    .join('\n'),
                  short: true,
                }
              : null,
            {
              title: 'Comments',
              value: `${comments.length}`,
              short: true,
            },
          ].filter(Boolean),
        },
      },
    }),
  });
  if (unfurl.status === 200) {
    const resp = await unfurl.json();
    if (!resp.ok) {
      console.error('Failed to unfurl', resp);
    }
  }

  return true;
}
