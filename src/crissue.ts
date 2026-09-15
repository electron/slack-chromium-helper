import { MessageAttachment } from '@slack/bolt';

import { escapeSlackMessage } from './escape';

enum IssueStatus {
  STATUS_UNSPECIFIED = 0,
  NEW = 1,
  ASSIGNED = 2,
  ACCEPTED = 3,
  FIXED = 4,
  VERIFIED = 5,
  NOT_REPRODUCIBLE = 6,
  INTENDED_BEHAVIOR = 7,
  OBSOLETE = 8,
  INFEASIBLE = 9,
  DUPLICATE = 10,
}
const humanFriendlyIssueStatus: Record<IssueStatus, string> = {
  [IssueStatus.STATUS_UNSPECIFIED]: 'Unspecified',
  [IssueStatus.NEW]: 'New',
  [IssueStatus.ASSIGNED]: 'Assigned',
  [IssueStatus.ACCEPTED]: 'Accepted',
  [IssueStatus.FIXED]: 'Fixed',
  [IssueStatus.VERIFIED]: 'Verified',
  [IssueStatus.NOT_REPRODUCIBLE]: 'Not Reproducible',
  [IssueStatus.INTENDED_BEHAVIOR]: 'Intended Behavior',
  [IssueStatus.OBSOLETE]: 'Obsolete',
  [IssueStatus.INFEASIBLE]: 'Infeasible',
  [IssueStatus.DUPLICATE]: 'Duplicate',
};
const issueTypes = [
  ['Bug', 'Unintended behavior'],
  ['Feature Request', 'Request for new functionality'],
  ['Customer Issue', 'Issue affecting a 3rd party'],
  ['Internal Cleanup', 'Maintenance work'],
  ['Process', 'Miscellaneous non-feature work'],
  ['Vulnerability', 'A security concern'],
  ['Privacy Issue', 'A privacy concern'],
  ['Project', 'Goal-driven effort'],
  ['Feature', 'A collection of work'],
  ['Milestone', 'An important achievement'],
  ['Epic', 'A large collection of work'],
  ['Story', 'A small collection of work'],
  ['Task', 'A small unit of work'],
  ['Unspecified', 'Unspecified'],
];

const parseIssueIdentifier = (url: string) => {
  const parsedUrl = new URL(url);
  if (parsedUrl.host === 'issues.chromium.org') {
    // https://issues.chromium.org/issues/40286415
    const parts = parsedUrl.pathname.split('/');
    if (parts[1] === 'issues') {
      return {
        issuesHost: parsedUrl.host,
        issueNumber: parseInt(parts[2], 10),
        issueTracker: 'Chromium',
      };
    }
  }

  return null;
};

// issues.chromium.org prefixes its JSON payloads with `)]}'` as an XSSI guard
const XSSI_PREFIX_LENGTH = 4;

function parseXssiGuardedJson(text: string): unknown {
  return JSON.parse(text.slice(XSSI_PREFIX_LENGTH).trim());
}

/**
 * Parses the body of an issues list request down to the array of matched
 * issues. Returns null for anything that does not look like a search
 * response with at least one result; notably restricted (e.g. security)
 * issues answer with `null` in place of the results array.
 */
export function parseIssueSearchResponse(text: string): unknown[] | null {
  let parsed: unknown;
  try {
    parsed = parseXssiGuardedJson(text);
  } catch {
    return null;
  }
  if (!Array.isArray(parsed)) return null;

  const [issueData] = parsed;
  if (!Array.isArray(issueData) || issueData[0] !== 'b.IssueSearchResponse') return null;

  const results = issueData[1];
  if (!Array.isArray(results) || results.length === 0) return null;

  return results;
}

