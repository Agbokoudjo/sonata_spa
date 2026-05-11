# Events Reference

`@wlindabla/sonata_spa` uses a Symfony-inspired event system built on top of `@wlindabla/event_dispatcher`. Every stage of the navigation pipeline dispatches a typed event that you can listen to.

**Single source of truth**: all event name constants are in `SpaEvents`.

```typescript
import { SpaEvents } from '@wlindabla/sonata_spa';
```

---

## Navigation lifecycle events

### `spa:request` — `SpaEvents.REQUEST`

**Class**: `SpaRequestEvent`  
**Stoppable**: ✅ Yes — call `event.stopPropagation()` to cancel navigation  
**Dispatched by**: `SpaKernel.handle()`  
**When**: Immediately when a navigation is triggered, before any URL matching

**Use cases**: Block navigation when a form has unsaved changes, show a "Leave page?" dialog.

```typescript
import { SpaEvents, SpaRequestEvent } from '@wlindabla/sonata_spa';

dispatcher.addListener(SpaEvents.REQUEST, (event: SpaRequestEvent) => {
    if (document.querySelector('form.dirty')) {
        const confirmed = confirm('You have unsaved changes. Leave anyway?');
        if (!confirmed) {
            event.stopPropagation(); // cancel navigation
        }
    }
});
```

**Payload**:

| Property | Type | Description |
|---|---|---|
| `event.request` | `SpaRequest` | The navigation request (`url`, `trigger`, `target`) |

---

### `spa:route:resolved` — `SpaEvents.ROUTE_RESOLVED`

**Class**: `SpaRouteResolvedEvent`  
**Stoppable**: ✅ Yes — take full control of this navigation  
**Dispatched by**: `SpaKernel.handle()` after `RouteResolver.resolve()`  
**When**: After the URL has been resolved to a `RouteMatch`

**Use cases**: Override routing for a specific resource, handle a page type not covered by built-in subscribers.

```typescript
import { SpaEvents, SpaRouteResolvedEvent } from '@wlindabla/sonata_spa';

dispatcher.addListener(SpaEvents.ROUTE_RESOLVED, (event: SpaRouteResolvedEvent) => {
    if (event.routeMatch.resource === 'my-special-resource') {
        event.stopPropagation(); // handle it yourself
        mySpecialHandler(event.routeMatch);
    }
});
```

**Payload**:

| Property | Type | Description |
|---|---|---|
| `event.request` | `SpaRequest` | The original navigation request |
| `event.routeMatch` | `RouteMatch` | The resolved page type, resource, token and URL |

---

### `spa:navigate:completed` — `SpaEvents.NAVIGATE_COMPLETED`

**Class**: `SpaNavigateCompletedEvent`  
**Stoppable**: No  
**Dispatched by**: Page Subscribers after full pipeline completion  
**When**: After DOM swap + history push + DomManager reinitialize

**Use cases**: Analytics page tracking, update breadcrumbs, update document title.

```typescript
import { SpaEvents, SpaNavigateCompletedEvent } from '@wlindabla/sonata_spa';

dispatcher.addListener(SpaEvents.NAVIGATE_COMPLETED, (event: SpaNavigateCompletedEvent) => {
    analytics.page({ url: event.to, from: event.from });
    document.title = `Admin — ${event.routeMatch.resource}`;
});
```

**Payload**:

| Property | Type | Description |
|---|---|---|
| `event.from` | `string` | The URL we navigated from |
| `event.to` | `string` | The URL we navigated to |
| `event.routeMatch` | `RouteMatch` | The resolved RouteMatch |
| `event.newMainContainer` | `HTMLElement` | The new main container after swap |
| `event.newMainContentArea` | `HTMLElement` | The new content area after swap |
| `event.newMainContentHeader` | `HTMLElement \| null` | The new content header after swap |

---

### `spa:server:redirect` — `SpaEvents.SERVER_REDIRECT`

**Class**: `SpaServerRedirectEvent`  
**Stoppable**: ✅ Yes — prevents `window.location.href` from being set  
**Dispatched by**: `SpaKernel` when a server-managed URL is detected  
**When**: Before triggering a full page reload

