/**
 * @wlindabla/sonata_spa — Types
 * TypeScript contracts for the entire SPA architecture
 * @author AGBOKOUDJO Franck <internationaleswebservices@gmail.com>
 */

import { Env } from "@wlindabla/form_validator/utils";

// ─── CRUDPageType ─────────────────────────────────────────────────────────────

/**
 * Page type detected by the RouteResolver from the Sonata URL.
 *
 * SonataAdmin generates URLs like:
 *   /admin/{prefix}/{resource}/list
 *   /admin/{prefix}/{resource}/{token}/show
 *   /admin/{prefix}/{resource}/{token}/edit   → serverManaged by default
 *   /admin/{prefix}/{resource}/create         → serverManaged by default
 *   /admin/{prefix}/{resource}/{token}/delete
 *   /admin/dashboard
 */
export type CRUDPageType =
    | 'list'
    | 'show'
    | 'create'
    | 'edit'
    | 'delete'
    | 'dashboard'
    | 'batch'
    | 'unknown';

// ─── RouteMatch ───────────────────────────────────────────────────────────────

/**
 * Result of URL resolution by the RouteResolver.
 * Frontend equivalent of Symfony's RouteMatch.
 *
 * @example
 * // /admin/app/user/list
 * // → { pageType: 'list', resource: 'user', token: undefined, url: '...' }
 *
 * // /admin/app/user/s69db38c053269/show
 * // → { pageType: 'show', resource: 'user', token: 's69db38c053269', url: '...' }
 */
export interface RouteMatch {
    /** Detected CRUD page type */
    readonly pageType: CRUDPageType;
    /** Sonata resource name e.g. "user", "product" */
    readonly resource: string;
    /** Unique object token for show/edit/delete — absent for list/create */
    readonly token?: string|undefined;
    /** Full resolved URL */
    readonly url: string;
}

// ─── SpaRequest ───────────────────────────────────────────────────────────────

/**
 * Represents a SPA navigation request.
 * Frontend equivalent of Symfony's Request object.
 * Created by BindingManagers and passed to SpaKernel.handle().
 */
export interface SpaRequest {
    /** Destination URL */
    readonly url: string;
    /** HTML element that triggered the navigation (clicked link) */
    readonly target?: HTMLElement;
    /** Origin of the navigation request */
    readonly trigger: 'click' | 'popstate' | 'programmatic' | 'batch';
}

// ─── SpaResponse ──────────────────────────────────────────────────────────────

/**
 * Represents the response received from the server after a fetch.
 * Mutable — can be modified in SpaResponseEvent before DOM swap.
 * Frontend equivalent of Symfony's Response object.
 */
export interface SpaResponse {
    /** Raw HTML received from the server */
    html: string;
    /** Virtual document parsed with DOMParser — ready for swap */
    virtualDoc: Document;
    /** RouteMatch associated with this response */
    readonly routeMatch: RouteMatch;
    /** HTTP response status code */
    readonly statusCode: number;
}

// ─── SwapContext ──────────────────────────────────────────────────────────────

/**
 * Context passed to DomSwapManager and SwapStrategies.
 * Contains everything a strategy needs to perform the DOM swap.
 */
export interface SwapContext {
    /** Server response containing HTML and virtualDoc */
    readonly response: SpaResponse;
    /** Resolved RouteMatch — determines which strategy to use */
    readonly routeMatch: RouteMatch;
    /** Main container element #app-main */
    readonly mainContainer: HTMLElement;
    /** Content area element #app-content */
    readonly mainContentArea: HTMLElement;
    /** Content header element #app-content-header — null on dashboard */
    readonly mainContentHeader: HTMLElement | null;
}

// ─── FetchConfirmDeleteOptions ────────────────────────────────────────────────

