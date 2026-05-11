/**
 * @wlindabla/sonata_spa — DomManager
 * Re-initializes the DOM after each SPA swap.
 * Handles inline scripts, Stimulus controllers, Bootstrap 5 components,
 * pagination links, sorting links and batch checkboxes.
 * @author AGBOKOUDJO Franck <internationaleswebservices@gmail.com>
 */

import type { BrowserEventDispatcher } from '@wlindabla/event_dispatcher/browser';
import { SpaEvents, SpaDomReadyEvent } from '../Events';
import type { RouteMatch } from '../types';

/**
 * Re-initializes the DOM after each SPA navigation swap.
 *
 * When the SPA replaces DOM content via innerHTML or replaceWith(),
 * several things break and need to be manually re-initialized:
 *
 *   1. Inline <script> tags           → cloned and re-executed
 *   2. Stimulus controllers           → outlets re-synchronized (Sonata uniqid)
 *   3. Date controllers               → Intl.DateTimeFormat formatting
 *   4. Bootstrap 5 Dropdowns         → re-instantiated
 *   5. Bootstrap 5 Tooltips          → re-instantiated
 *   6. Pagination links               → rebound via PaginationBindingManager
 *   7. Sort links                     → rebound via FilterBindingManager
 *   8. Batch select-all checkbox      → rebound
 *
 * After all re-initialization, dispatches SpaDomReadyEvent (spa:dom:ready)
 * so BindingManagers and third-party modules can rebind themselves.
 *
 * Usage — called by Page Subscribers after each DOM swap:
 * ```typescript
 * domManager.reinitialize(mainContentArea, routeMatch);
 * ```
 */
export class DomManager {

    public constructor(
        private readonly dispatcher: BrowserEventDispatcher
    ) {}

    /**
     * Main entry point — called after each SPA DOM swap.
     * Re-initializes all DOM-dependent features in the correct order.
     *
     * @param container - The swapped container element to reinitialize within
     * @param routeMatch - The RouteMatch of the current navigation
     */
    public reinitialize(container: HTMLElement, routeMatch: RouteMatch): void {
        // Order matters — scripts first, then components that may depend on them
        this.reExecuteScripts(container);
        this.reconnectStimulusOutlets(container);
        this.reinitializeDateControllers(container);
        this.reinitializeBootstrapDropdowns(container);
        this.reinitializeBootstrapTooltips(container);
        this.reinitializeBatchCheckbox(container);

        // Dispatch spa:dom:ready — BindingManagers call rebind() here
        const domReadyEvent = new SpaDomReadyEvent(container, routeMatch);
        this.dispatcher.dispatch(domReadyEvent, SpaEvents.DOM_READY);
    }

    // ─── 1. Inline scripts ────────────────────────────────────────────────────

    /**
     * Re-execute inline <script> tags injected by the server response.
     *
     * When content is injected via innerHTML, <script> tags are NOT executed
     * by the browser. We must clone and replace each script element to trigger
     * execution.
     *
     * External scripts already loaded in <head> are skipped to avoid
     * double-loading.
     *
     * @param container - The container to search for scripts
     */
    private reExecuteScripts(container: HTMLElement): void {
        container.querySelectorAll<HTMLScriptElement>('script').forEach((oldScript) => {
            // Skip external scripts already present in <head>
            if (
                oldScript.src &&
                document.querySelector(`script[src="${oldScript.src}"]`)
            ) {
                oldScript.remove();
                return;
            }

            const newScript = document.createElement('script');

            // Copy all attributes (type, src, async, defer, etc.)
            Array.from(oldScript.attributes).forEach((attr) => {
                newScript.setAttribute(attr.name, attr.value);
            });

            // Copy inline script content
            if (!oldScript.src) {
                newScript.textContent = oldScript.textContent;
            }

            oldScript.parentNode?.replaceChild(newScript, oldScript);
        });
    }

