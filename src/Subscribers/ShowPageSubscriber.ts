/**
 * @wlindabla/sonata_spa — ShowPageSubscriber
 * Handles crud:show events — fetches full page and replaces #app-main.
 * @author AGBOKOUDJO Franck <internationaleswebservices@gmail.com>
 */

import type { EventSubscriberInterface } from '@wlindabla/event_dispatcher';
import type { BrowserEventDispatcher } from '@wlindabla/event_dispatcher/browser';
import { SpaEvents, SpaCrudEvent } from '../Events';
import type { DomSwapManagerInterface, HistoryManagerInterface, PageFetcherInterface, SpaSubscriberInterface } from '../contracts';
import type { SpaRouterOptions } from '../types';
import { SpaParameterBag } from '../ParameterBag';
import { AbstractCRUDPageSubscriber } from './AbstractCRUDPageSubscriber';

/**
 * Handles navigation to Sonata show pages (crud:show).
 *
 * Unlike list pages, show pages require a full page fetch
 * because their layout is completely different from the list.
 *
 * Full pipeline on crud:show:
 *   1. PageFetcher.fetchFullPage(url)    → GET full HTML page
 *   2. dispatch SpaResponseEvent         → developer can mutate HTML before swap
 *   3. DomSwapManager.swap()             → ShowSwapStrategy (replaces #app-main)
 *   4. Update DOM references             → mainContentArea + mainContentHeader
 *   5. HistoryManager.push(url)          → pushState
 *   6. dispatch SpaNavigateCompletedEvent
 */
export class ShowPageSubscriber extends AbstractCRUDPageSubscriber implements SpaSubscriberInterface {

    public constructor(
        private readonly dispatcher: BrowserEventDispatcher,
        _fetcher: PageFetcherInterface,
        _swapManager: DomSwapManagerInterface,
        private readonly historyManager: HistoryManagerInterface,
        _mainContainer: HTMLElement,
        _mainContentArea: HTMLElement,
        _mainContentHeader: HTMLElement | null,
        _options: SpaRouterOptions
    ) {
        super(_fetcher,
            _swapManager,
            _mainContainer,
            _mainContentArea,
            _mainContentHeader,
            _options
        );
    }

    public getSubscribedEvents(): ReturnType<EventSubscriberInterface['getSubscribedEvents']> {
        return {
            [SpaEvents.CRUD_SHOW]: {
                listener: 'onShow',
                priority: 0,
            },
        };
    }

    /**
     * Handle crud:show event.
     * Fetches the full page and replaces the entire #app-main container.
     *
     * @param event - The SpaCrudEvent dispatched by SpaKernel
     */
    public async onShow(event: SpaCrudEvent): Promise<void> {
        const { request, routeMatch } = event;

        try {
            // ── Step 1: Fetch the full page ───────────────────────────────────
            const spaResponse = await this.fetcher.fetchFullPage(
                request.url,
                request,
                routeMatch
            );

            this.finalizeNavigation(
                request,
                spaResponse,
                routeMatch,
                this.historyManager,
                this.dispatcher)
            
        } catch (error) {
            console.error('[ShowPageSubscriber] Navigation failed:', error);
            if (SpaParameterBag.getEnv() === "prod") {
                window.location.href = request.url;
            }
        }
    }

    /**
     * Get the current mainContentArea reference.
     * Used by SpaKernel to keep references in sync after a show swap.
     */
    public getMainContentArea(): HTMLElement {
        return this.mainContentArea;
    }

    /**
     * Get the current mainContentHeader reference.
     */
    public getMainContentHeader(): HTMLElement | null {
        return this.mainContentHeader;
    }
}
