/**
 * @wlindabla/sonata_spa — AbstractCRUDPageSubscriber
 * @author AGBOKOUDJO Franck <internationaleswebservices@gmail.com>
 */

import type {
    RouteMatch, SpaRequest,
    SpaResponse,
    SpaRouterOptions,
    SwapContext
} from '../types';

import type { EventDispatcherInterface } from '@wlindabla/event_dispatcher';

import { SpaEvents,SpaResponseEvent, SpaNavigateCompletedEvent } from '../Events';

import type {
    DomSwapManagerInterface, 
    HistoryManagerInterface,
    PageFetcherInterface
} from '../contracts';

/**
 * @author AGBOKOUDJO Franck <internationaleswebservices@gmail.com>
 */
export abstract class AbstractCRUDPageSubscriber  {

    /** Mutable references — updated after each full page swap */
    protected mainContentArea: HTMLElement;
    protected mainContentHeader: HTMLElement | null;

    protected constructor(
        protected readonly fetcher: PageFetcherInterface,
        protected readonly swapManager: DomSwapManagerInterface,
        private mainContainer: HTMLElement,
        mainContentArea: HTMLElement,
        mainContentHeader: HTMLElement | null,
        private readonly options: SpaRouterOptions
    ) {
        this.mainContentArea = mainContentArea;
        this.mainContentHeader = mainContentHeader;
    }

    protected finalizeNavigation(
        request: SpaRequest,
        spaResponse: SpaResponse,
        routeMatch: RouteMatch,
        historyManager:HistoryManagerInterface,
        dispatcher: EventDispatcherInterface,
        _updateDomReferences:boolean =true
    ): void {

        // ── Step 2: dispatch SpaResponseEvent (MUTABLE) ───────────────────
        const responseEvent = new SpaResponseEvent(request, spaResponse);
        dispatcher.dispatch(responseEvent, SpaEvents.RESPONSE);

        // ── Step 3: Build SwapContext and perform DOM swap ─────────────────
        const swapContext: SwapContext = {
            response: responseEvent.response,
            routeMatch,
            mainContainer: this.mainContainer,
            mainContentArea: this.mainContentArea,
            mainContentHeader: this.mainContentHeader,
        };

        this.swapManager.swap(swapContext);

        // ── Step 4: Update DOM references after full page swap ─────────────
        if (_updateDomReferences) {
            this.updateDomReferences();
        }

        // ── Step 5: Push URL to browser history ───────────────────────────
        historyManager.push(request.url, routeMatch);

        // ── Step 6: dispatch spa:navigate:completed ────────────────────────
        const completedEvent = new SpaNavigateCompletedEvent(
            window.location.href,
            request.url,
            routeMatch,
            this.mainContainer,
            this.mainContentArea,
            this.mainContentHeader,
        );

        dispatcher.dispatch(completedEvent, SpaEvents.NAVIGATE_COMPLETED);
    }


    /**
     * Re-query DOM references after a full page swap.
     * ShowSwapStrategy replaces #app-main.innerHTML so the previous
     * references to mainContentArea and mainContentHeader are stale.
     * Also updates the PageFetcher loading targets.
     */
    protected updateDomReferences(): void {
        const { router } = this.options;

        // Main container
        const mainContainer = document.querySelector<HTMLElement>(
            router.mainSelector ?? '#app-main'
        ) ?? document.querySelector<HTMLElement>('.app-main')
            ?? document.querySelector<HTMLElement>('main')
            ?? document.querySelector<HTMLElement>('.content-wrapper');

        if (mainContainer) {
            this.mainContainer = mainContainer;
        }

        const newContentArea = document.querySelector<HTMLElement>(
            router.mainContentAreaSelector ?? '#app-content'
        ) ?? document.querySelector<HTMLElement>('.app-content')
            ?? document.querySelector(".content");

        const newContentHeader = document.querySelector<HTMLElement>(
            router.mainContentHeaderSelector ?? '#app-content-header'
        ) ?? document.querySelector<HTMLElement>('.app-content-header')
            ?? document.querySelector(".content-header");
        ;

        if (newContentArea) {
            this.mainContentArea = newContentArea;
        }

        this.mainContentHeader = newContentHeader;

        // Update PageFetcher loading targets with new references
        this.fetcher.updateLoadingTargets(this.mainContentArea, this.mainContentHeader);
    }
}
