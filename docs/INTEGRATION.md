# Real-World Integration Guide

This guide walks through a complete, production-ready integration of `@wlindabla/sonata_spa` into a Symfony project using SonataAdmin, AdminLTE 4, and Bootstrap 5.3.

---

## Prerequisites

- Symfony 6.x or 7.x
- SonataAdminBundle >= 4.x
- AdminLTE 4 theme installed>=3.x
- Bootstrap 5.3
- Webpack Encore (or Vite with Symfony)
- Node.js >= 18

---

## Step 1 — Install the library

```bash
yarn add @wlindabla/sonata_spa
```

---

## Step 2 — Verify your AdminLTE 4 HTML structure

The kernel needs to find these elements in the DOM. Check that your `standard_layout.html.twig` (or its override) uses the expected structure:

```html
<!-- Sidebar -->
<aside id="app-sidebar" class="app-sidebar ...">
    <div class="sidebar-wrapper">
        <nav id="sonata-admin-sidebar" class="sonata-admin-sidebar">
            <!-- sidebar links here -->
        </nav>
    </div>
</aside>

<!-- Main wrapper -->
<main id="app-main" class="app-main ...">

    <!-- Content header -->
    <div id="app-content-header" class="app-content-header content-header">
        <nav class="navbar ...">
            <!-- action buttons, filter toggles -->
        </nav>
    </div>

    <!-- Content area — this gets swapped -->
    <div id="app-content" class="app-content">
        {% block sonata_page_content %}
            <!-- Sonata CRUD content here -->
        {% endblock %}
    </div>

</main>
```

If your selectors differ, configure them via `SpaRouterOptions.router`.

---

## Step 3 — Update your Symfony controller for AJAX support

For delete and batch actions to work correctly without full reloads, override the relevant admin controller methods to return JSON for XHR requests.

### Delete action

```php
// src/Admin/UserAdmin.php or your CRUDController
use Symfony\Component\HttpFoundation\JsonResponse;

public function deleteAction(Request $request): Response
{
    $id = $request->attributes->get($this->admin->getIdParameter());
    $object = $this->assertObjectExists($request, true);

    $this->checkParentChildAssociation($request, $object);
    $this->admin->checkAccess('delete', $object);

    if ($request->getMethod() === Request::METHOD_DELETE) {
        // CSRF validation done by Sonata internally

        try {
            $this->admin->delete($object);

            if ($request->isXmlHttpRequest()) {
                return new JsonResponse([
                    'title'   => 'Success',
                    'message' => sprintf('%s has been successfully deleted.', $this->admin->toString($object)),
                ]);
            }

            $this->addFlash('sonata_flash_success', 'flash_delete_success');
        } catch (\Exception $e) {
            $this->addFlash('sonata_flash_error', 'flash_delete_error');
        }

        return $this->redirectTo($request, $object);
    }

    // Return the delete confirmation page (GET request)
    return $this->renderWithExtraParams($this->admin->getTemplateRegistry()->getTemplate('delete'), [
        'object'     => $object,
        'action'     => 'delete',
        'csrf_token' => $this->getCsrfToken('sonata.delete'),
    ]);
}
```

### Batch delete action

```php
public function batchActionDelete(ProxyQueryInterface $query): Response
{
    $this->admin->checkAccess('batchDelete');

    try {
        $this->batchDelete($this->admin->getClass(), 'id', $query);

        if ($this->getRequest()->isXmlHttpRequest()) {
            return new JsonResponse([
                'title'   => 'Batch action completed',
                'message' => 'The selected items have been successfully deleted.',
            ]);
        }

        $this->addFlash('sonata_flash_success', 'flash_batch_delete_success');
    } catch (\Exception $e) {
        $this->addFlash('sonata_flash_error', 'flash_batch_delete_error');
    }

    return $this->redirectToList();
}
```

### Form create/edit actions

For form submissions, your controller (or the overridden `CRUDController`) should detect XHR requests and return JSON:

