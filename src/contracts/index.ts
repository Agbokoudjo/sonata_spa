/**
 * @wlindabla/sonata_spa — Contracts
 * Interfaces that all classes must implement
 * @author AGBOKOUDJO Franck <internationaleswebservices@gmail.com>
 */

import type {
    SpaRequest,
    SpaResponse,
    SpaRouterOptions,
    SwapContext,
    CRUDPageType,
    RouteMatch,
    FetchConfirmDeleteOptions,
    BatchConfirmData,
    APP_ENV
} from '../types';

import { SpaEvents } from '../Events';

import { FetchResponseInterface } from "@wlindabla/http_client"
import type { BrowserEventDispatcher } from '@wlindabla/event_dispatcher/browser';
import type { EventSubscriberInterface } from '@wlindabla/event_dispatcher';

// ─── SpaRouterInterface ───────────────────────────────────────────────────────
/**
 * Contract for the SpaKernel.
 * Frontend equivalent of Symfony's HttpKernelInterface.
 *
 * The SpaKernel is the central orchestrator of the SPA system.
 * It manages the full navigation pipeline:
 *   BindingManager click → handle() → RequestMatcher → RouteResolver
 *   → dispatch crud:* event → Subscriber → Fetcher → DomSwapper
 *   → HistoryManager → DomManager → spa:navigate:completed
 *
 * @example
 * ```typescript
 * const spa = new SpaKernel(options);
 * spa.addSubscriber(new MyCustomSubscriber());
 * spa.boot();
 * ```
 */
export interface SpaRouterInterface {
    /**
     * Boot the SPA kernel.
     * Instantiates and registers all built-in Subscribers and BindingManagers.
     * Must be called once after instantiation — like Symfony's kernel.boot().
     */
    boot(): void;

    /**
     * Handle a SPA navigation request.
     * Frontend equivalent of Symfony's HttpKernel.handle().
     * Orchestrates the full navigation pipeline.
     *
     * @param request - The navigation request to handle
     */
    handle(request: SpaRequest): Promise<void>;

    /**
     * Programmatically navigate to a URL.
     * Creates a SpaRequest with trigger 'programmatic' and calls handle().
     *
     * @param url - The destination URL
     */
    navigate(url: string): Promise<void>;

    /**
     * Register a custom subscriber on the event dispatcher.
     * Allows the developer to hook into any stage of the navigation pipeline.
     *
     * @param subscriber - The subscriber to register
     * @returns this — for method chaining
     */
    addSubscriber(subscriber: EventSubscriberInterface): this;

    /**
     * Get the current SpaRouterOptions.
     */
    readonly options: SpaRouterOptions;
}

// ─── SwapStrategyInterface ────────────────────────────────────────────────────

/**
 * Contract for DOM swap strategies.
 * Each strategy handles a specific CRUDPageType.
 * Used by DomSwapManager to select the appropriate strategy.
 *
 * Strategy Pattern — each strategy is responsible for:
 *   1. Detecting its target elements in the virtual document
 *   2. Replacing, adding or removing elements in the live DOM
 *   3. Handling all 3 cases: replace existing, add new, remove absent
 *
 * @example
 * ```typescript
 * class MyCustomSwapStrategy implements SwapStrategyInterface {
 *   supports(pageType: CRUDPageType): boolean {
 *     return pageType === 'list';
 *   }
 *   swap(context: SwapContext): void {
 *     // custom swap logic
 *   }
 * }
 * ```
 */
export interface SwapStrategyInterface {
    /**
     * Determines whether this strategy supports the given page type.
     * Called by DomSwapManager to select the right strategy.
     *
     * @param pageType - The detected CRUD page type
     * @returns true if this strategy handles the given page type
     */
    supports(pageType: CRUDPageType): boolean;

    /**
     * Perform the surgical DOM swap.
     * Receives the full SwapContext with the virtual document and DOM references.
     *
     * Must handle all 3 cases for each element:
     *   - newEl exists + currentEl exists → replace
     *   - newEl exists + currentEl absent → append
     *   - newEl absent + currentEl exists → remove
     *
     * @param context - The swap context with virtualDoc and DOM references
     */
    swap(context: SwapContext): void;
}

// ─── BindingManagerInterface ──────────────────────────────────────────────────

