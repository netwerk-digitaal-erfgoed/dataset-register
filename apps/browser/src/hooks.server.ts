import type { Handle } from '@sveltejs/kit/hooks';
import { paraglideMiddleware } from '$lib/paraglide/server';

const handleParaglide: Handle = ({ event, resolve }) =>
  paraglideMiddleware(event.request, ({ request, locale }) => {
    // SvelteKit 3 types `event.request` as read-only, but Paraglide’s documented
    // integration still hands the de-localised request on by assigning it.
    (event as { request: Request }).request = request;

    return resolve(event, {
      transformPageChunk: ({ html }) =>
        html.replace('%paraglide.lang%', locale),
      filterSerializedResponseHeaders: (name) => name === 'content-type',
    });
  });

export const handle: Handle = handleParaglide;
