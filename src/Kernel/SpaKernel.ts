/**
 * @wlindabla/sonata_spa — SpaKernel
 * Central orchestrator of the SPA system.
 * Frontend equivalent of Symfony's HttpKernel.
 * @author AGBOKOUDJO Franck <internationaleswebservices@gmail.com>
 */

import { BrowserEventDispatcher } from '@wlindabla/event_dispatcher/browser';
import type { EventSubscriberInterface } from '@wlindabla/event_dispatcher';

import type {
    SpaKernelExtensionInterface,
    SpaRouterInterface, 
    BindingManagerInterface } from '../contracts';
import type {
    SpaRequest,
    SpaRouterOptions,
    RouteMatch, APP_ENV
} from '../types';

import { RouteResolver } from '../Router/RouteResolver';
import { RequestMatcher } from '../Router/RequestMatcher';
import { HistoryManager } from './HistoryManager';

import {
    SpaEvents,
    SpaRequestEvent,
    SpaRouteResolvedEvent,
    SpaCrudEvent,
    SpaServerRedirectEvent,
    SpaNavigateCompletedEvent,
    SpaDomReadyEvent,
} from '../Events';
import { SonataSpaLogger } from '../Logger';

import {
    ListPageSubscriber,
    DefaultDeletionOperationSubscriber,
    ShowPageSubscriber,
    DeletePageSubscriber,
    DashboardSubscriber,
    FormSubscriber,
    DefaultBatchSubscriber,
    BatchPageSubscriber,
    SonataHttpRequestSubscriber
} from '../Subscribers';

import {
    PaginationBindingManager,
    SidebarBindingManager,
    ActionBindingManager,
    FilterBindingManager,
    FormBindingManager,
    BatchBindingManager
} from '../Binding';

import { DomSwapManager } from '../DomSwapper/DomSwapManager';
import { DomManager } from '../DomReinit';

import {
    PageFetcher,
    DeleteFetcher,
    FetchDelegateAdapter,
    BatchFetcher
} from '../Fetcher';

import { SpaParameterBag, KERNEL_WRITE_TOKEN } from '../ParameterBag';
import {
    SpaExtensionContext
} from '../Extension';

/**
 * The SpaKernel is the heart of @wlindabla/sonata_spa.
 * Frontend equivalent of Symfony's HttpKernel.
 *
 * It manages the full navigation pipeline:
 *
 *   User click
 *     → BindingManager builds SpaRequest
 *     → SpaKernel.handle(SpaRequest)
 *         1. dispatch SpaRequestEvent        (STOPPABLE — cancel navigation)
 *         2. RequestMatcher.isServerManaged? (YES → window.location.href)
 *         3. RouteResolver.resolve(url)      → RouteMatch
 *         4. dispatch SpaRouteResolvedEvent  (STOPPABLE — dev takes control)
 *         5. dispatch crud:list|show|delete|dashboard
 *            → Page Subscriber handles the rest:
 *              fetch → swap → history → dom:ready → navigate:completed
 *
 * The kernel itself does NOT fetch, does NOT swap the DOM.
 * It only orchestrates and dispatches events.
 * Page Subscribers do the actual work.
 *
 * @example
 * ```typescript
 * import { SpaKernel } from '@wlindabla/sonata_spa/kernel';
 *
 * const spa =SpaKernel.create({
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
 * },
 * env:APP_ENV
 * new BrowserEventDispatcher(window,{ bubbles: true }));
 *
 * // Optionally add custom subscribers
 * spa.addSubscriber(new MyCustomSubscriber());
 *.addKernelExtension(new MyExtension(), new AnotherExtension())
 * // Boot — registers all built-in subscribers and binding managers
 * spa.boot();
 * ```
 * @author AGBOKOUDJO Franck <internationaleswebservices@gmail.com>
 */
export class SpaKernel implements SpaRouterInterface {
    private static _instance: SpaKernel | null = null;
    // ── Core services ─────────────────────────────────────────────────────────
    private readonly dispatcher: BrowserEventDispatcher;
    private readonly routeResolver: RouteResolver;
    private readonly requestMatcher: RequestMatcher;
    private readonly historyManager: HistoryManager;

