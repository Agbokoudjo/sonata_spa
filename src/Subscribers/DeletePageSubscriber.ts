/**
 * @wlindabla/sonata_spa — DeletePageSubscriber
 * Handles crud:delete events — fetches CSRF token, shows confirmation,
 * then POSTs the delete request.
 * @author AGBOKOUDJO Franck <internationaleswebservices@gmail.com>
 */

import type { EventSubscriberInterface } from '@wlindabla/event_dispatcher';
import type { BrowserEventDispatcher } from '@wlindabla/event_dispatcher/browser';

import {
    SpaEvents,
    SpaCrudEvent,
    SpaDeleteConfirmRequestedEvent,
    SpaDeleteFailedEvent,
    SpaDeleteProcessingEvent,
    SpaDeleteSucceededEvent
} from '../Events';

import type { DeleteFetcherInterface, SpaSubscriberInterface } from '../contracts';
import { FetchResponse } from "@wlindabla/http_client";
import { RouteMatch } from '../types';
import { SpaParameterBag } from '../ParameterBag';
import { SonataSpaLogger } from '../Logger';

/**
 * Handles navigation to Sonata delete pages (crud:delete).
 *
 * Full pipeline on crud:delete:
 *   1. DeleteConfirmFetcher.fetch(url)        → GET delete page → extract csrfToken
 *   2. dispatch SpaDeleteConfirmRequestedEvent → UI shows confirmation modal
 *      The developer's confirmation handler calls:
 *        event.accept() → proceeds with DELETE POST
 *        event.cancel() → dispatches spa:delete:confirm:cancelled
 *   3. If accepted → POST deleteUrl with csrfToken
 *   4. On success  → navigate to list page (Sonata redirects after delete)
 *   5. dispatch SpaNavigateCompletedEvent
 *
 * The developer provides the confirmation UI by listening to:
 *   SpaEvents.DELETE_CONFIRM_REQUESTED
 *
 * @example
 * ```typescript
 * // Custom confirmation with SweetAlert2
 * dispatcher.addListener(SpaEvents.DELETE_CONFIRM_REQUESTED, async (event) => {
 *   const result = await Swal.fire({
 *     title: event.title ?? 'Are you sure?',
 *     text: event.message ?? 'This action cannot be undone.',
 *     icon: 'warning',
 *     showCancelButton: true,
 *     confirmButtonText: event.btnDeleteText ?? 'Delete',
 *   });
 *
 *   if (result.isConfirmed) {
 *     await event.accept();
 *   } else {
 *     event.cancel();
 *   }
 * });
 * ```
 */
export class DeletePageSubscriber implements SpaSubscriberInterface {

    public constructor(
        private readonly dispatcher: BrowserEventDispatcher,
        private readonly deleteFetcher: DeleteFetcherInterface,
        private readonly navigate: (url: string) => Promise<void>
    ) { }

    public getSubscribedEvents(): ReturnType<EventSubscriberInterface['getSubscribedEvents']> {
        return {
            [SpaEvents.CRUD_DELETE]: {
                listener: 'onDelete',
                priority: 0,
            },
        };
    }

    /**
     * Handle crud:delete event.
     *
     * @param event - The SpaCrudEvent dispatched by SpaKernel
     */
    public async onDelete(event: SpaCrudEvent): Promise<void> {
        const { request, routeMatch } = event;

        try {
            // ── Step 1: Fetch delete confirmation page → extract CSRF token ────
            const confirmData = await this.deleteFetcher.confirmDelete(
                request.url,
                request,
                routeMatch
            );

            if (!confirmData) {
                // Fetch failed — fall back to full server navigation
                if (SpaParameterBag.getEnv() === "prod") {
                    window.location.href = request.url;
                }

                return;
            }

            if (!confirmData.csrfToken) {
                SonataSpaLogger.error('[DeletePageSubscriber] CSRF token not found in delete page.');
                if (SpaParameterBag.getEnv() === "prod") {
                    window.location.href = request.url;
                }

                return;
            }

            // ── Step 2: dispatch SpaDeleteConfirmRequestedEvent ────────────────
            // The developer's listener shows a confirmation modal
            // and calls event.accept() or event.cancel()
            const confirmEvent = new SpaDeleteConfirmRequestedEvent(
                confirmData.title,
                confirmData.message,
                confirmData.btnDeleteText,
                routeMatch
            );

            // Register the accept callback — executed when user confirms
            confirmEvent.onAccept(async () => {
                await this.performDelete(
                    request.url,
                    confirmData.csrfToken!,
                    routeMatch
                );
            });

            // Register the cancel callback — executed when user cancels
            confirmEvent.onCancel(() => {
                this.dispatcher.dispatch(
                    { routeMatch },
                    SpaEvents.DELETE_CONFIRM_CANCELLED
                );
            });

            // Dispatch and await — the listener must call accept() or cancel()
            await this.dispatcher.dispatchAsync(
                confirmEvent,
                SpaEvents.DELETE_CONFIRM_REQUESTED
            );

        } catch (error) {
            SonataSpaLogger.error('[DeletePageSubscriber] Delete failed:', error);
            if (SpaParameterBag.getEnv() === "prod") {
                window.location.href = request.url;
            }
        }
    }

