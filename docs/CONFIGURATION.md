# Configuration Reference

## `SpaRouterOptions`

Passed to `SpaKernel.create()` as the first argument.

```typescript
interface SpaRouterOptions {
    router: {
        sidebarSelector?:           string;  // default: '.app-sidebar'
        mainSelector?:              string;  // default: '#app-main'
        mainContentAreaSelector?:   string;  // default: '#app-content'
        mainContentHeaderSelector?: string;  // default: '#app-content-header'
    };
    serverManagedUrlOptions?: RegExp[];
    genericSelectors?:        string[];
    listDataTableContainerSelector?: string;
    filtersBoxSelector?:      string;
}
```

### `router` fields

| Field | Default | Description |
|---|---|---|
| `sidebarSelector` | `'.app-sidebar'` | CSS selector for the AdminLTE sidebar (`<aside>`) |
| `mainSelector` | `'#app-main'` | CSS selector for the main container wrapping all content |
| `mainContentAreaSelector` | `'#app-content'` | CSS selector for the dynamic content area |
| `mainContentHeaderSelector` | `'#app-content-header'` | CSS selector for the content header (nullable — not present on all pages) |

The kernel resolves each selector and falls back to common alternatives (`main`, `.content-wrapper`, `.app-main`, etc.) before throwing. If a required element is not found, an informative error is thrown with instructions to check your `SpaRouterOptions`.

### `serverManagedUrlOptions`

Additional URL patterns that should always trigger a full page reload. The developer's patterns are **merged** with the built-in defaults (not replaced):

**Built-in defaults** (always active):
- `/\/edit(\?.*)?$/` — edit pages (CSRF token generation)
- `/\/create(\?.*)?$/` — create pages (CSRF token generation)

```typescript
serverManagedUrlOptions: [
    /\/export(\?.*)?$/,   // your custom export endpoint
    /\/import(\?.*)?$/,   // your custom import endpoint
]
```

### `genericSelectors`

Extra CSS selectors used by `GenericSwapStrategy` (the fallback swap strategy). These are merged with the built-in selectors:

**Built-in defaults**: `.sonata-ba-form`, `.sonata-ba-show`, `.sonata-ba-content`, `.sonata-ba-preview`

```typescript
genericSelectors: [
    '.my-custom-sonata-block',
    '.my-special-content-area',
]
```

---

## `APP_ENV`

```typescript
type APP_ENV = 'prod' | 'dev' | 'test';
```

Passed as the second argument to `SpaKernel.create()`. Controls:
- Whether debug logging is active (`SonataSpaLogger` output)
- Whether error fallbacks redirect via `window.location.href` (only in `'prod'`)
- `SpaParameterBag.isDebug()` return value

In `'dev'` mode, navigation errors are logged to the console instead of silently redirecting.

---

## `SpaParameterBag`

Read-only access to runtime parameters from anywhere in your code:

```typescript
import { SpaParameterBag } from '@wlindabla/sonata_spa';

SpaParameterBag.getEnv();     // 'prod' | 'dev' | 'test'
SpaParameterBag.isDebug();    // boolean
SpaParameterBag.getVersion(); // string
SpaParameterBag.isBooted();   // boolean — true after SpaKernel.boot()
```
