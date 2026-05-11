# API Reference

## `SpaKernel`

The central orchestrator. Use `SpaKernel.create()` — the constructor is private.

### `SpaKernel.create(options, env?, dispatcher?)`

Factory method. Creates and returns the singleton `SpaKernel` instance. Subsequent calls return the existing instance.

```typescript
const spa = SpaKernel.create(
    options: SpaRouterOptions,
    env: APP_ENV = 'prod',
    dispatcher?: BrowserEventDispatcher
): SpaKernel
```

| Parameter | Type | Required | Description |
|---|---|---|---|
| `options` | `SpaRouterOptions` | ✅ | Router configuration |
| `env` | `APP_ENV` | No (default: `'prod'`) | Application environment |
| `dispatcher` | `BrowserEventDispatcher` | No | Shared dispatcher instance — pass `window.eventDispatcherBrowser` to share across libraries |

---

### `.boot(): void`

Boots the kernel. Must be called **once** after instantiation and after all `addSubscriber()` / `addKernelExtension()` calls.

**Execution order inside `boot()`**:
1. Sort extensions by priority (desc)
2. Resolve DOM references from selectors
3. Instantiate internal services
4. Call `extension.instantiateServices()` for each extension
5. Register pending custom subscribers
6. Register built-in page subscribers
7. Call `extension.registerSubscribers()` for each extension
8. Call `extension.registerRoutePatterns()`, `registerServerManagedUrls()`, `registerCrudEventNames()`
9. Register built-in binding managers
10. Call `extension.registerBindingManagers()` for each extension
11. Start `HistoryManager.listen()` (popstate)
12. Mark current URL in history state
13. Set up `spa:dom:ready` and `spa:navigate:completed` listeners

```typescript
spa.boot();
```

Calling `boot()` more than once logs a warning and is a no-op.

---

### `.handle(request): Promise<void>`

Handle a SPA navigation request. This is the main entry point of the navigation pipeline.

```typescript
spa.handle({
    url:     '/admin/app/user/list',
    trigger: 'click',
    target:  linkElement,
}): Promise<void>
```

Called automatically by `BindingManagers`. You can also call it manually for programmatic navigation, but prefer `navigate()` for that.

---

### `.navigate(url): Promise<void>`

Programmatically navigate to a URL. Creates a `SpaRequest` with `trigger: 'programmatic'`.

```typescript
await spa.navigate('/admin/app/user/list');
```

---

### `.addSubscriber(subscriber): this`

Register a custom `EventSubscriberInterface` on the dispatcher.

- If called **before** `boot()` → queued and registered during boot
- If called **after** `boot()` → registered immediately

Returns `this` for method chaining.

```typescript
spa
    .addSubscriber(new MyAnalyticsSubscriber())
    .addSubscriber(new MyConfirmDeleteSubscriber())
    .boot();
```

---

### `.addKernelExtension(...extensions): this`

Register one or more kernel extensions. Must be called **before** `boot()`.

```typescript
spa.addKernelExtension(new MyExtension(), new AnotherExtension()).boot();
```

---

### `.getDispatcher(): BrowserEventDispatcher`

Get the shared event dispatcher instance. Use this to add raw listeners outside subscriber classes.

```typescript
spa.getDispatcher().addListener(SpaEvents.DOM_READY, (event) => {
    myLibrary.init(event.container);
});
```

---

### `.options: SpaRouterOptions`

Read-only access to the current configuration.

```typescript
console.log(spa.options.router.sidebarSelector);
```

---

### `.currentNavigationUrl: string`

The URL of the current or most recent navigation.

---

### `.getHistoryManager(): HistoryManager`

Get the `HistoryManager` instance (for advanced use in custom subscribers).

---

### `.getRouteResolver(): RouteResolver`

Get the `RouteResolver` instance (for advanced use in custom subscribers and form redirect resolution).

---

### `SpaKernel.reset(): void`

