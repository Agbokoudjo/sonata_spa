/**
 * @wlindabla/sonata_spa — Events
 * All SPA event constants and event classes
 * Inspired by Symfony's KernelEvents and StoppableEventInterface
 * @author AGBOKOUDJO Franck <internationaleswebservices@gmail.com>
 */

import { BaseEvent } from '@wlindabla/event_dispatcher';
import type {
    SpaRequest, 
    SpaResponse,
     RouteMatch, 
     SwapContext,
     BatchConfirmData, 
    CRUDPageType } from '../types';

// ─── SpaEvents — Event name constants ────────────────────────────────────────

/**
 * All event name constants for @wlindabla/sonata_spa.
 * Single source of truth — use these constants everywhere instead of raw strings.
 *
 * Naming convention:
 *   spa:*    → lifecycle events (navigation, fetch, swap, dom)
 *   crud:*   → CRUD page type events dispatched after RouteResolver
 * These constants define the lifecycle of the Single Page Application.
 * They are used by the EventDispatcher to orchestrate communication 
 *   between the SpaKernel and its Subscribers.
 *  Stoppable events (stopPropagation() cancels the pipeline):
 *   - SpaEvents.REQUEST          → cancel navigation (unsaved changes guard)
 *   - SpaEvents.ROUTE_RESOLVED   → developer takes full control of navigation
 *   - SpaEvents.SWAP_BEFORE      → developer performs custom DOM swap
 *
 * Mutable events (payload can be modified before next step):
 *   - SpaEvents.RESPONSE         → modify HTML before DOM swap
 */
export abstract class SpaEvents {
    // ── Navigation lifecycle ──────────────────────────────────────────────────

    /** Dispatched when a navigation is requested — STOPPABLE */
    static readonly REQUEST = 'spa:request' as const;

    /** Dispatched after RouteResolver resolves the URL — STOPPABLE */
    static readonly ROUTE_RESOLVED = 'spa:route:resolved' as const;

    /** Dispatched when the server response is received — MUTABLE */
    static readonly RESPONSE = 'spa:response' as const;

    /** Dispatched when navigation completes successfully */
    static readonly NAVIGATE_COMPLETED = 'spa:navigate:completed' as const;

    /** Dispatched when a server-managed URL is detected — full page reload */
    static readonly SERVER_REDIRECT = 'spa:server:redirect' as const;

    // ── Fetch lifecycle ───────────────────────────────────────────────────────

    /** Dispatched just before the HTTP request is sent */
    static readonly FETCH_PREPARE = 'spa:fetch:prepare' as const;

    /** Dispatched when the HTTP request starts */
    static readonly FETCH_STARTED = 'spa:fetch:started' as const;

    /** Dispatched when the server returns a 2xx response */
    static readonly FETCH_SUCCEEDED = 'spa:fetch:succeeded' as const;

    /** Dispatched when the server returns a 4xx/5xx response */
    static readonly FETCH_FAILED = 'spa:fetch:failed' as const;

    /** Dispatched on network error, timeout or abort */
    static readonly FETCH_ERRORED = 'spa:fetch:errored' as const;

    /** Dispatched when the HTTP request finishes (always — success or error) */
    static readonly FETCH_FINISHED = 'spa:fetch:finished' as const;

    // ── DOM swap lifecycle ────────────────────────────────────────────────────

    /** Dispatched before the DOM swap — STOPPABLE (developer can do custom swap) */
    static readonly SWAP_BEFORE = 'spa:swap:before' as const;

    /** Dispatched after the DOM swap completes */
    static readonly SWAP_AFTER = 'spa:swap:after' as const;

    /** Dispatched after DomManager.reinitialize() — all scripts/BS5/Stimulus ready */
    static readonly DOM_READY = 'spa:dom:ready' as const;

    // ── CRUD page type events — dispatched by RouteResolver ──────────────────

    /** Dispatched when the resolved page type is 'list' */
    static readonly CRUD_LIST = 'crud:list' as const;

    /** Dispatched when the resolved page type is 'show' */
    static readonly CRUD_SHOW = 'crud:show' as const;