/**
 * Contract for DOM event binding managers.
 * Each manager is responsible for intercepting a specific type of user interaction
 * and converting it into a SpaRequest passed to SpaKernel.handle().
 *
 * @example
 * ```typescript
 * class SidebarBindingManager implements BindingManagerInterface {
 *   bind(): void {
 *     this.sidebar.addEventListener('click', (e) => {
 *       // intercept clicks → kernel.handle(new SpaRequest(...))
 *     });
 *   }
 *   rebind(container: HTMLElement): void {
 *     // nothing to rebind for sidebar — it is never swapped
 *   }
 * }
 * ```
 */
export interface BindingManagerInterface {
    /**
     * Bind DOM event listeners.
     * Called once during SpaKernel.boot().
     * Use event delegation where possible to avoid rebinding after swap.
     */
    bind(): void;

    /**
     * Rebind DOM event listeners after a DOM swap.
     * Called after each spa:dom:ready event.
     * Required for elements that are replaced during the swap
     * (pagination links, sorting links, action buttons, etc.)
     *
     * @param container - The swapped container element to rebind within
     */
    rebind(container: HTMLElement): void;
}

// ─── SpaSubscriberInterface ───────────────────────────────────────────────────

/**
 * Contract for SPA event subscribers.
 * Extends EventSubscriberInterface from @wlindabla/event_dispatcher.
 *
 * Each subscriber listens to one or more SPA events (crud:list, crud:show, etc.)
 * and is responsible for the full handling of that event:
 *   fetch → build SpaResponse → dispatch to DomSwapManager → history → dom:ready
 *
 * Frontend equivalent of Symfony's EventSubscriberInterface.
 *
 * @example
 * ```typescript
 * class ListPageSubscriber implements SpaSubscriberInterface {
 *   getSubscribedEvents() {
 *     return {
 *       [SpaEvents.CRUD_LIST]: { listener: 'onList', priority: 0 }
 *     };
 *   }
 *   async onList(event: SpaRouteResolvedEvent): Promise<void> {
 *     // fetch fragment → swap → history → dom:ready
 *   }
 * }
 * ```
 */
export interface SpaSubscriberInterface extends EventSubscriberInterface { }

// ─── DomSwapManagerInterface ──────────────────────────────────────────────────

/**
 * Contract for the DomSwapManager.
 * Selects and executes the appropriate SwapStrategy based on the RouteMatch.
 */
export interface DomSwapManagerInterface {
    /**
     * Select the appropriate strategy and perform the DOM swap.
     * Dispatches spa:swap:before (stoppable) before the swap.
     * Dispatches spa:swap:after after the swap.
     *
     * @param context - The full swap context
     */
    swap(context: SwapContext): void;

    /**
     * Register a custom swap strategy.
     * Custom strategies are checked before built-in strategies.
     *
     * @param strategy - The strategy to register
     * @returns this — for method chaining
     */
    addStrategy(strategy: SwapStrategyInterface): this;
}

// ─── HistoryManagerInterface ──────────────────────────────────────────────────

/**
 * Contract for the HistoryManager.
 * Manages browser history (pushState / popstate).
 */
export interface HistoryManagerInterface {
    /**
     * Push a new entry to the browser history.
     *
     * @param url - The URL to push
     * @param routeMatch - The RouteMatch to store in the history state
     */
    push(url: string, routeMatch: RouteMatch): void;

    /**
     * Start listening to popstate events.
     * Called once during SpaKernel.boot().
     */
    listen(): void;
}

// ─── RouteResolverInterface ───────────────────────────────────────────────────

/**
 * Contract for the RouteResolver.
 * Parses Sonata URLs and returns a RouteMatch.
 */
export interface RouteResolverInterface {
    /**
     * Resolve a URL to a RouteMatch.
     *
     * @param url - The URL to resolve
     * @returns RouteMatch with pageType, resource, token and url
     */
    resolve(url: string): RouteMatch;

