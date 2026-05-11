/**
 * @wlindabla/sonata_spa — BatchPageSubscriber
 * Handles crud:batch events — posts the batch form, shows the confirmation modal,
 * then re-submits with confirmation=ok and dispatches the batch lifecycle events.
 * @author AGBOKOUDJO Franck <internationaleswebservices@gmail.com>
 */

import {
    SpaEvents,
    SpaCrudEvent,
    SpaBatchConfirmRequestedEvent,
    SpaBatchProcessingEvent,
    SpaBatchSucceededEvent,
    SpaBatchFailedEvent
} from '../Events';

import type { EventSubscriberInterface } from '@wlindabla/event_dispatcher';
import type { BrowserEventDispatcher } from '@wlindabla/event_dispatcher/browser';

import { FetchResponse } from '@wlindabla/http_client/core';
import type { BatchConfirmData, RouteMatch } from '../types';
import type { BatchFetcherInterface, SpaSubscriberInterface } from '../contracts';

import { SonataSpaLogger } from '../Logger';
import { SpaParameterBag } from '../ParameterBag';

/**
 * Handles navigation to Sonata batch pages (crud:batch).
 *
 * Full pipeline on crud:batch:
 *   1. Read the submitted batch form — check that at least one item is selected
 *   2. POST to Sonata batch URL → Sonata returns the confirmation HTML page
 *   3. BatchFetcher parses the page → extracts csrfToken, encodedData, title, message
 *   4. Dispatch {@link SpaEvents.BATCH_CONFIRM_REQUESTED} → UI shows confirmation modal
 *      The developer's handler calls:
 *        event.accept() → proceeds with the confirmed batch POST
 *        event.cancel() → dispatches {@link SpaEvents.BATCH_CONFIRM_CANCELLED}
 *   5. If accepted → POST batch URL with confirmation=ok + csrfToken + encodedData
 *   6. On success  → dispatch {@link SpaEvents.BATCH_SUCCEEDED} → navigate to list
 *   7. On failure  → dispatch {@link SpaEvents.BATCH_FAILED}
 *
 * The developer provides the confirmation UI by listening to:
 *   {@link SpaEvents.BATCH_CONFIRM_REQUESTED}
 *
 * @example
 * ```typescript
 * dispatcher.addListener(SpaEvents.BATCH_CONFIRM_REQUESTED, async (event) => {
 *   const result = await Swal.fire({
 *     title: event.confirmData.title ?? 'Are you sure?',
 *     text: event.confirmData.message ?? 'This action cannot be undone.',
 *     icon: 'warning',
 *     showCancelButton: true,
 *     confirmButtonText: event.confirmData.btnDeleteText ?? 'Execute',
 *   });
 *   if (result.isConfirmed) { await event.accept(); } else { event.cancel(); }
 * });
 * ```
 */
export class BatchPageSubscriber implements SpaSubscriberInterface {

    public constructor(
        private readonly dispatcher: BrowserEventDispatcher,
        private readonly batchFetcher: BatchFetcherInterface,
        private readonly navigate: (url: string) => Promise<void>
    ) { }

    public getSubscribedEvents(): ReturnType<EventSubscriberInterface['getSubscribedEvents']> {
        return {
            [SpaEvents.CRUD_BATCH]: {
                listener: 'onBatch',
                priority: 0,
            },
        };
    }

    /**
     * Handle crud:batch event.
     * Reads the form, checks the selection, fetches the confirmation page,
     * then delegates to the developer's confirmation UI handler.
     *
     * @param event - The SpaCrudEvent dispatched by SpaKernel
     */
    public async onBatch(event: SpaCrudEvent): Promise<void> {
        const { request, routeMatch } = event;

        const form = request.target as HTMLFormElement | undefined;
        if (!form) return;

        const formData = new FormData(form);
        formData.append('_method', form.getAttribute('method') ?? 'POST');
        const idx = formData.getAll('idx[]') as string[];
        const allElements = formData.get('all_elements') === '1';

        let url = form.getAttribute('action');
        if (!url) {
            throw new Error('[BatchBindingManager] Form action attribute is missing');
        }

        // Guard — no items selected: fall back to server-side handling
        if (idx.length === 0 && !allElements) {
            if (SpaParameterBag.getEnv() === "prod") {
                window.location.href = url;
            }
            return;
        }

        try {
            // ── Step 1: POST batch form → get confirmation page ────────────
            const confirmData = await this.batchFetcher.batchConfirmFetcher(
                url,
                formData,
                request,
                routeMatch 
            );

            if (!confirmData) {
                // Fetch failed — fall back to full server navigation
                await this.navigate(form.action.replace('/batch', '/list'));
                return;
            }

            // ── Step 2: Dispatch BATCH_CONFIRM_REQUESTED ───────────────────
            const confirmEvent = new SpaBatchConfirmRequestedEvent(confirmData, routeMatch);

            confirmEvent.onAccept(async () => {
                await this.performBatch(confirmData, routeMatch);
            });

            confirmEvent.onCancel(() => {
                this.dispatcher.dispatch(
                    { routeMatch },
                    SpaEvents.BATCH_CONFIRM_CANCELLED
                );
            });

            await this.dispatcher.dispatchAsync(
                confirmEvent,
                SpaEvents.BATCH_CONFIRM_REQUESTED
            );

        } catch (error) {
            SonataSpaLogger.error('[BatchPageSubscriber#onBatch] Unexpected error:', error);

            if (SpaParameterBag.getEnv() === "prod") {
                window.location.href =url;
            }
        }
    }

