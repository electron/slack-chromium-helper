import { MessageAttachment } from '@slack/bolt';

import { handleChromiumIssueUnfurl } from './crissue';

export function parseBugIdentifier(url: string) {
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

const MAX_REDIRECTS = 5;

function isNewTrackerIssueUrl(url: URL) {
  return url.host === 'issues.chromium.org' && /^\/issues\/\d+/.test(url.pathname);
}

/**
 * Monorail is gone, but crbug.com still redirects Monorail ids to their
 * issues.chromium.org equivalents (possibly via bugs.chromium.org), so we
 * follow that redirect chain by hand and hand the result to the issue unfurler.
 */
export async function resolveLegacyBugUrl(project: string, number: number): Promise<string | null> {
  const candidates = [`https://crbug.com/${project}/${number}`];
  if (project === 'chromium') candidates.push(`https://crbug.com/${number}`);

  for (const candidate of candidates) {
    let current = candidate;
    for (let hop = 0; hop < MAX_REDIRECTS; hop++) {
      const response = await fetch(current, { redirect: 'manual' });
      const location = response.headers.get('location');
      if (!location) break;

      let next: URL;
      try {
        next = new URL(location, current);
      } catch {
        break;
      }

      if (isNewTrackerIssueUrl(next)) return next.toString();
      current = next.toString();
    }
  }

  return null;
}

export async function handleChromiumBugUnfurl(url: string): Promise<MessageAttachment | null> {
  const bugIdentifier = parseBugIdentifier(url);
  if (!bugIdentifier) return null;

  const resolved = await resolveLegacyBugUrl(bugIdentifier.project, bugIdentifier.number);
  if (!resolved) return null;

  const attachment = await handleChromiumIssueUnfurl(resolved);
  if (!attachment) return null;

  // Keep the link the user actually shared as the title link
  return { ...attachment, title_link: url };
}