```php
// In your overridden create/edit action
if ($request->isXmlHttpRequest() && $form->isSubmitted()) {
    if ($form->isValid()) {
        $this->admin->update($object); // or create

        return new JsonResponse([
            'title'      => 'Saved!',
            'message'    => 'Record saved successfully.',
            'redirectUrl' => $this->admin->generateUrl('list'), // optional
        ], 200);
    }

    // Return validation errors as JSON (422)
    $violations = [];
    foreach ($form->getErrors(true) as $error) {
        $violations[$error->getOrigin()->getName()] = $error->getMessage();
    }

    return new JsonResponse([
        'title'      => 'Validation Error',
        'violations' => $violations,
    ], 422);
}
```

---

## Step 4 — Create the SPA entry point

```typescript
// assets/spa.ts
import { SpaKernel, SpaEvents } from '@wlindabla/sonata_spa';
import type {
    SpaDomReadyEvent,
    SpaNavigateCompletedEvent,
    SpaDeleteSucceededEvent,
    SpaBatchSucceededEvent,
    SpaDeleteConfirmRequestedEvent
} from '@wlindabla/sonata_spa';
import { BrowserEventDispatcher } from '@wlindabla/event_dispatcher/browser';

document.addEventListener('DOMContentLoaded', () => {

    // ── Create the shared event dispatcher ──────────────────────────────────
    // If you also use @wlindabla/form_validator's global dispatcher,
    // pass the same instance here to share the event bus across libraries.
    const dispatcher = new BrowserEventDispatcher(window, { bubbles: true });

    // Make it globally available (optional — for @wlindabla/form_validator)
    (window as any).eventDispatcherBrowser = dispatcher;

    // ── Create the kernel ───────────────────────────────────────────────────
    const spa = SpaKernel.create(
        {
            router: {
                sidebarSelector:           '#app-sidebar',
                mainSelector:              '#app-main',
                mainContentAreaSelector:   '#app-content',
                mainContentHeaderSelector: '#app-content-header',
            },
            serverManagedUrlOptions: [
                // Add any project-specific URLs that must always reload
                // /\/export(\?.*)?$/,
            ],
        },
        // Change to 'dev' during development to enable console logging
        (document.documentElement.dataset['env'] ?? 'prod') as 'prod' | 'dev',
        dispatcher
    );

    // ── Hook into navigation lifecycle ──────────────────────────────────────

    // Re-initialize third-party libraries after each DOM swap
    spa.getDispatcher().addListener(SpaEvents.DOM_READY, (event: SpaDomReadyEvent) => {
        initThirdPartyLibraries(event.container);
    });

    // Analytics
    spa.getDispatcher().addListener(SpaEvents.NAVIGATE_COMPLETED, (event: SpaNavigateCompletedEvent) => {
        // Google Analytics 4
        if (typeof gtag !== 'undefined') {
            gtag('event', 'page_view', {
                page_location: event.to,
                page_title:    document.title,
            });
        }
    });

    // ── Boot ─────────────────────────────────────────────────────────────────
    spa.boot();
});

/**
 * Re-initialize third-party libraries after each SPA navigation.
 * Scope all queries to `container` to avoid touching unrelated DOM elements.
 */
function initThirdPartyLibraries(container: HTMLElement): void {
    // Select2
    if (typeof jQuery !== 'undefined' && jQuery.fn.select2) {
        jQuery(container).find('select.select2:not(.select2-hidden-accessible)').select2({
            width: '100%',
        });
    }

    // Flatpickr
    if (typeof flatpickr !== 'undefined') {
        container.querySelectorAll<HTMLInputElement>('input.flatpickr:not(.flatpickr-input)').forEach(el => {
            flatpickr(el, { dateFormat: 'd/m/Y', locale: 'fr' });
        });
    }

    // ApexCharts / Chart.js (dashboard only)
    if (container.querySelector('[data-chart]')) {
        initCharts(container);
    }
}
```

---

## Step 5 — Include the script in your Twig layout

