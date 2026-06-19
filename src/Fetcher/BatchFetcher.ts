/**
 * @wlindabla/sonata_spa — BatchFetcher
 * Fetches the Sonata batch confirmation page and executes the confirmed batch action.
 * @author AGBOKOUDJO Franck <internationaleswebservices@gmail.com>
 */

import type { BatchFetcherInterface } from '../contracts';
import { FetchRequest } from '@wlindabla/http_client/core';
import { RequestType, EventTargetType } from '@wlindabla/http_client/types';
import type { BrowserEventDispatcher } from '@wlindabla/event_dispatcher/browser';
import type { FetchResponseInterface } from '@wlindabla/http_client/contracts';
import { FetchDelegateAdapter } from './FetchDelegateAdapter';
import type { BatchConfirmData, SpaRequest, RouteMatch } from '../types';
import { SonataSpaLogger } from '../Logger';
import { addParamToUrl } from '@wlindabla/form_validator/utils';

/**
 * Handles the two-step Sonata batch flow:
 *
 *   Step 1 — {@link batchConfirmFetcher}:
 *     POST the batch form to Sonata → Sonata returns the confirmation HTML page.
 *     We parse that page to extract the CSRF token, encoded data, title, message
 *     and button text needed to show a custom confirmation modal.
 *
 *   Step 2 — {@link executeBatch}:
 *     POST back to the batch URL with `confirmation=ok` and the extracted data.
 *     The `X-Requested-With: XMLHttpRequest` header tells Sonata (when the
 *     controller is overridden) to return JSON instead of a redirect.
 *
 * Sonata batch confirmation page structure (batch_confirmation.html.twig):
 * ```html
 * <div class="sonata-ba-delete">
 *      <div class="box-header">
        {% if batch_translation_domain is not same as(false) %}
            {% set action_label = action_label|trans({}, batch_translation_domain) %}
        {% endif %}
        <h4 class="box-title">{% trans with {'%action%': action_label} from 'SonataAdminBundle' %}title_batch_confirmation{% endtrans %}</h4>
    </div>
    <div class="box-body">
        {% if data.all_elements %}
            {{ 'message_batch_all_confirmation'|trans({}, 'SonataAdminBundle') }}
        {% else %}
            {% trans with {'%count%': data.idx|length} from 'SonataAdminBundle' %}message_batch_confirmation{% endtrans %}
        {% endif %}
    </div>
 *   <form action="/admin/xxx/batch?filter=..." method="POST">
 *     <input type="hidden" name="confirmation"        value="ok">
 *     <input type="hidden" name="data"                value="{&quot;action&quot;:&quot;delete&quot;,...}">
 *     <input type="hidden" name="_sonata_csrf_token"  value="abc123...">
 *     <button type="submit" class="btn btn-danger">Execute</button>
 *   </form>
 * </div>
 * ```
 */
export class BatchFetcher implements BatchFetcherInterface {
    private readonly fetchRequest: FetchRequest;

    /**
     * @param dispatcher - The BrowserEventDispatcher for spa:fetch:* events
     * @param delegate   - FetchDelegateAdapter to dispatch SPA lifecycle events
     *                     at each HTTP request stage so developers can hook in.
     */
    public constructor(
        private readonly dispatcher: BrowserEventDispatcher,
        private readonly delegate: FetchDelegateAdapter
    ) {
        this.fetchRequest = new FetchRequest(
            this.delegate,
            this.dispatcher,
            {
                credentials: 'same-origin',
                methodSend: 'GET',
                responseType: 'text',
                retryOnStatusCode: false,
                keepalive: false,
                url: '',
            },
            RequestType.MAIN,
            {
                type: EventTargetType.WINDOW,
                instance: window
            }
        );
    }

    /**
     * POST the batch form to Sonata and extract the confirmation page data.
     *
     * Sonata returns an HTML confirmation page when `ask_confirmation` is true.
     * We parse it to extract everything needed to show a custom modal and then
     * re-submit with confirmation.
     *
     * @param batchUrl   - The Sonata batch URL (e.g. /admin/app/user/batch)
     * @param formData   - The FormData built from the list batch form
     * @param spaRequest - The original SPA request (forwarded to fetch lifecycle events)
     * @param routeMatch - The resolved RouteMatch (forwarded to fetch lifecycle events)
     * @returns Extracted {@link BatchConfirmData}, or `null` if the fetch failed
     */
    public async batchConfirmFetcher(
        batchUrl: string,
        formData: FormData,
        spaRequest: SpaRequest,
        routeMatch: RouteMatch
    ): Promise<BatchConfirmData | null> {
        this.delegate.setSpaRequest(spaRequest);

        try {
            this.fetchRequest.fetchRequestOptions = {
                credentials: 'same-origin',
                methodSend: 'POST',
                data: formData,
                responseType: 'text',
                retryOnStatusCode: false,
                keepalive: false,
                url: addParamToUrl(batchUrl),
                headers: {
                    'Accept': 'text/html',
                    'X-Requested-With': 'XMLHttpRequest',
                },
            };

            const response = await this.fetchRequest.handle();
            return this.extractConfirmData(response.data as string, batchUrl);

        } catch (error) {
            SonataSpaLogger.error(
                '[BatchFetcher#batchConfirmFetcher] Failed to fetch batch confirmation page:',
                error
            );
            return null;
        }
    }