export async function handleChromiumIssueUnfurl(url: string): Promise<MessageAttachment | null> {
  const issueIdentifier = parseIssueIdentifier(url);
  if (!issueIdentifier) return null;

  const r = await fetch('https://issues.chromium.org/action/issues/list', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
    },
    body: JSON.stringify([`id:${issueIdentifier.issueNumber}`, 250, 'modified_time:desc']),
  });
  if (!r.ok) return null;

  const results = parseIssueSearchResponse(await r.text());
  if (!results) return null;

  const [issue] = results as any[];
  if (!Array.isArray(issue)) return null;

  // The following extraction names are Just Good Guesses
  const [
    issueNumber,
    ,
    respType,
    issueMeta,
    _nullishUnknown,
    _fieldsIds,
    _unixUpdated,
    ,
    ,
    _anotherBooleanUnknown,
    _yetAnotherBooleanUnknown,
    ,
    magicCommentFetchNumber,
    ,
    fieldMeta, // null? // single number in array? [ 3 ] // number // number // number // array of numbers? [ 2, 72, 72 ]
    ,
    ,
    ,
    ,
    ,
    ,
    issueDetails,
    moreIssueDetails,
  ] = issue;

  const [_booleanUnknown, unixCreated, unixUpdated, , , , , , , userInfo] = issueMeta ?? [];

  if (!Array.isArray(issueDetails)) return null;

  const [
    _idMaybe,
    issueType,
    issueStatus,
    issuePriority,
    issueSeverity,
    issueTitle,
    issueOpenerData,
    issueAssigneeData, // null?
    ,
    issueCCData, // array of user data // null? // empty array? // empty array? // hostlist ids maybe?
    ,
    ,
    ,
    ,
    issueFieldValues, // array, need to use fieldsMeta to map to field names
    // there is more
  ] = issueDetails;

  const fields = [];
  for (const value of issueFieldValues ?? []) {
    const fieldId = value?.[0];
    const meta = (fieldMeta ?? []).find((m: any) => m?.[13]?.[0] === fieldId)?.[13];
    if (!meta) continue;

    fields.push({
      id: meta[0],
      name: meta[4],
      // not needed
      // possibleValues: meta[7],
      humanValue: value[9],
      rawValues: (value[5] || value[7] || value[8])?.[0],
    });
  }

  const commentsResp = await fetch('https://issues.chromium.org/action/comments/batch', {
    headers: {
      'content-type': 'application/json',
    },
    body: JSON.stringify([
      'b.BatchGetIssueCommentsRequest',
      null,
      null,
      `${magicCommentFetchNumber}`,
      [issueNumber, [1], 2],
    ]),
    method: 'POST',
  });

  let firstComment: any = null;

  if (commentsResp.ok) {
    try {
      const commentsData: any = parseXssiGuardedJson(await commentsResp.text());
      if (commentsData?.[0]?.[0] === 'b.BatchGetIssueCommentsResponse') {
        firstComment = commentsData[0][2]?.[0]?.[0] ?? null;
      }
    } catch (error) {
      console.error('Failed to parse issue comments', { url, error });
    }
  }

  return {
    color: ![
      IssueStatus.FIXED,
      IssueStatus.DUPLICATE,
      IssueStatus.INFEASIBLE,
      IssueStatus.INTENDED_BEHAVIOR,
      IssueStatus.NOT_REPRODUCIBLE,
      IssueStatus.OBSOLETE,
    ].includes(issueStatus)
      ? '#36B37E'
      : '#FF5630',
    author_name: escapeSlackMessage(issueOpenerData?.[1] ?? 'Unknown'),
    // author_link: `https://bugs.chromium.org/u/${issue.reporterRef.userId}/`,
    fallback: escapeSlackMessage(`[${issueIdentifier.issueTracker}] #${issueNumber} ${issueTitle}`),
    title: escapeSlackMessage(`#${issueNumber} ${issueTitle}`),
    title_link: `https://${issueIdentifier.issuesHost}/issues/${issueNumber}`,
    footer_icon: 'https://upload.wikimedia.org/wikipedia/commons/2/26/Chromium_logo.png',
    text: typeof firstComment?.[0] === 'string' ? escapeSlackMessage(firstComment[0]) : 'Unknown',
    footer: `<https://issues.chromium.org|${issueIdentifier.issueTracker} Issue Tracker>`,
    ts: `${Math.floor(unixCreated / 1000 / 1000)}`,
    fields: [
      {
        title: 'Type',
        value: issueTypes[issueType - 1]?.[0] ?? 'Unknown',
        short: true,
      },
      {
        title: 'Status',
        value: humanFriendlyIssueStatus[issueStatus as IssueStatus] ?? 'Unknown',
        short: true,
      },
      {
        title: 'Priority',
        value: `P${issuePriority - 1}`,
        short: true,
      },
      {
        title: 'Severity',
        value: `S${issueSeverity - 1}`,
        short: true,
      },
    ],
    // fields: notNull([
    //   issue.componentRefs && issue.componentRefs.length
    //     ? {
    //         title: 'Components',
    //         value: issue.componentRefs
    //           .map(
    //             (ref) =>
    //               `• <https://bugs.chromium.org/p/${
    //                 issue.projectName
    //               }/issues/list?q=component%3A${encodeURIComponent(ref.path)}|\`${ref.path.replace(
    //                 />/g,
    //                 '→',
    //               )}\`>`,
    //           )
    //           .join('\n'),
    //         short: true,
    //       }
    //     : null,
    //   issue.labelRefs && issue.labelRefs.length
    //     ? {
    //         title: 'Labels',
    //         value: issue.labelRefs
    //           .map(
    //             (ref) =>
    //               `• <https://bugs.chromium.org/p/${
    //                 issue.projectName
    //               }/issues/list?q=label%3A${encodeURIComponent(ref.label)}|\`${ref.label}\`>`,
    //           )
    //           .join('\n'),
    //         short: true,
    //       }
    //     : null,
    //   {
    //     title: 'Comments',
    //     value: `${comments.length}`,
    //     short: true,
    //   },
    // ]),
  };
}
