# @wlindabla/sonata_spa

<div align="center">

**A Symfony-inspired SPA router for SonataAdmin — AdminLTE 4 + Bootstrap 5.3**

*Transform your SonataAdmin backend into a fast, seamless Single Page Application — without losing a single native feature.*

[Why this library?](#-why-wlindabla-sonata_spa) • [Architecture](#-architecture) • [Installation](#-installation) • [Quick Start](#-quick-start) • [Events](#-events-reference) • [Extension System](#-extension-system) • [API Reference](#-api-reference) • [Contributing](#-contributing)

---

</div>

## 📖 Table of Contents

- [Why @wlindabla/sonata\_spa?](#-why-wlindabla-sonata_spa)
- [How It Works — The Big Picture](#-how-it-works--the-big-picture)
- [Architecture](./docs/ARCHITECTURE.md)
- [Installation](#-installation)
- [Requirements](#-requirements)
- [Quick Start](#-quick-start)
- [Configuration Reference](./docs/CONFIGURATION.md)
- [Events Reference](./docs/EVENTS.md)
- [Subscribers](./docs/SUBSCRIBERS.md)
- [Extension System](./docs/EXTENSION.md)
- [DOM Swap Strategies](./docs/SWAP_STRATEGIES.md)
- [Binding Managers](./docs/BINDING_MANAGERS.md)
- [Fetchers](./docs/FETCHERS.md)
- [Types Reference](./docs/TYPES.md)
- [API Reference](./docs/API.md)
- [Real-World Integration Guide](./docs/INTEGRATION.md)
- [Contributing](#-contributing)
- [License](#-license)
- [Author](#-author)

---

## 🎯 Why @wlindabla/sonata_spa?

### The problem with SonataAdmin out of the box

SonataAdmin is an exceptional Symfony admin bundle. After years of using it in production, we love it deeply — its CRUD generation, filter system, batch actions, Stimulus controllers, CSRF protection, and Twig templating are hard to beat.

**But by default, every single navigation is a full page reload.**

Click a sidebar link → full reload. Paginate a list → full reload. Sort a column → full reload. Apply filters → full reload. View a record → full reload. Every action loads the entire HTML document, re-executes every script, re-initializes every Bootstrap component and every Stimulus controller.

This is the expected behavior for a classic server-side application. But for a modern admin panel used every day by your team, it creates a noticeably sluggish experience — especially on lists with complex filters, dashboards with widgets, or show pages with embedded relations.

### The @wlindabla/sonata_spa solution

`@wlindabla/sonata_spa` is a **Symfony-inspired SPA router** that sits on top of your existing SonataAdmin installation and converts navigation into an SPA experience — **without modifying a single line of your Symfony code**.

- **Sidebar links, pagination, filters, sorting, show/delete actions** — all intercepted and handled via `fetch()` + surgical DOM swap.
- **Create and edit pages** remain server-managed by default (full reload) because they require CSRF token generation — exactly right.
- **Batch actions and delete confirmations** get beautiful SweetAlert2 modals instead of raw browser confirms.
- **All native Sonata features are preserved**: Stimulus controllers, Bootstrap 5, CSRF tokens, access control, Twig templates — nothing changes on the server.

> After years of using SonataAdmin in production and loving it, we built this library to give the admin experience the speed it deserves — while keeping everything that makes Sonata great intact.

### What you gain

- Instant navigation between list, show, and dashboard pages (no full reloads)
- Surgical DOM swaps — only the changed content is replaced
- Browser back/forward buttons work correctly via the History API
- SweetAlert2 confirmation modals for delete and batch actions
- A full event-driven lifecycle you can hook into at every stage
- Zero changes required to your Symfony controllers or Twig templates
- Full TypeScript support with strict types

---

## 🏗️ How It Works — The Big Picture

The architecture is directly inspired by Symfony's `HttpKernel` and `EventDispatcher` components.

```
User clicks a sidebar link
        │
        ▼
  SidebarBindingManager
  intercepts the click
        │
        ▼
  SpaKernel.handle(SpaRequest)
        │
        ├─ 1. dispatch spa:request        (STOPPABLE — cancel navigation)
        │
        ├─ 2. RequestMatcher.isServerManaged()
        │       YES → window.location.href (full reload)
        │       NO  → continue
        │
        ├─ 3. RouteResolver.resolve(url)  → RouteMatch
        │       { pageType: 'list', resource: 'user', url: '...' }
        │
        ├─ 4. dispatch spa:route:resolved (STOPPABLE — take full control)
        │
        └─ 5. dispatch crud:list / crud:show / crud:delete / spa:dashboard / ...
                        │
                        ▼
              ListPageSubscriber.onList(event)
                        │
                        ├─ PageFetcher.fetchFragment(url)
                        │      → GET with X-Requested-With: XMLHttpRequest
                        │
                        ├─ DomSwapManager.swap()
                        │      → dispatch spa:swap:before (STOPPABLE)
                        │      → ListSwapStrategy.swap()  (surgical swap)
                        │      → dispatch spa:swap:after
                        │
                        ├─ HistoryManager.push(url, routeMatch)
                        │      → window.history.pushState(...)
                        │
                        ├─ DomManager.reinitialize()
                        │      → re-execute scripts
                        │      → reconnect Stimulus controllers
                        │      → reinitialize Bootstrap 5
                        │      → dispatch spa:dom:ready
                        │
                        └─ dispatch spa:navigate:completed
```

The **kernel does not fetch, does not swap the DOM, does not touch history**.
It only orchestrates and dispatches events.
**Page Subscribers do the actual work.**

This clean separation means you can override any stage without touching the kernel.

---

## 📦 Installation

```bash
# Using yarn (recommended)
yarn add @wlindabla/sonata_spa

# Using npm
npm install @wlindabla/sonata_spa

# Using pnpm
pnpm add @wlindabla/sonata_spa
```

The library requires `@wlindabla/form_validator` as a peer dependency (it is listed as a direct dependency and ships automatically). SweetAlert2 is bundled internally.

---

## ✅ Requirements

| Requirement | Version |
|---|---|
| Node.js | >= 18.0.0 |
| TypeScript | >= 5.0.0 (optional but recommended) |
| SonataAdmin | >= 4.x |
| AdminLTE | >= 4.x |
| Bootstrap | >= 5.3 |
| `@wlindabla/form_validator` | >= 4.2.1 |

---

## 🚀 Quick Start

### Step 1 — Add the SPA entry point in your Symfony project

Create `assets/spa.ts` (or `assets/spa.js`):

```typescript
import { SpaKernel, SpaEvents } from '@wlindabla/sonata_spa';
import { BrowserEventDispatcher } from '@wlindabla/event_dispatcher/browser';

document.addEventListener('DOMContentLoaded', () => {

    // ── 1. Create the kernel ───────────────────────────────────────────────
    const spa = SpaKernel.create(
        {
            router: {
                sidebarSelector:           '#app-sidebar',
                mainSelector:              '#app-main',
                mainContentAreaSelector:   '#app-content',
                mainContentHeaderSelector: '#app-content-header',
            },
            // These URLs always trigger a full server reload
            // (CSRF token generation, complex Sonata forms)
            // The defaults already include /edit and /create
            serverManagedUrlOptions: [],
        },
        'prod',  // or 'dev' for debug logging
        new BrowserEventDispatcher(window, { bubbles: true })
    );

    // ── 2. (Optional) Hook into navigation events ──────────────────────────
    spa.getDispatcher().addListener(SpaEvents.DOM_READY, (event) => {
        // Called after every DOM swap — re-initialize your own libraries here
        console.log('DOM ready in container:', event.container);
    });

    spa.getDispatcher().addListener(SpaEvents.NAVIGATE_COMPLETED, (event) => {
        console.log('Navigated to:', event.to);
    });

    // ── 3. Boot — registers all built-in subscribers and binding managers ──
    spa.boot();
});
```

### Step 2 — Include the script in your AdminLTE layout

In your Twig layout (`standard_layout.html.twig` or your override):

```twig
{# At the bottom of <body> #}
{{ encore_entry_script_tags('spa') }}
```

Or with Webpack Encore in `webpack.config.js`:

```javascript
Encore.addEntry('spa', './assets/spa.ts');
```

### Step 3 — That's it

Navigate your SonataAdmin backend. Links are now intercepted. Pages swap without full reloads. Browser back/forward buttons work. Delete and batch confirmations show SweetAlert2 modals.

---

## ⚙️ Configuration

See the full configuration reference: **[docs/CONFIGURATION.md](./docs/CONFIGURATION.md)**

```typescript
SpaKernel.create({
    router: {
        sidebarSelector:           '#app-sidebar',       // default: '.app-sidebar'
        mainSelector:              '#app-main',           // default: '#app-main'
        mainContentAreaSelector:   '#app-content',        // default: '#app-content'
        mainContentHeaderSelector: '#app-content-header', // default: '#app-content-header'
    },

    // URLs that require a full page reload (default: /edit, /create)
    serverManagedUrlOptions: [
        /\/edit(\?.*)?$/,
        /\/create(\?.*)?$/,
        /\/export(\?.*)?$/,  // example: custom server-managed URL
    ],

    // Extra Sonata CSS selectors for the generic swap fallback
    genericSelectors: ['.my-custom-sonata-block'],
}, 'prod');
```

---

## 📡 Events Reference

See the full events reference: **[docs/EVENTS.md](./docs/EVENTS.md)**

A quick overview of the most important events you can listen to:

```typescript
const dispatcher = spa.getDispatcher();

// Cancel a navigation (unsaved changes guard)
dispatcher.addListener(SpaEvents.REQUEST, (event) => {
    if (hasUnsavedChanges()) {
        event.stopPropagation();
    }
});

// Re-initialize your own libraries after each DOM swap
dispatcher.addListener(SpaEvents.DOM_READY, (event) => {
    myDatepicker.init(event.container);
    mySelect2.init(event.container);
});

// React to successful navigation
dispatcher.addListener(SpaEvents.NAVIGATE_COMPLETED, (event) => {
    analytics.track('pageview', { url: event.to });
});

// React to delete success
dispatcher.addListener(SpaEvents.DELETE_SUCCEEDED, (event) => {
    console.log('Deleted from resource:', event.routeMatch.resource);
});

// React to batch success
dispatcher.addListener(SpaEvents.BATCH_SUCCEEDED, (event) => {
    console.log('Batch done:', event.message);
});

// Replace the default delete confirmation UI
dispatcher.addListener(SpaEvents.DELETE_CONFIRM_REQUESTED, async (event) => {
    const confirmed = await myCustomModal.confirm(event.title, event.message);
    if (confirmed) {
        await event.accept();
    } else {
        event.cancel();
    }
}, 10); // priority > 0 overrides DefaultDeletionOperationSubscriber
```

---

## 🧩 Extension System

See the full extension guide: **[docs/EXTENSION.md](./docs/EXTENSION.md)**

The extension system allows you to extend the kernel without inheriting from it — inspired by Sonata's `AdminExtensionInterface` pattern.

```typescript
import type { SpaKernelExtensionInterface, SpaExtensionContextInterface } from '@wlindabla/sonata_spa';

class MyAnalyticsExtension implements SpaKernelExtensionInterface {

    instantiateServices(context: SpaExtensionContextInterface): void {
        // instantiate your services here
    }

    registerSubscribers(context: SpaExtensionContextInterface): void {
        context.getDispatcher().addSubscriber(new MyAnalyticsSubscriber());
    }

    registerBindingManagers(context: SpaExtensionContextInterface): void {
        context.registerBindingManager(
            new MyCustomBindingManager(context.getMainContainer(), context.getRouter())
        );
    }

    registerRoutePatterns(context: SpaExtensionContextInterface): void {
        context.addRoutePattern(/\/approval(\/)?(\?.*)?$/, 'approval');
    }

    registerServerManagedUrls(context: SpaExtensionContextInterface): void {
        context.addServerManagedUrl(/\/export(\?.*)?$/);
    }

    registerCrudEventNames(context: SpaExtensionContextInterface): void {
        context.addCrudEventName('approval', 'crud:approval');
    }

    getPriority(): number { return 0; }
}

// Register before boot()
spa.addKernelExtension(new MyAnalyticsExtension()).boot();
```

---

## 📚 Documentation

| Document | Description |
|---|---|
| [ARCHITECTURE.md](./docs/ARCHITECTURE.md) | Full architecture overview — kernel, events, subscribers, strategies |
| [CONFIGURATION.md](./docs/CONFIGURATION.md) | All `SpaRouterOptions` fields with defaults and examples |
| [EVENTS.md](./docs/EVENTS.md) | Complete event reference with payloads and usage examples |
| [SUBSCRIBERS.md](./docs/SUBSCRIBERS.md) | Built-in subscribers and how to override them |
| [EXTENSION.md](./docs/EXTENSION.md) | Extension system — add custom behavior without modifying the kernel |
| [SWAP_STRATEGIES.md](./docs/SWAP_STRATEGIES.md) | DOM swap strategies — built-in and custom |
| [BINDING_MANAGERS.md](./docs/BINDING_MANAGERS.md) | Binding managers — how user interactions become SPA requests |
| [FETCHERS.md](./docs/FETCHERS.md) | Internal fetchers — PageFetcher, DeleteFetcher, BatchFetcher |
| [TYPES.md](./docs/TYPES.md) | TypeScript types and interfaces |
| [API.md](./docs/API.md) | Full public API reference |
| [INTEGRATION.md](./docs/INTEGRATION.md) | Step-by-step Symfony + SonataAdmin integration guide |

---

## 🤝 Contributing

1. Fork the repository
2. Create your feature branch: `git checkout -b feature/my-feature`
3. Commit your changes: `git commit -m 'feat: add my feature'`
4. Push to the branch: `git push origin feature/my-feature`
5. Open a Pull Request

---

## 📄 License

MIT © [AGBOKOUDJO Franck](https://github.com/Agbokoudjo) — INTERNATIONALES WEB APPS & SERVICES

---

## 👤 Author

**AGBOKOUDJO Franck**

- 📧 Email: [internationaleswebservices@gmail.com](mailto:internationaleswebservices@gmail.com)
- 📞 Phone: +229 01 67 25 18 86
- 💼 LinkedIn: [INTERNATIONALES WEB APPS & SERVICES](https://www.linkedin.com/in/internationales-web-apps-services-120520193/)
- 🐙 GitHub: [@Agbokoudjo](https://github.com/Agbokoudjo)
- 🏢 Company: INTERNATIONALES WEB APPS & SERVICES

---

<div align="center">

**Built with ❤️ in Benin 🇧🇯 — for the SonataAdmin community worldwide**

</div>
