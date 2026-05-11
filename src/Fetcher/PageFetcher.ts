/**
 * @wlindabla/sonata_spa — PageFetcher
 * Encapsulates all HTTP fetching logic using @wlindabla/http_client.
 * Used by Page Subscribers to fetch HTML content from the Symfony server.
 * @author AGBOKOUDJO Franck <internationaleswebservices@gmail.com>
 */

import { FetchRequest} from '@wlindabla/http_client/core';
import { RequestType, EventTargetType, FetchRequestOptions } from '@wlindabla/http_client/types';
import type { BrowserEventDispatcher } from '@wlindabla/event_dispatcher/browser';

import { FetchDelegateAdapter } from './FetchDelegateAdapter';
import type { PageFetcherInterface } from '../contracts/';
import type { SpaRequest, SpaResponse, RouteMatch } from '../types';
/**
 * Handles all HTTP page fetching for the SPA router.
 * Uses @wlindabla/http_client under the hood.
 *
 * Two fetch modes:
 *
 *   fetchFragment(url)
 *     → Sends X-Requested-With: XMLHttpRequest header
 *     → Used for list pages — server can return a partial HTML fragment
 *     → Faster — less HTML to transfer
 *
 *   fetchFullPage(url)
 *     → No XHR header — server returns full HTML page
 *     → Used for show and dashboard pages
 *     → The SpaKernel extracts #app-main from the full HTML
 *
 * Both methods return a SpaResponse with:
 *   - html: raw HTML string
 *   - virtualDoc: DOMParser result — ready for DOM swap
 *   - routeMatch: the RouteMatch that triggered this fetch
 *   - statusCode: HTTP response status code
 *  @author AGBOKOUDJO Franck <internationaleswebservices@gmail.com>
 */
export class PageFetcher implements PageFetcherInterface {

    private readonly fetchRequest: FetchRequest;
    private readonly _defaultFetchRequestOptions: FetchRequestOptions;
    /**
     * @param dispatcher - The BrowserEventDispatcher for spa:fetch:* events
     * @param mainContentArea - The main content area element for loading state
     * @param mainContentHeader - The content header element for loading state (nullable)
     */
    public constructor(
        private readonly dispatcher: BrowserEventDispatcher,
        private readonly delegate: FetchDelegateAdapter,
        mainContentArea: HTMLElement,
        mainContentHeader: HTMLElement | null = null
    ) {
        // Set loading targets for the delegate
        const loadingTargets: HTMLElement[] = [mainContentArea];
        if (mainContentHeader) {
            loadingTargets.push(mainContentHeader);
        }
        this.delegate.setLoadingTargets(loadingTargets);
        this._defaultFetchRequestOptions = {
            credentials: 'same-origin',
            methodSend: 'GET',
            responseType: 'text',
            retryOnStatusCode: false,
            keepalive: false,
            url:'', //by default
            timeout: 58000
        };
        // Initialize the FetchRequest with default options
        // Options are overridden per-request in fetchFragment/fetchFullPage
        this.fetchRequest = new FetchRequest(
            this.delegate,
            this.dispatcher,
            this._defaultFetchRequestOptions,
            RequestType.MAIN,
            {
                type: EventTargetType.WINDOW,
                instance: window
            }
        );
    }

    /**
     * Fetch a page fragment via AJAX.
     *
     * Sends X-Requested-With: XMLHttpRequest so the Symfony controller
     * can detect AJAX requests and return a partial HTML response.
     *
     * Used for: list pages, filtered list, paginated list, sorted list.
     *
     * @param url - The URL to fetch
     * @param spaRequest - The original SPA request (for event payloads)
     * @param routeMatch - The resolved RouteMatch
     * @returns SpaResponse with parsed HTML
     */
    public async fetchFragment(
        url: string,
        spaRequest: SpaRequest,
        routeMatch: RouteMatch
    ): Promise<SpaResponse> {
        this.delegate.setSpaRequest(spaRequest);
        this.fetchRequest.fetchRequestOptions = {
            ...this._defaultFetchRequestOptions,
            url:url,
            headers: {
                'X-Requested-With': 'XMLHttpRequest',
                'Accept': 'text/html',
            },
        };
        
        const response = await this.fetchRequest.handle();
        return this.buildSpaResponse(response.data as string, routeMatch, response.statusCode ?? 200);
    }

    /**
     * Fetch a full HTML page.
     *
     * No XHR header — server returns the complete HTML page.
     * Used when we need to replace the entire #app-main container.
     *
     * Used for: show pages, dashboard, first navigation from dashboard.
     *
     * @param url - The URL to fetch
     * @param spaRequest - The original SPA request (for event payloads)
     * @param routeMatch - The resolved RouteMatch
     * @returns SpaResponse with parsed full HTML
     */
    public async fetchFullPage(
        url: string,
        spaRequest: SpaRequest,
        routeMatch: RouteMatch
    ): Promise<SpaResponse> {
        this.delegate.setSpaRequest(spaRequest);
        this.fetchRequest.fetchRequestOptions = {
            ...this._defaultFetchRequestOptions,
            url:url,
            headers: {
                'Accept': 'text/html',
            }
        };
       
        const response = await this.fetchRequest.handle();
        return this.buildSpaResponse(response.data as string, routeMatch, response.statusCode ?? 200);
    }

    /**
     * Build a SpaResponse from raw HTML.
     * Parses the HTML with DOMParser and constructs the response object.
     *
     * @param html - Raw HTML string from the server
     * @param routeMatch - The RouteMatch that triggered this fetch
     * @param statusCode - HTTP response status code
     * @returns SpaResponse ready for DOM swap
     */
    private buildSpaResponse(
        html: string,
        routeMatch: RouteMatch,
        statusCode: number
    ): SpaResponse {
        const virtualDoc = new DOMParser().parseFromString(html, 'text/html');

        return {
            html,
            virtualDoc,
            routeMatch,
            statusCode,
        };
    }

    /**
     * Update the loading targets when DOM references change after a swap.
     * Called by Page Subscribers after a full page swap that replaces
     * mainContentArea and mainContentHeader.
     *
     * @param mainContentArea - The new content area element
     * @param mainContentHeader - The new content header element (nullable)
     */
    public updateLoadingTargets(
        mainContentArea: HTMLElement,
        mainContentHeader: HTMLElement | null
    ): void {
        const targets: HTMLElement[] = [mainContentArea];
        if (mainContentHeader) {
            targets.push(mainContentHeader);
        }
        this.delegate.setLoadingTargets(targets);
    }
}
