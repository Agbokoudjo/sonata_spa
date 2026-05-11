/**
 * @wlindabla/sonata_spa — DeleteConfirmFetcher
 * Fetches the Sonata delete confirmation page and extracts
 * the CSRF token, title, message and button text.
 * @author AGBOKOUDJO Franck <internationaleswebservices@gmail.com>
 */

import { FetchRequest } from '@wlindabla/http_client/core';
import { RequestType, EventTargetType} from '@wlindabla/http_client/types';
import type { BrowserEventDispatcher } from '@wlindabla/event_dispatcher/browser';
import { FetchResponseInterface } from '@wlindabla/http_client/contracts';
import { FetchDelegateAdapter } from './FetchDelegateAdapter';
import type { FetchConfirmDeleteOptions, SpaRequest, RouteMatch } from '../types';
import { SonataSpaLogger } from '../Logger';
import { DeleteFetcherInterface } from '../contracts';

/**
 * Fetches the Sonata delete confirmation page via GET request
 * and extracts the data needed to show a custom confirmation modal.
 *
 * Why do we fetch the confirmation page?
 *   Sonata generates a CSRF token on the server for the delete form.
 *   We need this token to send a valid DELETE POST request.
 *   Without it, Sonata will reject the request with a 403 error.
 *
 * Sonata delete confirmation page structure:
 * ```html
 * <div class="sonata-ba-delete">
 *   <form method="POST">
 *     <input type="hidden" name="_sonata_csrf_token" value="abc123...">
 *     <div class="box-header">
 *       <h3 class="box-title">Are you sure?</h3>
 *     </div>
 *     <div class="box-body">
 *       You are about to delete this item. This action cannot be undone.
 *     </div>
 *     <button type="submit" class="btn btn-danger">Yes, delete</button>
 *   </form>
 * </div>
 * ```
 *
 * Usage in DeletePageSubscriber:
 * ```typescript
 * const confirmData = await deleteFetcher.confirmDelete(deleteUrl, spaRequest, routeMatch);
 * if (!confirmData) return; // fetch failed
 *
 * // Show modal with confirmData.title, confirmData.message, confirmData.btnDeleteText
 * // Then POST to deleteUrl with confirmData.csrfToken
 * ```
 * @author AGBOKOUDJO Franck <internationaleswebservices@gmail.com>
 */
export class DeleteFetcher implements DeleteFetcherInterface{
    private readonly fetchRequest: FetchRequest;

    /**
     * @param dispatcher - The BrowserEventDispatcher for spa:fetch:* events
     * @param delegate - FetchDelegateAdapter   to dispatch SPA lifecycle events at each HTTP request stage.
     * so the developer can hook into any stage of the fetch pipeline.
     */
    public constructor(
        private readonly dispatcher: BrowserEventDispatcher,
        private readonly delegate: FetchDelegateAdapter) {
        
        this.fetchRequest = new FetchRequest(
            this.delegate,
            this.dispatcher,
            {
                credentials: 'same-origin',
                methodSend: 'GET',
                responseType: 'text',
                retryOnStatusCode: false,
                keepalive: false,
                url:''
            },
            RequestType.MAIN,
            {
                type: EventTargetType.WINDOW,
                instance: window
            }
        );
    }

    /**
     * Fetch the Sonata delete confirmation page and extract its data.
     *
     * @param deleteUrl - The Sonata delete URL (e.g. /admin/app/user/42/delete)
     * @param spaRequest - The original SPA request (for event payloads)
     * @param routeMatch - The resolved RouteMatch
     * @returns FetchConfirmDeleteOptions with csrfToken, title, message, btnDeleteText
     *          or null if the fetch failed
     */
    public async confirmDelete(
        deleteUrl: string,
        spaRequest: SpaRequest,
        routeMatch: RouteMatch
    ): Promise<FetchConfirmDeleteOptions | null> {
        this.delegate.setSpaRequest(spaRequest);

        try {
            this.fetchRequest.fetchRequestOptions = {
                credentials: 'same-origin',
                methodSend: 'GET',
                responseType: 'text',
                retryOnStatusCode: false,
                keepalive: false,
                url: deleteUrl,
                headers: {
                    'Accept': 'text/html',
                    'X-Requested-With': 'XMLHttpRequest'
                },
            };

            const response = await this.fetchRequest.handle();
            
            return this.extractConfirmData(response.data as string);

        } catch (error) {
            SonataSpaLogger.error('[DeleteFetcher confirmFetch] Failed to fetch delete confirmation page:', error);
            throw error;
        }
    }

