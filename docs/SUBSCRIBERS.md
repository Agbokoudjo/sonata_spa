# Subscribers

`@wlindabla/sonata_spa` ships with a set of built-in event subscribers that handle the full navigation pipeline. Each subscriber is responsible for one specific page type or lifecycle concern.

---

## Built-in subscribers overview

| Subscriber | Listens to | Responsibility |
|---|---|---|
| `ListPageSubscriber` | `crud:list` | Fetch fragment + surgical swap for list pages |
| `ShowPageSubscriber` | `crud:show` | Fetch full page + full #app-main swap for show pages |
| `DashboardSubscriber` | `spa:dashboard` | Fetch full page + full #app-main swap for dashboard |
| `DeletePageSubscriber` | `crud:delete` | Fetch CSRF + confirmation modal + DELETE POST |
| `DefaultDeletionOperationSubscriber` | `spa:delete:*` | Default SweetAlert2 UI for delete lifecycle |
| `BatchPageSubscriber` | `crud:batch` | Fetch confirmation page + batch POST |
| `DefaultBatchSubscriber` | `spa:batch:*` | Default SweetAlert2 UI for batch lifecycle |
| `FormSubscriber` | `spa:form:submit` | Handle form POST via `@wlindabla/form_validator` FormSubmission |
| `SonataHttpRequestSubscriber` | HTTP events | Bridges `@wlindabla/form_validator` HTTP request subscriber |

All subscribers are registered automatically by `SpaKernel.boot()`. You do not need to instantiate them.

---

## ListPageSubscriber

**Event**: `SpaEvents.CRUD_LIST` (`crud:list`)  
**Priority**: 0

Handles navigation to any Sonata list page.

**Pipeline**:
1. If coming from dashboard or a different resource → `PageFetcher.fetchFullPage()`
2. If already on the same resource (pagination, filter, sort) → `PageFetcher.fetchFragment()` with `X-Requested-With: XMLHttpRequest`
3. `DomSwapManager.swap()` → `ListSwapStrategy` (surgical swap of filters + data table)
4. `HistoryManager.push()`
5. `DomManager.reinitialize()` → dispatch `spa:dom:ready`
6. dispatch `spa:navigate:completed`

The transition between `fetchFragment` and `fetchFullPage` is determined automatically based on `RouteResolver.needsFullPage()` and `RouteResolver.isSameResource()`.

---

## ShowPageSubscriber

**Event**: `SpaEvents.CRUD_SHOW` (`crud:show`)  
**Priority**: 0

Handles navigation to any Sonata show page.

**Pipeline**:
1. `PageFetcher.fetchFullPage()` — show pages have completely different layouts
2. `DomSwapManager.swap()` → `ShowSwapStrategy` (replaces full `#app-main` content)
3. `HistoryManager.push()`
4. `DomManager.reinitialize()` → dispatch `spa:dom:ready`
5. dispatch `spa:navigate:completed`

---

## DashboardSubscriber

**Event**: `SpaEvents.DASHBOARD` (`spa:dashboard`)  
**Priority**: 0

Handles navigation to the SonataAdmin dashboard.

Same pipeline as `ShowPageSubscriber` — the dashboard is a full page swap.

---

## DeletePageSubscriber

**Event**: `SpaEvents.CRUD_DELETE` (`crud:delete`)  
**Priority**: 0

Handles the two-step Sonata delete flow.

**Pipeline**:
1. `DeleteFetcher.confirmDelete(url)` — GET the delete confirmation page → extract CSRF token, title, message, button text
2. dispatch `spa:delete:confirm:requested` → `DefaultDeletionOperationSubscriber` shows SweetAlert2
3. User confirms → `event.accept()` is called
4. dispatch `spa:delete:processing`
5. `DeleteFetcher.executeDelete(url, csrfToken)` — POST with CSRF token + `_method=DELETE`
6. On 2xx → dispatch `spa:delete:succeeded` → navigate to list after 3 seconds
7. On 4xx–599 → dispatch `spa:delete:failed`

---

## DefaultDeletionOperationSubscriber

**Events**: `DELETE_CONFIRM_REQUESTED`, `DELETE_PROCESSING`, `DELETE_SUCCEEDED`, `DELETE_FAILED`  
**Priority**: 0 on all events

Provides the default UI for the entire delete lifecycle using SweetAlert2 and the dialog helpers from `@wlindabla/form_validator`.

### Overriding the default UI

Register your listener at **priority > 0** to run before this subscriber:

```typescript
import {
    SpaEvents,
    SpaDeleteConfirmRequestedEvent,
    SpaDeleteSucceededEvent,
    SpaDeleteFailedEvent,
    SpaDeleteProcessingEvent
} from '@wlindabla/sonata_spa';

// Override confirmation modal
dispatcher.addListener(
    SpaEvents.DELETE_CONFIRM_REQUESTED,
    async (event: SpaDeleteConfirmRequestedEvent) => {
        const confirmed = await myConfirmModal.show({
            title: event.title ?? 'Delete this item?',
            message: event.message,
            confirmText: event.btnDeleteText ?? 'Delete',
        });

        if (confirmed) {
            await event.accept();
        } else {
            event.cancel();
        }
    },
    10  // priority > 0
);

// Override processing indicator
dispatcher.addListener(
    SpaEvents.DELETE_PROCESSING,
    (event: SpaDeleteProcessingEvent) => {
        myLoadingBar.show(event.title);
    },
    10
);

// Override success notification
dispatcher.addListener(
    SpaEvents.DELETE_SUCCEEDED,
    (event: SpaDeleteSucceededEvent) => {
        myToast.success(event.messageBody, { title: event.title });
    },
    10
);

// Override error notification
dispatcher.addListener(
    SpaEvents.DELETE_FAILED,
    (event: SpaDeleteFailedEvent) => {
        myToast.error(`${event.statusCode} — ${event.statusText}`, { title: event.title });
    },
    10
);
```

