// Announcements from the NDE status page (UptimeRobot), shown as a banner at the
// top of every page. The status page is shared by all NDE services and an
// announcement carries no tags, so a title prefix scopes it to a service: this
// app shows only announcements titled “[DR] …”.
//
// `.server.ts` keeps the UptimeRobot API key out of the browser bundle.
//
// Design:
//   - Opt-in: without UPTIMEROBOT_API_KEY and UPTIMEROBOT_STATUS_PAGE_ID (CI,
//     tests, local dev) there is no request and no banner.
//   - Stale-while-revalidate: once the first response is in, a page render never
//     waits for UptimeRobot; an expired entry is served while it refreshes.
//   - Fail open: a slow, failing or malformed response keeps the last known
//     announcements (none before the first success), so the page never breaks.
//   - The start and end dates are checked on every call, not when fetching, so an
//     announcement appears and disappears on time regardless of the cache.
import { LRUCache } from 'lru-cache';

export interface StatusAnnouncement {
  id: number;
  title: string;
  content: string;
  kind: 'issue' | 'maintenance' | 'info';
}

/**
 * Announcements currently published for this service. Never rejects: returns an
 * empty list when the status page is not configured or cannot be reached.
 */
export async function getStatusAnnouncements(): Promise<StatusAnnouncement[]> {
  const statusPageId = process.env.UPTIMEROBOT_STATUS_PAGE_ID;
  if (!statusPageId || !process.env.UPTIMEROBOT_API_KEY) return [];

  const announcements = (await cache.fetch(statusPageId)) ?? [];
  const now = new Date();

  return announcements
    .filter(
      ({ startDate, endDate }) =>
        startDate <= now && (endDate === null || endDate > now),
    )
    .map(({ id, title, content, kind }) => ({
      id,
      title,
      content,
      kind,
    }));
}

const TITLE_PREFIX = '[DR]';

// UptimeRobot’s rate limit is 10 requests per minute on the free plan, shared by
// every pod and every other API client on the account.
const TTL_MILLISECONDS = 60 * 1000;
const TIMEOUT_MILLISECONDS = 2000;

interface ScheduledAnnouncement extends StatusAnnouncement {
  startDate: Date;
  endDate: Date | null;
}

interface UptimeRobotAnnouncement {
  id: number;
  title: string | null;
  content: string | null;
  status: string | null;
  type: string | null;
  startDate: string | null;
  endDate: string | null;
}

const cache = new LRUCache<string, ScheduledAnnouncement[]>({
  max: 1,
  ttl: TTL_MILLISECONDS,
  allowStale: true,
  fetchMethod: async (statusPageId, staleAnnouncements) => {
    try {
      return await fetchAnnouncements(statusPageId);
    } catch {
      return staleAnnouncements ?? [];
    }
  },
});

async function fetchAnnouncements(
  statusPageId: string,
): Promise<ScheduledAnnouncement[]> {
  // Newest first; the first page holds far more published announcements than a
  // status page ever has at once.
  const response = await fetch(
    `https://api.uptimerobot.com/v3/psps/${encodeURIComponent(statusPageId)}/announcements?status=PUBLISHED`,
    {
      headers: { Authorization: `Bearer ${process.env.UPTIMEROBOT_API_KEY}` },
      signal: AbortSignal.timeout(TIMEOUT_MILLISECONDS),
    },
  );
  if (!response.ok) {
    throw new Error(`UptimeRobot responded with ${response.status}`);
  }
  const { data } = (await response.json()) as {
    data: UptimeRobotAnnouncement[];
  };

  return data.flatMap((announcement) => {
    const { id, title, content, status, type, startDate, endDate } =
      announcement;
    if (
      status !== 'Published' ||
      !title?.startsWith(TITLE_PREFIX) ||
      startDate === null
    ) {
      return [];
    }
    return [
      {
        id,
        title: title.slice(TITLE_PREFIX.length).trim(),
        // Rendered as plain text; a line break typed as HTML still breaks the line.
        content: (content ?? '').replace(/\s*<br\s*\/?>\s*/gi, '\n'),
        kind:
          type === 'Issue'
            ? 'issue'
            : type === 'Maintenance'
              ? 'maintenance'
              : 'info',
        startDate: new Date(startDate),
        endDate: endDate === null ? null : new Date(endDate),
      },
    ];
  });
}