    /** Dispatched when the resolved page type is 'create' (client-side only) */
    static readonly CRUD_CREATE = 'crud:create' as const;

    /** Dispatched when the resolved page type is 'edit' (client-side only) */
    static readonly CRUD_EDIT = 'crud:edit' as const;

    /** Dispatched when the resolved page type is 'delete' */
    static readonly CRUD_DELETE = 'crud:delete' as const;

    /** Dispatched when the resolved page type is 'dashboard' */
    static readonly DASHBOARD = 'spa:dashboard' as const;

    // ── Form lifecycle ────────────────────────────────────────────────────────

    /** Dispatched by FormBindingManager when a Sonata form is submitted */
    static readonly FORM_SUBMIT = 'spa:form:submit' as const;

    /** Dispatched when client-side validation fails — form is blocked */
    static readonly FORM_INVALID = 'spa:form:invalid' as const;

    /** Dispatched when form submission succeeds (2xx from server) */
    static readonly FORM_SUCCEEDED = 'spa:form:succeeded' as const;

    /** Dispatched when form submission fails (4xx/5xx from server) */
    static readonly FORM_FAILED = 'spa:form:failed' as const;

    // ── Delete confirmation lifecycle ─────────────────────────────────────────

    /** Dispatched when delete confirmation modal should be shown */
    static readonly DELETE_CONFIRM_REQUESTED = 'spa:delete:confirm:requested' as const;

    /** Dispatched when the user cancels the delete confirmation */
    static readonly DELETE_CONFIRM_CANCELLED = 'spa:delete:confirm:cancelled' as const;

    /** Dispatched when the user confirms the delete action */
    static readonly DELETE_CONFIRM_ACCEPTED = 'spa:delete:confirm:accepted' as const;

    // ─── Delete lifecycle event names (add to SpaEvents) ─────────────────────────

    /** Dispatched when a delete request is in progress */
    static readonly DELETE_PROCESSING = 'spa:delete:processing' as const;

    /** Dispatched when a delete request succeeds (2xx from server) */
    static readonly DELETE_SUCCEEDED = 'spa:delete:succeeded' as const;

    /** Dispatched when a delete request fails (4xx–599 from server) */
    static readonly DELETE_FAILED = 'spa:delete:failed' as const;

    // ─── Batch event names (add to SpaEvents) ────────────────────────────────────

    /** Dispatched when a batch confirmation modal should be shown */
    static readonly BATCH_CONFIRM_REQUESTED = 'spa:batch:confirm:requested' as const;

    /** Dispatched when the user cancels the batch confirmation */
    static readonly BATCH_CONFIRM_CANCELLED = 'spa:batch:confirm:cancelled' as const;

    /** Dispatched when the user confirms the batch action */
    static readonly BATCH_CONFIRM_ACCEPTED = 'spa:batch:confirm:accepted' as const;

    /** Dispatched when a batch request is in progress (after user confirmation) */
    static readonly BATCH_PROCESSING = 'spa:batch:processing' as const;

    /** Dispatched when a batch request succeeds (2xx from server) */
    static readonly BATCH_SUCCEEDED = 'spa:batch:succeeded' as const;

    /** Dispatched when a batch request fails (4xx–599 from server) */
    static readonly BATCH_FAILED = 'spa:batch:failed' as const;

    /** Dispatched when the resolved page type is 'batch' */
    static readonly CRUD_BATCH = 'crud:batch' as const;
}

/**
 * Dispatched when a SPA navigation is requested.
 * STOPPABLE — call stopPropagation() to cancel navigation.
 *
 * Use cases:
 *   - Block navigation when a form has unsaved changes
 *   - Show a confirmation dialog before leaving the page
 *
 * @example
 * ```typescript
 * dispatcher.addListener(SpaEvents.REQUEST, (event: SpaRequestEvent) => {
 *   if (hasUnsavedChanges()) {
 *     event.stopPropagation(); // navigation cancelled
 *   }
 * });
 * ```
 */
