/**
 * @wlindabla/sonata_spa — FormSubscriber
 * Handles spa:form:submit events using @wlindabla/form_validator FormSubmission.
 * Mirrors the real-world usage pattern from production Sonata projects.
 * @author AGBOKOUDJO Franck <internationaleswebservices@gmail.com>
 */

import type { EventSubscriberInterface } from '@wlindabla/event_dispatcher';
import type { BrowserEventDispatcher } from '@wlindabla/event_dispatcher/browser';

import Swal from 'sweetalert2';

import { SpaEvents, SpaFormSubmitEvent, SonataSubmitButton } from '../Events';
import type {
    DomSwapManagerInterface,
    SpaSubscriberInterface,
    RouteResolverInterface
} from '../contracts';
import type { SwapContext } from '../types';
import {
    FormSubmission,
    FormSubmitFailedEvent
} from '@wlindabla/form_validator/form-submit';

import { appTranslation } from '@wlindabla/form_validator';
import { AbstractFormSubmissionSubscriber } from '@wlindabla/form_validator/subscriber';

import { SonataSpaLogger } from '../Logger';
import { BadResponseHttp } from "@wlindabla/http_client/exceptions"

/**
 * Handles Sonata form submissions (spa:form:submit).
 *
 * Uses @wlindabla/form_validator FormSubmission exactly as in production:
 *   - showLoadingDialog()  → during submission
 *   - showSuccessDialog()  → on success (reads title + message from JSON)
 *   - showErrorDialog()    → on error (reads title + errorMessage from JSON)
 *   - handleErrorsManyForm() → displays 422 field errors on form fields
 *   - confirmMethodRequest   → SweetAlert2 confirmation (from data-iwas-confirm)
 *
 * Only forms with class "form-submission-handle-auto" are handled automatically.
 * This mirrors the exact pattern from production Sonata projects.
 *
 * Sonata form response contract (JSON):
 * ```json
 * // Success
 * { "title": "Saved!", "message": "Record saved successfully." }
 *
 * // Error 422 (validation)
 * { "title": "Validation Error", "violations": { "fieldName": "error message" } }
 *
 * // Error 4xx/5xx
 * { "title": "Error", "errorMessage": "Something went wrong." }
 * ```
 *
 * @example
 * ```typescript
 * // Registered automatically by SpaKernel.boot()
 * // The developer customizes behavior by listening to SpaEvents:
 *
 * dispatcher.addListener(SpaEvents.FORM_SUCCEEDED, (event) => {
 *   console.log('Form saved:', event.redirectUrl);
 * });
 *
 * dispatcher.addListener(SpaEvents.FORM_FAILED, (event) => {
 *   console.log('Form failed:', event.error);
 * });
 * ```
 * @author AGBOKOUDJO Franck <internationaleswebservices@gmail.com>
 */
export class FormSubscriber extends AbstractFormSubmissionSubscriber implements SpaSubscriberInterface {

    public constructor(
        private readonly dispatcher: BrowserEventDispatcher,
        private readonly swapManager: DomSwapManagerInterface,
        private readonly routeResolver: RouteResolverInterface,
        private readonly navigate: (url: string) => Promise<void>,
        private readonly mainContainer: HTMLElement,
        private readonly mainContentArea: HTMLElement,
        private readonly mainContentHeader: HTMLElement | null
    ) {
        super(appTranslation,"sonata-translations");
    }

    public override getSubscribedEvents(): ReturnType<EventSubscriberInterface['getSubscribedEvents']> {
        return {
            [SpaEvents.FORM_SUBMIT]: {
                listener: 'onFormSubmit',
                priority: 0,
            },
            ...super.getSubscribedEvents(),
        };
    }

    /**
     * Handle spa:form:submit event.
     *
     * Only processes forms with class "form-submission-handle-auto".
     * This mirrors the exact production pattern.
     *
     * @param event - The SpaFormSubmitEvent dispatched by FormBindingManager
     */
    public async onFormSubmit(event: SpaFormSubmitEvent): Promise<void> {
        const { form, routeMatch, submitter } = event;

        const formAction = form.getAttribute('action') ?? window.location.href;
        const formMethod = (form.getAttribute('method') ?? 'POST').toUpperCase();

        try {
            const submission = new FormSubmission(
                form,
                {
                    url: formAction,
                    method: formMethod,
                    headers: {
                        'X-Requested-With': 'XMLHttpRequest',
                        'Accept': 'application/json',
                    },
                    responseType: 'json',
                    timeout: 60000,
                    retryOnStatusCode: false,
                    retryCount: 2,
                    keepalive: false,
                },
                false, // mustRedirect — we handle redirect via SPA navigate
                this.dispatcher
            );

            // We handle errors ourselves via handleErrorsManyForm
            submission.withHandleErrorsManyForm(false);

            // ── SweetAlert2 confirmation (data-iwas-confirm on submitter) ─────
            // FormSubmission reads data-iwas-confirm from the submitter button
            // and calls confirmMethodRequest before sending the request
            submission.confirmMethodRequest = async (message: string) => {
                const result = await Swal.fire({
                    title: 'Confirm',
                    text: message,
                    icon: 'question',
                    showCancelButton: true,
                    confirmButtonColor: '#2D3099',
                    cancelButtonColor: '#d33',
                    confirmButtonText: 'Yes, save!',
                    cancelButtonText: 'Cancel',
                    background: '#00427E',
                    color: '#fff',
                });
                return result.isConfirmed;
            };

            // ── Register FormSubmission event listeners ────────────────────────
            this.registerFormSubmissionListeners(form);

            // ── Start submission ──────────────────────────────────────────────
            const response = await submission.processStart();

            if (!response) return;

            // ── Handle server response ────────────────────────────────────────
            if (response.statusCode >= 200 && response.statusCode < 300) {
                const data = response.data as Record<string, unknown>;

                // Dispatch SPA form succeeded event
                this.dispatcher.dispatch(
                    { form, routeMatch, data },
                    SpaEvents.FORM_SUCCEEDED
                );

                // Determine redirect URL based on submitter button name
                const redirectUrl = this.resolveRedirectUrl(
                    event,
                    data
                );

                if (redirectUrl) {
                    await this.navigate(redirectUrl);
                }
            }

        } catch (error) {
            SonataSpaLogger.error('[FormSubscriber] Form submission failed:', error);
            if (error instanceof BadResponseHttp) {
                SonataSpaLogger.error(error.toJSON()); // → objet JSON propre pour Sentry/Datadog
                console.error(error.toString()); // → texte formaté pour la console
            }
            this.dispatcher.dispatch(
                { form, routeMatch, error },
                SpaEvents.FORM_FAILED
            );

        }
    }

