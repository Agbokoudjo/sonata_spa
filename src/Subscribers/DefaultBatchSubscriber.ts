/**
 * @wlindabla/sonata_spa — DefaultBatchSubscriber
 * Default UI handler for all batch lifecycle events.
 * Uses SweetAlert2 for confirmation and @wlindabla/form_validator dialog helpers
 * for processing, success and error feedback.
 *
 * Developers can override any handler by registering a listener with a higher
 * priority on the same event and calling event.stopPropagation() if needed.
 *
 * @author AGBOKOUDJO Franck <internationaleswebservices@gmail.com>
 */

import Swal from 'sweetalert2';
import type { EventSubscriberInterface } from '@wlindabla/event_dispatcher';
import {
    SpaEvents,
    SpaBatchConfirmRequestedEvent,
    SpaBatchProcessingEvent,
    SpaBatchSucceededEvent,
    SpaBatchFailedEvent,
} from '../Events';
import type { SpaSubscriberInterface } from '../contracts';
import {
    showErrorDialog,
    showLoadingDialog,
    showSuccessDialog,
} from '@wlindabla/form_validator/utils';
import { SonataSpaLogger } from '../Logger';

/**
 * Default subscriber that handles all batch UI lifecycle events.
 *
 * Subscribed events and their default behavior:
 *
 * | Event                        | Priority | Behavior                                      |
 * |------------------------------|----------|-----------------------------------------------|
 * | BATCH_CONFIRM_REQUESTED      | 0        | SweetAlert2 confirmation modal                |
 * | BATCH_PROCESSING             | 0        | showLoadingDialog — spinner while POSTing      |
 * | BATCH_SUCCEEDED              | 0        | showSuccessDialog — success feedback           |
 * | BATCH_FAILED                 | 0        | showErrorDialog   — error feedback             |
 *
 * To replace any handler, register your own listener with `priority > 0`.
 * To fully suppress the default, call `event.stopPropagation()` in your listener
 * (only works on stoppable events).
 */
export class DefaultBatchSubscriber implements SpaSubscriberInterface {

    public getSubscribedEvents(): ReturnType<EventSubscriberInterface['getSubscribedEvents']> {
        return {
            [SpaEvents.BATCH_CONFIRM_REQUESTED]: {
                listener: 'onBatchConfirmRequested',
                priority: 0,
            },
            [SpaEvents.BATCH_PROCESSING]: {
                listener: 'onBatchProcessing',
                priority: 0,
            },
            [SpaEvents.BATCH_SUCCEEDED]: {
                listener: 'onBatchSucceeded',
                priority: 0,
            },
            [SpaEvents.BATCH_FAILED]: {
                listener: 'onBatchFailed',
                priority: 0,
            },
        };
    }

    // ─── Confirmation ─────────────────────────────────────────────────────────

    /**
     * Show a SweetAlert2 confirmation modal when a batch action is requested.
     *
     * Reads title, message and button text from the Sonata confirmation page data.
     * Calls {@link SpaBatchConfirmRequestedEvent.accept} or
     * {@link SpaBatchConfirmRequestedEvent.cancel} based on the user's choice.
     *
     * @param event - The batch confirm requested event carrying the confirmation data
     */
    public async onBatchConfirmRequested(
        event: SpaBatchConfirmRequestedEvent
    ): Promise<void> {
        const { confirmData } = event;
        try {
            const result = await Swal.fire({
                title: confirmData.title ?? 'Are you sure?',
                text: confirmData.message ?? 'This action will be applied to the selected items.',
                icon: 'question',
                showCancelButton: true,
                confirmButtonColor: '#d33',
                cancelButtonColor: '#6c757d',
                confirmButtonText: confirmData.btnDeleteText ?? 'Yes, execute',
                cancelButtonText: 'Cancel',
                background: '#00427E',
                color: '#fff',
            });

            if (result.isConfirmed) {
                await event.accept();
            } else {
                event.cancel();
            }
        } catch (error) {
            SonataSpaLogger.error(
                '[DefaultBatchSubscriber#onBatchConfirmRequested] SweetAlert2 error:',
                error
            );
            event.cancel();
        }
    }

    /**
     * Show a loading dialog while the batch POST request is in progress.
     *
     * Triggered immediately after the user confirms, before the HTTP request
     * is sent. The dialog blocks user interaction to prevent double submission.
     *
     * Uses {@link showLoadingDialog} from @wlindabla/form_validator which
     * displays a spinner consistent with the form submission feedback style.
     *
     * @param event - The batch processing event carrying the title and message
     */
    public onBatchProcessing(event: SpaBatchProcessingEvent): void {
        try {
            showLoadingDialog({ config: {title: event.title, text:event.message }});
        } catch (error) {
            SonataSpaLogger.error(
                '[DefaultBatchSubscriber#onBatchProcessing] Failed to show loading dialog:',
                error
            );
        }
    }

    /**
     * Show a success dialog when the batch action completes successfully.
     *
     * Triggered after a 2xx response is received from the server.
     * The dialog auto-closes after a short delay — the navigation to the
     * list page is handled by {@link BatchPageSubscriber} with a 3-second timer,
     * giving this dialog time to display before the transition.
     *
     * Uses {@link showSuccessDialog} from @wlindabla/form_validator.
     *
     * @param event - The batch succeeded event carrying the resolved title and message
     */
    public onBatchSucceeded(event: SpaBatchSucceededEvent): void {
        try {
            showSuccessDialog({
                title: event.title,
                message: event.message,
                config: {
                    timer: 10000,
                    confirmButtonText: 'OK'
                },
            }).then((value) => {
                SonataSpaLogger.info(value);
            }).catch((reason) => {
                SonataSpaLogger.info(reason)
            })
        } catch (error) {
            SonataSpaLogger.error(
                '[DefaultBatchSubscriber#onBatchSucceeded] Failed to show success dialog:',
                error
            );
        }
    }

    /**
     * Show an error dialog when the batch action fails (4xx–599 from server).
     *
     * Triggered when the server returns an HTTP error status. The status code
     * and status text are forwarded directly from the HTTP response — even when
     * the server returns a minimal error body, the HTTP layer always carries
     * a meaningful status (e.g. 403 "Forbidden", 500 "Internal Server Error").
     *
     * Uses {@link showErrorDialog} from @wlindabla/form_validator.
     *
     * @param event - The batch failed event carrying the HTTP status code and text
     */
    public onBatchFailed(event: SpaBatchFailedEvent): void {
        try {
            const title = 'Batch action failed';
            const message = event.statusText
                ? `The server returned an error: ${event.statusCode} — ${event.statusText}.`
                : `The server returned an unexpected error (${event.statusCode}).`;
            showErrorDialog({
                title: title,
                message: message,
                config: {
                    timer: 3000,
                    confirmButtonText: 'OK',
                }
            }).then((value) => {
                SonataSpaLogger.info(value);
            }).catch((reason) => {
                SonataSpaLogger.info(reason)
            })
        } catch (error) {
            SonataSpaLogger.error(
                '[DefaultBatchSubscriber#onBatchFailed] Failed to show error dialog:',
                error
            );
        }
    }
}