    /**
     * Add a custom URL pattern to the RouteResolver.
     * The pattern is prepended so it takes precedence over built-in patterns.
     * Called by SpaExtensionContext.addRoutePattern().
     *
     * @param pattern  - The RegExp to match against the URL pathname
     * @param pageType - The CRUDPageType to assign when the pattern matches
     *
     * @example
     * ```typescript
     * resolver.addPattern(/\/approval(\/)?(\?.*)?$/, 'approval' as CRUDPageType);
     * ```
     */
    addPattern(pattern: RegExp, pageType: CRUDPageType): void
}

// ─── RequestMatcherInterface ──────────────────────────────────────────────────
/**
 * Contract for the RequestMatcher.
 * Determines whether a URL should be handled by the SPA or by the server.
 */
export interface RequestMatcherInterface {
    /**
     * Check if the URL should be handled by the Symfony server.
     * If true, the SpaKernel will redirect via window.location.href.
     *
     * @param url - The URL to check
     * @returns true if the URL is server-managed (full page reload required)
     */
    isServerManaged(url: string): boolean;

    /**
     * Check if a link element should be ignored by the SPA router.
     * Handles: href="#", javascript:, target="_blank", external domains.
     *
     * @param link - The anchor element to check
     * @returns true if the link should be ignored
     */
    shouldIgnoreLink(link: HTMLElement): boolean;

    /**
     * Add a custom server-managed URL pattern at runtime.
     * Called by SpaExtensionContext.addServerManagedUrl().
     *
     * @param pattern - The RegExp to match against the URL
     *
     * @example
     * ```typescript
     * matcher.addServerManagedPattern(/\/export(\?.*)?$/);
     * ```
     */
    addServerManagedPattern(pattern: RegExp): void;
}

// ─── PageFetcherInterface ─────────────────────────────────────────────────────

/**
 * Contract for the PageFetcher.
 * Encapsulates all HTTP fetching logic using @wlindabla/http_client.
 */
export interface PageFetcherInterface {
    /**
     * Fetch a page fragment via AJAX.
     * Sends X-Requested-With: XMLHttpRequest header.
     * Used for list pages where only the content area needs to be replaced.
     *
     * @param url - The URL to fetch
     * @param spaRequest - The original SPA request (for event payloads)
     * @param routeMatch - The resolved RouteMatch
     * @returns The fetch response with HTML content
     */
    fetchFragment(url: string, spaRequest: SpaRequest,routeMatch: RouteMatch): Promise<SpaResponse>;

    /**
     * Fetch a full page.
     * Used for show and dashboard pages where a full page replacement is needed.
     *
     * @param url - The URL to fetch
     * @param spaRequest - The original SPA request (for event payloads)
     * @param routeMatch - The resolved RouteMatch
     * @returns The fetch response with full HTML content
     */
    fetchFullPage(url: string, spaRequest: SpaRequest, routeMatch: RouteMatch): Promise<SpaResponse>;

    /**
     * Update the loading targets when DOM references change after a swap.
     * Called by Page Subscribers after a full page swap that replaces
     * mainContentArea and mainContentHeader.
     *
     * @param mainContentArea - The new content area element
     * @param mainContentHeader - The new content header element (nullable)
     */
    updateLoadingTargets(
        mainContentArea: HTMLElement,
        mainContentHeader: HTMLElement | null
    ): void;
}

/**
 * Contract for any class that handles the Sonata delete confirmation flow.
 *
 * Inspired by Symfony's service interfaces pattern — program to an interface,
 * not to a concrete implementation.
 *
 * Implementations must handle two responsibilities:
 *   1. {@link confirmDelete}   — Fetch the delete confirmation page and extract its data
 *   2. {@link executeDelete}  — Send the actual DELETE POST request with the CSRF token
 *
 * @example
 * ```typescript
 * // Bind your implementation in the container
 * container.bind<DeleteFetcherInterface>('DeleteFetcher').to(DeleteFetcher);
 *
 * // Consume the interface — never the concrete class
 * class DeletePageSubscriber {
 *   constructor(private readonly fetcher: DeleteFetcherInterface) {}
 * }
 * ```
 */
