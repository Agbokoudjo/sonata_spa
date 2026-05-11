# Architecture

`@wlindabla/sonata_spa` is structured around four core pillars that map directly to Symfony concepts:

| Library concept | Symfony equivalent |
|---|---|
| `SpaKernel` | `HttpKernel` |
| `SpaRequest` / `RouteMatch` | `Request` / `RouteMatch` |
| `SpaEvents` + `EventSubscriberInterface` | `KernelEvents` + `EventSubscriberInterface` |
| `BindingManager` | `EventListener` on DOM |

---

## Directory structure

```
src/
├── Kernel/
│   ├── SpaKernel.ts           # Central orchestrator — sealed, singleton
│   └── HistoryManager.ts      # History API — pushState / popstate
│
├── Router/
│   ├── RouteResolver.ts       # Parses Sonata URLs → RouteMatch
│   └── RequestMatcher.ts      # Decides SPA vs full server reload
│
├── Events/
│   └── index.ts               # All event constants + event classes
│
├── Subscribers/
│   ├── AbstractCRUDPageSubscriber.ts
│   ├── ListPageSubscriber.ts
│   ├── ShowPageSubscriber.ts
│   ├── DashboardSubscriber.ts
│   ├── DeletePageSubscriber.ts
│   ├── DefaultDeletionOperationSubscriber.ts
│   ├── BatchPageSubscriber.ts
│   ├── DefaultBatchSubscriber.ts
│   ├── FormSubscriber.ts
│   └── SonataHttpRequestSubscriber.ts
│
├── Binding/
│   ├── SidebarBindingManager.ts
│   ├── ActionBindingManager.ts
│   ├── PaginationBindingManager.ts
│   ├── FilterBindingManager.ts
│   ├── FormBindingManager.ts
│   └── BatchBindingManager.ts
│
├── Fetcher/
│   ├── PageFetcher.ts          # Fetches HTML pages (fragment + full)
│   ├── DeleteFetcher.ts        # Fetches delete confirmation + executes delete
│   ├── BatchFetcher.ts         # Fetches batch confirmation + executes batch
│   └── FetchDelegateAdapter.ts # Bridges http_client lifecycle → SPA events
│
├── DomSwapper/
│   ├── DomSwapManager.ts       # Orchestrates swap strategies
│   ├── ListSwapStrategy.ts     # Surgical swap for list pages
│   ├── ShowSwapStrategy.ts     # Full #app-main swap for show/dashboard
│   ├── FormSwapStrategy.ts     # Swap .sonata-ba-form for create/edit
│   └── GenericSwapStrategy.ts  # Fallback — iterates known Sonata selectors
│
├── DomReinit/
│   └── DomManager.ts           # Re-initializes scripts, Stimulus, Bootstrap 5
│
├── Extension/
│   └── SpaExtensionContext.ts  # Limited kernel view exposed to extensions
│
├── ParameterBag/
│   └── SpaParameterBag.ts      # Read-only runtime parameters (env, debug)
│
├── Logger/
│   └── SonataSpaLogger.ts      # Delegates to @wlindabla/form_validator Logger
│
├── Http/
│   └── SpaRedirectResponse.ts  # Redirect resolution after form submit
│
├── contracts/
│   └── index.ts                # All TypeScript interfaces
│
└── types/
    └── index.ts                # All TypeScript types
```

---

## The kernel pipeline in detail

```
User interaction (click, form submit, popstate)
        │
        ▼
  BindingManager
  (SidebarBindingManager, ActionBindingManager,
   PaginationBindingManager, FilterBindingManager,
   FormBindingManager, BatchBindingManager)
        │  builds SpaRequest { url, trigger, target }
        ▼
  SpaKernel.handle(SpaRequest)
        │
        ├─ Guard: isNavigating? → skip concurrent navigation
        │
        ├─ 1. dispatch spa:request   ← STOPPABLE
        │       → cancel navigation (unsaved changes guard, etc.)
        │
        ├─ 2. RequestMatcher.isServerManaged(url)
        │       → YES: dispatch spa:server:redirect
        │              → window.location.href  (full reload)
        │       → NO: continue
        │
        ├─ 3. RouteResolver.resolve(url)
        │       → RouteMatch { pageType, resource, token, url }
        │
        ├─ 4. dispatch spa:route:resolved  ← STOPPABLE
        │       → developer takes full control of this navigation
        │
        └─ 5. dispatchAsync(SpaCrudEvent, crudEventName)
                → Page Subscriber handles the rest
```

