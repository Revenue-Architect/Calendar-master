/* Cloudflare Worker adapter for the Vite-built single-page planner.
 *
 * Sites uses the vinext layout for static assets, so the packaging step places
 * the Vite output under dist/client and this worker under dist/server. */
const worker = {
  async fetch(request, env) {
    const response = await env.ASSETS.fetch(request);
    if (response.status !== 404) return response;
    return env.ASSETS.fetch(new Request(new URL("/index.html", request.url), request));
  },
};

export default worker;
