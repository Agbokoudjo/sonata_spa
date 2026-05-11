/**
 * @wlindabla/sonata_spa — ShowSwapStrategy
 * Full page swap strategy for Sonata show and dashboard pages.
 * Replaces the entire #app-main container content.
 * @author AGBOKOUDJO Franck <internationaleswebservices@gmail.com>
 */

import type { SwapStrategyInterface } from '../contracts';
import type { SwapContext, CRUDPageType } from '../types';

/**
 * Full page swap strategy for show and dashboard pages.
 *
 * Unlike ListSwapStrategy which performs surgical swaps,
 * this strategy replaces the entire #app-main container content.
 *
 * Why a full swap for show pages?
 *   Show pages have a completely different layout — they display
 *   detail panels, related entities, action buttons — all different
 *   from the list layout. A surgical swap would be too complex
 *   and fragile. A full #app-main swap is simpler and more reliable.
 *
 * Why a full swap for dashboard?
 *   The dashboard has a completely unique layout with widgets,
 *   charts and statistics — nothing in common with CRUD pages.
 *
 * Process:
 *   1. Parse the virtualDoc (already done by PageFetcher)
 *   2. Find #app-main in the virtual document
 *   3. Replace the live #app-main innerHTML with the virtual one
 *   4. Update DOM references (mainContentArea, mainContentHeader)
 *      so subsequent operations target the new elements
 *  @author AGBOKOUDJO Franck <internationaleswebservices@gmail.com>
 */
export class ShowSwapStrategy implements SwapStrategyInterface {

    public supports(pageType: CRUDPageType): boolean {
        return pageType === 'show' || pageType === 'dashboard';
    }

    public swap(context: SwapContext): void {
        const { response, mainContainer } = context;
        const { virtualDoc } = response;

        // Find #app-main in the virtual document
        const virtualMain = virtualDoc.querySelector('#app-main') ||
                            virtualDoc.querySelector('.app-main') || 
                            virtualDoc.querySelector('.content-wrapper');

        if (virtualMain) {
            // Full replacement of #app-main content
            mainContainer.innerHTML = virtualMain.innerHTML;
        } else {
            // Fallback: virtualDoc does not contain #app-main
            // This can happen with partial server responses
            // Fall back to generic content swap
            this.swapGenericContent(virtualDoc, context);
        }
    }

    /**
     * Fallback generic content swap when #app-main is not found
     * in the virtual document.
     * Swaps known Sonata content selectors individually.
     */
    private swapGenericContent(
        virtualDoc: Document,
        context: SwapContext
    ): void {
        const { mainContentArea } = context;

        const selectors = [
            '.sonata-ba-form',
            '.sonata-ba-show',
            '.sonata-ba-content',
            '.sonata-ba-preview',
        ];

        for (const selector of selectors) {
            const newEl = virtualDoc.querySelector(selector);
            const currentEl = mainContentArea.querySelector(selector);

            if (newEl && currentEl) {
                currentEl.replaceWith(newEl);
            } else if (newEl && !currentEl) {
                mainContentArea.appendChild(newEl);
            } else if (!newEl && currentEl) {
                currentEl.remove();
            }
        }
    }
}