```typescript
dispatcher.addListener(SpaEvents.SERVER_REDIRECT, (event: SpaServerRedirectEvent) => {
    console.log(`Server redirect to ${event.url} — reason: ${event.reason}`);
    // reason: 'server-managed' | 'error-fallback'
});
```

---

## DOM lifecycle events

### `spa:dom:ready` — `SpaEvents.DOM_READY`

**Class**: `SpaDomReadyEvent`  
**Stoppable**: No  
**Dispatched by**: `DomManager.reinitialize()`  
**When**: After all re-initialization (scripts, Stimulus, Bootstrap 5) is complete

**This is the most commonly used event.** Hook into it to re-initialize any third-party library that depends on DOM elements.

```typescript
import { SpaEvents, SpaDomReadyEvent } from '@wlindabla/sonata_spa';

dispatcher.addListener(SpaEvents.DOM_READY, (event: SpaDomReadyEvent) => {
    // event.container is the swapped container element
    // Scope your initialization to avoid touching unrelated parts of the DOM

    // Re-initialize Select2
    $(event.container).find('select.select2').select2();

    // Re-initialize flatpickr
    event.container.querySelectorAll('.datepicker').forEach(el => {
        flatpickr(el, { dateFormat: 'd/m/Y' });
    });

    // Re-initialize DataTables
    event.container.querySelectorAll('table.datatable').forEach(el => {
        $(el).DataTable();
    });
});
```

**Payload**:

| Property | Type | Description |
|---|---|---|
| `event.container` | `HTMLElement` | The swapped container element — scope your init to this |
| `event.routeMatch` | `RouteMatch` | The RouteMatch of the current navigation |

---

### `spa:swap:before` — `SpaEvents.SWAP_BEFORE`

**Class**: `SpaSwapEvent`  
**Stoppable**: ✅ Yes — perform a custom DOM swap  
**Dispatched by**: `DomSwapManager.swap()`  
**When**: Before the DOM swap strategy executes

**Use cases**: Custom swap with CSS animations, custom swap for a specific page type.

```typescript
import { SpaEvents, SpaSwapEvent } from '@wlindabla/sonata_spa';

dispatcher.addListener(SpaEvents.SWAP_BEFORE, (event: SpaSwapEvent) => {
    if (event.routeMatch.resource === 'dashboard') {
        event.stopPropagation(); // prevent built-in swap
        performAnimatedSwap(event.context);
    }
});
```

**Payload**:

| Property | Type | Description |
|---|---|---|
| `event.context` | `SwapContext` | Full swap context with virtualDoc, DOM refs, routeMatch |
| `event.routeMatch` | `RouteMatch` | Shorthand for `event.context.routeMatch` |

---

### `spa:swap:after` — `SpaEvents.SWAP_AFTER`

**Class**: `SpaSwapAfterEvent`  
**Stoppable**: No  
**Dispatched by**: `DomSwapManager.swap()` after strategy execution  

---

## Fetch lifecycle events

These events are dispatched by `FetchDelegateAdapter` at each stage of the HTTP request.

| Event constant | When |
|---|---|
| `SpaEvents.FETCH_PREPARE` | Just before the HTTP request is sent |
| `SpaEvents.FETCH_STARTED` | When the request starts (loading state shown) |
| `SpaEvents.FETCH_SUCCEEDED` | Server returned 2xx |
| `SpaEvents.FETCH_FAILED` | Server returned 4xx or 5xx |
| `SpaEvents.FETCH_ERRORED` | Network error, timeout or abort |
| `SpaEvents.FETCH_FINISHED` | Always — loading state removed |

```typescript
// Show a custom loading indicator
dispatcher.addListener(SpaEvents.FETCH_STARTED, () => {
    document.getElementById('loading-bar')?.classList.add('active');
});

dispatcher.addListener(SpaEvents.FETCH_FINISHED, () => {
    document.getElementById('loading-bar')?.classList.remove('active');
});

// Handle network errors
dispatcher.addListener(SpaEvents.FETCH_ERRORED, (event: SpaFetchErrorEvent) => {
    showToast('Network error — please check your connection.', 'error');
    console.error(event.error);
});
```

---

## CRUD page events

