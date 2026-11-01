import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { handleChromiumIssueUnfurl, parseIssueSearchResponse } from '../src/crissue';

const XSSI_PREFIX = ")]}'\n";

// Synthesized from the production crash: for restricted (e.g. security) issues
// the tracker answers with `null` in place of the results array, which used to
// blow up the `issueData[1][0]` destructure with
// "TypeError: Cannot read properties of null (reading '0')".
const restrictedIssueBody = `${XSSI_PREFIX}[["b.IssueSearchResponse",null]]`;

const htmlBody = '<!DOCTYPE html><html><head><title>Sign in</title></head><body></body></html>';

const issueNumber = 511722559;

// Built to match the positions the unfurler destructures out of issueData[1][0]
// (issueDetails sits at index 21, after the six skipped slots that follow fieldMeta)
function buildIssue() {
  const issueDetails: unknown[] = [];
  issueDetails[0] = issueNumber;
  issueDetails[1] = 1; // issueType -> Bug
  issueDetails[2] = 1; // issueStatus -> New
  issueDetails[3] = 2; // issuePriority -> P1
  issueDetails[4] = 3; // issueSeverity -> S2
  issueDetails[5] = 'Title';
  issueDetails[6] = [null, 'opener'];
  issueDetails[7] = null;
  issueDetails[8] = null;
  issueDetails[9] = null;
  issueDetails[14] = []; // issueFieldValues

  const issue: unknown[] = [];
  issue[0] = issueNumber;
  issue[3] = [false, 1700000000000000, 1700000000000000];
  issue[12] = 7; // magicCommentFetchNumber
  issue[14] = []; // fieldMeta
  issue[21] = issueDetails;
  issue[22] = null; // moreIssueDetails
  return issue;
}

const happyListBody = `${XSSI_PREFIX}${JSON.stringify([['b.IssueSearchResponse', [buildIssue()]]])}`;
const happyCommentsBody = `${XSSI_PREFIX}[["b.BatchGetIssueCommentsResponse",null,[[["First comment"]]]]]`;

describe('parseIssueSearchResponse', () => {
  it('returns null for restricted issues', () => {
    expect(parseIssueSearchResponse(restrictedIssueBody)).toBeNull();
  });

  it('returns null for an HTML body', () => {
    expect(parseIssueSearchResponse(htmlBody)).toBeNull();
  });

  it('returns null for an unexpected response type', () => {
    expect(parseIssueSearchResponse(`${XSSI_PREFIX}[["b.SomethingElse",[[1]]]]`)).toBeNull();
  });

  it('returns the results array on the happy path', () => {
    const results = parseIssueSearchResponse(happyListBody);
    expect(results).toHaveLength(1);
    // JSON turns the holes in the sparse fixture (and its nested arrays) into nulls
    expect(results?.[0]).toEqual(JSON.parse(JSON.stringify(buildIssue())));
  });
});

describe('handleChromiumIssueUnfurl', () => {
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

  it('ignores URLs that are not issue links', async () => {
    await expect(handleChromiumIssueUnfurl('https://example.com/issues/1')).resolves.toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('resolves to null for a restricted issue instead of throwing', async () => {
    fetchMock.mockResolvedValueOnce(new Response(restrictedIssueBody, { status: 200 }));

    await expect(
      handleChromiumIssueUnfurl(`https://issues.chromium.org/issues/${issueNumber}`),
    ).resolves.toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('resolves to null for a non-OK response', async () => {
    fetchMock.mockResolvedValueOnce(new Response(htmlBody, { status: 403 }));

    await expect(
      handleChromiumIssueUnfurl(`https://issues.chromium.org/issues/${issueNumber}`),
    ).resolves.toBeNull();
  });

  it('builds an attachment on the happy path', async () => {
    fetchMock
      .mockResolvedValueOnce(new Response(happyListBody, { status: 200 }))
      .mockResolvedValueOnce(new Response(happyCommentsBody, { status: 200 }));

    const attachment = await handleChromiumIssueUnfurl(
      `https://issues.chromium.org/issues/${issueNumber}`,
    );

    expect(attachment).toMatchObject({
      color: '#36B37E',
      author_name: 'opener',
      title: `#${issueNumber} Title`,
      title_link: `https://issues.chromium.org/issues/${issueNumber}`,
      text: 'First comment',
      ts: '1700000000',
      fields: [
        { title: 'Type', value: 'Bug', short: true },
        { title: 'Status', value: 'New', short: true },
        { title: 'Priority', value: 'P1', short: true },
        { title: 'Severity', value: 'S2', short: true },
      ],
    });
  });

  it('still builds an attachment when the comments request fails', async () => {
    fetchMock
      .mockResolvedValueOnce(new Response(happyListBody, { status: 200 }))
      .mockResolvedValueOnce(new Response(htmlBody, { status: 200 }));

    const attachment = await handleChromiumIssueUnfurl(
      `https://issues.chromium.org/issues/${issueNumber}`,
    );

    expect(attachment).toMatchObject({ title: `#${issueNumber} Title`, text: 'Unknown' });
  });
});
