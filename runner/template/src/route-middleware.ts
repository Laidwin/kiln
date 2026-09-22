import { defineRouteMiddleware } from '@astrojs/starlight/route-data';

/**
 * Starlight builds edit links from the internal content path (`src/content/docs/…`),
 * but authors edit `docs/…` at the root of their project: point the link there.
 */
export const onRequest = defineRouteMiddleware(({ locals }) => {
	const route = locals.starlightRoute;
	if (route.editUrl) route.editUrl = new URL(route.editUrl.href.replace('/src/content/docs/', '/docs/'));
});