    /**
     * Execute the confirmed batch POST request and dispatch the lifecycle events.
     *
     * Dispatches the full batch lifecycle:
     *   - {@link SpaEvents.BATCH_PROCESSING}  immediately after user confirms
     *   - {@link SpaEvents.BATCH_SUCCEEDED}   on 2xx response
     *   - {@link SpaEvents.BATCH_FAILED}      on 4xx–599 response
     *
     * On success, navigates to the list page after a short delay so consumers
     * of BATCH_SUCCEEDED have time to display feedback.
     *
     * @param confirmData - The data extracted from the Sonata confirmation page
     * @param routeMatch  - The RouteMatch resolved from the original batch URL
     */
    private async performBatch(
        confirmData: BatchConfirmData,
        routeMatch: RouteMatch
    ): Promise<void> {
        try {
            // ── Step 1: Notify consumers that the batch action is in progress ─
            this.dispatcher.dispatch(
                new SpaBatchProcessingEvent(
                    routeMatch,
                    'Batch action in progress...',
                    'The batch operation is being processed. Please wait.'
                ),
                SpaEvents.BATCH_PROCESSING
            );

            // ── Step 2: Send the confirmed batch POST ─────────────────────────
            const response = await this.batchFetcher.executeBatch(confirmData) as FetchResponse;

            // ── Step 3a: Server returned 4xx–599 → dispatch BATCH_FAILED ──────
            if (response.failed) {
                /**
                 * statusCode and statusText are read directly from the HTTP response.
                 * Even when the server returns a minimal error body, the HTTP layer
                 * always carries a status code (e.g. 403, 500) and a status text
                 * (e.g. "Forbidden", "Internal Server Error").
                 * We forward both as-is so consumers can display or log the exact cause.
                 */
                this.dispatcher.dispatch(
                    new SpaBatchFailedEvent(
                        routeMatch,
                        response.statusCode,
                        response.statusText
                    ),
                    SpaEvents.BATCH_FAILED
                );
                return;
            }

            // ── Step 3b: 2xx → extract optional title/message from response ───
            const data = (response.data as Record<string, unknown>) ?? {};

            /**
             * Sonata may return a JSON body with message/title keys when the
             * controller is overridden for XHR support. When absent, fall back
             * to safe English defaults so consumers always receive meaningful strings.
             */
            const title = (
                typeof data['title'] === 'string' ? data['title'] : null
            ) ?? 'Batch action completed';

            const message = (
                typeof data['message'] === 'string'
                    ? data['message']
                    : typeof data['messageBody'] === 'string'
                        ? data['messageBody']
                        : null
            ) ?? 'The batch action has been successfully executed.';

            // ── Step 4: Dispatch BATCH_SUCCEEDED ─────────────────────────────
            this.dispatcher.dispatch(
                new SpaBatchSucceededEvent(routeMatch, message, title),
                SpaEvents.BATCH_SUCCEEDED
            );

            // ── Step 5: Navigate to list after a short delay ──────────────────
            /**
             * The 3-second delay gives BATCH_SUCCEEDED consumers (toast, snackbar)
             * enough time to display before the page transitions.
             */
            const listUrl = confirmData.confirmUrl.replace(/\/batch(\?.*)?$/, '/list');
            setTimeout(async () => {
                await this.navigate(listUrl);
            }, 3000);

        } catch (error) {
            console.error('[BatchPageSubscriber#performBatch] Unexpected error during batch:', error);
            // Network-level failure — SpaFetchErrorEvent is already dispatched
            // by FetchDelegateAdapter. No further dispatch needed here.
        }
    }
}