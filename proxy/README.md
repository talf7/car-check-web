# CORS proxy

## Why this exists

`data.gov.il` serves this app's datasets correctly — opening the API URL in a
browser tab returns the records. It does not serve them *to this page*: the
response arrives without an `Access-Control-Allow-Origin` header, so the browser
discards it before any code runs. The page reports this as
"החיבור תקין, אך הדפדפן חסם את התשובה".

Nothing in `index.html` can work around that. CORS is enforced by the browser, on
the browser's side, and the only way past it is for the request to be made by
something that is not a browser. The desktop version of this lookup
(`talf7/car-search-israel`) queries the same endpoint with plain HTTP, no special
headers, and works — so a server-side fetch gets the data.

These two files are that server-side fetch. Deploy **one** of them.

Neither is an open proxy: each forwards only `datastore_search`, only the two
resource IDs this app reads, and only for the origins listed at the top of the
file. Both pass the upstream status through untouched, so a failure at
data.gov.il still shows up in the page as itself rather than as a proxy error.

## Option A — Cloudflare Worker (free, no server needed)

1. Sign in at <https://dash.cloudflare.com> → **Workers & Pages** → **Create** →
   **Start with Hello World!** → **Deploy**.
2. **Edit code**, replace everything with `cloudflare-worker.js`, **Deploy**.
3. Copy the worker URL, e.g. `https://car-check-proxy.<name>.workers.dev`.

Free plan allows 100,000 requests/day.

## Option B — PHP host

Upload `proxy.php` to any host that runs PHP with cURL, e.g.
`https://example.co.il/car-proxy.php`.

## Wiring it up

Set `PROXY_BASE` near the top of the `<script>` block in `index.html` to the URL
you deployed:

```js
const PROXY_BASE = "https://car-check-proxy.<name>.workers.dev";
```

Leave it `""` to call data.gov.il directly.

## Checking it works

Open the proxy URL in a tab with a resource id appended:

```
<your-proxy-url>?resource_id=053cea08-09bc-40ec-8f7a-156f0677aff3&limit=1
```

JSON with `"success": true` means the proxy is reaching data.gov.il. Anything
else is reported verbatim, so the body says what went wrong.

If the proxy itself gets blocked by data.gov.il, the page will now say
`השרת של <proxy host> חסם את הבקשה` with the status code — a different message
from the CORS one, so the two cases stay distinguishable.