export class SpaRequestEvent extends BaseEvent {
    public constructor(
        private readonly _request: SpaRequest
    ) {
        super();
    }

    /** The navigation request that was requested */
    public get request(): SpaRequest {
        return this._request;
    }
}

/**
 * Dispatched after the RouteResolver resolves the URL to a RouteMatch.
 * STOPPABLE — call stopPropagation() to take full control of this navigation.
 *
 * Use cases:
 *   - Handle a custom page type outside Sonata CRUD
 *   - Override routing logic for a specific resource
 *
 * @example
 * ```typescript
 * dispatcher.addListener(SpaEvents.ROUTE_RESOLVED, (event: SpaRouteResolvedEvent) => {
 *   if (event.routeMatch.resource === 'my-custom-resource') {
 *     event.stopPropagation(); // handle it yourself
 *     myCustomHandler(event.routeMatch);
 *   }
 * });
 * ```
 */
export class SpaRouteResolvedEvent extends BaseEvent {
    public constructor(
        private readonly _request: SpaRequest,
        private readonly _routeMatch: RouteMatch
    ) {
        super();
    }

    public get request(): SpaRequest {
        return this._request;
    }

    public get routeMatch(): RouteMatch {
        return this._routeMatch;
    }
}

/**
 * Dispatched when the server response is received.
 * MUTABLE — modify response.html before DOM swap.
 * NOT stoppable — the response is already here.
 *
 * Use cases:
 *   - Inject additional content into the HTML before swap
 *   - Modify page title
 *   - Add breadcrumbs
 *
 * @example
 * ```typescript
 * dispatcher.addListener(SpaEvents.RESPONSE, (event: SpaResponseEvent) => {
 *   event.response.html = event.response.html.replace(
 *     '</title>', ' — My App</title>'
 *   );
 * });
 * ```
 */
export class SpaResponseEvent extends BaseEvent {
    public constructor(
        private readonly _request: SpaRequest,
        private readonly _response: SpaResponse
    ) {
        super();
    }

    public get request(): SpaRequest {
        return this._request;
    }

    /** Mutable — can be modified before the DOM swap */
    public get response(): SpaResponse {
        return this._response;
    }
}

/**
 * Dispatched before the DOM swap.
 * STOPPABLE — call stopPropagation() to perform a custom DOM swap.
 *
 * Use cases:
 *   - Custom DOM swap with animation
 *   - Partial swap for a specific page
 *
 * @example
 * ```typescript
 * dispatcher.addListener(SpaEvents.SWAP_BEFORE, (event: SpaSwapEvent) => {
 *   if (event.routeMatch.resource === 'dashboard') {
 *     event.stopPropagation(); // handle swap yourself
 *     myCustomDashboardSwap(event.context);
 *   }
 * });
 * ```
 */
export class SpaSwapEvent extends BaseEvent {
    public constructor(
        private readonly _context: SwapContext
    ) {
        super();
    }

    public get context(): SwapContext {
        return this._context;
    }

    public get routeMatch(): RouteMatch {
        return this._context.routeMatch;
    }
}

/**
 * Dispatched after the DOM swap completes.
 * NOT stoppable.
 */
export class SpaSwapAfterEvent extends BaseEvent {
    public constructor(
        private readonly _context: SwapContext
    ) {
        super();
    }

    public get context(): SwapContext {
        return this._context;
    }
}

/**
 * Dispatched after DomManager.reinitialize() completes.
 * NOT stoppable.
 * All scripts, Bootstrap 5 components and Stimulus controllers are ready.
 *
 * Use cases:
 *   - Third-party modules that need to re-initialize after a swap
 *   - BindingManagers that need to rebind event listeners
 *
 * @example
 * ```typescript
 * dispatcher.addListener(SpaEvents.DOM_READY, (event: SpaDomReadyEvent) => {
 *   myLibrary.init(event.container);
 * });
 * ```
 */
export class SpaDomReadyEvent extends BaseEvent {
    public constructor(
        private readonly _container: HTMLElement,
        private readonly _routeMatch: RouteMatch
    ) {
        super();
    }

