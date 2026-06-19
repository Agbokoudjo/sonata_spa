/**
 * @wlindabla/sonata_spa — FormSwapStrategy
 * DOM swap strategy for Sonata form pages (create/edit).
 * Swaps only the .sonata-ba-form container.
 * Used to display server-side validation errors without full page reload.
 * @author AGBOKOUDJO Franck <internationaleswebservices@gmail.com>
 */

import type { SwapStrategyInterface } from '../contracts';
import type { SwapContext, CRUDPageType } from '../types';

/**
 * DOM swap strategy for Sonata form pages.
 *
 * This strategy is used in two scenarios:
 *
 *   1. Server-side validation errors
 *      When Sonata returns the form with errors (HTTP 200 + form HTML),
 *      we swap only .sonata-ba-form to display the errors inline
 *      without reloading the entire page.
 *
 *   2. Create/Edit pages loaded via SPA (if developer removes them from serverManaged)
 *      By default, create and edit are server-managed (full reload).
 *      But if the developer removes them from serverManagedUrlOptions,
 *      this strategy handles the DOM swap.
 *
 * What gets swapped:
 *   - .sonata-ba-form          → the main form container
 *   - .sonata-ba-preview       → preview section (if present)
 *
 * What is NOT swapped (preserved):
 *   - #app-content-header      → content header with breadcrumbs/actions
 *   - .sonata-ba-filter        → filter box (not present on form pages)
 *   - sidebar                  → never touched
 *
 * Sonata form page HTML structure:
 * ```html
 * <div id="app-content">
 *   {% if _preview is not empty %}
 *     <div class="sonata-ba-preview">{{ _preview|raw }}</div>
 *   {% endif %}
 *   {% if _form is not empty %}
 *     <div class="sonata-ba-form">
 *       <form>...</form>
 *     </div>
 *   {% endif %}
 * </div>
 * ```
 *  @author AGBOKOUDJO Franck <internationaleswebservices@gmail.com>
 */
export class FormSwapStrategy implements SwapStrategyInterface {

    public supports(pageType: CRUDPageType): boolean {
        return pageType === 'create' || pageType === 'edit';
    }

    public swap(context: SwapContext): void {
        const { response, mainContentArea } = context;
        const { virtualDoc } = response;

        this.swapFormContainer(virtualDoc, mainContentArea);
        this.swapPreviewContainer(virtualDoc, mainContentArea);
        this.swapSonataActions(virtualDoc, context.mainContentHeader);
    }

    /**
     * Swap the main form container .sonata-ba-form.
     * This is the primary target — contains the Symfony form with all fields.
     */
    private swapFormContainer(
        virtualDoc: Document,
        mainContentArea: HTMLElement
    ): void {
        const newForm = virtualDoc.querySelector('.sonata-ba-form');
        const currentForm = mainContentArea.querySelector('.sonata-ba-form');

        if (newForm && currentForm) {
            currentForm.replaceWith(newForm);
            return;
        }

        if (newForm && !currentForm) {
            mainContentArea.appendChild(newForm);
            return;
        }

        if (!newForm && currentForm) {
            currentForm.remove();
        }
    }

    // ─── Preview container ────────────────────────────────────────────────────

    /**
     * Swap the preview container .sonata-ba-preview.
     * Present when Sonata has a preview section before the form.
     */
    private swapPreviewContainer(
        virtualDoc: Document,
        mainContentArea: HTMLElement
    ): void {
        const newPreview = virtualDoc.querySelector('.sonata-ba-preview');
        const currentPreview = mainContentArea.querySelector('.sonata-ba-preview');

        if (newPreview && currentPreview) {
            currentPreview.replaceWith(newPreview);
            return;
        }

        if (newPreview && !currentPreview) {
            // Preview goes before the form
            const formEl = mainContentArea.querySelector('.sonata-ba-form');
            if (formEl) {
                mainContentArea.insertBefore(newPreview, formEl);
            } else {
                mainContentArea.prepend(newPreview);
            }
            return;
        }

        if (!newPreview && currentPreview) {
            currentPreview.remove();
        }
    }

    // ─── Sonata action buttons ────────────────────────────────────────────────

    /**
     * Swap the Sonata action buttons in the content header.
     * On form pages these typically contain Back, Delete buttons.
     * Selector: ul[id^="container-sonata-actions"]
     */
    private swapSonataActions(
        virtualDoc: Document,
        mainContentHeader: HTMLElement | null
    ): void {
        if (!mainContentHeader) return;

        const newActions = virtualDoc.querySelector('ul[id^="container-sonata-actions"]');
        const currentActions = mainContentHeader.querySelector('ul[id^="container-sonata-actions"]');

        if (newActions && currentActions) {
            currentActions.replaceWith(newActions);
            return;
        }

        if (newActions && !currentActions) {
            const navbarRight = mainContentHeader.querySelector('.navbar-nav.element-action');
            navbarRight?.appendChild(newActions);
            return;
        }

        if (!newActions && currentActions) {
            currentActions.remove();
        }
    }
}