    /**
     * Perform the actual DELETE POST request with the CSRF token.
     * Dispatches the full delete lifecycle:
     *   - {@link SpaEvents.DELETE_PROCESSING}  immediately after user confirms
     *   - {@link SpaEvents.DELETE_SUCCEEDED}   on 2xx response
     *   - {@link SpaEvents.DELETE_FAILED}      on 4xx–599 response
     *
     * On success, navigates to the list page after a short delay
     * so consumers of DELETE_SUCCEEDED have time to display feedback.
     *
     * @param deleteUrl  - The Sonata delete URL
     * @param csrfToken  - The CSRF token extracted from the delete confirmation page
     * @param resource   - The resource name (used to build the fallback list URL)
     */
    private async performDelete(
        deleteUrl: string,
        csrfToken: string,
        routeMatch:RouteMatch
    ): Promise<void> {
        try {
            // ── Step 1: Notify consumers that the delete is in progress ───────
            this.dispatcher.dispatch(
                new SpaDeleteProcessingEvent(
                    routeMatch,
                    "Deletion in progress...",
                 "The operation to delete the item is in progress. Please wait."),
                SpaEvents.DELETE_PROCESSING
            );

            // ── Step 2: Send the DELETE POST request ──────────────────────────
            const response = await this.deleteFetcher.executeDelete(
                deleteUrl,
                csrfToken,
                routeMatch.resource
            ) as FetchResponse;

            // ── Step 3a: Server returned 4xx–599 → dispatch DELETE_FAILED ─────
            if (response.failed) {
                /**
                 * statusCode and statusText are read directly from the HTTP response.
                 * Even when the server returns a minimal error body, the HTTP layer
                 * always carries a status code (e.g. 403, 404, 500) and a status text
                 * (e.g. "Forbidden", "Not Found", "Internal Server Error").
                 * We forward both as-is so consumers can display or log the exact cause.
                 */
                this.dispatcher.dispatch(
                    new SpaDeleteFailedEvent(
                        routeMatch,
                        response.statusCode,
                        response.data  as string || "An error occurred during deletion.",
                        "Error"
                    ),
                    SpaEvents.DELETE_FAILED
                );
                return;
            }

            // ── Step 3b: 2xx → extract optional title/message from response ───
            const data = response.data as Record<string,any> ?? {};

            /**
             * Sonata may or may not include a message or title in the JSON response.
             * We read known keys (message, messageBody, title) from the payload.
             * When absent, fall back to safe English defaults so consumers of
             * DELETE_SUCCEEDED always receive meaningful strings to display.
             */
            const title = (
                typeof data['title'] === 'string' ? data['title'] : null
            ) ?? 'Item deleted' ;

            const message = (
                typeof data['message'] === 'string'
                    ? data['message']
                    : typeof data['messageBody'] === 'string'
                        ? data['messageBody']
                        : null
            ) ?? 'The item has been successfully deleted.';

            // ── Step 4: Dispatch DELETE_SUCCEEDED with resolved title/message ─
            this.dispatcher.dispatchAsync(
                new SpaDeleteSucceededEvent(
                    routeMatch,
                    message,
                    title),
                SpaEvents.DELETE_SUCCEEDED
            );

            // ── Step 5: Navigate to the list page after a short delay ─────────
            /**
             * The 3-second delay gives DELETE_SUCCEEDED consumers (toast, snackbar,
             * inline feedback) enough time to display before the page transitions.
             */
            const listUrl = this.buildListUrl(deleteUrl);
            setTimeout(async () => {
                await this.navigate(listUrl);
            }, 3000);

        } catch (error) {
            SonataSpaLogger.error('[DeletePageSubscriber#performDelete] Unexpected error during delete:', error);
            // Network-level failure — the SpaFetchErrorEvent is already dispatched
            // by FetchDelegateAdapter. No further dispatch needed here.
        }
    }

    /**
     * Build the list URL from the delete URL.
     * Fallback when the server does not redirect.
     *
     * Example:
     *   /admin/app/user/42/delete → /admin/app/user/list
     */
    private buildListUrl(deleteUrl: string): string {
        // Remove /{token}/delete from the end → append /list
        return deleteUrl.replace(/\/[^/]+\/delete(\?.*)?$/, '/list');
    }
}
