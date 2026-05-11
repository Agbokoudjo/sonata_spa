/**
 * @wlindabla/sonata_spa — PaginationBindingManager
 * Intercepts pagination link clicks in list pages.
 * Must rebind after each DOM swap since pagination is inside swapped content.
 * @author AGBOKOUDJO Franck <internationaleswebservices@gmail.com>
 */

import type { BindingManagerInterface, SpaRouterInterface } from '../contracts';
import { SonataSpaLogger } from '../Logger';

/**
 * Manages pagination link clicks in Sonata list pages.
 *
 * Pagination links are inside #pagination-container which is part of
 * the list table — replaced on every list navigation.
 * rebind() is called after each spa:dom:ready to re-intercept them.
 *
 * Uses dataset.spabound to prevent double-binding on the same link.
 *
 * Sonata pagination HTML structure:
 * ```html
 * <div id="pagination-container">
 *   <ul class="pagination">
 *     <li class="page-item">
 *       <a href="/admin/app/user/list?page=2" class="page-link">2</a>
 *     </li>
 *     <li class="page-item">
 *       <a href="/admin/app/user/list?page=3" class="page-link">3</a>
 *     </li>
 *   </ul>
 * </div>
 * ```
 */
export class PaginationBindingManager implements BindingManagerInterface {
    private static _instance: PaginationBindingManager | null = null;

    private constructor(
        private readonly kernel: SpaRouterInterface
    ) {}

    public static create(kernel: SpaRouterInterface): PaginationBindingManager {
        if (PaginationBindingManager._instance) {
            SonataSpaLogger.warn('[PaginationBindingManager] Instance already exists — returning existing.');
            return PaginationBindingManager._instance;
        }
        PaginationBindingManager._instance = new PaginationBindingManager(kernel);
        return PaginationBindingManager._instance;
    }

    public static reset(): void {
        PaginationBindingManager._instance = null;
    }
    
    /**
     * Initial binding — no-op on boot since pagination does not
     * exist on the initial page load before any navigation.
     * All binding happens in rebind() after each DOM swap.
     */
    public bind(): void {
        // Pagination container only exists after first list navigation
        // rebind() handles all cases
        this.bindPaginationLinks(document);
    }

    /**
     * Rebind pagination links after DOM swap.
     * Called after each spa:dom:ready event with the new container.
     *
     * @param container - The newly swapped container element
     */
    public rebind(container: HTMLElement): void {
        this.bindPaginationLinks(container);
    }

    /**
     * Find and bind all pagination links within a container.
     * Skips links already bound (dataset.spabound = 'true').
     *
     * @param container - The container to search within
     */
    private bindPaginationLinks(container: Document | HTMLElement): void {
        const paginationContainer = container.querySelector('#pagination-container') 
            ?? container.querySelector('.pagination');
        if (!paginationContainer) return;

        paginationContainer.querySelectorAll<HTMLAnchorElement>('a[href]').forEach((link) => {
            // Avoid double binding
            if (link.dataset['spabound'] === 'true') return;
            link.dataset['spabound'] = 'true';

            link.addEventListener('click', async (e: MouseEvent) => {
                e.preventDefault();

                const href = link.getAttribute('href');
                if (!href) return;

                await this.kernel.handle({
                    url: href,
                    target: link,
                    trigger: 'click',
                });
            });
        });
    }
}