    // ─── 2. Stimulus outlets ──────────────────────────────────────────────────

    /**
     * Re-synchronize Stimulus controller outlets after a DOM swap.
     *
     * SonataAdmin uses Stimulus for its filter system. The outlets use
     * element IDs that contain a unique hash (uniqid) generated server-side.
     * After a swap, the new IDs are different from the old ones → outlets break.
     *
     * Solution: find the new IDs and update the outlet attributes,
     * then force Stimulus to reconnect by temporarily removing/restoring
     * the data-controller attribute.
     *
     * Stimulus observes the DOM via MutationObserver so new elements with
     * data-controller are detected automatically — we only need to fix outlets.
     *
     * @param container - The swapped container
     */
    private reconnectStimulusOutlets(container: HTMLElement): void {
        const filterContainer = container.querySelector(
            '[data-controller~="sonata-filter"]'
        ) as HTMLElement | null;

        const filterList = document.querySelector(
            '[data-controller~="sonata-filter-list"]'
        ) as HTMLElement | null;

        if (filterContainer && filterList) {
            const newContainerId = filterContainer.id;
            const newListId = filterList.id;

            if (newContainerId) {
                filterContainer.setAttribute(
                    'data-sonata-filter-sonata-filter-list-outlet',
                    `#${newListId}`
                );
            }

            if (newListId) {
                filterList.setAttribute(
                    'data-sonata-filter-list-sonata-filter-outlet',
                    `#${newContainerId}`
                );
            }

            // Force Stimulus to reconnect by cycling data-controller attribute
            this.forceReconnect(filterContainer, 'sonata-filter');
            this.forceReconnect(filterList, 'sonata-filter-list');
        }

        // Reconnect all other Stimulus controllers in the container
        container.querySelectorAll<HTMLElement>('[data-controller]').forEach((el) => {
            const controllers = el.getAttribute('data-controller')?.split(/\s+/) ?? [];

            controllers
                .filter(Boolean)
                .filter((name) => name !== 'date' && name !== 'sonata-filter')
                .forEach((name) => this.forceReconnect(el, name));
        });
    }

    /**
     * Force Stimulus to disconnect and reconnect a specific controller
     * on an element by temporarily removing it from data-controller.
     *
     * @param element - The element with the Stimulus controller
     * @param controllerName - The name of the controller to reconnect
     */
    private forceReconnect(element: HTMLElement, controllerName: string): void {
        // Mémorise l'état des advanced avant disconnect
        const advancedStates = new Map<HTMLElement, boolean>();
        element.querySelectorAll<HTMLElement>('[data-sonata-filter-target="advanced"]')
            .forEach(el => advancedStates.set(el, !!el.hidden));
        
        const current = element.getAttribute('data-controller') ?? '';
        const others = current
            .split(/\s+/)
            .filter((c) => c !== controllerName && c !== '');

        // Step 1 — remove controller → Stimulus calls disconnect()
        if (others.length === 0) {
            element.removeAttribute('data-controller');
        } else {
            element.setAttribute('data-controller', others.join(' '));
        }

        // Step 2 — restore at next frame → Stimulus calls connect()
        requestAnimationFrame(() => {
            const restored = [...others, controllerName].join(' ').trim();
            element.setAttribute('data-controller', restored);

            // Restaure l'état des advanced après reconnect
            advancedStates.forEach((wasHidden, el) => {
                (el as HTMLElement).hidden = wasHidden;
            });
        });
    }

    // ─── 3. Date controllers ──────────────────────────────────────────────────

