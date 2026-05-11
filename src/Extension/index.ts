/*
 * This file is part of the project by AGBOKOUDJO Franck.
 *
 * (c) AGBOKOUDJO Franck <internationaleswebservices@gmail.com>
 * Phone: +229 01 67 25 18 86
 * LinkedIn: https://www.linkedin.com/in/internationales-web-apps-services-120520193/
 * Github: https://github.com/Agbokoudjo/
 * Company: INTERNATIONALES WEB APPS & SERVICES
 *
 * For more information, please feel free to contact the author.
 */

/**
 * @wlindabla/sonata_spa — SpaKernelExtensionInterface & SpaExtensionContext
 * Extension system for SpaKernel — inspired by Sonata AdminExtension pattern.
 * Allows developers to extend the SPA kernel without inheriting from it.
 * @author AGBOKOUDJO Franck <internationaleswebservices@gmail.com>
 */

import type { BrowserEventDispatcher } from '@wlindabla/event_dispatcher/browser';

import type { CRUDPageType, APP_ENV } from '../types';
import { SpaParameterBag } from '../ParameterBag';
import {
    HistoryManagerInterface,
    RequestMatcherInterface,
    RouteResolverInterface,
    SpaExtensionContextInterface,
    BindingManagerInterface,
    SpaRouterInterface,
} from '../contracts';

// ─── SpaExtensionContext ──────────────────────────────────────────────────────

/**
 * Limited view of SpaKernel exposed to extensions.
 *
 * Inspired by Sonata's pattern of passing a dedicated mapper object
 * (FormMapper, ListMapper) instead of the full Admin instance.
 * Extensions receive only what they are allowed to touch — not the kernel itself.
 *
 * Available capabilities:
 *   - Register subscribers on the event dispatcher
 *   - Register binding managers
 *   - Add custom route patterns to RouteResolver
 *   - Add custom server-managed URL patterns to RequestMatcher
 *   - Add custom CRUD event name mappings
 *   - Navigate programmatically
 *   - Read DOM references (container, content area)
 *   - Read environment parameters
 *
 * @example
 * ```typescript
 * class MyExtension implements SpaKernelExtensionInterface {
 *   registerSubscribers(context: SpaExtensionContext): void {
 *     context.getDispatcher().addSubscriber(new MySubscriber());
 *   }
 *
 *   registerBindingManagers(context: SpaExtensionContext): void {
 *     context.registerBindingManager(
 *       new MyBindingManager(context.getMainContainer(), context.getRouter())
 *     );
 *   }
 *
 *   registerRoutePatterns(context: SpaExtensionContext): void {
 *     context.addRoutePattern(/\/approval(\/)?(\?.*)?$/, 'approval');
 *   }
 * }
 * ```
 */
export class SpaExtensionContext implements SpaExtensionContextInterface{

    /**
     * @internal — constructed by SpaKernel only. Not part of the public API.
     */
    public constructor(
        private readonly _dispatcher: BrowserEventDispatcher,
        private readonly _router: SpaRouterInterface,
        private readonly _routeResolver: RouteResolverInterface,
        private readonly _requestMatcher: RequestMatcherInterface,
        private readonly _historyManager: HistoryManagerInterface,
        private readonly _mainContainer: HTMLElement,
        private readonly _mainContentArea: HTMLElement,
        private readonly _mainContentHeader: HTMLElement | null,
        private readonly _crudEventMap: Map<string, string>,
        private readonly _bindingManagerRegistry: (manager: BindingManagerInterface) => void
    ) { }

    /**
     * Returns the shared BrowserEventDispatcher instance.
     * Use this to register subscribers or raw listeners.
     *
     * @example
     * ```typescript
     * context.getDispatcher().addSubscriber(new MySubscriber());
     * context.getDispatcher().addListener(SpaEvents.DOM_READY, handler);
     * ```
     */
    public getDispatcher(): BrowserEventDispatcher {
        return this._dispatcher;
    }

    /**
     * Returns the SpaRouter instance for programmatic navigation.
     *
     * @example
     * ```typescript
     * await context.getRouter().navigate('/admin/app/user/list');
     * ```
     */
    public getRouter(): SpaRouterInterface {
        return this._router;
    }

