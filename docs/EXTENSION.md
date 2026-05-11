# Extension System

The extension system allows you to extend `SpaKernel` without inheriting from it.

This design is directly inspired by **Sonata's `AdminExtensionInterface`** pattern — the same philosophy that makes SonataAdmin so extensible without requiring you to fork the core.

---

## Why extensions instead of inheritance?

`SpaKernel` is intentionally **sealed** — its constructor is private and cannot be extended via class inheritance:

```typescript
// TypeScript error — constructor is private
class MySpaKernel extends SpaKernel { }
```

This design choice follows the same reasoning as Symfony's final classes: the kernel's internal wiring is complex, and inheritance would create tight coupling that breaks easily across updates.

Instead, `SpaKernelExtensionInterface` gives you a **limited, stable surface** to extend the kernel — exactly the parts you need, without exposing internals.

---

## `SpaKernelExtensionInterface`

```typescript
import type {
    SpaKernelExtensionInterface,
    SpaExtensionContextInterface
} from '@wlindabla/sonata_spa';
```

An extension must implement all six methods:

```typescript
interface SpaKernelExtensionInterface {
    instantiateServices(context: SpaExtensionContextInterface): void;
    registerSubscribers(context: SpaExtensionContextInterface): void;
    registerBindingManagers(context: SpaExtensionContextInterface): void;
    registerRoutePatterns(context: SpaExtensionContextInterface): void;
    registerServerManagedUrls(context: SpaExtensionContextInterface): void;
    registerCrudEventNames(context: SpaExtensionContextInterface): void;
    getPriority(): number;
}
```

Methods you don't need can simply return nothing:

```typescript
class MyExtension implements SpaKernelExtensionInterface {
    instantiateServices(_context: SpaExtensionContextInterface): void {}
    registerRoutePatterns(_context: SpaExtensionContextInterface): void {}
    registerServerManagedUrls(_context: SpaExtensionContextInterface): void {}
    registerCrudEventNames(_context: SpaExtensionContextInterface): void {}
    getPriority(): number { return 0; }

    registerSubscribers(context: SpaExtensionContextInterface): void {
        context.getDispatcher().addSubscriber(new MySubscriber());
    }

    registerBindingManagers(context: SpaExtensionContextInterface): void {
        context.registerBindingManager(
            new MyCustomBindingManager(context.getMainContainer(), context.getRouter())
        );
    }
}
```

---

## `SpaExtensionContext` — the limited kernel view

Each extension method receives a `SpaExtensionContextInterface` — a curated view of the kernel. It exposes only what extensions are allowed to touch.

### Available methods

#### Event dispatcher

```typescript
context.getDispatcher(): BrowserEventDispatcher
```

Use to register subscribers or raw event listeners.

```typescript
context.getDispatcher().addSubscriber(new MySubscriber());
context.getDispatcher().addListener(SpaEvents.DOM_READY, handler);
```

#### Navigation

```typescript
context.getRouter(): SpaRouterInterface
context.navigate(url: string): Promise<void>
```

```typescript
await context.navigate('/admin/app/user/list');
```

#### Route resolution

```typescript
context.getRouteResolver(): RouteResolverInterface
context.addRoutePattern(pattern: RegExp, pageType: string): void
```

Add a custom page type to the route resolver. Custom patterns are checked **before** the built-in ones:

```typescript
// Register a custom 'approval' page type
context.addRoutePattern(/\/approval(\/)?(\?.*)?$/, 'approval');
```

#### Server-managed URLs

```typescript
context.getRequestMatcher(): RequestMatcherInterface
context.addServerManagedUrl(pattern: RegExp): void
```

Force a full server reload for specific URLs:

```typescript
// Always full reload for /export
context.addServerManagedUrl(/\/export(\?.*)?$/);
```

#### Custom CRUD event names

```typescript
context.addCrudEventName(pageType: string, eventName: string): void
```

Map a custom page type to an event name the kernel will dispatch:

```typescript
context.addCrudEventName('approval', 'crud:approval');

// Then your subscriber listens to 'crud:approval'
dispatcher.addListener('crud:approval', (event: SpaCrudEvent) => {
    // handle approval page navigation
});
```

#### Binding managers