    // ── DOM references — resolved during boot() ───────────────────────────────
    private sidebar!: HTMLElement;
    private mainContainer!: HTMLElement;
    private mainContentArea!: HTMLElement;
    private mainContentHeader: HTMLElement | null = null;

    // ── Services — instantiated during boot() ─────────────────────────────────
    private domSwapManager!: DomSwapManager;
    private domManager!: DomManager;
    private pageFetcher!: PageFetcher;
    private deleteFetcher!: DeleteFetcher;
    private delegateFetcher!: FetchDelegateAdapter;
    private batchFetcher!: BatchFetcher;
    // ── State ─────────────────────────────────────────────────────────────────
    /** Whether boot() has already been called */
    private booted: boolean = false;
    /** Whether a navigation is currently in progress */
    private isNavigating: boolean = false;
    /** Custom subscribers registered by the developer before boot() */
    private readonly pendingSubscribers: EventSubscriberInterface[] = [];
    /** Binding managers registered during boot() */
    private readonly bindingManagers: BindingManagerInterface[] = [];
    /** The current URL being navigated to */
    private currentUrl: string = window.location.href;

     /** Extensions registered via addKernelExtension() — sorted by priority desc */
    private readonly kernelExtensions: SpaKernelExtensionInterface[] = [];

    /** Mutable CRUD event map — extensible by extensions */
    private readonly crudEventMap: Map<string, string> = new Map([
        ['list',      SpaEvents.CRUD_LIST],
        ['show',      SpaEvents.CRUD_SHOW],
        ['create',    SpaEvents.CRUD_CREATE],
        ['edit',      SpaEvents.CRUD_EDIT],
        ['delete',    SpaEvents.CRUD_DELETE],
        ['dashboard', SpaEvents.DASHBOARD],
        ['batch',     SpaEvents.CRUD_BATCH],
    ]);

    /**
     * Private constructor — SpaKernel is sealed and cannot be extended.
     *
     * Use {@link SpaKernel.create} to instantiate.
     * To extend kernel behavior, implement {@link SpaKernelExtensionInterface}
     * and register via {@link SpaKernel.create} options or {@link addKernelExtension}.
     *
     * @example
     * ```typescript
     * //correct
     * const spa = SpaKernel.create({ router: { ... } }, 'dev', dispatcher);
     *
     * // TypeScript error — constructor is private
     * class MySpa extends SpaKernel { }
     * ```
     */
    private constructor(
        private readonly _options: SpaRouterOptions,
        private readonly env: APP_ENV = "prod",
        _dispatcher?: BrowserEventDispatcher) {
        // Initialize the event dispatcher bound to window
        // so all events bubble up to native window.addEventListener listeners
        this.dispatcher = _dispatcher ?? new BrowserEventDispatcher(window, { bubbles: true });
        let debug = false;
        if (this.env !== "prod") {
            debug = true;
        }

        SonataSpaLogger.config(this.env, debug);
        // Initialize ParameterBag immediately at construction
        // so all services created after have access to env/debug
        SpaParameterBag.initialize(KERNEL_WRITE_TOKEN, {
            env: this.env,
            debug: debug 
        });

        // Initialize core services
        this.routeResolver = RouteResolver.create();
        this.requestMatcher = RequestMatcher.create(_options.serverManagedUrlOptions);
        this.historyManager = HistoryManager.create();

        // Inject the navigate callback into HistoryManager
        // to handle popstate (back/forward buttons)
        this.historyManager.setNavigateCallback(
            async (url: string, _routeMatch: RouteMatch) => {
                await this.navigate(url);
            }
        );
    }