### Page Subscriber pipeline

Each CRUD event is handled by a dedicated subscriber. The pipeline is identical for all of them:

```
Page Subscriber (e.g. ListPageSubscriber.onList)
        │
        ├─ PageFetcher.fetchFragment() or fetchFullPage()
        │       → GET request via @wlindabla/http_client
        │       → FetchDelegateAdapter dispatches:
        │           spa:fetch:prepare
        │           spa:fetch:started   → loading state (opacity 0.4)
        │           spa:fetch:succeeded / spa:fetch:failed / spa:fetch:errored
        │           spa:fetch:finished  → loading state removed
        │
        ├─ SpaResponse { html, virtualDoc, routeMatch, statusCode }
        │
        ├─ DomSwapManager.swap(SwapContext)
        │       → dispatch spa:swap:before  ← STOPPABLE
        │       → Select strategy:
        │           list      → ListSwapStrategy  (surgical)
        │           show      → ShowSwapStrategy  (full #app-main)
        │           dashboard → ShowSwapStrategy  (full #app-main)
        │           create    → FormSwapStrategy  (.sonata-ba-form)
        │           edit      → FormSwapStrategy  (.sonata-ba-form)
        │           *         → GenericSwapStrategy (fallback)
        │       → strategy.swap(context)
        │       → dispatch spa:swap:after
        │
        ├─ HistoryManager.push(url, routeMatch)
        │       → window.history.pushState(state, '', url)
        │
        ├─ DomManager.reinitialize(container, routeMatch)
        │       → re-execute inline <script> tags
        │       → reconnect Stimulus controllers (outlet IDs)
        │       → re-initialize Bootstrap 5 Dropdowns + Tooltips
        │       → re-initialize batch select-all checkbox
        │       → dispatch spa:dom:ready  → BindingManagers.rebind()
        │
        └─ dispatch spa:navigate:completed
```

---

## Singleton pattern

The kernel and all its core services use the singleton pattern. This ensures a single source of truth across the SPA lifetime:

```typescript
// All of these return the same instance on subsequent calls
SpaKernel.create(options, env, dispatcher);
RouteResolver.create();
RequestMatcher.create(patterns);
HistoryManager.create(callback);
```

For testing, each singleton exposes a static `reset()` method:

```typescript
// In tests only
SpaKernel.reset();
```

---

## Internal vs public API

Only the following are part of the public API and are exported from the package:

- `SpaKernel` — the only entry point
- `SpaEvents` — all event name constants
- All event classes (`SpaRequestEvent`, `SpaCrudEvent`, etc.)
- `SpaExtensionContext` — for extension authors
- `SpaParameterBag` — for read-only runtime access
- All contracts (interfaces) from `@wlindabla/sonata_spa/contracts`
- All types from `@wlindabla/sonata_spa/types`
- `DefaultDeletionOperationSubscriber` and `DefaultBatchSubscriber` — to allow override
- `AbstractCRUDPageSubscriber` — base class for custom page subscribers
- `DomSwapManager` — to add custom strategies
- `SpaRedirectResponse` — for form redirect resolution

The following are **internal** and not exported:

- `BindingManager` classes — they are instantiated and managed by the kernel
- `PageFetcher`, `DeleteFetcher`, `BatchFetcher` — internal HTTP layer
- `FetchDelegateAdapter` — internal bridge
- `DomManager` — internal DOM re-initialization
- `RouteResolver`, `RequestMatcher`, `HistoryManager` — internal routing layer
- `SpaParameterBag` write access — locked to the kernel via a private Symbol

---

## Security design — SpaParameterBag write token

The `SpaParameterBag` uses a C++ `friend class`-inspired pattern to restrict write access:

```typescript
// The write token is a unique Symbol — never exported
const KERNEL_WRITE_TOKEN: unique symbol = Symbol('SpaKernel.writeToken');

// Only SpaKernel (same module) can call initialize()
SpaParameterBag.initialize(KERNEL_WRITE_TOKEN, { env, debug });

// All consumers read via public static getters — no write access
SpaParameterBag.getEnv();    // 'prod' | 'dev' | 'test'
SpaParameterBag.isDebug();   // boolean
SpaParameterBag.getVersion(); // string
```

This ensures that `env` and `debug` are set exactly once by the kernel and cannot be tampered with by third-party code.
