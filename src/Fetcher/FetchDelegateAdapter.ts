/**
 * @wlindabla/sonata_spa — FetchDelegateAdapter
 * Implements FetchDelegateInterface from @wlindabla/http_client.
 * Bridges the http_client lifecycle callbacks to SPA events.
 * @author AGBOKOUDJO Franck <internationaleswebservices@gmail.com>
 */

import type {
    FetchDelegateInterface,
    FetchRequestInterface,
    FetchResponseInterface
} from '@wlindabla/http_client/contracts';
import { HttpFetchError } from '@wlindabla/http_client/core';
import type { BrowserEventDispatcher } from '@wlindabla/event_dispatcher/browser';
import { SpaEvents, SpaFetchErrorEvent } from '../Events';
import type { SpaRequest } from '../types';
import { SpaParameterBag } from '../ParameterBag';
import { SonataSpaLogger } from '../Logger';

/**
 * Adapts the @wlindabla/http_client FetchDelegateInterface
 * to dispatch SPA lifecycle events at each HTTP request stage.
 *
 * Each callback dispatches the corresponding spa:fetch:* event
 * so the developer can hook into any stage of the fetch pipeline.
 *
 * Lifecycle:
 *   prepareRequest    → spa:fetch:prepare
 *   requestStarted    → spa:fetch:started   (show loading state)
 *   requestSucceeded  → spa:fetch:succeeded
 *   requestFailed     → spa:fetch:failed    (4xx / 5xx)
 *   requestErrored    → spa:fetch:errored   (network / timeout)
 *   requestFinished   → spa:fetch:finished  (always — hide loading state)
 *
 * On network error (requestErrored):
 *   Falls back to window.location.href for resilience.
 *   The developer can listen to spa:fetch:errored to handle this case.
 * @author AGBOKOUDJO Franck <internationaleswebservices@gmail.com>
 */
export class FetchDelegateAdapter implements FetchDelegateInterface {

    /**
     * The original SPA request that triggered this fetch.
     * Used to populate event payloads.
     */
    private spaRequest: SpaRequest | null = null;

    /**
     * DOM elements to show loading state on during fetch.
     * Opacity reduced + pointer events disabled while loading.
     */
    private loadingTargets: HTMLElement[] = [];

    public constructor(
        private readonly dispatcher: BrowserEventDispatcher
    ) {}

    /**
     * Set the SPA request context for this fetch operation.
     * Called by PageFetcher before each fetch.
     *
     * @param request - The SPA navigation request that triggered this fetch
     */
    public setSpaRequest(request: SpaRequest): void {
        this.spaRequest = request;
    }

    /**
     * Set the DOM elements to show loading state on.
     * Called by PageFetcher with mainContentArea and mainContentHeader.
     *
     * @param targets - Elements to apply loading styles to
     */
    public setLoadingTargets(targets: HTMLElement[]): void {
        this.loadingTargets = targets.filter(Boolean);
    }

    /**
     * Called just before the HTTP request is sent.
     * Dispatches spa:fetch:prepare.
     * Use this to add custom headers dynamically.
     */
    public prepareRequest(request: FetchRequestInterface): void {
        this.dispatcher.dispatch(
            { request, spaRequest: this.spaRequest },
            SpaEvents.FETCH_PREPARE
        );
    }

    /**
     * Called when the HTTP request starts.
     * Dispatches spa:fetch:started and shows loading state.
     */
    public requestStarted(request: FetchRequestInterface): void {
        this.setLoading(true);

        this.dispatcher.dispatch(
            { request, spaRequest: this.spaRequest },
            SpaEvents.FETCH_STARTED
        );
    }

    /**
     * Called when the server returns a 2xx response.
     * Dispatches spa:fetch:succeeded.
     */
    public requestSucceededWithResponse(
        request: FetchRequestInterface,
        fetchResponse: FetchResponseInterface<unknown>
    ): void {
        this.dispatcher.dispatch(
            { request, fetchResponse, spaRequest: this.spaRequest },
            SpaEvents.FETCH_SUCCEEDED
        );
    }

    /**
     * Called when the server returns a 4xx or 5xx response.
     * Dispatches spa:fetch:failed.
     */
    public requestFailedWithResponse(
        request: FetchRequestInterface,
        fetchResponse: FetchResponseInterface<unknown>
    ): void {
        this.dispatcher.dispatch(
            { request, fetchResponse, spaRequest: this.spaRequest },
            SpaEvents.FETCH_FAILED
        );
    }

    /**
     * Called on network error, timeout or abort.
     * Dispatches spa:fetch:errored and SpaFetchErrorEvent.
     * Falls back to window.location.href for resilience.
     */
    public requestErrored(request: FetchRequestInterface, error: Error): void {
        if (this.spaRequest) {
            const errorEvent = new SpaFetchErrorEvent(this.spaRequest, error);
            this.dispatcher.dispatch(errorEvent, SpaEvents.FETCH_ERRORED);
        }

        // Only fall back to server on genuine network errors
        // not on HttpFetchError with a status code (those are handled by requestFailedWithResponse)
        if (!(error instanceof HttpFetchError)) {
            return;
        }

        SonataSpaLogger.error('[HttpFetchError]',error)
        // Network error or timeout — fall back to full server navigation
        if (SpaParameterBag.getEnv() === "prod") {
            window.location.href = request.url.toString();
        }
    }

    /**
     * Called when the HTTP request finishes — always, success or error.
     * Dispatches spa:fetch:finished and hides loading state.
     */
    public requestFinished(request: FetchRequestInterface): void {
        this.setLoading(false);

        this.dispatcher.dispatch(
            { request, spaRequest: this.spaRequest },
            SpaEvents.FETCH_FINISHED
        );

        // Reset context after each request
        this.spaRequest = null;
    }

    /**
     * Apply or remove loading styles on the registered loading targets.
     * Reduces opacity and disables pointer events while loading.
     *
     * @param loading - true to show loading, false to hide
     */
    private setLoading(loading: boolean): void {
        for (const target of this.loadingTargets) {
            target.style.opacity = loading ? '0.4' : '1';
            target.style.pointerEvents = loading ? 'none' : '';
            target.style.transition = 'opacity 0.15s ease';
        }
    }

    public requestPreventedHandlingResponse(request: FetchRequestInterface, fetchResponse: FetchResponseInterface<any>): void {
        console.log(request, fetchResponse);
    }
}
