/**
 * @wlindabla/sonata_spa — RouteResolver
 * Parses SonataAdmin URLs and resolves them to a RouteMatch.
 * Frontend equivalent of Symfony's Router component.
 * @author AGBOKOUDJO Franck <internationaleswebservices@gmail.com>
 */

import type { RouteMatch, CRUDPageType } from '../types';
import type { RouteResolverInterface } from '../contracts';
import { SonataSpaLogger } from '../Logger';

/**
 * Resolves SonataAdmin URLs to a RouteMatch.
 *
 * SonataAdmin URL patterns:
 *   /admin/{prefix}/{resource}/list
 *   /admin/{prefix}/{resource}/{token}/show
 *   /admin/{prefix}/{resource}/{token}/edit
 *   /admin/{prefix}/{resource}/create
 *   /admin/{prefix}/{resource}/{token}/delete
 *   /admin/dashboard
 *
 * The resolver extracts:
 *   - pageType  → detected from the URL suffix
 *   - resource  → the Sonata resource name (e.g. "user", "product")
 *   - token     → the unique object token for show/edit/delete
 *   - url       → the full resolved URL
 * @author AGBOKOUDJO Franck <internationaleswebservices@gmail.com>
 */
export class RouteResolver implements RouteResolverInterface {
    private static _instance: RouteResolver | null = null;
    /**
     * Map of URL suffix patterns to CRUDPageType.
     * Order matters — more specific patterns first.
     */
    private static readonly SUFFIX_MAP: ReadonlyArray<{
        pattern: RegExp;
        pageType: CRUDPageType;
    }> = [
            { pattern: /\/dashboard(\/.*)?(\?.*)?$/, pageType: 'dashboard' },
            { pattern: /\/([^/]+)\/show(\/)?(\?.*)?$/, pageType: 'show' },
            { pattern: /\/([^/]+)\/edit(\/)?(\?.*)?$/, pageType: 'edit' },
            { pattern: /\/([^/]+)\/delete(\/)?(\?.*)?$/, pageType: 'delete' },
            { pattern: /\/batch(\/)?(\?.*)?$/, pageType: 'batch' }, // Mise à jour ici
            { pattern: /\/list(\/)?(\?.*)?$/, pageType: 'list' },
            { pattern: /\/create(\/)?(\?.*)?$/, pageType: 'create' },
        ];

    /**
     * Instance-level suffix map — extensible via addPattern().
     * Initialized from the static SUFFIX_MAP defaults.
     * Extensions can prepend custom patterns via addPattern().
     */
    private readonly suffixMap: Array<{
        pattern: RegExp;
        pageType: CRUDPageType;
    }>;

    private constructor() {
        // Clone the static defaults into a mutable instance array
        this.suffixMap = [...RouteResolver.SUFFIX_MAP];
    }

    /**
     * Returns the unique RouteResolver instance.
     * Creates it on first call — returns the existing one on subsequent calls.
     * Ensures a single source of truth for URL resolution across the SPA lifetime.
     *
     * @internal — called by SpaKernel only.
     */
    public static create(): RouteResolver {
        if (RouteResolver._instance) {
            SonataSpaLogger.warn(
                '[RouteResolver] Instance already exists — returning existing.'
            );
            return RouteResolver._instance;
        }
        
        RouteResolver._instance = new RouteResolver();
        return RouteResolver._instance;
    }

    /**
     * Reset the singleton instance.
     * @internal — for testing purposes only.
     */
    public static reset(): void {
        RouteResolver._instance = null;
    }

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
    public addPattern(pattern: RegExp, pageType: CRUDPageType): void {
        this.suffixMap.unshift({ pattern, pageType });
    }

    /**
     * Resolve a SonataAdmin URL to a RouteMatch.
     *
     * @param url - The full URL to resolve (absolute or relative)
     * @returns RouteMatch with pageType, resource, token and url
     *
     * @example
     * resolver.resolve('/admin/app/user/list')
     * // → { pageType: 'list', resource: 'user', token: undefined, url: '/admin/app/user/list' }
     *
     * resolver.resolve('/admin/app/user/s69db38c053269/show')
     * // → { pageType: 'show', resource: 'user', token: 's69db38c053269', url: '...' }
     */
    public resolve(url: string): RouteMatch {
        const pathname = this.extractPathname(url);

        // Dashboard — no resource or token
        if (this.isDashboardUrl(pathname)) {
            return {
                pageType: 'dashboard',
                resource: 'dashboard',
                token: undefined,
                url,
            };
        }

        // Detect pageType from suffix
        const pageType = this.detectPageType(pathname);

        // Extract resource and token from the URL path segments
        const { resource, token } = this.extractResourceAndToken(pathname, pageType);
        return {
            pageType,
            resource,
            token,
            url,
        };
    }