export interface DeleteFetcherInterface {
    /**
     * Fetch the Sonata delete confirmation page and extract its data.
     *
     * Implementations must:
     *   - Perform a GET request to `deleteUrl`
     *   - Extract the CSRF token, title, message and button text from the HTML
     *   - Return `null` if the fetch fails (network error, non-2xx, parse error)
     *
     * @param deleteUrl  - The Sonata delete URL (e.g. `/admin/app/user/42/delete`)
     * @param spaRequest - The original SPA request (forwarded to fetch lifecycle events)
     * @param routeMatch - The resolved RouteMatch (forwarded to fetch lifecycle events)
     * @returns The extracted confirmation data, or `null` on failure
     */
    confirmDelete(
        deleteUrl: string,
        spaRequest: SpaRequest,
        routeMatch: RouteMatch
    ): Promise<FetchConfirmDeleteOptions | null>;

    /**
     * Execute the actual DELETE POST request with the CSRF token.
     *
     * Implementations must:
     *   - Build a FormData with `_sonata_csrf_token`, `_method=DELETE` and `btn_delete=1`
     *   - POST to `deleteUrl` with `X-Requested-With: XMLHttpRequest`
     *   - Throw on network error so the caller can dispatch {@link SpaEvents.DELETE_FAILED}
     *
     * @param deleteUrl  - The Sonata delete URL
     * @param csrfToken  - The CSRF token extracted from the confirmation page
     * @param resource   - The resource name (used for redirect logic after delete)
     * @returns The raw fetch response typed as JSON or string
     * @throws {Error} On network error or unrecoverable failure
     */
    executeDelete(
        deleteUrl: string,
        csrfToken: string,
        resource: string
    ): Promise<FetchResponseInterface>;
}

/**
 * Contract for any class that handles the Sonata batch confirmation flow.
 *
 * Inspired by Symfony's service interfaces pattern — program to an interface,
 * not to a concrete implementation.
 *
 * Implementations must handle two responsibilities:
 *   1. {@link batchConfirmFetcher} — POST the batch form to Sonata and extract
 *      the confirmation page data (CSRF token, encoded selection, title, message)
 *   2. {@link executeBatch}        — Re-submit the confirmed batch POST with
 *      `confirmation=ok` and the extracted CSRF token + encoded data
 *
 * @example
 * ```typescript
 * // Bind your implementation in the container
 * container.bind<BatchFetcherInterface>('BatchFetcher').to(BatchFetcher);
 *
 * // Consume the interface — never the concrete class
 * class BatchPageSubscriber {
 *   constructor(private readonly fetcher: BatchFetcherInterface) {}
 * }
 * ```
 */
export interface BatchFetcherInterface {
    /**
     * POST the Sonata batch form and extract the confirmation page data.
     *
     * Sonata returns an HTML confirmation page when `ask_confirmation` is `true`
     * in `configureBatchActions()`. This method submits the initial batch form
     * and parses the returned HTML to extract everything needed to:
     *   - Display a custom confirmation modal (title, message, button text)
     *   - Re-submit with confirmation (CSRF token, encoded selection data)
     *
     * Implementations must:
     *   - Perform a POST request to `batchUrl` with the provided `formData`
     *   - Parse the HTML response and extract the {@link BatchConfirmData}
     *   - Return `null` if the fetch fails (network error, non-2xx, parse error)
     *   - Throw if the CSRF token is missing in the parsed HTML
     *
     * @param batchUrl   - The Sonata batch URL (e.g. `/admin/app/user/batch`)
     * @param formData   - The FormData built from the list batch form (contains
     *                     `action`, `idx[]`, `all_elements`, `_sonata_csrf_token`)
     * @param spaRequest - The original SPA request (forwarded to fetch lifecycle events)
     * @param routeMatch - The resolved RouteMatch (forwarded to fetch lifecycle events)
     * @returns The extracted confirmation data, or `null` on failure
     */
    batchConfirmFetcher(
        batchUrl: string,
        formData: FormData,
        spaRequest: SpaRequest,
        routeMatch: RouteMatch
    ): Promise<BatchConfirmData | null>;

    /**
     * Execute the confirmed batch POST request.
     *
     * Implementations must:
     *   - Build a FormData with `_sonata_csrf_token`, `confirmation=ok`
     *     and either `data` (encoded JSON) or `action` + `idx[]` + `all_elements`
     *   - POST to `confirmData.confirmUrl` with `X-Requested-With: XMLHttpRequest`
     *     so the overridden Sonata controller returns JSON instead of a redirect
     *   - Throw on network error so the caller can dispatch {@link SpaEvents.BATCH_FAILED}
     *
     * @param confirmData - The data extracted from the Sonata confirmation page,
     *                      including the CSRF token, encoded selection and confirm URL
     * @returns The raw fetch response typed as JSON
     * @throws {Error} On network error or unrecoverable failure
     */
    executeBatch(confirmData: BatchConfirmData): Promise<FetchResponseInterface>;
}