    /**
     * Re-initialize Sonata's "date" Stimulus controller manually.
     *
     * The date controller formats <time> elements using Intl.DateTimeFormat.
     * We handle it manually because it is more reliable than Stimulus reconnection
     * and avoids double-formatting.
     *
     * After formatting, data-controller is removed so Stimulus never touches it again.
     *
     * @param container - The container to search for date elements
     */
    private reinitializeDateControllers(container: HTMLElement): void {
        container
            .querySelectorAll<HTMLTimeElement>('time[data-controller="date"]')
            .forEach((el) => {
                const dateValue = el.getAttribute('data-date-date-value');
                const locale = el.getAttribute('data-date-locale-value') ?? 'en';

                if (!dateValue) return;

                try {
                    const date = new Date(dateValue);
                    const formatted = new Intl.DateTimeFormat(locale, {
                        day: '2-digit',
                        month: '2-digit',
                        year: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit',
                    }).format(date);

                    el.textContent = formatted;

                    // Prevent Stimulus from re-processing this element
                    el.removeAttribute('data-controller');
                    el.setAttribute('data-date-formatted', 'true');

                } catch (error) {
                    console.warn('[DomManager] Date formatting error:', dateValue, error);
                }
            });
    }

    // ─── 4. Bootstrap 5 Dropdowns ─────────────────────────────────────────────

    /**
     * Re-initialize Bootstrap 5 Dropdown components.
     *
     * Bootstrap 5 components are initialized on elements present in the DOM
     * at script load time. New elements injected via SPA swap need manual init.
     *
     * Existing instances are disposed first to avoid memory leaks.
     *
     * Requires Bootstrap 5 to be available on window.bootstrap.
     *
     * @param container - The container to search for dropdown triggers
     */
    private reinitializeBootstrapDropdowns(container: HTMLElement): void {
        if (!window.bootstrap) return;

        if (!window.bootstrap!.Dropdown) return;

        container
            .querySelectorAll<HTMLElement>('[data-bs-toggle="dropdown"]')
            .forEach((el) => {
                window.bootstrap?.Dropdown.getInstance(el)?.dispose();
                new window.bootstrap!.Dropdown(el);
            });
    }

    // ─── 5. Bootstrap 5 Tooltips ──────────────────────────────────────────────

    /**
     * Re-initialize Bootstrap 5 Tooltip components.
     * Disposes existing instances before re-creating to avoid duplicates.
     *
     * @param container - The container to search for tooltip triggers
     */
    private reinitializeBootstrapTooltips(container: HTMLElement): void {
        if (!window.bootstrap?.Tooltip) return;

        container
            .querySelectorAll<HTMLElement>('[data-bs-toggle="tooltip"]')
            .forEach((el) => {
                window.bootstrap?.Tooltip.getInstance(el)?.dispose();
                new window.bootstrap!.Tooltip(el);
            });
    }

    // ─── 6. Batch select-all checkbox ─────────────────────────────────────────

    /**
     * Re-initialize the Sonata batch "select all" checkbox.
     *
     * The master checkbox (#list_batch_checkbox) toggles all row checkboxes.
     * It is replaced on every list swap so its event listener must be rebound.
     *
     * Uses dataset.spabound to prevent double binding.
     *
     * @param container - The container to search for the batch checkbox
     */
    private reinitializeBatchCheckbox(container: HTMLElement): void {
        const master = container.querySelector<HTMLInputElement>('#list_batch_checkbox');
        if (!master) return;

        if (master.dataset['spabound'] === 'true') return;
        master.dataset['spabound'] = 'true';

        master.addEventListener('change', (e: Event) => {
            const checked = (e.target as HTMLInputElement).checked;

            container
                .querySelectorAll<HTMLInputElement>('input[type="checkbox"][name="idx[]"]')
                .forEach((cb) => {
                    cb.checked = checked;
                });
        });
    }
}

// ─── Bootstrap 5 global type augmentation ─────────────────────────────────────

declare global {
    interface Window {
        bootstrap?: {
            Dropdown: {
                getInstance(el: HTMLElement): { dispose(): void } | null;
                new(el: HTMLElement): unknown;
            };
            Tooltip: {
                getInstance(el: HTMLElement): { dispose(): void } | null;
                new(el: HTMLElement): unknown;
            };
        };
        sonataApplication?: unknown;
    }
}
