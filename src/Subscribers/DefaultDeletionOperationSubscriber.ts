// src/Subscribers/DefaultDeleteConfirmSubscriber.ts

import Swal from 'sweetalert2';
import type { EventSubscriberInterface } from '@wlindabla/event_dispatcher';
import {
    SpaEvents,
    SpaDeleteConfirmRequestedEvent,
    SpaDeleteProcessingEvent,
    SpaDeleteSucceededEvent,
    SpaDeleteFailedEvent
} from '../Events';

import type { SpaSubscriberInterface } from '../contracts';
import {
    showErrorDialog,
    showLoadingDialog,
    showSuccessDialog
} from '@wlindabla/form_validator/utils';

import { SonataSpaLogger } from '../Logger';

/**
 * Default delete confirmation subscriber using SweetAlert2.
 * Registered automatically by SpaKernel.
 *
 * To replace with your own UI, register a listener with higher priority:
 * ```typescript
 * dispatcher.addListener(SpaEvents.DELETE_CONFIRM_REQUESTED, async (event) => {
 *   event.stopPropagation(); // prevents this default subscriber from running
 *   // your custom confirmation UI
 * }, 10); // priority > 0
 * ```
 */
export class DefaultDeletionOperationSubscriber implements SpaSubscriberInterface {

    public getSubscribedEvents(): ReturnType<EventSubscriberInterface['getSubscribedEvents']> {
        return {
            [SpaEvents.DELETE_CONFIRM_REQUESTED]: {
                listener: 'onDeleteConfirmRequested',
                priority: 0, // developer can override with priority > 0
            },
            [SpaEvents.DELETE_PROCESSING]: {
                listener: 'onDeleteProcessing',
                priority: 0, // developer can override with priority > 0
            },
            [SpaEvents.DELETE_FAILED]: {
            listener: 'onDeleteFailed',
                priority: 0, // developer can override with priority > 0
            },
            [SpaEvents.DELETE_SUCCEEDED]: {
                listener: 'onDeleteSucceeded',
                priority: 0, // developer can override with priority > 0
            }
        };
    }

    public async onDeleteConfirmRequested(
        event: SpaDeleteConfirmRequestedEvent
    ): Promise<void> {
        const result = await Swal.fire({
            title: event.title ?? 'Confirm deletion?',
            text: event.message ?? 'This action is irreversible. Do you really want to delete this item?',
            icon: 'question',
            showCancelButton: true,
            confirmButtonColor: '#d33',
            cancelButtonColor: '#6c757d',
            confirmButtonText: event.btnDeleteText ?? 'Yes, delete',
            cancelButtonText: 'Cancel',
            reverseButtons: true,
            background:"#00427E",
            color: "#fff",
        });

        if (result.isConfirmed) {
            await event.accept();
        } else {
            event.cancel();
        }
    }

    public onDeleteProcessing(event:SpaDeleteProcessingEvent): void{
        showLoadingDialog({
            config: {
                title: event.title,
                text: event.message,
                timer: 60000
            },
        })
    }

    public onDeleteSucceeded(event: SpaDeleteSucceededEvent): void {
        showSuccessDialog({
            title: event.title,
            message: event.messageBody,
            config: {
                timer: 10000,
                confirmButtonText: 'OK'
            },
        }).then((value) => {
            SonataSpaLogger.info(value);
        }).catch((reason) => {
            SonataSpaLogger.info(reason)
        })
    }

    public onDeleteFailed(event: SpaDeleteFailedEvent): void {
        showErrorDialog({
            title: event.title,
            message: event.statusText,
            config: {
                timer: 3000,
                confirmButtonText: 'OK',
            },
        }).then((value) => {
            SonataSpaLogger.info(value);
        }).catch((reason) => {
            SonataSpaLogger.info(reason)
        })
    }
}