    /** The swapped container element — use this to scope your re-initialization */
    public get container(): HTMLElement {
        return this._container;
    }

    public get routeMatch(): RouteMatch {
        return this._routeMatch;
    }
}

/**
 * Dispatched when navigation completes successfully.
 * NOT stoppable.
 */
export class SpaNavigateCompletedEvent extends BaseEvent {
    public constructor(
        private readonly _from: string,
        private readonly _to: string,
        private readonly _routeMatch: RouteMatch,
        public readonly newMainContainer: HTMLElement,
        public readonly newMainContentArea: HTMLElement,
        public readonly newMainContentHeader: HTMLElement|null
    ) {
        super();
    }

    /** The URL we navigated from */
    public get from(): string {
        return this._from;
    }

    /** The URL we navigated to */
    public get to(): string {
        return this._to;
    }

    public get routeMatch(): RouteMatch {
        return this._routeMatch;
    }
}

/**
 * Dispatched when a CRUD page event is triggered (crud:list, crud:show, etc.).
 * This is the event that Page Subscribers listen to.
 * Carries the full context needed by the subscriber to handle the navigation.
 */
export class SpaCrudEvent extends BaseEvent {
    public constructor(
        private readonly _request: SpaRequest,
        private readonly _routeMatch: RouteMatch,
        private readonly _pageType: CRUDPageType
    ) {
        super();
    }

    public get request(): SpaRequest {
        return this._request;
    }

    public get routeMatch(): RouteMatch {
        return this._routeMatch;
    }

    public get pageType(): CRUDPageType {
        return this._pageType;
    }
}

/**
 * Sonata submit button name constants.
 * Each button name tells Sonata what to do after a successful save.
 * Sonata reads the submitted button name server-side to determine the redirect.
 *
 * Edit page buttons:
 *   btn_update_and_list  → save and redirect to list
 *   btn_update_and_edit  → save and stay on edit page
 *   btn_preview          → save and show preview
 *
 * Create page buttons:
 *   btn_create_and_list    → create and redirect to list
 *   btn_create_and_edit    → create and redirect to edit page
 *   btn_create_and_create  → create and show empty create form again
 *   btn_create             → simple create (XHR mode)
 *   btn_update             → simple update (XHR mode)
 */
export const SonataSubmitButton = {
    // Edit actions
    UPDATE_AND_LIST: 'btn_update_and_list',
    UPDATE_AND_EDIT: 'btn_update_and_edit',
    UPDATE: 'btn_update',
    PREVIEW: 'btn_preview',
    // Create actions
    CREATE_AND_LIST: 'btn_create_and_list',
    CREATE_AND_EDIT: 'btn_create_and_edit',
    CREATE_AND_CREATE: 'btn_create_and_create',
    CREATE: 'btn_create',
} as const;

export type SonataSubmitButtonName = typeof SonataSubmitButton[keyof typeof SonataSubmitButton];

/**
 * Dispatched by FormBindingManager when a Sonata form is submitted.
 * Listened to by FormSubscriber.
 *
 * Carries:
 *   - The form element
 *   - The RouteMatch resolved from the form action URL
 *   - The submitter button element (which button was clicked)
 *   - The submitter button name (btn_create_and_list, btn_update_and_list, etc.)
 *
 * The submitter button name is critical — Sonata uses it server-side
 * to determine the redirect after a successful save.
 * FormSubscriber includes it in the POST body so Sonata redirects correctly.
 *
 * At this point, @wlindabla/form_validator has already validated the form
 * client-side — the submit button was disabled if invalid.
 * FormSubmission from @wlindabla/form_validator handles data-iwas-confirm.
 */
export class SpaFormSubmitEvent extends BaseEvent {
    public constructor(
        private readonly _form: HTMLFormElement,
        private readonly _routeMatch: RouteMatch,
        private readonly _submitter: HTMLButtonElement | null = null
    ) {
        super();
    }

    public get form(): HTMLFormElement {
        return this._form;
    }

