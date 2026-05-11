/**
 * @wlindabla/sonata_spa — GenericSwapStrategy
 * Fallback DOM swap strategy for unknown or custom Sonata page types.
 * Iterates over known Sonata CSS selectors and swaps each one individually.
 * @author AGBOKOUDJO Franck <internationaleswebservices@gmail.com>
 */

import type { SwapStrategyInterface } from '../contracts';
import type { SwapContext, CRUDPageType } from '../types';

/**
 * Default fallback swap strategy.
 * Used when no other strategy matches the current page type.
 *
 * Iterates over a list of known Sonata content selectors and
 * performs a surgical swap for each one found in the virtual document.
 *
 * Default selectors (in order):
 *   1. .sonata-ba-form     → create/edit form
 *   2. .sonata-ba-show     → show detail panel
 *   3. .sonata-ba-content  → generic content block
 *   4. .sonata-ba-preview  → preview section
 *
 * The developer can extend the selector list via SpaRouterOptions.genericSelectors.
 *
 * This strategy supports ALL page types — it is always the last
 * resort when DomSwapManager finds no matching strategy.
 *  @author AGBOKOUDJO Franck <internationaleswebservices@gmail.com>
 */
export class GenericSwapStrategy implements SwapStrategyInterface {

    /**
     * Default Sonata content selectors to swap.
     * Order matters — more specific selectors first.
     */
    private static readonly DEFAULT_SELECTORS: string[] = [
        '.sonata-ba-form',
        '.sonata-ba-show',
        '.sonata-ba-content',
        '.sonata-ba-preview',
    ];

    private readonly selectors: string[];

    /**
     * @param customSelectors - Additional selectors from SpaRouterOptions.genericSelectors.
     *   These are merged with the default selectors.
     */
    public constructor(customSelectors: string[] = []) {
        // Merge custom selectors with defaults, avoiding duplicates
        const merged = [...GenericSwapStrategy.DEFAULT_SELECTORS];

        for (const selector of customSelectors) {
            if (!merged.includes(selector)) {
                merged.push(selector);
            }
        }

        this.selectors = merged;
    }

    /**
     * GenericSwapStrategy supports all page types.
     * It is always the last fallback in DomSwapManager.
     */
    public supports(_pageType: CRUDPageType): boolean {
        return true;
    }

    public swap(context: SwapContext): void {
        const { response, mainContentArea } = context;
        const { virtualDoc } = response;

        for (const selector of this.selectors) {
            this.swapElement(selector, virtualDoc, mainContentArea);
        }
    }

    /**
     * Swap a single element by CSS selector.
     * Handles all 3 cases: replace, add, remove.
     *
     * @param selector - CSS selector to find the element
     * @param virtualDoc - The parsed virtual document from server response
     * @param mainContentArea - The live content area to swap within
     */
    private swapElement(
        selector: string,
        virtualDoc: Document,
        mainContentArea: HTMLElement
    ): void {
        const newEl = virtualDoc.querySelector(selector);
        const currentEl = mainContentArea.querySelector(selector);

        if (newEl && currentEl) {
            currentEl.replaceWith(newEl);
            return;
        }

        if (newEl && !currentEl) {
            mainContentArea.appendChild(newEl);
            return;
        }

        if (!newEl && currentEl) {
            currentEl.remove();
        }
    }

    /**
     * Get the currently active selectors.
     * Useful for debugging.
     */
    public getSelectors(): string[] {
        return [...this.selectors];
    }
}
