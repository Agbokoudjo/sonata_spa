/**
 * @wlindabla/sonata_spa — ListPageSubscriber
 * Handles crud:list events — fetches fragment and performs surgical DOM swap.
 * @author AGBOKOUDJO Franck <internationaleswebservices@gmail.com>
 */

import type { EventSubscriberInterface } from '@wlindabla/event_dispatcher';
import type { BrowserEventDispatcher } from '@wlindabla/event_dispatcher/browser';

import { SpaEvents, SpaCrudEvent} from '../Events';
import type {
    DomSwapManagerInterface,
    HistoryManagerInterface,
    SpaSubscriberInterface
} from '../contracts';
import type { SpaResponse, SpaRouterOptions } from '../types';

import { PageFetcher } from '../Fetcher/PageFetcher';
import { SpaParameterBag } from '../ParameterBag';
import { AbstractCRUDPageSubscriber } from './AbstractCRUDPageSubscriber';
import { RouteResolver } from '../Router/RouteResolver';
import { SonataSpaLogger } from '../Logger';
/**
 * Handles navigation to Sonata list pages (crud:list).
 *
 * Full pipeline on crud:list:
 *   1. PageFetcher.fetchFragment(url)    → GET with X-Requested-With: XMLHttpRequest
 *   2. dispatch SpaResponseEvent         → developer can mutate HTML before swap
 *   3. DomSwapManager.swap()             → ListSwapStrategy (surgical swap)
 *   4. HistoryManager.push(url)          → pushState
 *   5. DomManager.reinitialize()         → scripts, BS5, Stimulus, pagination
 *   6. dispatch SpaNavigateCompletedEvent
 *
 * @example
 * ```typescript
 * // Registered automatically by SpaKernel.boot()
 * dispatcher.addSubscriber(new ListPageSubscriber(
 *   dispatcher, fetcher, swapManager, historyManager, domManager
 * ));
 * ```
 */
export class ListPageSubscriber extends AbstractCRUDPageSubscriber implements SpaSubscriberInterface {

    public constructor(
        private readonly dispatcher: BrowserEventDispatcher,
        _fetcher: PageFetcher,
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
            [SpaEvents.CRUD_LIST]: {
                listener: 'onList',
                priority: 0,
            },
        };
    }

    /**
     * Handle crud:list event.
     * Fetches the list fragment and performs a surgical DOM swap.
     *
     * @param event - The SpaCrudEvent dispatched by SpaKernel
     */
    public async onList(event: SpaCrudEvent): Promise<void> {
        const { request, routeMatch } = event;

        try {
            let spaResponse: SpaResponse;
            let __updateDomRefs = true;
            // ── Step 1: Fetch the list fragment ───────────────────────────────
            /**
             * if current page are not a page of curd by example if
             * current url is /admin/dashboard then it do fetchFullPage
             */
            if (RouteResolver.needsFullPage(window.location.href) ||
                !RouteResolver.isSameResource(window.location.href, request.url)) {
                spaResponse = await this.fetcher.fetchFullPage(
                    request.url,
                    request,
                    routeMatch
                );
                __updateDomRefs = true;
            } else {
                spaResponse = await this.fetcher.fetchFragment(
                    request.url,
                    request,
                    routeMatch
                );
            }

            this.finalizeNavigation(
                request,
                spaResponse,
                routeMatch,
                this.historyManager,
                this.dispatcher,
                __updateDomRefs)

        } catch (error) {
            SonataSpaLogger.error('[ListPageSubscriber] Navigation failed:', error);
            // Fall back to full server navigation
            if (SpaParameterBag.getEnv() === "prod") {
                window.location.href = request.url;
            }
        }
    }
}
