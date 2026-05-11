/**
 * @wlindabla/sonata_spa — DashboardSubscriber
 * Handles spa:dashboard events — fetches full page and replaces #app-main.
 * @author AGBOKOUDJO Franck <internationaleswebservices@gmail.com>
 */

import type { EventSubscriberInterface } from '@wlindabla/event_dispatcher';
import type { BrowserEventDispatcher } from '@wlindabla/event_dispatcher/browser';

import { SpaEvents, SpaCrudEvent} from '../Events';
import type {
    DomSwapManagerInterface, HistoryManagerInterface,
    PageFetcherInterface, SpaSubscriberInterface
} from '../contracts';
import type {SpaRouterOptions } from '../types';

import { AbstractCRUDPageSubscriber } from './AbstractCRUDPageSubscriber';
import { SpaParameterBag } from '../ParameterBag';
import { SonataSpaLogger } from '../Logger';

/**
 * Handles navigation to the SonataAdmin dashboard (spa:dashboard).
 *
 * The dashboard has a unique layout — widgets, charts, statistics —
 * completely different from CRUD pages.
 * Like ShowPageSubscriber, it performs a full #app-main swap.
 *
 * Full pipeline on spa:dashboard:
 *   1. PageFetcher.fetchFullPage(url)    → GET full dashboard HTML
 *   2. dispatch SpaResponseEvent         → developer can mutate HTML
 *   3. DomSwapManager.swap()             → ShowSwapStrategy (replaces #app-main)
 *   4. Update DOM references             → mainContentArea + mainContentHeader
 *   5. HistoryManager.push(url)          → pushState
 *   6. dispatch SpaNavigateCompletedEvent
 */
export class DashboardSubscriber extends AbstractCRUDPageSubscriber implements SpaSubscriberInterface {

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
            [SpaEvents.DASHBOARD]: {
                listener: 'onDashboard',
                priority: 0,
            },
        };
    }

    /**
     * Handle spa:dashboard event.
     *
     * @param event - The SpaCrudEvent dispatched by SpaKernel
     */
    public async onDashboard(event: SpaCrudEvent): Promise<void> {
        const { request, routeMatch } = event;

        try {
            // ── Step 1: Fetch the full dashboard page ─────────────────────────
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
            SonataSpaLogger.error('[DashboardSubscriber] Navigation failed:', error);
            if (SpaParameterBag.getEnv() === "prod") {
                window.location.href = request.url;
            }
        }
    }
}
