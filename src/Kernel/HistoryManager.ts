/**
 * @wlindabla/sonata_spa — HistoryManager
 * Manages browser history via the History API (pushState / popstate).
 * Called by Page Subscribers after each successful navigation.
 * @author AGBOKOUDJO Franck <internationaleswebservices@gmail.com>
 */

import type { HistoryManagerInterface } from '../contracts';
import type { RouteMatch } from '../types';
import { SonataSpaLogger } from '../Logger';

/**
 * Shape of the state object stored in window.history.
 * Retrieved on popstate to avoid re-resolving the URL.
 */
interface HistoryState {
    /** Marker to identify states pushed by @wlindabla/sonata_spa */
    readonly _spa: true;
    /** The URL that was pushed */
    readonly url: string;
    /** The resolved RouteMatch stored to avoid re-resolving on popstate */
    readonly routeMatch: RouteMatch;
    /** Timestamp of when this state was pushed */
    readonly pushedAt: number;
}

/**
 * Manages browser history for the SPA router.
 *
 * Responsibilities:
 *   1. push(url, routeMatch) — pushes a new history entry after navigation
 *   2. listen() — subscribes to popstate (back/forward buttons)
 *      and calls the kernel navigate callback with the stored RouteMatch
 *
 * The RouteMatch is stored in the history state to avoid re-running
 * RouteResolver on popstate — we already know the page type.
 *
 * Pipeline position (called by Page Subscribers after DOM swap):
 *   DomSwapper.swap() → HistoryManager.push() ← HERE
 *                     → DomManager.reinitialize()
 *                     → dispatch spa:navigate:completed
 */
export class HistoryManager implements HistoryManagerInterface {
    private static _instance: HistoryManager | null = null;

    /** Callback invoked on popstate — provided by SpaKernel */
    private onPopState: ((url: string, routeMatch: RouteMatch) => Promise<void>) | null = null;

    /** Whether listen() has already been called */
    private isListening: boolean = false;

    /**
     * @param navigateCallback - The SpaKernel.handle() callback to invoke on popstate.
     *   Injected by the kernel during boot() to avoid circular dependencies.
     */
    private constructor(
        navigateCallback?: (url: string, routeMatch: RouteMatch) => Promise<void>
    ) {
        if (navigateCallback) {
            this.onPopState = navigateCallback;
        }
    }

    /**
     * Returns the unique HistoryManager instance.
     * On first call, creates the instance with the provided callback.
     * On subsequent calls, returns the existing instance — callback argument is ignored.
     *
     * @param navigateCallback - The SpaKernel navigate callback (first call only)
     * @internal — called by SpaKernel only.
     */
    public static create(
        navigateCallback?: (url: string, routeMatch: RouteMatch) => Promise<void>
    ): HistoryManager {
        if (HistoryManager._instance) {
            SonataSpaLogger.warn(
                '[HistoryManager] Instance already exists — returning existing.'
            );
            return HistoryManager._instance;
        }
        HistoryManager._instance = new HistoryManager(navigateCallback);
        return HistoryManager._instance;
    }

    /**
     * Reset the singleton instance.
     * @internal — for testing purposes only.
     */
    public static reset(): void {
        HistoryManager._instance = null;
    }

    /**
     * Set the navigate callback after construction.
     * Called by SpaKernel.boot() to inject the handle() method.
     *
     * @param callback - The callback to invoke on popstate
     */
    public setNavigateCallback(
        callback: (url: string, routeMatch: RouteMatch) => Promise<void>
    ): void {
        this.onPopState = callback;
    }

    /**
     * Push a new entry to the browser history.
     * Stores the RouteMatch in the history state for popstate retrieval.
     *
     * Called by Page Subscribers after a successful DOM swap.
     *
     * @param url - The URL to push into history
     * @param routeMatch - The resolved RouteMatch to store in history state
     *
     * @example
     * // After a successful list navigation:
     * historyManager.push('/admin/app/user/list', routeMatch);
     * // window.history now has state: { _spa: true, url, routeMatch, pushedAt }
     */
    public push(url: string, routeMatch: RouteMatch): void {
        const state: HistoryState = {
            _spa: true,
            url,
            routeMatch,
            pushedAt: Date.now(),
        };

        // Avoid pushing duplicate entries for the same URL
        if (window.location.href === url) {
            window.history.replaceState(state, '', url);
            return;
        }

        window.history.pushState(state, '', url);
    }

    /**
     * Replace the current history entry without pushing a new one.
     * Used for the initial page load to mark the current state as SPA-managed.
     *
     * @param url - The URL to set (defaults to current URL)
     * @param routeMatch - The RouteMatch for the current page
     */
    public replace(url: string, routeMatch: RouteMatch): void {
        const state: HistoryState = {
            _spa: true,
            url,
            routeMatch,
            pushedAt: Date.now(),
        };

        window.history.replaceState(state, '', url);
    }

    /**
     * Start listening to popstate events (back/forward browser buttons).
     * Must be called once during SpaKernel.boot().
     *
     * On popstate:
     *   1. Checks if the state was pushed by @wlindabla/sonata_spa
     *   2. If yes — uses the stored RouteMatch directly (no re-resolution)
     *   3. If no  — falls back to the current pathname
     *
     * @throws Error if listen() is called before setNavigateCallback()
     */
    public listen(): void {
        if (this.isListening) {
            console.warn('[SpaRouter] HistoryManager.listen() called more than once — ignored.');
            return;
        }

        if (!this.onPopState) {
            throw new Error(
                '[SpaRouter] HistoryManager: navigate callback is not set. ' +
                'Call setNavigateCallback() before listen().'
            );
        }

        this.isListening = true;

        window.addEventListener('popstate', async (event: PopStateEvent) => {
            await this.handlePopState(event);
        });
    }

    /**
     * Handle a popstate event from the browser.
     * Extracts the URL and RouteMatch from the history state and
     * calls the navigate callback.
     */
    private async handlePopState(event: PopStateEvent): Promise<void> {
        if (!this.onPopState) return;

        const state = event.state as HistoryState | null;

        // State pushed by @wlindabla/sonata_spa — use stored data
        if (state?._spa === true && state.url) {
            await this.onPopState(state.url, state.routeMatch);
            return;
        }

        // Unknown state (e.g. initial page load state) — use current URL
        const currentUrl = window.location.href;
        await this.onPopState(currentUrl, this.buildFallbackRouteMatch(currentUrl));
    }

    /**
     * Build a minimal fallback RouteMatch when the state is not SPA-managed.
     * The SpaKernel will re-resolve it properly via RouteResolver.
     */
    private buildFallbackRouteMatch(url: string): RouteMatch {
        return {
            pageType: 'unknown',
            resource: 'unknown',
            token: undefined,
            url,
        };
    }

    /**
     * Check if the current history state was pushed by @wlindabla/sonata_spa.
     */
    public isCurrentStateSpaManaged(): boolean {
        const state = window.history.state as HistoryState | null;
        return state?._spa === true;
    }

    /**
     * Get the RouteMatch stored in the current history state.
     * Returns null if the current state was not pushed by the SPA.
     */
    public getCurrentRouteMatch(): RouteMatch | null {
        const state = window.history.state as HistoryState | null;
        if (state?._spa === true) {
            return state.routeMatch;
        }
        return null;
    }

    /**
     * Whether the HistoryManager is currently listening to popstate events.
     */
    public get listening(): boolean {
        return this.isListening;
    }
}
