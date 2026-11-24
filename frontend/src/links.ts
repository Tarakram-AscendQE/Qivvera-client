/** The legacy hash route that opens a change on one revision. */
export const changeLink = (changeId: unknown, revisionId: unknown): string =>
  `#/changes/${encodeURIComponent(String(changeId))}/revisions/${encodeURIComponent(String(revisionId))}`;