These events are dispatched by `SpaKernel` after route resolution, based on the detected `pageType`.

| Event constant | `pageType` | Handled by |
|---|---|---|
| `SpaEvents.CRUD_LIST` = `'crud:list'` | `'list'` | `ListPageSubscriber` |
| `SpaEvents.CRUD_SHOW` = `'crud:show'` | `'show'` | `ShowPageSubscriber` |
| `SpaEvents.CRUD_DELETE` = `'crud:delete'` | `'delete'` | `DeletePageSubscriber` |
| `SpaEvents.DASHBOARD` = `'spa:dashboard'` | `'dashboard'` | `DashboardSubscriber` |
| `SpaEvents.CRUD_BATCH` = `'crud:batch'` | `'batch'` | `BatchPageSubscriber` |
| `SpaEvents.CRUD_CREATE` = `'crud:create'` | `'create'` | *(server-managed by default)* |
| `SpaEvents.CRUD_EDIT` = `'crud:edit'` | `'edit'` | *(server-managed by default)* |

All CRUD events carry a `SpaCrudEvent`:

```typescript
import { SpaEvents, SpaCrudEvent } from '@wlindabla/sonata_spa';

// Listen to list navigations
dispatcher.addListener(SpaEvents.CRUD_LIST, (event: SpaCrudEvent) => {
    console.log('List navigation:', event.routeMatch.resource);
});
```

---

## Form lifecycle events

| Event constant | When |
|---|---|
| `SpaEvents.FORM_SUBMIT` | FormBindingManager intercepted a form submit |
| `SpaEvents.FORM_SUCCEEDED` | Form POST returned 2xx |
| `SpaEvents.FORM_FAILED` | Form POST returned 4xx/5xx or validation error |

```typescript
dispatcher.addListener(SpaEvents.FORM_SUCCEEDED, (event) => {
    console.log('Form saved for resource:', event.routeMatch.resource);
});

dispatcher.addListener(SpaEvents.FORM_FAILED, (event) => {
    console.error('Form failed with status:', event.statusCode);
});
```

---

## Delete lifecycle events

| Event constant | Class | When |
|---|---|---|
| `SpaEvents.DELETE_CONFIRM_REQUESTED` | `SpaDeleteConfirmRequestedEvent` | Modal should be shown |
| `SpaEvents.DELETE_CONFIRM_CANCELLED` | plain object | User cancelled |
| `SpaEvents.DELETE_PROCESSING` | `SpaDeleteProcessingEvent` | DELETE POST in progress |
| `SpaEvents.DELETE_SUCCEEDED` | `SpaDeleteSucceededEvent` | 2xx response received |
| `SpaEvents.DELETE_FAILED` | `SpaDeleteFailedEvent` | 4xx–599 response received |

### Overriding the default delete confirmation UI

The built-in `DefaultDeletionOperationSubscriber` uses SweetAlert2 at priority `0`.
Register your listener at a **higher priority** to override:

```typescript
dispatcher.addListener(
    SpaEvents.DELETE_CONFIRM_REQUESTED,
    async (event: SpaDeleteConfirmRequestedEvent) => {
        // Your custom confirmation UI
        const confirmed = await myModal.confirm({
            title: event.title ?? 'Confirm deletion?',
            message: event.message ?? 'This action is irreversible.',
            confirmText: event.btnDeleteText ?? 'Delete',
        });

        if (confirmed) {
            await event.accept(); // proceeds with the DELETE POST
        } else {
            event.cancel(); // dispatches DELETE_CONFIRM_CANCELLED
        }
    },
    10 // priority > 0 — runs before DefaultDeletionOperationSubscriber
);
```

### Reacting to delete success

```typescript
dispatcher.addListener(
    SpaEvents.DELETE_SUCCEEDED,
    (event: SpaDeleteSucceededEvent) => {
        myToast.success(event.messageBody, { title: event.title });
    },
    10 // override default SweetAlert2 dialog
);
```

---

## Batch lifecycle events

