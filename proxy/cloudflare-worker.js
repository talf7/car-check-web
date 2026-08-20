// CORS proxy for the two data.gov.il datasets this app reads.
//
// data.gov.il answers the browser without an Access-Control-Allow-Origin header,
// so the browser discards the response before the page can read it. Requests that
// do not come from a browser are unaffected — the desktop version of this lookup
// (talf7/car-search-israel) queries the same endpoint with plain HTTP and works.
// This worker is that non-browser client: it fetches the data server-side and
// re-serves it with the header attached.
//
// Deliberately not an open proxy. It forwards only datastore_search, only the two
// resource IDs below, and only for the listed origins, so the URL is useless to
// anyone who finds it.

const UPSTREAM = "https://data.gov.il/api/3/action/datastore_search";

const ALLOWED_RESOURCES = new Set([
  "053cea08-09bc-40ec-8f7a-156f0677aff3", // רכב פרטי ומסחרי (registration)
  "142afde2-6228-49f9-8a29-9b6c3a0cbe40", // WLTP model data
]);

// Add any other origin the page is served from (a custom domain, for example).
const ALLOWED_ORIGINS = new Set([
  "https://talf7.github.io",
]);

const MAX_LIMIT = 50;

function corsHeaders(origin) {
  return { "Access-Control-Allow-Origin": origin, "Vary": "Origin", "Cache-Control": "no-store" };
}

function json(body, status, headers) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...headers, "Content-Type": "application/json; charset=utf-8" },
  });
}

export default {
  async fetch(request) {
    const url = new URL(request.url);
    const origin = request.headers.get("Origin");

    // No Origin at all means a direct visit (typing the URL in a tab, curl):
    // allowed, so the worker stays testable, but served without CORS headers.
    if (origin && !ALLOWED_ORIGINS.has(origin)) {
      return json({ error: "origin not allowed" }, 403, {});
    }
    const cors = origin ? corsHeaders(origin) : {};

    if (request.method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: { ...cors, "Access-Control-Allow-Methods": "GET, OPTIONS", "Access-Control-Max-Age": "86400" },
      });
    }
    if (request.method !== "GET") return json({ error: "method not allowed" }, 405, cors);

    const resourceId = url.searchParams.get("resource_id") || "";
    if (!ALLOWED_RESOURCES.has(resourceId)) {
      return json({ error: "resource_id not allowed" }, 403, cors);
    }

    // Rebuilt parameter by parameter rather than forwarded wholesale, so nothing
    // the caller invents reaches data.gov.il.
    const upstream = new URL(UPSTREAM);
    upstream.searchParams.set("resource_id", resourceId);
    const filters = url.searchParams.get("filters");
    if (filters) upstream.searchParams.set("filters", filters);
    const limit = Number.parseInt(url.searchParams.get("limit") || "1", 10);
    upstream.searchParams.set("limit", String(Math.min(Number.isFinite(limit) && limit > 0 ? limit : 1, MAX_LIMIT)));

    let res;
    try {
      res = await fetch(upstream, { headers: { Accept: "application/json" } });
    } catch (e) {
      return json({ error: "upstream unreachable", detail: String(e) }, 502, cors);
    }

    // The upstream status and body pass through untouched. The page reads the
    // status to name the failure, so an outage or a block at data.gov.il stays
    // visible as itself instead of being flattened into a proxy error.
    return new Response(await res.text(), {
      status: res.status,
      headers: { ...cors, "Content-Type": res.headers.get("Content-Type") || "application/json; charset=utf-8" },
    });
  },
};
