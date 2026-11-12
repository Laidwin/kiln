import { defineRouteMiddleware } from '@astrojs/starlight/route-data';
import includes from './kiln-includes.json';

/**
 * Starlight builds edit links from the internal content path (`src/content/docs/…`),
 * but authors edit `docs/…` at the root of their project: point the link there.
 * Pages of docs.yml `include` point at their own file.
 */
export const onRequest = defineRouteMiddleware(({ locals }) => {
	const route = locals.starlightRoute;
	const include = includes.find((i) => i.id === route.entry.id);
	if (include) {
		route.editUrl = include.editUrl ? new URL(include.editUrl) : undefined;
		return;
	}
	if (route.editUrl) route.editUrl = new URL(route.editUrl.href.replace('/src/content/docs/', '/docs/'));
});