/**
 * Data extracted from the Sonata delete confirmation page.
 * Fetched by DeleteConfirmFetcher from the Sonata HTML page.
 *
 * Sonata generates a page containing:
 *   <div class="sonata-ba-delete">
 *     <input name="_sonata_csrf_token" value="...">
 *     <div class="box-header"><div class="box-title">Title</div></div>
 *     <div class="box-body">Confirmation message</div>
 *     <button type="submit">Delete</button>
 *   </div>
 */
export interface FetchConfirmDeleteOptions {
    /** CSRF token extracted from the Sonata delete form */
    readonly csrfToken: string | null;
    /** Confirmation modal title */
    readonly title: string | null;
    /** Confirmation message */
    readonly message: string | null;
    /** Delete button label */
    readonly btnDeleteText: string | null;
}

// ─── SpaRouterOptions ─────────────────────────────────────────────────────────

/**
 * Configuration options for the SpaKernel.
 * Provided by the developer when instantiating.
 *
 * @example
 * ```typescript
 * const spa = new SpaKernel({
 *   router: {
 *     sidebarSelector: '#sonata-admin-sidebar',
 *     mainSelector: '#app-main',
 *     mainContentAreaSelector: '#app-content',
 *     mainContentHeaderSelector: '#app-content-header',
 *   },
 *   serverManagedUrlOptions: [
 *     /\/edit(\?.*)?$/,
 *     /\/create(\?.*)?$/
 *   ],
 * });
 * spa.boot();
 * ```
 */
export interface SpaRouterOptions {
    router: {
        /** CSS selector for the AdminLTE sidebar — default: '#sonata-admin-sidebar' */
        sidebarSelector?: string;
        /** CSS selector for the main container — default: '#app-main' */
        mainSelector?: string;
        /** CSS selector for the content area — default: '#app-content' */
        mainContentAreaSelector?: string;
        /** CSS selector for the content header — default: '#app-content-header' */
        mainContentHeaderSelector?: string;
    };
    /**
     * URLs managed by the Symfony server — triggers a full page reload.
     * The developer can override this list.
     * Default: /edit/, /create/, /batch/
     * Reason: CSRF tokens, complex Sonata forms.
     */
    serverManagedUrlOptions?: RegExp[];
    /**
     * CSS selectors for generic Sonata content areas to swap.
     * Default: ['.sonata-ba-form', '.sonata-ba-show', '.sonata-ba-content', '.sonata-ba-preview']
     */
    genericSelectors?: string[];
    /**
     * CSS selector for the list data table container.
     * Default: '.col-xs-12.col-md-12:has(.list-table-container)'
     */
    listDataTableContainerSelector?: string;
    /**
     * CSS selector for the filters box.
     * Default: '.sonata-filters-box'
     */
    filtersBoxSelector?: string;
}

// ─── CRUDSuffixURL ────────────────────────────────────────────────────────────

/**
 * URL suffixes generated by SonataAdmin for each CRUD action.
 * Used by RouteResolver to detect the page type.
 */
export type CRUDSuffixURL =
    | 'create'
    | 'list'
    | 'edit'
    | 'show'
    | 'delete'
    | 'batch'
    | 'dashboard';

export type APP_ENV = Env;

export interface BatchConfirmData {
    title: string;
    message: string;
    confirmUrl: string;       // action du form de confirmation
    csrfToken: string;        // _sonata_csrf_token
    encodedData: string;      // data encodé (idx, action, all_elements)
    action: string;           // l'action batch (ex: "delete")
    idx: string[];            // les IDs sélectionnés
    allElements: boolean;
    btnDeleteText: string;
}

/** The type of redirect — mirrors Symfony's redirectTo() logic */
export type SpaRedirectType =
    | 'list'          // btn_update_and_list, btn_create_and_list, btn_delete
    | 'create'        // btn_create_and_create
    | 'edit'          // default after edit → back to edit
    | 'show'          // default after edit → show if no edit route
    | 'url';          // explicit URL (from Location header or response.url)
