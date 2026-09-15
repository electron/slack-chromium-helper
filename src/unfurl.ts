import { MessageAttachment } from '@slack/bolt';

import { Unfurler } from './utils';

/**
 * Runs every unfurler against a single URL. An unfurler that rejects is logged
 * and treated as if it returned null so one flaky upstream can never take the
 * whole link_shared event (or the process) down with it.
 */
export async function unfurlLink(
  url: string,
  unfurlers: Unfurler[],
): Promise<MessageAttachment | null> {
  const results = await Promise.allSettled(unfurlers.map(async (unfurler) => unfurler(url)));

  const validUnfurls: MessageAttachment[] = [];
  results.forEach((result, index) => {
    if (result.status === 'rejected') {
      console.error('Unfurler failed', {
        url,
        unfurler: unfurlers[index].name,
        error: result.reason,
      });
    } else if (result.value) {
      validUnfurls.push(result.value);
    }
  });

  if (validUnfurls.length > 1) {
    console.error('More than one unfurler responded to a given URL', { url });
    return null;
  }

  return validUnfurls[0] ?? null;
}