    /**
     * Execute the actual DELETE POST request with the CSRF token.
     * Called by the confirm callback when the user accepts.
     *
     * @param deleteUrl - The Sonata delete URL
     * @param csrfToken - The CSRF token extracted from the delete page
     * @param resource - The resource name for redirect after delete
     */
    public async executeDelete(
        deleteUrl: string,
        csrfToken: string,
        resource: string
    ): Promise<FetchResponseInterface> {
        const formData = new FormData();
        formData.append('_sonata_csrf_token', csrfToken);
        formData.append('_method', 'DELETE');
        formData.append('btn_delete', '1');

        try {
            this.fetchRequest.fetchRequestOptions = {
                credentials: 'same-origin',
                methodSend: 'POST',
                responseType: 'json',
                retryOnStatusCode: false,
                keepalive: false,
                url: deleteUrl,
                headers: {
                    'Accept': 'application/json',
                    'X-Requested-With': 'XMLHttpRequest'
                },
                data: formData,
                timeout:60000
            };

            return this.fetchRequest.handle();
        } catch (error) {
            SonataSpaLogger.error('[DeleteFetcher executeDelete] Delete request failed:',error);
            throw error;
        }
    }

    /**
     * Extract confirmation data from the Sonata delete page HTML.
     *
     * Handles both AdminLTE 4 and legacy AdminLTE < 3 template structures.
     *
     * @param html - Raw HTML of the delete confirmation page
     * @returns Extracted FetchConfirmDeleteOptions
     */
    private extractConfirmData(html: string): FetchConfirmDeleteOptions {
        const doc = new DOMParser().parseFromString(html, 'text/html');

        return {
            csrfToken: this.extractCsrfToken(doc),
            title: this.extractTitle(doc),
            message: this.extractMessage(doc),
            btnDeleteText: this.extractButtonText(doc),
        };
    }

    /**
     * Extract the CSRF token from the delete form.
     * Sonata places it in a hidden input named "_sonata_csrf_token".
     */
    private extractCsrfToken(doc: Document): string | null {
        const tokenInput = doc.querySelector<HTMLInputElement>(
            '.sonata-ba-delete input[name="_sonata_csrf_token"]'
        );
        return tokenInput?.value ?? null;
    }

    /**
     * Extract the confirmation dialog title.
     * Handles both AdminLTE 4 (.card-title) and legacy (.box-title) structures.
     */
    private extractTitle(doc: Document): string | null {
        // AdminLTE 4 / Bootstrap 5 structure
        const cardTitle = doc.querySelector<HTMLElement>('.sonata-ba-delete .card-title');
        if (cardTitle?.innerText) return cardTitle.innerText.trim();

        // Legacy AdminLTE < 3 structure
        const boxTitle = doc.querySelector<HTMLElement>('.sonata-ba-delete .box-header .box-title');
        if (boxTitle?.innerText) return boxTitle.innerText.trim();

        // Fallback: any h3 or h4 in the delete container
        const heading = doc.querySelector<HTMLElement>('.sonata-ba-delete h3, .sonata-ba-delete h4');
        return heading?.innerText?.trim() ?? null;
    }

    /**
     * Extract the confirmation message body.
     * Handles both AdminLTE 4 (.card-body) and legacy (.box-body) structures.
     */
    private extractMessage(doc: Document): string | null {
        // AdminLTE 4 / Bootstrap 5 structure
        const cardBody = doc.querySelector<HTMLElement>('.sonata-ba-delete .card-body p');
        if (cardBody?.innerText) return cardBody.innerText.trim();

        // Legacy AdminLTE < 3 structure
        const boxBody = doc.querySelector<HTMLElement>('.sonata-ba-delete .box-body');
        if (boxBody?.innerText) return boxBody.innerText.trim();

        return null;
    }

    /**
     * Extract the delete button label.
     * Used to display the same text in the custom confirmation modal.
     */
    private extractButtonText(doc: Document): string | null {
        const submitBtn = doc.querySelector<HTMLButtonElement>(
            '.sonata-ba-delete button[type="submit"]'
        );
        return submitBtn?.innerText?.trim() ?? null;
    }
}