    public get routeMatch(): RouteMatch {
        return this._routeMatch;
    }

    /**
     * The button element that triggered the submit.
     * Use this to identify which Sonata action was requested.
     */
    public get submitter(): HTMLButtonElement | null {
        return this._submitter;
    }

    /**
     * The name attribute of the clicked submit button.
     * Sonata reads this server-side to determine the post-save redirect.
     *
     * Examples:
     *   'btn_update_and_list'  → redirect to list after edit
     *   'btn_create_and_list'  → redirect to list after create
     *   'btn_create_and_edit'  → redirect to edit page after create
     */
    public get submitterName(): SonataSubmitButtonName | null {
        const name = this._submitter?.getAttribute('name');
        return (name as SonataSubmitButtonName) ?? null;
    }

    /**
     * Whether the form action leads back to the list page after submit.
     * True for btn_update_and_list and btn_create_and_list.
     */
    public get redirectsToList(): boolean {
        const name = this.submitterName;
        return name === SonataSubmitButton.UPDATE_AND_LIST ||
            name === SonataSubmitButton.CREATE_AND_LIST;
    }

    /**
     * Whether the form action stays on the edit page after submit.
     * True for btn_update_and_edit and btn_create_and_edit.
     */
    public get redirectsToEdit(): boolean {
        const name = this.submitterName;
        return name === SonataSubmitButton.UPDATE_AND_EDIT ||
            name === SonataSubmitButton.CREATE_AND_EDIT;
    }
}

/**
 * Dispatched when the fetch request encounters a network error.
 * NOT stoppable.
 * The SpaKernel falls back to window.location.href on network errors.
 */
export class SpaFetchErrorEvent extends BaseEvent {
    public constructor(
        private readonly _request: SpaRequest,
        private readonly _error: Error
    ) {
        super();
    }

    public get request(): SpaRequest {
        return this._request;
    }

    public get error(): Error {
        return this._error;
    }
}

/**
 * Dispatched when the delete confirmation modal should be shown.
 * Listened to by the UI confirmation handler (SweetAlert2 or custom modal).
 *
 * The handler must call either:
 *   - event.accept()  → proceeds with the delete POST request
 *   - event.cancel()  → cancels the delete action
 */
export class SpaDeleteConfirmRequestedEvent extends BaseEvent {
    private _accepted: boolean = false;
    private _confirmCallback: (() => Promise<void>) | null = null;
    private _cancelCallback: (() => void) | null = null;

    public constructor(
        private readonly _title: string | null,
        private readonly _message: string | null,
        private readonly _btnDeleteText: string | null,
        private readonly _routeMatch: RouteMatch
    ) {
        super();
    }

    public get title(): string | null {
        return this._title;
    }

    public get message(): string | null {
        return this._message;
    }

    public get btnDeleteText(): string | null {
        return this._btnDeleteText;
    }

    public get routeMatch(): RouteMatch {
        return this._routeMatch;
    }

    public get isAccepted(): boolean {
        return this._accepted;
    }

    /**
     * Register the callback to execute when the user confirms the delete.
     * Called internally by DeletePageSubscriber.
     */
    public onAccept(callback: () => Promise<void>): void {
        this._confirmCallback = callback;
    }

    /**
     * Register the callback to execute when the user cancels.
     * Called internally by DeletePageSubscriber.
     */
    public onCancel(callback: () => void): void {
        this._cancelCallback = callback;
    }

    /**
     * Call this from your confirmation UI to proceed with the delete.
     */
    public async accept(): Promise<void> {
        this._accepted = true;
        if (this._confirmCallback) {
            await this._confirmCallback();
        }
    }

    /**
     * Call this from your confirmation UI to cancel the delete.
     */
    public cancel(): void {
        this._accepted = false;
        if (this._cancelCallback) {
            this._cancelCallback();
        }
    }
}

/**
 * Dispatched when a server-managed URL is detected by RequestMatcher.
 * Triggers a full page reload via window.location.href.
 * NOT stoppable.
 */