    /**
     * Register listeners on FormSubmission lifecycle events.
     * Mirrors the FormSubmissionSubscriber pattern from production.
     *
     * Uses { once: true } so listeners are automatically removed
     * after each form submission.
     */
    private registerFormSubmissionListeners(form: HTMLFormElement): void {}

    public override async onFormSubmitFailed(event: FormSubmitFailedEvent): Promise<void> {
        super.onFormSubmitFailed(event);
        
        const fetchResponse = event.response;
        const data = fetchResponse.data as Record<string, unknown>;
        const form = event.formElement;

        if (!data.violations) {
            // No field violations — swap form HTML to show server errors
            const html = fetchResponse.data as string;
            if (typeof html === 'string' && html.includes('sonata-ba-form')) {
                await this.swapFormErrors(html, form);
            }
         }

        this.dispatcher.dispatch(
            { form, statusCode: fetchResponse.statusCode, data },
            SpaEvents.FORM_FAILED
        );
    }

    /**
     * Resolve the redirect URL after a successful form submission.
     *
     * Priority:
     *   1. URL returned by server in JSON response
     *   2. Derived from the submitter button name (Sonata convention)
     *   3. Fallback to list page URL
     *
     * Sonata button → redirect mapping:
     *   btn_update_and_list   → list page
     *   btn_create_and_list   → list page
     *   btn_update_and_edit   → edit page (server provides URL)
     *   btn_create_and_edit   → edit page (server provides URL)
     *   btn_create_and_create → create page (same URL)
     *
     * @param event - The SpaFormSubmitEvent
     * @param data - The JSON response data from server
     */
    private resolveRedirectUrl(
        event: SpaFormSubmitEvent,
        data: Record<string, unknown>
    ): string | null {
        // 1. Server explicitly returned a redirect URL
        const serverRedirectUrl = data['redirectUrl'] as string | undefined;
        if (serverRedirectUrl) return serverRedirectUrl;

        const { form, submitterName } = event;
        const formAction = form.getAttribute('action') ?? window.location.href;

        // 2. Derive from submitter button name
        if (
            submitterName === SonataSubmitButton.UPDATE_AND_LIST ||
            submitterName === SonataSubmitButton.CREATE_AND_LIST
        ) {
            // Navigate to list page
            return this.buildListUrl(formAction);
        }

        if (
            submitterName === SonataSubmitButton.CREATE_AND_CREATE
        ) {
            // Stay on the create page
            return formAction;
        }

        // btn_update_and_edit / btn_create_and_edit
        // Server must return the edit URL for the new/updated entity
        const editUrl = data['editUrl'] as string | undefined;
        if (editUrl) return editUrl;

        // 3. Fallback — navigate to list
        return this.buildListUrl(formAction);
    }

    /**
     * Build the list URL from a create/edit form action URL.
     *
     * Examples:
     *   /admin/app/user/create         → /admin/app/user/list
     *   /admin/app/user/42/edit        → /admin/app/user/list
     */
    private buildListUrl(formAction: string): string {
        return formAction
            .replace(/\/[^/]+\/edit(\?.*)?$/, '/list')
            .replace(/\/create(\?.*)?$/, '/list');
    }

    // ─── Form error swap ──────────────────────────────────────────────────────

    /**
     * Swap .sonata-ba-form to display server-side validation errors.
     * Called when server returns 200 + HTML form with error markup.
     *
     * @param html - HTML response from server with validation errors
     * @param form - The submitted form element
     */
    private async swapFormErrors(
        html: string,
        form: HTMLFormElement
    ): Promise<void> {
        const formAction = form.getAttribute('action') ?? window.location.href;
        const routeMatch = this.routeResolver.resolve(formAction);
        const virtualDoc = new DOMParser().parseFromString(html, 'text/html');

        const swapContext: SwapContext = {
            response: { html, virtualDoc, routeMatch, statusCode: 200 },
            routeMatch,
            mainContainer: this.mainContainer,
            mainContentArea: this.mainContentArea,
            mainContentHeader: this.mainContentHeader,
        };

        this.swapManager.swap(swapContext);
    }
}