```typescript
context.registerBindingManager(manager: BindingManagerInterface): void
```

The kernel calls `bind()` immediately and `rebind(container)` after each DOM swap.

#### DOM references

```typescript
context.getMainContainer(): HTMLElement        // #app-main
context.getMainContentArea(): HTMLElement      // #app-content
context.getMainContentHeader(): HTMLElement | null  // #app-content-header
```

#### Runtime parameters

```typescript
context.getEnv(): APP_ENV   // 'prod' | 'dev' | 'test'
context.isDebug(): boolean
```

---

## Extension execution order

Extensions are sorted by `getPriority()` in **descending order** (highest first) before boot.

All extension hook calls happen within `SpaKernel.boot()` in this order:

```
boot()
  │
  ├─ kernelExtensions.sort() by priority desc
  ├─ resolveDomReferences()
  ├─ instantiateServices()           ← kernel's own services
  │
  ├─ extension.instantiateServices() ← for each extension
  │
  ├─ pendingSubscribers registered   ← your addSubscriber() calls
  ├─ registerBuiltInSubscribers()    ← kernel's built-in subscribers
  ├─ extension.registerSubscribers() ← for each extension
  │
  ├─ extension.registerRoutePatterns()
  ├─ extension.registerServerManagedUrls()
  ├─ extension.registerCrudEventNames()
  │
  ├─ registerBindingManagers()        ← kernel's built-in managers
  ├─ extension.registerBindingManagers()
  │
  └─ historyManager.listen()
```

---

## Full example — analytics + custom page type

```typescript
import type {
    SpaKernelExtensionInterface,
    SpaExtensionContextInterface,
    SpaSubscriberInterface
} from '@wlindabla/sonata_spa';
import { SpaEvents, SpaCrudEvent } from '@wlindabla/sonata_spa';
import type { EventSubscriberInterface } from '@wlindabla/event_dispatcher';

// ── Custom subscriber ───────────────────────────────────────────────────────

class AnalyticsSubscriber implements SpaSubscriberInterface {
    getSubscribedEvents(): ReturnType<EventSubscriberInterface['getSubscribedEvents']> {
        return {
            [SpaEvents.NAVIGATE_COMPLETED]: { listener: 'onNavigate', priority: 0 },
            ['crud:approval']:              { listener: 'onApproval', priority: 0 },
        };
    }

    onNavigate(event: any): void {
        window.gtag?.('event', 'page_view', { page_location: event.to });
    }

    onApproval(event: SpaCrudEvent): void {
        console.log('Approval page viewed for token:', event.routeMatch.token);
    }
}

// ── Extension ───────────────────────────────────────────────────────────────

class MyProjectExtension implements SpaKernelExtensionInterface {

    instantiateServices(_context: SpaExtensionContextInterface): void {}

    registerSubscribers(context: SpaExtensionContextInterface): void {
        context.getDispatcher().addSubscriber(new AnalyticsSubscriber());
    }

    registerBindingManagers(_context: SpaExtensionContextInterface): void {}

    registerRoutePatterns(context: SpaExtensionContextInterface): void {
        // URL pattern: /admin/app/contract/42/approval
        context.addRoutePattern(/\/approval(\/)?(\?.*)?$/, 'approval');
    }

    registerServerManagedUrls(context: SpaExtensionContextInterface): void {
        // These URLs always trigger a full page reload
        context.addServerManagedUrl(/\/export(\?.*)?$/);
        context.addServerManagedUrl(/\/import(\?.*)?$/);
    }

    registerCrudEventNames(context: SpaExtensionContextInterface): void {
        context.addCrudEventName('approval', 'crud:approval');
    }

    getPriority(): number { return 10; }
}

// ── Register with the kernel ─────────────────────────────────────────────────

spa
    .addKernelExtension(new MyProjectExtension())
    .addSubscriber(new AnotherSubscriber())
    .boot();
```

---

## Important: extensions must be registered before `boot()`

```typescript
// ✅ Correct
spa.addKernelExtension(new MyExtension()).boot();

// ❌ Wrong — extension ignored after boot()
spa.boot();
spa.addKernelExtension(new MyExtension()); // logs a warning, does nothing
```