| Event constant | Class | When |
|---|---|---|
| `SpaEvents.BATCH_CONFIRM_REQUESTED` | `SpaBatchConfirmRequestedEvent` | Modal should be shown |
| `SpaEvents.BATCH_CONFIRM_CANCELLED` | plain object | User cancelled |
| `SpaEvents.BATCH_PROCESSING` | `SpaBatchProcessingEvent` | Batch POST in progress |
| `SpaEvents.BATCH_SUCCEEDED` | `SpaBatchSucceededEvent` | 2xx response received |
| `SpaEvents.BATCH_FAILED` | `SpaBatchFailedEvent` | 4xx–599 response received |

```typescript
dispatcher.addListener(
    SpaEvents.BATCH_CONFIRM_REQUESTED,
    async (event: SpaBatchConfirmRequestedEvent) => {
        const confirmed = await myModal.confirm({
            title: event.confirmData.title ?? 'Execute batch action?',
            message: event.confirmData.message,
            confirmText: event.confirmData.btnDeleteText ?? 'Execute',
        });

        if (confirmed) {
            await event.accept();
        } else {
            event.cancel();
        }
    },
    10
);
```

---

## Complete event table

| Constant | Value | Stoppable | Class |
|---|---|---|---|
| `REQUEST` | `spa:request` | ✅ | `SpaRequestEvent` |
| `ROUTE_RESOLVED` | `spa:route:resolved` | ✅ | `SpaRouteResolvedEvent` |
| `RESPONSE` | `spa:response` | No | `SpaResponseEvent` |
| `NAVIGATE_COMPLETED` | `spa:navigate:completed` | No | `SpaNavigateCompletedEvent` |
| `SERVER_REDIRECT` | `spa:server:redirect` | ✅ | `SpaServerRedirectEvent` |
| `FETCH_PREPARE` | `spa:fetch:prepare` | No | plain object |
| `FETCH_STARTED` | `spa:fetch:started` | No | plain object |
| `FETCH_SUCCEEDED` | `spa:fetch:succeeded` | No | plain object |
| `FETCH_FAILED` | `spa:fetch:failed` | No | plain object |
| `FETCH_ERRORED` | `spa:fetch:errored` | No | `SpaFetchErrorEvent` |
| `FETCH_FINISHED` | `spa:fetch:finished` | No | plain object |
| `SWAP_BEFORE` | `spa:swap:before` | ✅ | `SpaSwapEvent` |
| `SWAP_AFTER` | `spa:swap:after` | No | `SpaSwapAfterEvent` |
| `DOM_READY` | `spa:dom:ready` | No | `SpaDomReadyEvent` |
| `CRUD_LIST` | `crud:list` | No | `SpaCrudEvent` |
| `CRUD_SHOW` | `crud:show` | No | `SpaCrudEvent` |
| `CRUD_DELETE` | `crud:delete` | No | `SpaCrudEvent` |
| `CRUD_BATCH` | `crud:batch` | No | `SpaCrudEvent` |
| `DASHBOARD` | `spa:dashboard` | No | `SpaCrudEvent` |
| `FORM_SUBMIT` | `spa:form:submit` | No | `SpaFormSubmitEvent` |
| `FORM_SUCCEEDED` | `spa:form:succeeded` | No | plain object |
| `FORM_FAILED` | `spa:form:failed` | No | plain object |
| `DELETE_CONFIRM_REQUESTED` | `spa:delete:confirm:requested` | No | `SpaDeleteConfirmRequestedEvent` |
| `DELETE_PROCESSING` | `spa:delete:processing` | No | `SpaDeleteProcessingEvent` |
| `DELETE_SUCCEEDED` | `spa:delete:succeeded` | No | `SpaDeleteSucceededEvent` |
| `DELETE_FAILED` | `spa:delete:failed` | No | `SpaDeleteFailedEvent` |
| `BATCH_CONFIRM_REQUESTED` | `spa:batch:confirm:requested` | No | `SpaBatchConfirmRequestedEvent` |
| `BATCH_PROCESSING` | `spa:batch:processing` | No | `SpaBatchProcessingEvent` |
| `BATCH_SUCCEEDED` | `spa:batch:succeeded` | No | `SpaBatchSucceededEvent` |
| `BATCH_FAILED` | `spa:batch:failed` | No | `SpaBatchFailedEvent` |
