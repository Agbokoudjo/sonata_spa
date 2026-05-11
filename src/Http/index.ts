import { SpaRedirectType } from "../types";
import {FetchResponseInterface} from "@wlindabla/http_client/contracts"
/**
 * @wlindabla/sonata_spa — SpaRedirectResponse
 * Inspired by Symfony's RedirectResponse.
 * Represents the navigation decision after a successful form submission.
 *
 * Sonata submit buttons and their redirect destinations:
 *   btn_update_and_list   → list page
 *   btn_create_and_list   → list page
 *   btn_create_and_create → create page (same resource)
 *   btn_delete            → list page
 *   (default)             → edit or show page (from Location header)
 *
 * @author AGBOKOUDJO Franck <internationaleswebservices@gmail.com>
 */

/**
 * Represents the result of a successful Sonata form submission.
 * The SPA uses this to decide where to navigate next.
 *
 * Inspired by Symfony's RedirectResponse — immutable value object.
 * @example 
 * ```typescript
 * // Dans FormSubscriber — après POST réussi
    const redirectResponse = SpaRedirectResponse.resolve(
    fetchResponse,           // fetch Response
    event.submitterName,     // 'btn_update_and_list' | 'btn_create_and_list' | null
    routeMatch.resource,     // 'book'
    this.buildListUrl(request.url),   // /admin/book/list
    this.buildCreateUrl(request.url)  // /admin/book/create
    );
    // Log en dev
    SonataSpaLogger.info('[FormSubscriber] Redirect resolved:', redirectResponse.toString());
    // Naviguer selon la décision
    await this.navigate(redirectResponse.url);
 * ```
 */
export class SpaRedirectResponse {
    private constructor(
        /** The resolved destination URL */
        public readonly url: string,
        /** The type of redirect */
        public readonly type: SpaRedirectType,
        /** The submitter button name that triggered the redirect */
        public readonly submitterName: string | null,
        /** The resource name (e.g. 'book', 'admin_user') */
        public readonly resource: string,
    ) { }

    // ── Static factories — mirrors Symfony's redirectTo() conditions ──────

    /**
     * Navigate to the list page.
     * Triggered by: btn_update_and_list, btn_create_and_list, btn_delete
     */
    static toList(listUrl: string, resource: string, submitterName: string | null): SpaRedirectResponse {
        return new SpaRedirectResponse(listUrl, 'list', submitterName, resource);
    }

    /**
     * Navigate to the create page.
     * Triggered by: btn_create_and_create
     */
    static toCreate(createUrl: string, resource: string): SpaRedirectResponse {
        return new SpaRedirectResponse(createUrl, 'create', 'btn_create_and_create', resource);
    }

    /**
     * Navigate to the edit page (default after save).
     * Triggered by: default save button
     */
    static toEdit(editUrl: string, resource: string): SpaRedirectResponse {
        return new SpaRedirectResponse(editUrl, 'edit', null, resource);
    }

    /**
     * Navigate to the show page.
     * Triggered by: default save when no edit route
     */
    static toShow(showUrl: string, resource: string): SpaRedirectResponse {
        return new SpaRedirectResponse(showUrl, 'show', null, resource);
    }

    /**
     * Navigate to an explicit URL from the server's Location header.
     * Used as fallback when the redirect type cannot be determined.
     */
    static toUrl(url: string, resource: string, submitterName: string | null): SpaRedirectResponse {
        return new SpaRedirectResponse(url, 'url', submitterName, resource);
    }

    // ── Factory — resolves from fetch Response + submitter context ─────────

    /**
     * Resolve a SpaRedirectResponse from a fetch Response and the submitter
     * button that was clicked.
     *
     * This mirrors Symfony's CRUDController::redirectTo() logic exactly:
     *
     * ```php
     * if (btn_update_and_list)   → redirectToList()
     * if (btn_create_and_list)   → redirectToList()
     * if (btn_create_and_create) → redirect to create
     * if (btn_delete)            → redirectToList()
     * default                    → redirect to edit or show
     * ```
     *
     * @param response      - The fetch Response from the form POST
     * @param submitterName - The name attribute of the clicked submit button
     * @param resource      - The Sonata resource (e.g. 'book')
     * @param listUrl       - The list URL for this resource
     * @param createUrl     - The create URL for this resource (optional)
     * 
     */
    static resolve(
        response: FetchResponseInterface,
        submitterName: string | null,
        resource: string,
        listUrl: string,
        createUrl?: string,
    ): SpaRedirectResponse {
        // ── Buttons that always go to list ─────────────────────────────────
        const goesToList = [
            'btn_update_and_list',
            'btn_create_and_list',
            'btn_delete',
        ];

        if (submitterName && goesToList.includes(submitterName)) {
            return SpaRedirectResponse.toList(listUrl, resource, submitterName);
        }

        // ── btn_create_and_create → create page ────────────────────────────
        if (submitterName === 'btn_create_and_create') {
            const url = createUrl ?? listUrl;
            return SpaRedirectResponse.toCreate(url, resource);
        }

        // ── Default — use Location header from server response ─────────────
        const redirectUrl = response.redirected
            ? response.originalResponse.url
            : response.headers.get('Location') ?? listUrl;

        const redirectedPath = new URL(redirectUrl, window.location.origin).pathname;

        // Detect edit or show from the redirected URL path
        if (redirectedPath.includes('/edit')) {
            return SpaRedirectResponse.toEdit(redirectUrl, resource);
        }  

        if (redirectedPath.includes('/show')) {
            return SpaRedirectResponse.toShow(redirectUrl, resource);
        }

        // Fallback — explicit URL
        return SpaRedirectResponse.toUrl(redirectUrl, resource, submitterName);
    }

    /** Returns true if this redirect goes to the list page */
    get isToList(): boolean {
        return this.type === 'list';
    }

    /** Returns true if this redirect goes to a create page */
    get isToCreate(): boolean {
        return this.type === 'create';
    }

    /** Returns true if this redirect stays on edit/show */
    get isToDetail(): boolean {
        return this.type === 'edit' || this.type === 'show';
    }

    toString(): string {
        return `SpaRedirectResponse(type=${this.type}, url=${this.url}, submitter=${this.submitterName})`;
    }
}