    /**
     * Factory method — the only way to instantiate SpaKernel.
     *
     * SpaKernel is sealed — it cannot be extended via inheritance.
     * Use {@link SpaKernelExtensionInterface} to add custom behavior.
     *
     * @param options     - The SPA router configuration options
     * @param env         - The application environment (default: 'prod')
     * @param dispatcher  - Optional shared BrowserEventDispatcher instance.
     *                      Pass the instance from @wlindabla/form_validator
     *                      (window.eventDispatcherBrowser) to share the same
     *                      event bus across all libraries.
     * @returns A fully constructed SpaKernel instance ready for boot()
     *
     * @example
     * ```typescript
     * import { BrowserEventDispatcher } from '@wlindabla/form_validator';
     *
     * const spa = SpaKernel.create(
     *   {
     *     router: {
     *       sidebarSelector:           '.app-sidebar',
     *       mainContentAreaSelector:   '#app-content',
     *       mainContentHeaderSelector: '#app-content-header',
     *     },
     *   },
     *   'dev',
     *   BrowserEventDispatcher(window, { bubbles: true })
     * );
     *
     * spa
     *   .addKernelExtension(new MyExtension(),new AnotherExtension())
     *   .addSubscriber(new MySubscriber())
     *   .boot();
     * ```
     */
    public static create(
        options: SpaRouterOptions,
        env: APP_ENV = 'prod',
        dispatcher?: BrowserEventDispatcher
    ): SpaKernel {
        if (SpaKernel._instance) {
            SonataSpaLogger.warn('[SpaKernel] Instance already exists — returning existing.');
            return SpaKernel._instance;
        }

        SpaKernel._instance = new SpaKernel(options, env, dispatcher);
        return SpaKernel._instance;
    }

    /**
     * Boot the SPA kernel.
     * Must be called once after instantiation and after addSubscriber() calls.
     *
     * Execution order:
     *   1. Register all pending custom subscribers
     *   2. Register all built-in Page Subscribers
     *   3. Register all built-in Binding Managers
     *   4. Start listening to popstate (HistoryManager)
     *   5. Mark current URL in history state
     *   6. Mark as booted
     *
     * @throws Error if boot() is called more than once
     */
    public boot(): void {
        if (this.booted) {
            SonataSpaLogger.warn('[SpaKernel] boot() called more than once — ignored.');
            return;
        }

        // Sort extensions by priority descending (highest first)
        this.kernelExtensions.sort((a, b) => b.getPriority() - a.getPriority());

        // Resolve DOM references
        this.resolveDomReferences();

        // Instantiate shared services
        this.instantiateServices();

        // Build the extension context (shared across all extension calls)
        const context = this.buildExtensionContext();

        // Extensions — instantiateServices
        for (const ext of this.kernelExtensions) {
            ext.instantiateServices(context);
        }

        // Register custom subscribers added before boot()
        for (const subscriber of this.pendingSubscribers) {
            this.dispatcher.addSubscriber(subscriber);
        }

        //  Register built-in Page Subscribers
        this.registerBuiltInSubscribers();

        // Extensions — registerSubscribers
        for (const ext of this.kernelExtensions) {
            ext.registerSubscribers(context);
        }

        // Extensions — registerRoutePatterns
        for (const ext of this.kernelExtensions) {
            ext.registerRoutePatterns(context);
        }

        // Extensions — registerServerManagedUrls
        for (const ext of this.kernelExtensions) {
            ext.registerServerManagedUrls(context);
        }

        // Extensions — registerCrudEventNames
        for (const ext of this.kernelExtensions) {
            ext.registerCrudEventNames(context);
        }
        // Register built-in Binding Managers and bind them
        this.registerBindingManagers();

        // Extensions — registerBindingManagers
        for (const ext of this.kernelExtensions) {
            ext.registerBindingManagers(context);
        }

        //Start listening to browser back/forward buttons
        this.historyManager.listen();

        // 5. Mark the current page in history state
        //    so popstate on the first page works correctly
        const initialRouteMatch = this.routeResolver.resolve(window.location.href);
        this.historyManager.replace(window.location.href, initialRouteMatch);

        // Listen to spa:dom:ready to rebind managers after each swap
        this.dispatcher.addListener(
            SpaEvents.DOM_READY,
            (event: SpaDomReadyEvent) => {
                this.rebindManagers(event.container);
                if (this.env !== 'prod') {
                    SonataSpaLogger.log('event SpaDomReadyEvent', event);
                }
            }
        );

        // Listen to spa:navigate:completed to trigger DomManager.reinitialize()
        this.dispatcher.addListener(
            SpaEvents.NAVIGATE_COMPLETED,
            (event: SpaNavigateCompletedEvent) => {
                this.mainContainer = event.newMainContainer;
                this.mainContentArea = event.newMainContentArea;
                this.mainContentHeader = event.newMainContentHeader;

                const routeMatch = event.routeMatch ?? this.routeResolver.resolve(window.location.href);
                if (this.mainContentHeader) {
                    this.domManager.reinitialize(this.mainContentHeader, routeMatch);
                }
                this.domManager.reinitialize(this.mainContentArea, routeMatch);
                 if (this.env !== 'prod') {
                     SonataSpaLogger.log('event SpaNavigateCompletedEvent', event);
                     SonataSpaLogger.log('SpaNavigateCompletedEvent mainContentHeader',this.mainContentHeader?.innerHTML);
                     SonataSpaLogger.log('SpaNavigateCompletedEvent mainContentArea', this.mainContentArea?.innerHTML);
                }
            }
        );

        this.booted = true;

        if (SpaParameterBag.isDebug()) {
            SonataSpaLogger.info('[SpaKernel] Booted successfully.', {
                env: SpaParameterBag.getEnv(),
                extensions: this.kernelExtensions.length,
                subscribers: this.pendingSubscribers.length,
                bindingManagers: this.bindingManagers.length,
            });
        }
    }