```twig
{# templates/bundles/SonataAdminBundle/standard_layout.html.twig #}

{% block javascripts %}
    {{ parent() }}
    {{ encore_entry_script_tags('spa') }}
{% endblock %}
```

Or pass the current environment to the SPA via a `data-env` attribute:

```twig
<html data-env="{{ app.environment }}">
```

---

## Step 6 — Configure Webpack Encore

```javascript
// webpack.config.js
const Encore = require('@symfony/webpack-encore');

Encore
    // ... your existing config ...
    .addEntry('spa', './assets/spa.ts')
    .enableTypeScriptLoader()
;

module.exports = Encore.getWebpackConfig();
```

---

## Step 7 — Add form validation to your Sonata forms (optional)

`@wlindabla/sonata_spa` integrates with `@wlindabla/form_validator` out of the box for any Sonata form that has the `form-validate` class.

In your Twig form template:

```twig
{# templates/bundles/SonataAdminBundle/CRUD/base_edit.html.twig #}

{{ form_start(form, {
    attr: {
        class:    'form-validate form-submit crud-entity  formedit',
        novalidate: true,
    }
}) }}

{# Add data-* attributes to fields for client-side validation #}
{{ form_row(form.name, {
    attr: {
        'data-event-validate':      'blur',
        'data-event-validate-blur': 'blur',
        'data-error-message-input': 'Name is required.',
        required: true,
        minlength: 2,
        maxlength: 100,
    }
}) }}

{{ form_row(form.email, {
    attr: {
        'data-event-validate':      'blur',
        'data-event-validate-blur': 'blur',
        'data-error-message-input': 'Please enter a valid email address.',
        required: true,
    }
}) }}

{{ form_end(form) }}
```

---

## Step 8 — Production checklist

Before going live:

- [ ] Change `env` from `'dev'` to `'prod'` (or read from `data-env`)
- [ ] Verify all CSS selectors match your AdminLTE layout (`#app-main`, `#app-content`, etc.)
- [ ] Test sidebar navigation, pagination, filters, sorting
- [ ] Test delete confirmation flow (SweetAlert2 modal appears, CSRF token works)
- [ ] Test batch actions (confirmation modal, success notification, list refresh)
- [ ] Test browser back/forward buttons after several navigations
- [ ] Test form submissions (validation errors, success redirects)
- [ ] Test `serverManagedUrlOptions` — edit and create pages should still do full reloads
- [ ] Verify third-party libraries (Select2, flatpickr, etc.) re-initialize correctly via `spa:dom:ready`
- [ ] Run `yarn build` and check for TypeScript errors

---

## Common issues

### "Sidebar element not found"

Your sidebar selector does not match the actual DOM. Check `sidebarSelector` in `SpaRouterOptions`. The kernel falls back to `aside` before throwing.

### SweetAlert2 modal appears but delete fails with 403

The CSRF token was not found in the delete confirmation page. Make sure your `delete.html.twig` includes the `_sonata_csrf_token` hidden input. If you have a heavily customized template, check that `.sonata-ba-delete form input[name="_sonata_csrf_token"]` exists.

### Pagination links redirect to a full page

`PaginationBindingManager` binds on `#pagination-container` or `.pagination`. If your Sonata theme uses a different wrapper, check that `rebind()` is being called (it is — via `spa:dom:ready`). Add a `console.log` inside `SpaEvents.DOM_READY` to verify the container contains the pagination.

### Stimulus controllers not reconnecting after swap

This is handled automatically by `DomManager.reconnectStimulusOutlets()`. If a custom Stimulus controller is not reconnecting, verify that it has a `data-controller` attribute on the swapped element. The `DomManager` cycles `data-controller` via `requestAnimationFrame` to force Stimulus to reconnect.

### Custom library not re-initializing after navigation

Listen to `SpaEvents.DOM_READY` and initialize your library within `event.container`:

```typescript
spa.getDispatcher().addListener(SpaEvents.DOM_READY, (event) => {
    // Always scope to event.container
    myLibrary.init(event.container);
});
```

Never use `document` or `document.body` as the scope — only `event.container`.