export class SpaServerRedirectEvent extends BaseEvent {
    public constructor(
        private readonly _url: string,
        private readonly _reason: 'server-managed' | 'error-fallback'
    ) {
        super();
    }

    public get url(): string {
        return this._url;
    }

    /** Reason for the server redirect */
    public get reason(): 'server-managed' | 'error-fallback' {
        return this._reason;
    }
}
// ─── Delete lifecycle event classes ─
/**
 * Dispatched when a delete request is in progress (after user confirmation).
 * NOT stoppable — the HTTP request has already been sent.
 *
 * Use cases:
 *   - Show a loading spinner or disable the confirm button
 *   - Log the pending deletion for audit purposes
 *
 * @example
 * ```typescript
 * dispatcher.addListener(SpaEvents.DELETE_PROCESSING, (event: SpaDeleteProcessingEvent) => {
 *   showSpinner();
 * });
 * ```
 */
export class SpaDeleteProcessingEvent extends BaseEvent {
    public constructor(
        private readonly _routeMatch: RouteMatch,
        public readonly title:string ,
        public readonly message:string
    ) {
        super();
    }

    public get routeMatch(): RouteMatch {
        return this._routeMatch;
    }
}

/**
 * Dispatched when the delete request completes successfully (2xx response).
 * NOT stoppable.
 *
 * Use cases:
 *   - Remove the deleted row from the DOM without a full page reload
 *   - Show a success toast/notification
 *   - Trigger a list refresh
 *
 * @example
 * ```typescript
 * dispatcher.addListener(SpaEvents.DELETE_SUCCEEDED, (event: SpaDeleteSucceededEvent) => {
 *   showToast(`Item deleted successfully`);
 *   refreshList(event.routeMatch);
 * });
 * ```
 */
export class SpaDeleteSucceededEvent extends BaseEvent {
    public constructor(
        private readonly _routeMatch: RouteMatch,
        private readonly _messageBody: string,
        public readonly title: string
    ) {
        super();
    }

    public get routeMatch(): RouteMatch {
        return this._routeMatch;
    }

    /** The server response message received after the successful deletion */
    public get messageBody(): string {
        return this._messageBody;
    }
}

/**
 * Dispatched when the delete request fails with an HTTP error status (4xx–599).
 * NOT stoppable.
 *
 * Use cases:
 *   - Show an error message to the user (forbidden, not found, server error)
 *   - Log the failure for monitoring
 *   - Re-enable the confirm button so the user can retry
 *
 * @example
 * ```typescript
 * dispatcher.addListener(SpaEvents.DELETE_FAILED, (event: SpaDeleteFailedEvent) => {
 *   showErrorToast(`Delete failed: ${event.statusCode}`);
 * });
 * ```
 */
export class SpaDeleteFailedEvent extends BaseEvent {
    public constructor(
        private readonly _routeMatch: RouteMatch,
        private readonly _statusCode: number,
        private readonly _statusText: string ,
        public readonly title:string //for by sweetAlert
    ) {
        super();
    }

    public get routeMatch(): RouteMatch {
        return this._routeMatch;
    }

    /**
     * The HTTP status code returned by the server.
     * Expected range: 400–599.
     */
    public get statusCode(): number {
        return this._statusCode;
    }

    /**
     * The HTTP status text returned by the server (e.g. "Not Found", "Forbidden").
     */
    public get statusText(): string {
        return this._statusText;
    }
}


// ─── Batch event classes ──────────────────────────────────────────────────────

/**
 * Dispatched when the batch confirmation modal should be shown.
 * Listened to by the UI confirmation handler (SweetAlert2 or custom modal).
 *
 * The handler must call either:
 *   - event.accept()  → proceeds with the batch POST request
 *   - event.cancel()  → cancels the batch action
 *
 * @example
 * ```typescript
 * dispatcher.addListener(SpaEvents.BATCH_CONFIRM_REQUESTED, async (event) => {
 *   const result = await Swal.fire({
 *     title: event.confirmData.title ?? 'Are you sure?',
 *     text: event.confirmData.message ?? 'This action cannot be undone.',
 *     icon: 'warning',
 *     showCancelButton: true,
 *   });
 *   if (result.isConfirmed) { await event.accept(); } else { event.cancel(); }
 * });
 * ```
 */