    /**
     * Handle a SPA navigation request.
     * Frontend equivalent of Symfony's HttpKernel.handle().
     *
     * Pipeline:
     *   1. Guard — prevent concurrent navigation
     *   2. dispatch SpaRequestEvent (STOPPABLE)
     *   3. RequestMatcher — server-managed check
     *   4. RouteResolver — resolve URL to RouteMatch
     *   5. dispatch SpaRouteResolvedEvent (STOPPABLE)
     *   6. dispatch crud:* event → Page Subscriber takes over
     *
     * @param request - The SPA navigation request to handle
     */
    public async handle(request: SpaRequest): Promise<void> {
        // Guard: prevent concurrent navigation
        if (this.isNavigating) {
            if (this.env === "dev") {
                console.warn('[SpaKernel] Navigation already in progress — ignored.', request.url);
            }
            return;
        }

        this.isNavigating = true;

        try {
            // ── Step 1: dispatch SpaRequestEvent (STOPPABLE) ──────────────────
            const requestEvent = new SpaRequestEvent(request);
            this.dispatcher.dispatch(requestEvent, SpaEvents.REQUEST);

            if (requestEvent.isPropagationStopped()) {
                // Developer cancelled the navigation (e.g. unsaved changes guard)
                if (this.env === "dev") {
                    console.info('[SpaKernel] Navigation cancelled by SpaRequestEvent listener.', request.url);
                }
                return;
            }

            // ── Step 2: RequestMatcher — server-managed check ──────────────────
            if (this.requestMatcher.isServerManaged(request.url)) {
                this.redirectToServer(request.url, 'server-managed');
                return;
            }

            // ── Step 3: RouteResolver — resolve URL to RouteMatch ──────────────
            const routeMatch = this.routeResolver.resolve(request.url);
            // ── Step 4: dispatch SpaRouteResolvedEvent (STOPPABLE) ────────────
            const routeResolvedEvent = new SpaRouteResolvedEvent(request, routeMatch);
            this.dispatcher.dispatch(routeResolvedEvent, SpaEvents.ROUTE_RESOLVED);

            if (routeResolvedEvent.isPropagationStopped()) {
                // Developer takes full control of this navigation
                if (this.env === 'dev') {
                    SonataSpaLogger.info('[SpaKernel] Navigation taken over by SpaRouteResolvedEvent listener.', routeMatch);
                }
                return;
            }

            // ── Step 5: dispatch crud:* event → Page Subscriber handles the rest
            this.currentUrl = request.url;
            await this.dispatchCrudEvent(request, routeMatch);

        } catch (error) {
            // On unexpected error — fall back to full server navigation
            SonataSpaLogger.error('[SpaKernel] Unexpected error during navigation:', error);
            this.redirectToServer(request.url, 'error-fallback');
        } finally {
            this.isNavigating = false;
        }
    }

    /**
     * Programmatically navigate to a URL.
     * Creates a SpaRequest with trigger 'programmatic' and calls handle().
     *
     * @param url - The destination URL
     */
    public async navigate(url: string): Promise<void> {
        await this.handle({ url, trigger: 'programmatic' });
    }