    /**
     * Extract the pathname from a full URL or relative path.
     * Handles both absolute URLs (https://...) and relative paths (/admin/...).
     */
    private extractPathname(url: string): string {
        try {
            // Try to parse as absolute URL
            return (new URL(url)).pathname;
        } catch {
            // Relative path — extract pathname before query string
            return url.split('?')[0] ?? url;
        }
    }

    /**
     * Detect the CRUDPageType from the URL pathname.
     */
    private detectPageType(pathname: string): CRUDPageType {
        for (const { pattern, pageType } of this.suffixMap) {
            if (pattern.test(pathname)) {
                return pageType;
            }
        }
        return 'unknown';
    }

    /**
     * Extract the resource name and optional token from the URL path segments.
     *
     * Sonata URL structure:
     *   /admin/{adminPrefix}/{resource}/list
     *   /admin/{adminPrefix}/{resource}/{token}/show
     *
     * The resource is the segment before the action suffix.
     * The token is present for show/edit/delete — it sits between resource and suffix.
     */
    private extractResourceAndToken(
        pathname: string,
        pageType: CRUDPageType
    ): { resource: string; token: string | undefined } {
        // Remove leading slash and split into segments
        const segments = pathname.replace(/^\//, '').split('/').filter(Boolean);

        if (segments.length === 0) {
            return { resource: 'unknown', token: undefined };
        }

        // Pages with token: show, edit, delete
        // Pattern: /admin/{prefix}/{resource}/{token}/{suffix}
        const pagesWithToken: CRUDPageType[] = ['show', 'edit', 'delete'];

        if (pagesWithToken.includes(pageType) && segments.length >= 4) {
            // segments: ['admin', '{prefix}', '{resource}', '{token}', '{suffix}']
            // resource is at index length-3, token at length-2, suffix at length-1
            const suffix = segments[segments.length - 1];
            const token = segments[segments.length - 2];
            const resource = segments[segments.length - 3];

            // Validate: last segment must be a known suffix
            if (this.isKnownSuffix(suffix ?? '') && resource && token) {
                return { resource, token };
            }
        }

        // Pages without token: list, create, dashboard
        // Pattern: /admin/{prefix}/{resource}/{suffix}
        if (segments.length >= 3) {
            const suffix = segments[segments.length - 1];
            const resource = segments[segments.length - 2];

            if (this.isKnownSuffix(suffix ?? '') && resource) {
                return { resource, token: undefined };
            }
        }

        // Fallback: use last segment as resource
        return {
            resource: segments[segments.length - 1] ?? 'unknown',
            token: undefined,
        };
    }

    /**
     * Check if a URL segment is a known Sonata action suffix.
     */
    private isKnownSuffix(segment: string): boolean {
        return ['list', 'show', 'edit',
                'create', 'delete',
                'dashboard', 'batch'].includes(segment);
    }

    /**
     * Check if the URL pathname points to the dashboard.
     */
    private isDashboardUrl(pathname: string): boolean {
        return /\/dashboard(\/.*)?$/.test(pathname);
    }

    // ─── Static helpers (used by other classes) ───────────────────────────────

    /**
     * Check if a URL points to a list page.
     */
    public static isListUrl(url: string): boolean {
        return /\/list(\?.*)?$/.test(url);
    }

    /**
     * Check if a URL points to a show page.
     */
    public static isShowUrl(url: string): boolean {
        return /\/([^/]+)\/show(\?.*)?$/.test(url);
    }

    /**
     * Check if a URL points to a dashboard page.
     */
    public static isDashboardUrl(url: string): boolean {
        return /\/dashboard(\/.*)?(\?.*)?$/.test(url);
    }

    /**
     * Check if a URL points to a delete page.
     */
    public static isDeleteUrl(url: string): boolean {
        return /\/([^/]+)\/delete(\?.*)?$/.test(url);
    }

    public static isBatchUrl(url: string): boolean {
        return /\/batch(\?.*)?$/.test(url);
    }

    public static needsFullPage(currentUrl:string) {
        return (
            /\/dashboard(\/.*)?(\?.*)?$/.test(currentUrl)       // dashboard
        );
    }

    /**
     * Check if two URLs point to the same Sonata resource (same pathname base).
     * Used to decide between fetchFragment (same resource) and fetchFullPage (different resource).
     *
     * Example:
     *   /admin/admin_user/list?page=1  vs  /admin/admin_user/list?page=3  → true  → fetchFragment
     *   /admin/book/list?page=1        vs  /admin/admin_user/list?page=1  → false → fetchFullPage
     */
    public static isSameResource(currentUrl: string, targetUrl: string): boolean {
        try {
            const currentPathname = new URL(currentUrl).pathname;
            const targetPathname = new URL(targetUrl).pathname;
            return currentPathname === targetPathname;
        } catch {
            return false;
        }
    }
}