/**
 * Limited view of the SpaKernel exposed to extensions.
 * 
 * Following the Symfony/Sonata pattern, this interface provides extensions 
 * with a restricted set of capabilities, ensuring they only interact with 
 * authorized kernel features.
 */
export interface SpaExtensionContextInterface {

    /**
     * Returns the shared BrowserEventDispatcher instance.
     * Use this to register subscribers or raw event listeners.
     * 
     * @returns The event dispatcher instance.
     */
    getDispatcher(): BrowserEventDispatcher;

    /**
     * Returns the SpaRouter instance for programmatic navigation.
     * 
     * @returns The router instance.
     */
    getRouter(): SpaRouterInterface;

    /**
     * Programmatically navigate to a specific URL.
     * This is a shorthand for calling navigate() on the router.
     * 
     * @param url - The destination URL.
     * @returns A promise that resolves when navigation is complete.
     */
    navigate(url: string): Promise<void>;

    /**
     * Returns the RouteResolver instance.
     * Use this to resolve URLs into RouteMatch objects.
     * 
     * @returns The route resolver instance.
     */
    getRouteResolver(): RouteResolverInterface;

    /**
     * Adds a custom URL pattern to the RouteResolver.
     * Custom patterns are given precedence over built-in patterns.
     * 
     * @param pattern - The RegExp to match against the URL pathname.
     * @param pageType - The CRUDPageType or custom string identifier to assign to the match.
     */
    addRoutePattern(pattern: RegExp, pageType: CRUDPageType | string): void;

    /**
     * Returns the RequestMatcher instance.
     * 
     * @returns The request matcher instance.
     */
    getRequestMatcher(): RequestMatcherInterface;

    /**
     * Adds a custom server-managed URL pattern.
     * Matches will trigger a full page reload instead of SPA-style navigation.
     * 
     * @param pattern - The RegExp to match against the URL.
     */
    addServerManagedUrl(pattern: RegExp): void;

    /**
     * Registers a custom CRUD event name for a specific page type.
     * This mapping is used by the kernel to resolve which event to dispatch for a RouteMatch.
     * 
     * @param pageType - The custom page type identifier (e.g., 'approval').
     * @param eventName - The event name constant to be dispatched (e.g., 'crud:approval').
     */
    addCrudEventName(pageType: string, eventName: string): void;

    /**
     * Registers a custom BindingManager.
     * The kernel manages the lifecycle of the manager, calling bind() and rebind() as necessary.
     * 
     * @param manager - The BindingManager instance to register.
     */
    registerBindingManager(manager: BindingManagerInterface): void;

    /**
     * Returns the HistoryManager instance.
     * Use this to manipulate the browser history state (push/replace).
     * 
     * @returns The history manager instance.
     */
    getHistoryManager(): HistoryManagerInterface;

    /**
     * Returns the main container element that wraps the entire admin content area.
     * 
     * @returns The HTMLElement representing the main container.
     */
    getMainContainer(): HTMLElement;

    /**
     * Returns the main content area element.
     * This element is typically swapped or updated on each navigation.
     * 
     * @returns The HTMLElement representing the dynamic content area.
     */
    getMainContentArea(): HTMLElement;

    /**
     * Returns the main content header element if it exists.
     * 
     * @returns The header HTMLElement or null if not present on the current page.
     */
    getMainContentHeader(): HTMLElement | null;

    /**
     * Returns the current application environment (e.g., 'prod', 'dev', 'test').
     * 
     * @returns The environment string.
     */
    getEnv(): APP_ENV;

    /**
     * Checks if the application is currently running in debug mode.
     * 
     * @returns True if debug mode is active, false otherwise.
     */
    isDebug(): boolean;
}

/**
 * Interface for read-only access — exposed to all consumers.
 */
export interface SpaParameterBagReadInterface {
    getEnv(): APP_ENV;
    isDebug(): boolean;
    getVersion(): string;
}