export class SpaBatchConfirmRequestedEvent extends BaseEvent {
    private _confirmCallback: (() => Promise<void>) | null = null;
    private _cancelCallback: (() => void) | null = null;

    public constructor(
        private readonly _confirmData: BatchConfirmData,
        private readonly _routeMatch: RouteMatch
    ) {
        super();
    }

    public get confirmData(): BatchConfirmData {
        return this._confirmData;
    }

    public get routeMatch(): RouteMatch {
        return this._routeMatch;
    }

    /** Register the callback to execute when the user confirms. Called internally by BatchPageSubscriber. */
    public onAccept(callback: () => Promise<void>): void {
        this._confirmCallback = callback;
    }

    /** Register the callback to execute when the user cancels. Called internally by BatchPageSubscriber. */
    public onCancel(callback: () => void): void {
        this._cancelCallback = callback;
    }

    /** Call this from your confirmation UI to proceed with the batch action. */
    public async accept(): Promise<void> {
        if (this._confirmCallback) {
            await this._confirmCallback();
        }
    }

    /** Call this from your confirmation UI to cancel the batch action. */
    public cancel(): void {
        if (this._cancelCallback) {
            this._cancelCallback();
        }
    }
}

/**
 * Dispatched when a batch request is in progress (after user confirmation).
 * NOT stoppable — the HTTP request has already been sent.
 *
 * Use cases:
 *   - Show a loading spinner or disable the confirm button
 *   - Log the pending batch operation for audit purposes
 *
 * @example
 * ```typescript
 * dispatcher.addListener(SpaEvents.BATCH_PROCESSING, (event: SpaBatchProcessingEvent) => {
 *   showSpinner();
 * });
 * ```
 */
export class SpaBatchProcessingEvent extends BaseEvent {
    public constructor(
        private readonly _routeMatch: RouteMatch,
        public readonly title: string,
        public readonly message: string
    ) {
        super();
    }

    public get routeMatch(): RouteMatch {
        return this._routeMatch;
    }
}

/**
 * Dispatched when the batch request completes successfully (2xx response).
 * NOT stoppable.
 *
 * Use cases:
 *   - Show a success toast/notification
 *   - Trigger a list refresh
 *
 * @example
 * ```typescript
 * dispatcher.addListener(SpaEvents.BATCH_SUCCEEDED, (event: SpaBatchSucceededEvent) => {
 *   showToast(event.message);
 * });
 * ```
 */
export class SpaBatchSucceededEvent extends BaseEvent {
    public constructor(
        private readonly _routeMatch: RouteMatch,
        public readonly message: string,
        public readonly title: string
    ) {
        super();
    }

    public get routeMatch(): RouteMatch {
        return this._routeMatch;
    }
}

/**
 * Dispatched when the batch request fails with an HTTP error status (4xx–599).
 * NOT stoppable.
 *
 * Use cases:
 *   - Show an error message to the user (forbidden, not found, server error)
 *   - Re-enable the confirm button so the user can retry
 *
 * @example
 * ```typescript
 * dispatcher.addListener(SpaEvents.BATCH_FAILED, (event: SpaBatchFailedEvent) => {
 *   showErrorToast(`Batch action failed: ${event.statusCode}`);
 * });
 * ```
 */
export class SpaBatchFailedEvent extends BaseEvent {
    public constructor(
        private readonly _routeMatch: RouteMatch,
        private readonly _statusCode: number,
        private readonly _statusText: string
    ) {
        super();
    }

    public get routeMatch(): RouteMatch {
        return this._routeMatch;
    }

    /**
     * The HTTP status code returned by the server.
     * Expected range: 400–599.
     */
    public get statusCode(): number {
        return this._statusCode;
    }

    /**
     * The HTTP status text returned by the server (e.g. "Forbidden", "Internal Server Error").
     */
    public get statusText(): string {
        return this._statusText;
    }
}