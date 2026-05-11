# Types Reference

All types are exported from `@wlindabla/sonata_spa/types`:

```typescript
import type { RouteMatch, SpaRequest, SpaResponse, ... } from '@wlindabla/sonata_spa/types';
// or directly:
import type { RouteMatch } from '@wlindabla/sonata_spa';
```

---

## `CRUDPageType`

The page type detected by `RouteResolver` from the Sonata URL.

```typescript
type CRUDPageType =
    | 'list'       // /admin/{prefix}/{resource}/list
    | 'show'       // /admin/{prefix}/{resource}/{token}/show
    | 'create'     // /admin/{prefix}/{resource}/create
    | 'edit'       // /admin/{prefix}/{resource}/{token}/edit
    | 'delete'     // /admin/{prefix}/{resource}/{token}/delete
    | 'dashboard'  // /admin/dashboard
    | 'batch'      // /admin/{prefix}/{resource}/batch
    | 'unknown';
```

---

## `RouteMatch`

The result of URL resolution by `RouteResolver`. Frontend equivalent of Symfony's `RouteMatch`.

```typescript
interface RouteMatch {
    readonly pageType: CRUDPageType;
    readonly resource: string;       // e.g. 'user', 'product'
    readonly token?:   string;       // e.g. 's69db38c053269' — present for show/edit/delete
    readonly url:      string;       // full resolved URL
}
```

**Examples**:

```
/admin/app/user/list
→ { pageType: 'list', resource: 'user', token: undefined, url: '...' }

/admin/app/user/s69db38c053269/show
→ { pageType: 'show', resource: 'user', token: 's69db38c053269', url: '...' }

/admin/dashboard
→ { pageType: 'dashboard', resource: 'dashboard', token: undefined, url: '...' }
```

---

## `SpaRequest`

Represents a SPA navigation request. Created by `BindingManagers` and passed to `SpaKernel.handle()`.

```typescript
interface SpaRequest {
    readonly url:      string;
    readonly target?:  HTMLElement;          // element that triggered the navigation
    readonly trigger:  'click' | 'popstate' | 'programmatic' | 'batch';
}
```

---

## `SpaResponse`

The response received from the server. Mutable — can be modified in `SpaResponseEvent` before the DOM swap.

```typescript
interface SpaResponse {
    html:              string;     // raw HTML from server (mutable)
    virtualDoc:        Document;   // DOMParser result — ready for swap
    readonly routeMatch: RouteMatch;
    readonly statusCode: number;
}
```

---

## `SwapContext`

Passed to `DomSwapManager` and all `SwapStrategy` implementations.

```typescript
interface SwapContext {
    readonly response:           SpaResponse;
    readonly routeMatch:         RouteMatch;
    readonly mainContainer:      HTMLElement;
    readonly mainContentArea:    HTMLElement;
    readonly mainContentHeader:  HTMLElement | null;
}
```

---

## `SpaRouterOptions`

See [CONFIGURATION.md](./CONFIGURATION.md) for the full reference.

---

## `FetchConfirmDeleteOptions`

Data extracted from the Sonata delete confirmation page by `DeleteFetcher`.

```typescript
interface FetchConfirmDeleteOptions {
    readonly csrfToken:    string | null;
    readonly title:        string | null;
    readonly message:      string | null;
    readonly btnDeleteText: string | null;
}
```

---

## `BatchConfirmData`

Data extracted from the Sonata batch confirmation page by `BatchFetcher`.

```typescript
interface BatchConfirmData {
    title:       string;
    message:     string;
    confirmUrl:  string;     // form action URL for the confirmed POST
    csrfToken:   string;     // _sonata_csrf_token
    encodedData: string;     // serialized selection (JSON)
    action:      string;     // e.g. 'delete'
    idx:         string[];   // selected IDs
    allElements: boolean;
    btnDeleteText: string;
}
```

---

## `SpaRedirectType`

The type of redirect resolved after a successful form submission. Mirrors Symfony's `redirectTo()` logic.

```typescript
type SpaRedirectType =
    | 'list'   // btn_update_and_list, btn_create_and_list
    | 'create' // btn_create_and_create
    | 'edit'   // default after edit
    | 'show'   // default after edit when no edit route
    | 'url';   // explicit URL from Location header or response body
```

---

## `SonataSubmitButton`

Constants for Sonata submit button names:

```typescript
import { SonataSubmitButton } from '@wlindabla/sonata_spa';

SonataSubmitButton.UPDATE_AND_LIST   // 'btn_update_and_list'
SonataSubmitButton.UPDATE_AND_EDIT   // 'btn_update_and_edit'
SonataSubmitButton.UPDATE            // 'btn_update'
SonataSubmitButton.CREATE_AND_LIST   // 'btn_create_and_list'
SonataSubmitButton.CREATE_AND_EDIT   // 'btn_create_and_edit'
SonataSubmitButton.CREATE_AND_CREATE // 'btn_create_and_create'
SonataSubmitButton.CREATE            // 'btn_create'
SonataSubmitButton.PREVIEW           // 'btn_preview'
```
