import { building } from '$app/environment';
import { getStatusAnnouncements } from '$lib/services/status-announcements.server';

// Prerendered pages (/changes) are built once, so a banner baked into them would
// outlive the announcement; they get none.
export const load = async () => ({
  statusAnnouncements: building ? [] : await getStatusAnnouncements(),
});