    /**
     * Register a custom subscriber on the event dispatcher.
     * If called before boot(), the subscriber is queued and registered during boot().
     * If called after boot(), the subscriber is registered immediately.
     *
     * @param subscriber - The subscriber to register
     * @returns this — for method chaining
     *
     * @example
     * ```typescript
     * spa
     *   .addSubscriber(new MyAnalyticsSubscriber())
     *   .addSubscriber(new MyConfirmDeleteSubscriber())
     *   .boot();
     * ```
     */
    public addSubscriber(subscriber: EventSubscriberInterface): this {
        if (this.booted) {
            // Already booted — register immediately
            this.dispatcher.addSubscriber(subscriber);
        } else {
            // Queue for registration during boot()
            this.pendingSubscribers.push(subscriber);
        }
        return this;
    }

    /**
     * Get the event dispatcher instance.
     * Allows the developer to add raw listeners outside subscribers.
     *
     * @example
     * ```typescript
     * spa.getDispatcher().addListener(SpaEvents.DOM_READY, (event) => {
     *   myLibrary.init(event.container);
     * });
     * ```
     */
    public getDispatcher(): BrowserEventDispatcher {
        return this.dispatcher;
    }

    /**
     * Get the current SpaRouterOptions.
     */
    public get options(): SpaRouterOptions {
        return this._options;
    }

    /**
     * Get the current URL being navigated.
     */
    public get currentNavigationUrl(): string {
        return this.currentUrl;
    }

    /**
     * Get the HistoryManager instance.
     * Used by Page Subscribers to push history entries.
     */
    public getHistoryManager(): HistoryManager {
        return this.historyManager;
    }

    /**
     * Get the RouteResolver instance.
     * Used by Page Subscribers and FormSubscriber.
     */
    public getRouteResolver(): RouteResolver {
        return this.routeResolver;
    }

    /**
     * Dispatch the appropriate crud:* event based on the resolved RouteMatch.
     * Page Subscribers listen to these events and handle the full pipeline.
     *
     * @param request - The original SPA request
     * @param routeMatch - The resolved RouteMatch
     */
    private async dispatchCrudEvent(
        request: SpaRequest,
        routeMatch: RouteMatch
    ): Promise<void> {
        const crudEvent = new SpaCrudEvent(request, routeMatch, routeMatch.pageType);

        const eventName = this.getCrudEventName(routeMatch);

        if (this.env === "dev") {
            SonataSpaLogger.info(`[SpaKernel] Dispatching ${eventName}`, routeMatch);
        }

        // Use dispatchAsync — Page Subscribers perform async work (fetch, DOM swap)
        // and we need to await their completion
        await this.dispatcher.dispatchAsync(crudEvent, eventName);
    }

    /**
      * Map a RouteMatch pageType to the corresponding event name.
      * Now reads from the mutable crudEventMap so extensions can add entries.
      */
    private getCrudEventName(routeMatch: RouteMatch): string {
        return this.crudEventMap.get(routeMatch.pageType) ?? SpaEvents.CRUD_LIST;
    }

    /**
     * Redirect to the Symfony server via full page reload.
     * Used for server-managed URLs and error fallbacks.
     *
     * @param url - The URL to redirect to
     * @param reason - The reason for the server redirect
     */
    private redirectToServer(
        url: string,
        reason: 'server-managed' | 'error-fallback'
    ): void {
        const redirectEvent = new SpaServerRedirectEvent(url, reason);
        this.dispatcher.dispatch(redirectEvent, SpaEvents.SERVER_REDIRECT);
        if (redirectEvent.isPropagationStopped()) {
            return;
        }

        if (this.env === "prod") {
            window.location.href = url;
        }
    }

    /**
     * Rebind all registered Binding Managers after a DOM swap.
     * Called on each spa:dom:ready event.
     *
     * @param container - The swapped container element
     */
    private rebindManagers(container: HTMLElement): void {
        for (const manager of this.bindingManagers) {
            manager.rebind(container);
        }
    }

    /**
     * Register a binding manager and immediately call bind().
     *
     * @param manager - The binding manager to register
     */
    protected registerBindingManager(manager: BindingManagerInterface): void {
        this.bindingManagers.push(manager);
        manager.bind();
    }

