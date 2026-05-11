# DOM Swap Strategies

`DomSwapManager` selects and executes the appropriate swap strategy based on the `RouteMatch.pageType`. The Strategy Pattern allows you to plug in custom swap logic without touching the kernel.

---

## Built-in strategies

### `ListSwapStrategy`

**Supports**: `'list'`

Performs a surgical swap — only the changed parts of the page are replaced. This is the most important strategy: it makes list navigation feel instant because only the data table and filters are replaced, not the entire page.

**What gets swapped**:
- Entire `#app-main` content (when the virtual document contains it)
- Fallback (partial responses): filter actions, CRUD action buttons, filters box, data table

### `ShowSwapStrategy`

**Supports**: `'show'`, `'dashboard'`

Replaces the entire `#app-main` innerHTML. Used for show and dashboard pages because their layout is completely different from list pages — a surgical swap would be too complex.

### `FormSwapStrategy`

**Supports**: `'create'`, `'edit'`

Swaps only `.sonata-ba-form` and `.sonata-ba-preview`. Used when the server returns a form with validation errors (HTTP 200 + form HTML). Preserves the content header.

Note: create and edit pages are **server-managed by default** and never reach this strategy in normal operation. It is primarily used to display server-side validation errors after a failed form submission.

### `GenericSwapStrategy`

**Supports**: all page types (fallback)

Iterates over a list of known Sonata CSS selectors and swaps each one found. Always the last resort.

**Default selectors**: `.sonata-ba-form`, `.sonata-ba-show`, `.sonata-ba-content`, `.sonata-ba-preview`

Extra selectors can be added via `SpaRouterOptions.genericSelectors`.

---

## Adding a custom strategy

Implement `SwapStrategyInterface`:

```typescript
import type { SwapStrategyInterface } from '@wlindabla/sonata_spa/contracts';
import type { SwapContext, CRUDPageType } from '@wlindabla/sonata_spa/types';

class MyApprovalSwapStrategy implements SwapStrategyInterface {

    supports(pageType: CRUDPageType): boolean {
        return (pageType as string) === 'approval';
    }

    swap(context: SwapContext): void {
        const { response, mainContentArea } = context;
        const { virtualDoc } = response;

        const newContent = virtualDoc.querySelector('.my-approval-content');
        const currentContent = mainContentArea.querySelector('.my-approval-content');

        if (newContent && currentContent) {
            currentContent.replaceWith(newContent);
        } else if (newContent) {
            mainContentArea.appendChild(newContent);
        } else if (currentContent) {
            currentContent.remove();
        }
    }
}
```

Register it via the extension system:

```typescript
class MyExtension implements SpaKernelExtensionInterface {
    instantiateServices(context: SpaExtensionContextInterface): void {
        // DomSwapManager is internal — access it via the dispatcher or
        // register the strategy from a custom subscriber that has a reference
    }
    // ...
}
```

Or if you have a reference to the `DomSwapManager` (via a custom subscriber that receives it via constructor injection through the extension context):

```typescript
// In a custom subscriber or via spa:dom:ready
import { DomSwapManager } from '@wlindabla/sonata_spa/swapper';
// DomSwapManager is instantiated internally — to add a strategy,
// listen to spa:swap:before and handle the custom pageType yourself:

dispatcher.addListener(SpaEvents.SWAP_BEFORE, (event: SpaSwapEvent) => {
    if (event.routeMatch.pageType === 'approval') {
        event.stopPropagation();
        new MyApprovalSwapStrategy().swap(event.context);
    }
});
```
