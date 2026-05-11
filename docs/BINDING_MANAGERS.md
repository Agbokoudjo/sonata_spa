# Binding Managers

Binding managers are the bridge between user interactions and the SPA router. They intercept DOM events (clicks, form submits) and convert them into `SpaRequest` objects passed to `SpaKernel.handle()`.

All binding managers are internal — they are instantiated and managed by `SpaKernel.boot()`. You do not instantiate them directly.

---

## `SidebarBindingManager`

**Binds on**: `sidebar` element (event delegation)  
**Triggers**: All sidebar link clicks

Uses event delegation — one listener on the sidebar root handles all link clicks. The sidebar is never swapped, so `rebind()` is a no-op.

**Ignored links** (delegated to `RequestMatcher.shouldIgnoreLink()`):
- `href="#"` or hash-only links
- `href="javascript:..."` pseudo-links
- `target="_blank"` links
- External links (different hostname)
- Server-managed URLs (`/edit`, `/create`, etc.)
- Links managed by Stimulus (`data-action` attribute)

Also manages the `active` CSS class on sidebar items after each navigation.

---

## `ActionBindingManager`

**Binds on**: `mainContainer` (event delegation)  
**Triggers**: Show links, delete links, Sonata action element links  
**Rebinds after**: Every DOM swap

Intercepts:
- `.view_link` — row action links to show pages
- `.delete_link` — row action links to delete pages
- `.sonata-action-element` — content-header action buttons (Show, Back, etc.)
- Any link containing `/show`, `/list`, or `/delete` in the URL (for Twig relation templates like `list_many_to_many.html.twig`)

---

## `PaginationBindingManager`

**Binds on**: `#pagination-container` (individual link binding)  
**Triggers**: Pagination link clicks  
**Rebinds after**: Every DOM swap

Uses `dataset.spabound` to prevent double-binding. The pagination container is inside the list table, which is replaced on every navigation.

---

## `FilterBindingManager`

**Binds on**: `form.sonata-filter-form` (individual form binding)  
**Triggers**: Filter form submit, filter reset link, column sort links  
**Rebinds after**: Every DOM swap

**Key design detail**: Sonata's Stimulus `sonata-filter` controller registers a `submit->sonata-filter#prepareSubmit` action. Stimulus fires **before** the native `submit` event. By the time `FilterBindingManager`'s listener fires, Sonata has already:
- Removed `name` from unchanged fields
- Added `<input name="filters" value="reset">` if all filters are default

So `FilterBindingManager` only needs to prevent the full reload and navigate via SPA with the already-prepared form data.

The `buildUrlFromForm()` helper from `@wlindabla/form_validator` is used to serialize the cleaned `FormData` into a URL.

---

## `FormBindingManager`

**Binds on**: `.sonata-ba-form form.form-validate` (individual form binding)  
**Triggers**: Form submit events  
**Rebinds after**: Every DOM swap

Responsibilities:
1. Initializes `@wlindabla/form_validator` `FormValidateController` on each form
2. Binds real-time validation events (blur, input, change, dragenter, drop)
3. Tracks which submit button was clicked (for Sonata redirect resolution)
4. On submit → runs final validation → dispatches `spa:form:submit`

The submit button state is managed via `field:validation:failed` / `field:validation:success` events.

---

## `BatchBindingManager`

**Binds on**: `mainContainer` — finds `.btn-batch-submit` or `form[action*="/batch"] [type="submit"]`  
**Triggers**: Batch form submit button clicks  
**Rebinds after**: Every DOM swap

Intercepts the Sonata batch submit button and routes it through `SpaKernel.handle()` with `trigger: 'batch'`. This allows the kernel to dispatch `crud:batch` and have `BatchPageSubscriber` handle the two-step Sonata batch flow.

---

## Writing a custom BindingManager

```typescript
import type { BindingManagerInterface, SpaRouterInterface } from '@wlindabla/sonata_spa/contracts';

class MyCustomBindingManager implements BindingManagerInterface {

    constructor(
        private readonly container: HTMLElement,
        private readonly kernel: SpaRouterInterface
    ) {}

    bind(): void {
        // Use event delegation when possible — more efficient and survives DOM swaps
        this.container.addEventListener('click', async (e) => {
            const target = e.target as Element;
            const link = target.closest('a.my-custom-link[href]') as HTMLAnchorElement | null;
            if (!link) return;

            e.preventDefault();
            await this.kernel.handle({
                url: link.getAttribute('href')!,
                target: link,
                trigger: 'click',
            });
        });
    }

    rebind(container: HTMLElement): void {
        // Rebind individual elements that are recreated after each swap
        container.querySelectorAll<HTMLButtonElement>('.my-action-button').forEach(btn => {
            if (btn.dataset['spabound'] === 'true') return;
            btn.dataset['spabound'] = 'true';

            btn.addEventListener('click', async () => {
                const url = btn.dataset['url'];
                if (!url) return;
                await this.kernel.handle({ url, trigger: 'click' });
            });
        });
    }
}
```

Register it via the extension system:

```typescript
class MyExtension implements SpaKernelExtensionInterface {
    registerBindingManagers(context: SpaExtensionContextInterface): void {
        context.registerBindingManager(
            new MyCustomBindingManager(
                context.getMainContainer(),
                context.getRouter()
            )
        );
    }
    // ...
}
```
