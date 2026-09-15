import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { MessageAttachment } from '@slack/bolt';

import { unfurlLink } from '../src/unfurl';

const url = 'https://example.com/some-link';
const attachment: MessageAttachment = { title: 'An unfurl' };

describe('unfurlLink', () => {
  let errorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('isolates a rejecting unfurler and returns the other result', async () => {
    const boom = new Error('boom');
    async function failing(_url: string) {
      throw boom;
    }
    async function working(_url: string) {
      return attachment;
    }

    await expect(unfurlLink(url, [failing, working])).resolves.toBe(attachment);

    expect(errorSpy).toHaveBeenCalledTimes(1);
    expect(errorSpy).toHaveBeenCalledWith('Unfurler failed', {
      url,
      unfurler: 'failing',
      error: boom,
    });
  });

  it('returns null when every unfurler returns null', async () => {
    const nothing = async (_url: string) => null;

    await expect(unfurlLink(url, [nothing, nothing])).resolves.toBeNull();
    expect(errorSpy).not.toHaveBeenCalled();
  });

  it('returns null and logs when more than one unfurler responds', async () => {
    const responder = async (_url: string) => attachment;

    await expect(unfurlLink(url, [responder, responder])).resolves.toBeNull();

    expect(errorSpy).toHaveBeenCalledTimes(1);
    expect(errorSpy).toHaveBeenCalledWith('More than one unfurler responded to a given URL', {
      url,
    });
  });
});