    // ─── DOM resolution ───────────────────────────────────────────────────────
    /**
     * Resolve all required DOM element references from selectors.
     * Called at the start of boot().
     * Throws if required elements are not found.
     */
    private resolveDomReferences(): void {
        const { router } = this._options;

        // Sidebar
        const sidebar = document.querySelector<HTMLElement>(
            router.sidebarSelector ?? '.app-sidebar'
        ) ?? document.querySelector<HTMLElement>('aside');

        if (!sidebar) {
            throw new Error(
                '[SpaKernel] Sidebar element not found. ' +
                'Check sidebarSelector in SpaRouterOptions.'
            );
        }
        this.sidebar = sidebar;

        // Main container
        const mainContainer = document.querySelector<HTMLElement>(
            router.mainSelector ?? '#app-main'
        ) ?? document.querySelector<HTMLElement>('.app-main')
            ?? document.querySelector<HTMLElement>('main')
            ?? document.querySelector<HTMLElement>('.content-wrapper');

        if (!mainContainer) {
            throw new Error(
                '[SpaKernel] Main container element not found. ' +
                'Check mainSelector in SpaRouterOptions.'
            );
        }
        this.mainContainer = mainContainer;

        // Content area
        const mainContentArea = document.querySelector<HTMLElement>(
            router.mainContentAreaSelector ?? '#app-content'
        ) ?? document.querySelector<HTMLElement>('.app-content')
            ?? document.querySelector<HTMLElement>('.content');

        if (!mainContentArea) {
            throw new Error(
                '[SpaKernel] Content area element not found. ' +
                'Check mainContentAreaSelector in SpaRouterOptions.'
            );
        }
        this.mainContentArea = mainContentArea;

        // Content header (nullable — not present on dashboard)
        this.mainContentHeader = document.querySelector<HTMLElement>(
            router.mainContentHeaderSelector ?? '#app-content-header'
        ) ?? document.querySelector<HTMLElement>('.app-content-header')
            ?? document.querySelector<HTMLElement>('.content-header');
    }

    /**
     * Instantiate all shared services that depend on DOM references.
     * Called after resolveDomReferences().
     */
    private instantiateServices(): void {
        this.domSwapManager = new DomSwapManager(
            this.dispatcher,
            this._options.genericSelectors
        );

        this.domManager = new DomManager(this.dispatcher);
        this.delegateFetcher = new FetchDelegateAdapter(this.dispatcher);

        this.pageFetcher = new PageFetcher(
            this.dispatcher,
            this.delegateFetcher,
            this.mainContentArea,
            this.mainContentHeader
        );

        this.deleteFetcher = new DeleteFetcher(this.dispatcher, this.delegateFetcher);
        this.batchFetcher = new BatchFetcher(this.dispatcher, this.delegateFetcher);
    }

    /**
     * Register all built-in Page Subscribers.
     *
     *   ListPageSubscriber    → crud:list
     *   ShowPageSubscriber    → crud:show
     *   DeletePageSubscriber  → crud:delete
     *   DashboardSubscriber   → spa:dashboard
     *   FormSubscriber        → spa:form:submit
     */
    private registerBuiltInSubscribers(): void {
        // Navigate callback — passed to subscribers that need to trigger navigation
        const navigate = (url: string) => this.navigate(url);

        this.dispatcher.addSubscriber(
            new SonataHttpRequestSubscriber() as unknown as EventSubscriberInterface
        );

        // ListPageSubscriber
        this.dispatcher.addSubscriber(new ListPageSubscriber(
            this.dispatcher,
            this.pageFetcher,
            this.domSwapManager,
            this.historyManager,
            this.mainContainer,
            this.mainContentArea,
            this.mainContentHeader,
            this._options
        ));

        // ShowPageSubscriber
        this.dispatcher.addSubscriber(new ShowPageSubscriber(
            this.dispatcher,
            this.pageFetcher,
            this.domSwapManager,
            this.historyManager,
            this.mainContainer,
            this.mainContentArea,
            this.mainContentHeader,
            this._options
        ));

        // DeletePageSubscriber
        this.dispatcher.addSubscriber(new DeletePageSubscriber(
            this.dispatcher,
            this.deleteFetcher,
            navigate
        ));

        // Default delete confirmation — uses SweetAlert2
        // Developer can override by listening to DELETE_CONFIRM_REQUESTED with priority > 0
        this.dispatcher.addSubscriber(new DefaultDeletionOperationSubscriber());

        // DashboardSubscriber
        this.dispatcher.addSubscriber(new DashboardSubscriber(
            this.dispatcher,
            this.pageFetcher,
            this.domSwapManager,
            this.historyManager,
            this.mainContainer,
            this.mainContentArea,
            this.mainContentHeader,
            this._options
        ));

        // FormSubscriber
        this.dispatcher.addSubscriber(new FormSubscriber(
            this.dispatcher,
            this.domSwapManager,
            this.routeResolver,
            navigate,
            this.mainContainer,
            this.mainContentArea,
            this.mainContentHeader
        ));

        this.dispatcher.addSubscriber(new BatchPageSubscriber(
            this.dispatcher,
            this.batchFetcher,
            navigate));

        this.dispatcher.addSubscriber(new DefaultBatchSubscriber());
    }