Reset all singleton instances. **Internal — for testing purposes only.**

```typescript
// In your test teardown
SpaKernel.reset();
```

---

## `SpaRedirectResponse`

Immutable value object representing the navigation decision after a successful Sonata form submission. Mirrors Symfony's `CRUDController::redirectTo()` logic.

```typescript
import { SpaRedirectResponse } from '@wlindabla/sonata_spa';
```

### Static factories

```typescript
SpaRedirectResponse.toList(listUrl, resource, submitterName)
SpaRedirectResponse.toCreate(createUrl, resource)
SpaRedirectResponse.toEdit(editUrl, resource)
SpaRedirectResponse.toShow(showUrl, resource)
SpaRedirectResponse.toUrl(url, resource, submitterName)
```

### `.resolve(response, submitterName, resource, listUrl, createUrl?)` — static

Resolve a redirect response from the server response + submitter context.

```typescript
const redirect = SpaRedirectResponse.resolve(
    fetchResponse,
    'btn_update_and_list',
    'user',
    '/admin/app/user/list',
    '/admin/app/user/create'
);

await this.navigate(redirect.url);
```

### Properties

| Property | Type | Description |
|---|---|---|
| `url` | `string` | The resolved destination URL |
| `type` | `SpaRedirectType` | `'list' \| 'create' \| 'edit' \| 'show' \| 'url'` |
| `submitterName` | `string \| null` | The button name that triggered the redirect |
| `resource` | `string` | The Sonata resource name |
| `isToList` | `boolean` | True if redirect goes to list page |
| `isToCreate` | `boolean` | True if redirect goes to create page |
| `isToDetail` | `boolean` | True if redirect goes to edit or show page |

---

## `RouteResolver` static helpers

These static methods are useful in custom code without needing a `RouteResolver` instance:

```typescript
import { RouteResolver } from '@wlindabla/sonata_spa/contracts';
// Available via the kernel:
const resolver = spa.getRouteResolver();
```

Alternatively, these static helpers are available directly:

```typescript
RouteResolver.isListUrl(url)      // boolean
RouteResolver.isShowUrl(url)      // boolean
RouteResolver.isDashboardUrl(url) // boolean
RouteResolver.isDeleteUrl(url)    // boolean
RouteResolver.isBatchUrl(url)     // boolean
RouteResolver.isSameResource(currentUrl, targetUrl) // boolean
RouteResolver.needsFullPage(currentUrl)             // boolean
```

---

## Package exports

```typescript
// Main entry point
import { SpaKernel, SpaEvents, SpaParameterBag } from '@wlindabla/sonata_spa';

// All events
import { SpaEvents, SpaRequestEvent, SpaCrudEvent, ... } from '@wlindabla/sonata_spa/events';

// Subscribers (for override or custom use)
import {
    DefaultDeletionOperationSubscriber,
    DefaultBatchSubscriber,
    AbstractCRUDPageSubscriber
} from '@wlindabla/sonata_spa/subscribers';

// Contracts (interfaces)
import type {
    SpaRouterInterface,
    SpaKernelExtensionInterface,
    SpaExtensionContextInterface,
    BindingManagerInterface,
    SwapStrategyInterface,
    ...
} from '@wlindabla/sonata_spa/contracts';

// Types
import type { RouteMatch, SpaRequest, CRUDPageType, ... } from '@wlindabla/sonata_spa/types';

// Extension context
import { SpaExtensionContext } from '@wlindabla/sonata_spa/extension';

// DOM swap manager
import { DomSwapManager } from '@wlindabla/sonata_spa/swapper';

// HTTP redirect response
import { SpaRedirectResponse } from '@wlindabla/sonata_spa/http';

// Logger
import { SonataSpaLogger } from '@wlindabla/sonata_spa/logger';

// Exceptions (if any)
import { ... } from '@wlindabla/sonata_spa/exceptions';
```
