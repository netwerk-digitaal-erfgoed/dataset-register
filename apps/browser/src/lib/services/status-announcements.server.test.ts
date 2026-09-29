import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const announcementsUrl =
  'https://api.uptimerobot.com/v3/psps/891828/announcements?status=PUBLISHED';

function uptimeRobotAnnouncement(
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    id: 1,
    title: '[DR] Registrations rejected',
    content: 'Schema.org changed its JSON-LD context.',
    status: 'Published',
    type: 'Issue',
    startDate: '2026-09-20T08:00:00.000Z',
    endDate: null,
    ...overrides,
  };
}

function respondWith(...announcements: Record<string, unknown>[]) {
  return Promise.resolve(Response.json({ data: announcements }));
}

// The module keeps its cache across calls, so each test imports a fresh copy.
async function getStatusAnnouncements() {
  const module = await import('./status-announcements.server');
  return module.getStatusAnnouncements();
}

describe('getStatusAnnouncements', () => {
  const fetchMock = vi.fn<typeof fetch>();

  beforeEach(() => {
    vi.resetModules();
    // lru-cache measures its TTL with the performance object it found when first
    // imported, and keeps it across resetModules; so leave the real one in place
    // and make it follow the fake clock.
    vi.useFakeTimers({
      now: new Date('2026-09-29T12:00:00.000Z'),
      toFake: [
        'Date',
        'setTimeout',
        'clearTimeout',
        'setInterval',
        'clearInterval',
      ],
    });
    vi.spyOn(performance, 'now').mockImplementation(() => Date.now());
    vi.stubGlobal('fetch', fetchMock);
    vi.stubEnv('UPTIMEROBOT_API_KEY', 'read-only-key');
    vi.stubEnv('UPTIMEROBOT_STATUS_PAGE_ID', '891828');
  });

  afterEach(() => {
    fetchMock.mockReset();
    vi.useRealTimers();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it('returns nothing without asking UptimeRobot when not configured', async () => {
    vi.stubEnv('UPTIMEROBOT_API_KEY', '');

    expect(await getStatusAnnouncements()).toEqual([]);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('returns this service’s live announcements without their prefix', async () => {
    fetchMock.mockReturnValue(
      respondWith(
        uptimeRobotAnnouncement(),
        uptimeRobotAnnouncement({
          id: 2,
          title: '[DR]Scheduled maintenance',
          type: 'Maintenance',
        }),
        uptimeRobotAnnouncement({
          id: 9,
          title: '[DR] New search',
          type: 'Info',
        }),
        uptimeRobotAnnouncement({ id: 3, title: '[TN] Termennetwerk down' }),
        uptimeRobotAnnouncement({
          id: 4,
          title: 'Problemen bij Termennetwerk',
        }),
        uptimeRobotAnnouncement({ id: 5, status: 'Offline' }),
        uptimeRobotAnnouncement({
          id: 6,
          startDate: '2026-10-01T08:00:00.000Z',
        }),
        uptimeRobotAnnouncement({ id: 7, endDate: '2026-09-28T08:00:00.000Z' }),
        uptimeRobotAnnouncement({ id: 8, startDate: null }),
      ),
    );

    expect(await getStatusAnnouncements()).toEqual([
      {
        id: 1,
        title: 'Registrations rejected',
        content: 'Schema.org changed its JSON-LD context.',
        kind: 'issue',
      },
      {
        id: 2,
        title: 'Scheduled maintenance',
        content: 'Schema.org changed its JSON-LD context.',
        kind: 'maintenance',
      },
      {
        id: 9,
        title: 'New search',
        content: 'Schema.org changed its JSON-LD context.',
        kind: 'info',
      },
    ]);
    expect(fetchMock).toHaveBeenCalledWith(
      announcementsUrl,
      expect.objectContaining({
        headers: { Authorization: 'Bearer read-only-key' },
      }),
    );
  });

  it('turns HTML line breaks into newlines and leaves other markup as text', async () => {
    fetchMock.mockReturnValue(
      respondWith(
        uptimeRobotAnnouncement({ content: 'First <br />second<BR>third <b>' }),
      ),
    );

    const [announcement] = await getStatusAnnouncements();
    expect(announcement.content).toBe('First\nsecond\nthird <b>');
  });

  it('hides an announcement once it ends, without asking UptimeRobot again', async () => {
    fetchMock.mockReturnValue(
      respondWith(
        uptimeRobotAnnouncement({ endDate: '2026-09-29T12:00:30.000Z' }),
      ),
    );
    const { getStatusAnnouncements } =
      await import('./status-announcements.server');

    expect(await getStatusAnnouncements()).toHaveLength(1);
    vi.advanceTimersByTime(40 * 1000);
    expect(await getStatusAnnouncements()).toEqual([]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('serves expired announcements while refreshing them', async () => {
    fetchMock.mockReturnValueOnce(respondWith(uptimeRobotAnnouncement()));
    const { getStatusAnnouncements } =
      await import('./status-announcements.server');
    expect(await getStatusAnnouncements()).toHaveLength(1);

    vi.advanceTimersByTime(2 * 60 * 1000);
    fetchMock.mockReturnValueOnce(respondWith());

    // The refresh is still pending, so the page gets the previous result…
    expect(await getStatusAnnouncements()).toHaveLength(1);
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    // …and the next page the refreshed one.
    await vi.waitFor(async () =>
      expect(await getStatusAnnouncements()).toEqual([]),
    );
  });

  it('keeps the last known announcements when UptimeRobot fails', async () => {
    fetchMock.mockReturnValueOnce(respondWith(uptimeRobotAnnouncement()));
    const { getStatusAnnouncements } =
      await import('./status-announcements.server');
    expect(await getStatusAnnouncements()).toHaveLength(1);

    vi.advanceTimersByTime(2 * 60 * 1000);
    fetchMock.mockResolvedValue(new Response(null, { status: 429 }));
    await getStatusAnnouncements();
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));

    expect(await getStatusAnnouncements()).toHaveLength(1);
  });

  it('returns nothing when UptimeRobot cannot be reached at all', async () => {
    fetchMock.mockRejectedValue(new TypeError('fetch failed'));

    expect(await getStatusAnnouncements()).toEqual([]);
  });
});
