import { deLocalizeUrl } from '$lib/utils/i18n';

export const reroute = (request) => deLocalizeUrl(request.url).pathname;