    /**
     * Execute the confirmed batch POST request.
     *
     * Sends `confirmation=ok` with the CSRF token and the encoded data
     * (or reconstructed idx/action/all_elements if no encoded data is available).
     * The `X-Requested-With: XMLHttpRequest` header triggers the JSON path
     * in the overridden `batchActionDelete()` controller.
     *
     * @param confirmData - The data extracted from the confirmation page
     * @returns The server response typed as JSON
     * @throws {Error} On network error or unrecoverable failure
     */
    public async executeBatch(confirmData: BatchConfirmData): Promise<FetchResponseInterface> {
        const formData = new FormData();
        formData.append('_sonata_csrf_token', confirmData.csrfToken);
        formData.append('confirmation', 'ok');

        if (confirmData.encodedData) {
            // Preferred path — Sonata serialized the full selection as JSON
            formData.append('data', confirmData.encodedData);
        } else {
            // Fallback — reconstruct the fields individually
            formData.append('action', confirmData.action);
            confirmData.idx.forEach(id => formData.append('idx[]', id));
            if (confirmData.allElements) {
                formData.append('all_elements', '1');
            }
        }

        try {
            this.fetchRequest.fetchRequestOptions = {
                credentials: 'same-origin',
                methodSend: 'POST',
                responseType: 'json',
                retryOnStatusCode: false,
                keepalive: false,
                url: confirmData.confirmUrl,
                headers: {
                    'Accept': 'application/json',
                    'X-Requested-With': 'XMLHttpRequest',
                },
                data: formData,
                timeout: 60000,
            };

            return this.fetchRequest.handle();

        } catch (error) {
            SonataSpaLogger.error(
                '[BatchFetcher#executeBatch] Batch request failed:',
                error
            );
            throw error;
        }
    }

    /**
     * Parse the Sonata batch confirmation HTML and extract all data needed
     * to re-submit the batch action after user confirmation.
     *
     * @param html     - Raw HTML of the batch confirmation page
     * @param batchUrl - Fallback URL if the form action cannot be parsed
     * @returns Populated {@link BatchConfirmData}
     * @throws {Error} If the CSRF token is missing (Sonata misconfiguration)
     */
    private extractConfirmData(html: string, batchUrl: string): BatchConfirmData {
        const doc = new DOMParser().parseFromString(html, 'text/html');

        const confirmForm = doc.querySelector<HTMLFormElement>(
            '.sonata-ba-delete form[action*="/batch"]'
        );

        // The CSRF token is mandatory — without it Sonata will reject the POST with 400
        const csrfToken = this.extractCsrfToken(doc);
        if (!csrfToken) {
            throw new Error(
                '[BatchFetcher] CSRF token not found in batch confirmation page. ' +
                'Make sure the Sonata batch_confirmation template is not overridden ' +
                'in a way that removes the _sonata_csrf_token hidden input.'
            );
        }

        const dataInput = confirmForm?.querySelector<HTMLInputElement>('input[name="data"]');
        const actionInput = confirmForm?.querySelector<HTMLInputElement>('input[name="action"]');

        return {
            csrfToken,
            title: this.extractTitle(doc) || "Confirm the action?",
            message: this.extractMessage(doc) || "This action is irreversible. Do you really want to continue?",
            btnDeleteText: this.extractButtonText(doc) ?? "Yes,delete",
            confirmUrl: confirmForm?.action ?? batchUrl,
            encodedData: dataInput?.value ?? '',
            action: actionInput?.value ?? '',
            idx: Array.from(
                confirmForm?.querySelectorAll<HTMLInputElement>('input[name="idx[]"]') ?? []
            ).map(input => input.value),
            allElements: confirmForm?.querySelector<HTMLInputElement>(
                'input[name="all_elements"]'
            )?.value === '1',
        };
    }

    /**
     * Extract the CSRF token from the batch confirmation form.
     * Sonata places it in a hidden input named `_sonata_csrf_token`.
     * Returns `null` if not found — the caller must treat this as a fatal error.
     */
    private extractCsrfToken(doc: Document): string | null {
        return doc.querySelector<HTMLInputElement>(
            '.sonata-ba-delete form input[name="_sonata_csrf_token"]'
        )?.value ?? null;
    }

    /**
     * Extract the confirmation dialog title.
     * Handles both AdminLTE 4 (.card-title) and legacy (.box-title) structures.
     */
    private extractTitle(doc: Document): string | null {
        const cardTitle = doc.querySelector<HTMLElement>('.sonata-ba-delete .card-title');
        if (cardTitle?.innerText) return cardTitle.innerText.trim();

        const boxTitle = doc.querySelector<HTMLElement>('.sonata-ba-delete .box-header .box-title');
        if (boxTitle?.innerText) return boxTitle.innerText.trim();

        const heading = doc.querySelector<HTMLElement>(
            '.sonata-ba-delete h3, .sonata-ba-delete h4'
        );
        return heading?.innerText?.trim() ?? null;
    }

    /**
     * Extract the confirmation message body.
     * Handles both AdminLTE 4 (.card-body) and legacy (.box-body) structures.
     */
    private extractMessage(doc: Document): string | null {
        const cardBody = doc.querySelector<HTMLElement>('.sonata-ba-delete .card-body p');
        if (cardBody?.innerText) return cardBody.innerText.trim();

        const boxBody = doc.querySelector<HTMLElement>('.sonata-ba-delete .box-body');
        if (boxBody?.innerText) return boxBody.innerText.trim();

        return null;
    }

    /**
     * Extract the submit button label from the confirmation form.
     * Used to display the same text in the custom confirmation modal.
     */
    private extractButtonText(doc: Document): string | null {
        return doc.querySelector<HTMLButtonElement | HTMLInputElement>(
            '.sonata-ba-delete button[type="submit"]'
        )?.innerText?.trim() ?? null;
    }
}