/**
 * @wlindabla/sonata_spa — RequestMatcher
 * Determines whether a URL should be handled by the SPA or the Symfony server.
 * First check in the SpaKernel pipeline — the gatekeeper.
 * @author AGBOKOUDJO Franck <internationaleswebservices@gmail.com>
 */

import type { RequestMatcherInterface } from '../contracts';
import { SonataSpaLogger } from '../Logger';

/**
 * Default server-managed URL patterns.
 * These URLs require a full Symfony page reload because they involve:
 *   - CSRF token generation (edit, create)
 *   - Complex Sonata form handling (batch)
 *
 * The developer can override this list via SpaRouterOptions.serverManagedUrlOptions.
 */
const DEFAULT_SERVER_MANAGED_PATTERNS: RegExp[] = [
    /\/edit(\?.*)?$/,
    /\/create(\?.*)?$/
];

/**
 * Determines whether a URL or link should be handled by the SPA router
 * or delegated to the Symfony server (full page reload).
 *
 * This is the FIRST check in the SpaKernel pipeline.
 * If isServerManaged() returns true, the kernel stops and redirects
 * via window.location.href immediately.
 *
 * Pipeline position:
 *   User click → BindingManager → SpaKernel.handle()
 *     → RequestMatcher.isServerManaged() ← HERE
 *     → RouteResolver.resolve()
 *     → dispatch crud:* event
 */
export class RequestMatcher implements RequestMatcherInterface {
    private static _instance: RequestMatcher | null = null;
    private readonly serverManagedPatterns: RegExp[];

    /**
     * @param serverManagedPatterns - Custom patterns for server-managed URLs.
     *   If not provided, defaults to /edit/, /create/
     *   The developer's patterns completely replace the defaults.
     */
    private constructor(serverManagedPatterns?: RegExp[]) {
        this.serverManagedPatterns = serverManagedPatterns
            ? [...DEFAULT_SERVER_MANAGED_PATTERNS, ...serverManagedPatterns]
            : [...DEFAULT_SERVER_MANAGED_PATTERNS];
    }

    /**
     * Returns the unique RequestMatcher instance.
     * On first call, creates the instance with the provided patterns.
     * On subsequent calls, returns the existing instance — patterns argument is ignored.
     *
     * @param serverManagedPatterns - Custom server-managed URL patterns (first call only)
     * @internal — called by SpaKernel only.
     */
    public static create(serverManagedPatterns?: RegExp[]): RequestMatcher {
        if (RequestMatcher._instance) {
            SonataSpaLogger.warn(
                '[RequestMatcher] Instance already exists — returning existing.'
            );
            return RequestMatcher._instance;
        }
        RequestMatcher._instance = new RequestMatcher(serverManagedPatterns);
        return RequestMatcher._instance;
    }

    /**
     * Reset the singleton instance.
     * @internal — for testing purposes only.
     */
    public static reset(): void {
        RequestMatcher._instance = null;
    }

    /**
     * Check if the URL should be handled by the Symfony server.
     * Returns true if any of the server-managed patterns match the URL.
     *
     * @param url - The URL to check
     * @returns true if the URL requires a full page reload
     *
     * @example
     * matcher.isServerManaged('/admin/app/user/create') // true (default)
     * matcher.isServerManaged('/admin/app/user/list')   // false
     * matcher.isServerManaged('/admin/app/user/s69/edit') // true (default)
     */
    public isServerManaged(url: string): boolean {
        return this.serverManagedPatterns.some((pattern) => pattern.test(url));
    }

    /**
     * Check if a link element should be ignored by the SPA router.
     *
     * Ignores:
     *   - Links with no href attribute
     *   - Hash-only links (href="#" or href="#section")
     *   - JavaScript pseudo-links (href="javascript:...")
     *   - Links opening in a new tab (target="_blank")
     *   - External links (different hostname)
     *   - Server-managed URLs (edit, create, batch)
     *
     * @param link - The anchor element to check
     * @returns true if the SPA router should ignore this link
     */
    public shouldIgnoreLink(link: HTMLElement): boolean {
        const href = link.getAttribute('href');
        // No href
        if (!href || href.trim() === '') {
            return true;
        }  

        // Hash-only link
        if (href === '#' || href === '' || href.startsWith('#') || href.indexOf('#') !== -1) {
            return true;
        }
      
        // Ignore les liens gérés par Stimulus
        if (link.hasAttribute('data-action')) return true;

        // JavaScript pseudo-link
        if (href.startsWith('javascript')) {
            return true;
        }

        // Opens in new tab
        if (link.getAttribute('target') === '_blank') {
            return true;
        }

        // External link — different hostname
        if (this.isExternalLink(href)) {
            return true;
        }

        // Server-managed URL
        if (this.isServerManaged(href)) {
            return true;
        }

        return false;
    }

    /**
     * Check if an href points to an external domain.
     * Returns false for relative paths (they are always internal).
     */
    private isExternalLink(href: string): boolean {
        // Relative paths are always internal
        if (href.startsWith('/') || href.startsWith('./') || href.startsWith('../')) {
            return false;
        }

        try {
            const url = new URL(href);
            return url.hostname !== window.location.hostname;
        } catch {
            // Cannot parse as URL — treat as internal relative path
            return false;
        }
    }

    /**
     * Get the currently active server-managed patterns.
     * Useful for debugging.
     */
    public getServerManagedPatterns(): RegExp[] {
        return [...this.serverManagedPatterns];
    }

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
    public addServerManagedPattern(pattern: RegExp): void {
        this.serverManagedPatterns.push(pattern);
    }
}