    /**
     * Register and bind all built-in Binding Managers.
     *
     *   SidebarBindingManager    → sidebar link clicks
     *   ActionBindingManager     → show/delete action links
     *   PaginationBindingManager → pagination links
     *   FilterBindingManager     → filter form submit/reset + sort links
     *   FormBindingManager       → Sonata form submit + form_validator
     */
    private registerBindingManagers(): void {
        this.registerBindingManager(SidebarBindingManager.create(
            this.sidebar,
            this,
            this.requestMatcher
        ));

        this.registerBindingManager(ActionBindingManager.create(
            this.mainContainer,
            this,
            this.requestMatcher
        ));

        this.registerBindingManager(PaginationBindingManager.create(this));

        this.registerBindingManager(FilterBindingManager.create(this));

        this.registerBindingManager(FormBindingManager.create(
            this.dispatcher,
            this.mainContentArea,
            this.routeResolver
        ));

        this.registerBindingManager(BatchBindingManager.create(
            this.mainContainer,
            this
        ));
    }

    /**
     * Register one or more kernel extensions.
     * Extensions are sorted by priority (highest first) before boot().
     * Must be called before boot().
     *
     * Inspired by Sonata's AdminExtension system — the developer creates
     * a class that implements {@link SpaKernelExtensionInterface} without
     * inheriting from SpaKernel.
     *
     * @param extensions - One or more extension instances to register
     * @returns this — for method chaining
     *
     * @example
     * ```typescript
     * spa
     *   .addKernelExtension(new MyExtension(), new AnotherExtension())
     *   .addSubscriber(new MySubscriber())
     *   .boot();
     * ```
     */
    public addKernelExtension(...extensions: SpaKernelExtensionInterface[]): this {
        if (this.booted) {
            SonataSpaLogger.warn(
                '[SpaKernel] addKernelExtension() called after boot() — ignored. ' +
                'Register extensions before calling boot().'
            );
            return this;
        }
        this.kernelExtensions.push(...extensions);
        return this;
    }

    /**
     * Build the SpaExtensionContext passed to all extensions during boot().
     * Creates a single shared context instance — all extensions share the same
     * references (dispatcher, routeResolver, etc.).
     */
    private buildExtensionContext(): SpaExtensionContext {
        return new SpaExtensionContext(
            this.dispatcher,
            this,
            this.routeResolver,
            this.requestMatcher,
            this.historyManager,
            this.mainContainer,
            this.mainContentArea,
            this.mainContentHeader,
            this.crudEventMap,
            (manager) => this.registerBindingManager(manager)
        );
    }

    /**
     * Reset all singleton instances.
     * @internal — for testing purposes only.
     */
    public static reset(): void {
        SpaKernel._instance = null;
        RouteResolver.reset();
        RequestMatcher.reset();
        HistoryManager.reset();
        FilterBindingManager.reset();
        ActionBindingManager.reset();
        BatchBindingManager.reset();
        FormBindingManager.reset();
        PaginationBindingManager.reset();
        SidebarBindingManager.reset();
    }
}
