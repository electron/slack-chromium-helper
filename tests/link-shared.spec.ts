import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { MessageAttachment } from '@slack/bolt';

import { createLinkSharedHandler, LinkSharedHandlerArgs } from '../src/link-shared';

const channel = 'C123';
const message_ts = '1700000000.000100';
const goodUrl = 'https://issues.chromium.org/issues/1';
const badUrl = 'https://crbug.com/2';
const attachment: MessageAttachment = { title: 'An unfurl' };

function makeArgs(urls: string[], unfurl: LinkSharedHandlerArgs['client']['chat']['unfurl']) {
  return {
    client: { chat: { unfurl } },
    body: { event: { channel, message_ts, links: urls.map((url) => ({ url })) } },
  } satisfies LinkSharedHandlerArgs;
}

// Unfurls goodUrl, throws on anything else
async function unfurlsGoodUrl(url: string) {
  if (url === goodUrl) return attachment;
  throw new Error(`cannot handle ${url}`);
}

describe('createLinkSharedHandler', () => {
  beforeEach(() => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('keeps unfurling the other links when an unfurler rejects', async () => {
    const unfurl = vi.fn().mockResolvedValue({ ok: true });
    const handler = createLinkSharedHandler([unfurlsGoodUrl]);

    await expect(handler(makeArgs([badUrl, goodUrl], unfurl))).resolves.toBeUndefined();

    expect(unfurl).toHaveBeenCalledTimes(1);
    expect(unfurl).toHaveBeenCalledWith({
      channel,
      ts: message_ts,
      unfurls: { [goodUrl]: attachment },
    });
  });

  it('does not reject when chat.unfurl fails with cannot_find_message', async () => {
    const unfurl = vi.fn().mockRejectedValue({
      code: 'slack_webapi_platform_error',
      data: { error: 'cannot_find_message' },
    });
    const handler = createLinkSharedHandler([unfurlsGoodUrl]);

    await expect(handler(makeArgs([goodUrl], unfurl))).resolves.toBeUndefined();

    expect(unfurl).toHaveBeenCalledTimes(1);
    expect(console.error).toHaveBeenCalledWith(
      'Failed to unfurl',
      expect.objectContaining({ channel, ts: message_ts }),
    );
  });

  it('ignores messages with more than three links', async () => {
    const unfurl = vi.fn().mockResolvedValue({ ok: true });
    const unfurler = vi.fn().mockResolvedValue(attachment);
    const handler = createLinkSharedHandler([unfurler]);

    await handler(makeArgs([goodUrl, goodUrl, goodUrl, goodUrl], unfurl));

    expect(unfurler).not.toHaveBeenCalled();
    expect(unfurl).not.toHaveBeenCalled();
  });

  it('skips chat.unfurl when nothing was unfurled', async () => {
    const unfurl = vi.fn().mockResolvedValue({ ok: true });
    const handler = createLinkSharedHandler([async () => null]);

    await handler(makeArgs([goodUrl, badUrl], unfurl));

    expect(unfurl).not.toHaveBeenCalled();
  });
});