    /**
     * Programmatically navigate to a URL.
     * Shorthand for context.getRouter().navigate(url).
     *
     * @param url - The destination URL
     */
    public async navigate(url: string): Promise<void> {
        await this._router.navigate(url);
    }

    // ── Route resolution ──────────────────────────────────────────────────────

    /**
     * Returns the RouteResolver instance.
     * Use this to resolve URLs to RouteMatch objects in your extension.
     */
    public getRouteResolver(): RouteResolverInterface {
        return this._routeResolver;
    }

    /**
     * Add a custom URL pattern to the RouteResolver.
     * The pattern is inserted at the beginning of the suffix map
     * so it takes precedence over built-in patterns.
     *
     * @param pattern  - The RegExp to match against the URL pathname
     * @param pageType - The CRUDPageType (or custom string) to assign
     *
     * @example
     * ```typescript
     * // Add support for a custom /approval page type
     * context.addRoutePattern(/\/approval(\/)?(\?.*)?$/, 'approval');
     * ```
     */
    public addRoutePattern(pattern: RegExp, pageType: CRUDPageType | string): void {
        this._routeResolver.addPattern(pattern, pageType as CRUDPageType);
    }

    // ── Request matching ──────────────────────────────────────────────────────

    /**
     * Returns the RequestMatcher instance.
     */
    public getRequestMatcher(): RequestMatcherInterface {
        return this._requestMatcher;
    }

    /**
     * Add a custom server-managed URL pattern.
     * URLs matching this pattern will trigger a full page reload
     * instead of SPA navigation.
     *
     * @param pattern - The RegExp to match against the URL
     *
     * @example
     * ```typescript
     * // Force full reload for /export URLs
     * context.addServerManagedUrl(/\/export(\?.*)?$/);
     * ```
     */
    public addServerManagedUrl(pattern: RegExp): void {
        this._requestMatcher.addServerManagedPattern(pattern);
    }

    /**
     * Register a custom CRUD event name for a given page type.
     * The kernel uses this map in dispatchCrudEvent() to resolve
     * which event name to dispatch for a given RouteMatch.
     *
     * @param pageType  - The custom page type (e.g. 'approval')
     * @param eventName - The event name constant (e.g. 'crud:approval')
     *
     * @example
     * ```typescript
     * context.addCrudEventName('approval', 'crud:approval');
     * // Then listen:
     * context.getDispatcher().addListener('crud:approval', handler);
     * ```
     */
    public addCrudEventName(pageType: string, eventName: string): void {
        this._crudEventMap.set(pageType, eventName);
    }

    /**
     * Register a custom BindingManager.
     * The kernel will call bind() immediately and rebind() after each DOM swap.
     *
     * @param manager - The BindingManager to register
     *
     * @example
     * ```typescript
     * context.registerBindingManager(
     *   new MyBindingManager(context.getMainContainer(), context.getRouter())
     * );
     * ```
     */
    public registerBindingManager(manager: BindingManagerInterface): void {
        this._bindingManagerRegistry(manager);
    }

    /**
     * Returns the HistoryManager instance.
     * Use this to push or replace history entries from your extension.
     */
    public getHistoryManager(): HistoryManagerInterface {
        return this._historyManager;
    }

    /**
     * Returns the main container element (wraps the full admin content area).
     */
    public getMainContainer(): HTMLElement {
        return this._mainContainer;
    }

    /**
     * Returns the main content area element (swapped on each navigation).
     */
    public getMainContentArea(): HTMLElement {
        return this._mainContentArea;
    }

    /**
     * Returns the main content header element, or null if absent.
     * Not present on all pages (e.g. dashboard).
     */
    public getMainContentHeader(): HTMLElement | null {
        return this._mainContentHeader;
    }

    /**
     * Returns the current application environment.
     * Reads from SpaParameterBag — set by SpaKernel during construction.
     *
     * @returns 'prod' | 'dev' | 'test'
     */
    public getEnv(): APP_ENV {
        return SpaParameterBag.getEnv();
    }

    /**
     * Returns true when the application runs in debug mode.
     */
    public isDebug(): boolean {
        return SpaParameterBag.isDebug();
    }
}
