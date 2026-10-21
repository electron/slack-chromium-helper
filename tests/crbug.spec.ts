import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { handleChromiumBugUnfurl, parseBugIdentifier, resolveLegacyBugUrl } from '../src/crbug';

const newTrackerUrl = 'https://issues.chromium.org/issues/40761008';

function redirectTo(location: string) {
  return new Response(null, { status: 302, headers: { location } });
}

describe('parseBugIdentifier', () => {
  it('parses crbug.com short links', () => {
    expect(parseBugIdentifier('https://crbug.com/1195924')).toEqual({
      project: 'chromium',
      number: 1195924,
    });
  });

  it('parses bugs.chromium.org chromium links', () => {
    expect(
      parseBugIdentifier('https://bugs.chromium.org/p/chromium/issues/detail?id=1195924'),
    ).toEqual({ project: 'chromium', number: 1195924 });
  });

  it('parses bugs.chromium.org links for other projects', () => {
    expect(parseBugIdentifier('https://bugs.chromium.org/p/v8/issues/detail?id=1')).toEqual({
      project: 'v8',
      number: 1,
    });
  });

  it('returns null for unrelated URLs', () => {
    expect(parseBugIdentifier('https://example.com/p/chromium/issues/detail?id=1')).toBeNull();
    expect(parseBugIdentifier('https://crbug.com/not-a-number')).toBeNull();
  });
});

describe('with a stubbed fetch', () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    vi.stubGlobal('fetch', fetchMock);
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    fetchMock.mockReset();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  describe('resolveLegacyBugUrl', () => {
    it('follows a redirect to the new tracker', async () => {
      fetchMock.mockResolvedValueOnce(redirectTo(newTrackerUrl));

      await expect(resolveLegacyBugUrl('chromium', 1195924)).resolves.toBe(newTrackerUrl);
      expect(fetchMock).toHaveBeenCalledWith('https://crbug.com/chromium/1195924', {
        redirect: 'manual',
      });
    });

    it('follows a redirect chain through bugs.chromium.org', async () => {
      fetchMock
        .mockResolvedValueOnce(
          redirectTo('https://bugs.chromium.org/p/chromium/issues/detail?id=1195924'),
        )
        .mockResolvedValueOnce(redirectTo(newTrackerUrl));

      await expect(resolveLegacyBugUrl('chromium', 1195924)).resolves.toBe(newTrackerUrl);
      expect(fetchMock).toHaveBeenCalledTimes(2);
    });

    it('falls back to the project-less crbug.com URL for chromium', async () => {
      fetchMock
        .mockResolvedValueOnce(new Response('nope', { status: 200 }))
        .mockResolvedValueOnce(redirectTo(newTrackerUrl));

      await expect(resolveLegacyBugUrl('chromium', 1195924)).resolves.toBe(newTrackerUrl);
      expect(fetchMock).toHaveBeenNthCalledWith(2, 'https://crbug.com/1195924', {
        redirect: 'manual',
      });
    });

    it('returns null when there is no redirect', async () => {
      fetchMock.mockResolvedValue(new Response('nope', { status: 200 }));

      await expect(resolveLegacyBugUrl('v8', 1)).resolves.toBeNull();
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it('returns null when the redirect does not land on the new tracker', async () => {
      fetchMock.mockResolvedValue(redirectTo('https://www.google.com/'));

      await expect(resolveLegacyBugUrl('v8', 1)).resolves.toBeNull();
    });
  });

  describe('handleChromiumBugUnfurl', () => {
    it('resolves to null without throwing when there is no redirect', async () => {
      fetchMock.mockResolvedValue(new Response('nope', { status: 200 }));

      await expect(handleChromiumBugUnfurl('https://crbug.com/1195924')).resolves.toBeNull();
    });

    it('ignores unrelated URLs without fetching', async () => {
      await expect(handleChromiumBugUnfurl('https://example.com/1195924')).resolves.toBeNull();
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it('delegates to the issue unfurler and keeps the shared link as the title link', async () => {
      const issue: unknown[] = [];
      issue[0] = 40761008;
      issue[3] = [false, 1700000000000000, 1700000000000000];
      issue[12] = 7;
      issue[14] = [];
      const details: unknown[] = [40761008, 1, 1, 2, 3, 'Title', [null, 'opener']];
      details[14] = [];
      issue[21] = details;

      fetchMock
        .mockResolvedValueOnce(redirectTo(newTrackerUrl))
        .mockResolvedValueOnce(
          new Response(`)]}'\n${JSON.stringify([['b.IssueSearchResponse', [issue]]])}`),
        )
        .mockResolvedValueOnce(
          new Response(`)]}'\n[["b.BatchGetIssueCommentsResponse",null,[[["First comment"]]]]]`),
        );

      await expect(handleChromiumBugUnfurl('https://crbug.com/1195924')).resolves.toMatchObject({
        title: '#40761008 Title',
        title_link: 'https://crbug.com/1195924',
        text: 'First comment',
      });
    });
  });
});