---

## BatchPageSubscriber

**Event**: `SpaEvents.CRUD_BATCH` (`crud:batch`)  
**Priority**: 0

Handles the two-step Sonata batch flow.

**Pipeline**:
1. Read the submitted batch form — check that at least one item is selected
2. `BatchFetcher.batchConfirmFetcher(url, formData)` — POST the form → get the Sonata confirmation HTML page → extract CSRF token, encoded data, title, message
3. dispatch `spa:batch:confirm:requested` → `DefaultBatchSubscriber` shows SweetAlert2
4. User confirms → `event.accept()` is called
5. dispatch `spa:batch:processing`
6. `BatchFetcher.executeBatch(confirmData)` — POST with `confirmation=ok` + CSRF token + encoded data
7. On 2xx → dispatch `spa:batch:succeeded` → navigate to list after 3 seconds
8. On 4xx–599 → dispatch `spa:batch:failed`

---

## DefaultBatchSubscriber

**Events**: `BATCH_CONFIRM_REQUESTED`, `BATCH_PROCESSING`, `BATCH_SUCCEEDED`, `BATCH_FAILED`  
**Priority**: 0 on all events

Same override pattern as `DefaultDeletionOperationSubscriber` — register at priority > 0 to replace the default SweetAlert2 dialogs.

```typescript
dispatcher.addListener(
    SpaEvents.BATCH_CONFIRM_REQUESTED,
    async (event: SpaBatchConfirmRequestedEvent) => {
        const confirmed = await myConfirmModal.show({
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

## FormSubscriber

**Event**: `SpaEvents.FORM_SUBMIT` (`spa:form:submit`)  
**Priority**: 0

Handles Sonata form submissions. Uses `@wlindabla/form_validator`'s `FormSubmission` class.

**Pipeline**:
1. Builds a `FormSubmission` instance with `X-Requested-With: XMLHttpRequest`
2. Reads `data-iwas-confirm` from the submitter button → shows SweetAlert2 confirmation
3. POSTs the form data
4. On 2xx → resolves the redirect URL from the submitter button name or server response
5. Navigates to the resolved URL

### Sonata form JSON response contract

Your Symfony controller should return JSON for AJAX form submissions:

```json
// Success
{
    "title": "Saved!",
    "message": "Record saved successfully.",
    "redirectUrl": "/admin/app/user/42/show"
}

// Validation error (422)
{
    "title": "Validation Error",
    "violations": {
        "user[name]": "This field is required.",
        "user[email]": "This value is not a valid email address."
    }
}

// Other errors (4xx / 5xx)
{
    "title": "Error",
    "errorMessage": "Something went wrong."
}
```

### Sonata submit button → redirect mapping

`FormSubscriber` reads the name of the clicked submit button and resolves the redirect destination:

| Button name | Redirect |
|---|---|
| `btn_update_and_list` | list page |
| `btn_create_and_list` | list page |
| `btn_create_and_create` | create page (same URL) |
| `btn_update_and_edit` | edit page (from server `editUrl`) |
| `btn_create_and_edit` | edit page (from server `editUrl`) |
| *(default)* | list page (fallback) |

---

## Writing a custom subscriber

To handle a custom page type (registered via `addCrudEventName`):

```typescript
import type { EventSubscriberInterface } from '@wlindabla/event_dispatcher';
import type { SpaSubscriberInterface } from '@wlindabla/sonata_spa';
import { SpaCrudEvent } from '@wlindabla/sonata_spa';

class ApprovalPageSubscriber implements SpaSubscriberInterface {

    getSubscribedEvents(): ReturnType<EventSubscriberInterface['getSubscribedEvents']> {
        return {
            'crud:approval': {
                listener: 'onApproval',
                priority: 0,
            },
        };
    }

    async onApproval(event: SpaCrudEvent): Promise<void> {
        const { request, routeMatch } = event;
        // fetch + swap + history + dom:ready — your custom logic here
        console.log('Approval page for token:', routeMatch.token);
    }
}

// Register before boot()
spa.addSubscriber(new ApprovalPageSubscriber());
spa.boot();
```

---

## AbstractCRUDPageSubscriber

The base class for all page subscribers. It is exported and can be used as a base for your own page subscribers.

```typescript
import { AbstractCRUDPageSubscriber } from '@wlindabla/sonata_spa';
```

It provides the `finalizeNavigation()` helper that executes the standard post-fetch pipeline (swap → history → dom:ready → navigate:completed) so you don't have to repeat it in every subscriber.