// ─── SpaKernelExtensionInterface ─────────────────────────────────────────────
/**
 * Contract for SpaKernel extensions.
 *
 * Inspired by Sonata's AdminExtensionInterface — allows developers to extend
 * the SPA kernel without inheriting from SpaKernel or modifying its source.
 *
 * An extension can:
 *   - Instantiate and register custom services
 *   - Register custom subscribers on the event dispatcher
 *   - Register custom binding managers
 *   - Add custom route patterns to the RouteResolver
 *   - Add custom server-managed URL patterns to RequestMatcher
 *   - Add custom CRUD event name mappings
 *
 * All methods receive a {@link SpaExtensionContextInterface} — a limited view of the
 * kernel that exposes only what extensions are allowed to touch.
 *
 * @example
 * ```typescript
 * class MyExtension implements SpaKernelExtensionInterface {
 *
 *   instantiateServices(context:SpaExtensionContextInterface): void {
 *     // instancie tes services custom ici
 *   }
 *
 *   registerSubscribers(context: SpaExtensionContextInterface): void {
 *     context.getDispatcher().addSubscriber(new MySubscriber());
 *   }
 *
 *   registerBindingManagers(context: SpaExtensionContextInterface): void {
 *     context.registerBindingManager(
 *       new MyBindingManager(context.getMainContainer(), context.getRouter())
 *     );
 *   }
 *
 *   registerRoutePatterns(context: SpaExtensionContextInterface): void {
 *     context.addRoutePattern(/\/approval(\/)?(\?.*)?$/, 'approval');
 *   }
 *
 *   registerServerManagedUrls(context: SpaExtensionContextInterface): void {
 *     context.addServerManagedUrl(/\/export(\?.*)?$/);
 *   }
 *
 *   registerCrudEventNames(context:SpaExtensionContextInterface): void {
 *     context.addCrudEventName('approval', 'crud:approval');
 *   }
 *
 *   getPriority(): number { return 0; }
 * }
 *
 * // Register with the kernel
 * spa.addKernelExtension(new MyExtension()).boot();
 * ```
 */
export interface SpaKernelExtensionInterface {

    /**
     * Instantiate and store custom services needed by this extension.
     * Called after the kernel's own services are instantiated.
     *
     * Use this method to build your services and store them on the extension
     * instance so other methods (registerSubscribers, registerBindingManagers)
     * can reference them.
     *
     * @param context - The limited kernel context
     */
    instantiateServices(context: SpaExtensionContextInterface): void;

    /**
     * Register custom event subscribers on the dispatcher.
     * Called after the kernel's built-in subscribers are registered.
     *
     * @param context - The limited kernel context
     */
    registerSubscribers(context: SpaExtensionContextInterface): void;

    /**
     * Register custom binding managers.
     * Called after the kernel's built-in binding managers are registered.
     * The kernel will call bind() immediately and rebind() after each DOM swap.
     *
     * @param context - The limited kernel context
     */
    registerBindingManagers(context: SpaExtensionContextInterface): void;

    /**
     * Register custom URL patterns on the RouteResolver.
     * Called before the first navigation — patterns added here take
     * precedence over built-in patterns.
     *
     * @param context - The limited kernel context
     */
    registerRoutePatterns(context: SpaExtensionContextInterface): void;

    /**
     * Register custom server-managed URL patterns on the RequestMatcher.
     * URLs matching these patterns will trigger a full page reload.
     *
     * @param context - The limited kernel context
     */
    registerServerManagedUrls(context: SpaExtensionContextInterface): void;

    /**
     * Register custom CRUD event name mappings.
     * Allows the extension to introduce new page types that the kernel
     * will dispatch as events (e.g. 'approval' → 'crud:approval').
     *
     * @param context - The limited kernel context
     */
    registerCrudEventNames(context: SpaExtensionContextInterface): void;

    /**
     * Returns the priority of this extension.
     * Extensions with higher priority are executed first.
     * Default priority is 0.
     *
     * @returns A positive or negative integer
     *
     * @example
     * ```typescript
     * getPriority(): number { return 10; } // executed before priority 0
     * getPriority(): number { return -1; } // executed after priority 0
     * ```
     */
    getPriority(): number;
}