# Fetchers

Fetchers are the internal HTTP layer of `@wlindabla/sonata_spa`. They wrap `@wlindabla/http_client`'s `FetchRequest` and expose a clean, typed API to Page Subscribers.

All fetchers are **internal** — they are instantiated by `SpaKernel.boot()` and injected into the relevant subscribers. You never instantiate them directly.

However, you can interact with their lifecycle via the fetch events (`spa:fetch:*`) dispatched by `FetchDelegateAdapter`.

---

## `PageFetcher`

Used by `ListPageSubscriber`, `ShowPageSubscriber`, and `DashboardSubscriber`.

### Two fetch modes

#### `fetchFragment(url, spaRequest, routeMatch)`

Sends `X-Requested-With: XMLHttpRequest`. The Symfony server can detect this header and return a partial HTML response (only the content area, without the full page layout). Used for list pages, filtered lists, paginated lists, and sorted lists.

```
GET /admin/app/user/list?page=2
Headers: X-Requested-With: XMLHttpRequest
         Accept: text/html
```

#### `fetchFullPage(url, spaRequest, routeMatch)`

No XHR header — the server returns the complete HTML page. Used for show pages and the dashboard, where the full `#app-main` needs to be replaced.

```
GET /admin/app/user/s69db38c053269/show
Headers: Accept: text/html
```

Both methods return a `SpaResponse`:

```typescript
interface SpaResponse {
    html:              string;    // raw HTML
    virtualDoc:        Document;  // DOMParser result
    readonly routeMatch: RouteMatch;
    readonly statusCode: number;
}
```

### Loading state

`PageFetcher` delegates loading state management to `FetchDelegateAdapter`. During fetch:
- `mainContentArea` opacity → `0.4`
- `mainContentArea` pointer events → `none`
- Same for `mainContentHeader` if present

On fetch completion (success or error), full opacity is restored.

---

## `DeleteFetcher`

Used by `DeletePageSubscriber`.

### Two steps

#### Step 1 — `confirmDelete(deleteUrl, spaRequest, routeMatch)`

**GET** the Sonata delete confirmation page.

Why do we need this step? Sonata generates a CSRF token **server-side** for the delete form. Without fetching this token first, any DELETE POST will be rejected with a 403 Forbidden error. This is the correct security behavior — we just need to work with it.

Parses the HTML to extract:

```typescript
{
    csrfToken:    string | null,  // input[name="_sonata_csrf_token"]
    title:        string | null,  // .card-title or .box-title
    message:      string | null,  // .card-body p or .box-body
    btnDeleteText: string | null, // button[type="submit"] text
}
```

Supports both **AdminLTE 4** (`.card-title`, `.card-body`) and **legacy AdminLTE** (`.box-title`, `.box-body`) template structures.

#### Step 2 — `executeDelete(deleteUrl, csrfToken, resource)`

**POST** with:
```
_sonata_csrf_token = <extracted token>
_method            = DELETE
btn_delete         = 1
```

Headers:
```
Accept:             application/json
X-Requested-With:  XMLHttpRequest
```

Returns a `FetchResponseInterface` which `DeletePageSubscriber` inspects for success/failure.

---

## `BatchFetcher`

Used by `BatchPageSubscriber`.

### Two steps

#### Step 1 — `batchConfirmFetcher(batchUrl, formData, spaRequest, routeMatch)`

**POST** the batch form to the Sonata batch URL.

Sonata returns an HTML confirmation page (`batch_confirmation.html.twig`) when `ask_confirmation: true` is set in `configureBatchActions()`. We parse this page to extract:

```typescript
{
    csrfToken:    string,     // _sonata_csrf_token
    title:        string,     // confirmation dialog title
    message:      string,     // confirmation message body
    btnDeleteText: string,    // submit button label
    confirmUrl:   string,     // form action URL for the confirmed POST
    encodedData:  string,     // data field (serialized selection as JSON)
    action:       string,     // batch action name (e.g. 'delete')
    idx:          string[],   // selected record IDs
    allElements:  boolean,    // whether "select all" was used
}
```

**CSRF token extraction**: the CSRF token is mandatory. If it is missing (misconfigured Sonata template), an error is thrown immediately.

Supports both **AdminLTE 4** and **legacy** template structures.

#### Step 2 — `executeBatch(confirmData)`

**POST** with `confirmation=ok` + CSRF token + encoded data:

```
_sonata_csrf_token = <extracted token>
confirmation       = ok
data               = <encodedData>   (preferred — Sonata serialized selection as JSON)
                     OR
action             = delete          (fallback — reconstructed fields)
idx[]              = [id1, id2, ...]
all_elements       = 1               (if applicable)
```

Headers:
```
Accept:             application/json
X-Requested-With:  XMLHttpRequest
```

The `X-Requested-With: XMLHttpRequest` header is critical — it tells an overridden Sonata controller to return JSON instead of an HTML redirect.

---

## `FetchDelegateAdapter`

The bridge between `@wlindabla/http_client`'s `FetchDelegateInterface` and the SPA event system. It translates each HTTP lifecycle callback into a `spa:fetch:*` event dispatched on the `BrowserEventDispatcher`.

| `FetchDelegateInterface` callback | SPA event dispatched |
|---|---|
| `prepareRequest()` | `spa:fetch:prepare` |
| `requestStarted()` | `spa:fetch:started` + loading state ON |
| `requestSucceededWithResponse()` | `spa:fetch:succeeded` |
| `requestFailedWithResponse()` | `spa:fetch:failed` |
| `requestErrored()` | `spa:fetch:errored` + fallback to `window.location.href` (prod only) |
| `requestFinished()` | `spa:fetch:finished` + loading state OFF |

On a **network-level error** (`requestErrored`), the adapter falls back to `window.location.href` in `'prod'` environment only. In `'dev'`, the error is logged and navigation stops, allowing you to inspect it in the console.

All events carry both the native `FetchRequestInterface` object and the original `SpaRequest` that triggered the fetch, so you have full context in your listeners.
