import { APP_ENV } from "../types";

// ── Private write token ───────────────────────────────────────────────────────
// This Symbol is the only key that unlocks write access.
// It is NOT exported — no code outside this file can call the write methods.
// Equivalent to C++ `friend class SpaKernel`.
const KERNEL_WRITE_TOKEN: unique symbol = Symbol('SpaKernel.writeToken');

// Export the token TYPE only — not the value
// SpaKernel imports the value directly from this file (same module)
export type KernelWriteToken = typeof KERNEL_WRITE_TOKEN;


/**
 * @wlindabla/sonata_spa — SpaParameterBag
 * Centralized read-only access to SPA runtime parameters.
 *
 * Write access is restricted to SpaKernel via a private Symbol token
 * that is never exported — equivalent to C++ `friend class` pattern.
 *
 * Consumers (Fetchers, Subscribers, BindingManagers) can read parameters
 * via static getters. Only SpaKernel can write via the unexported token.
 *
 * @example
 * ```typescript
 * // In any Fetcher, Subscriber or BindingManager
 * if (SpaParameterBag.isDebug()) {
 *     SonataSpaLogger.info('[MyService] debug info');
 * }
 * const env = SpaParameterBag.getEnv(); // 'prod' | 'dev' | 'test'
 * ```
 */
export class SpaParameterBag  {
    // ── Internal state ────────────────────────────────────────────────────────
    private static _env: APP_ENV = 'prod';
    private static _debug: boolean = false;
    private static _version: string = '1.0.0';
    private static _booted: boolean = false;

    // ── Write API — kernel only ───────────────────────────────────────────────

    /**
     * Initialize all parameters at once.
     * Can only be called ONCE — subsequent calls are ignored.
     * The token parameter ensures only SpaKernel (which holds the Symbol) can call this.
     *
     * @internal SpaKernel only
     */
    public static initialize(
        token: typeof KERNEL_WRITE_TOKEN,
        params: {
            env: APP_ENV;
            debug?: boolean;
            version?: string;
        }
    ): void {
        SpaParameterBag.guardToken(token);

        // Idempotent — can only be initialized once per page load
        if (SpaParameterBag._booted) {
            return;
        }

        SpaParameterBag._env = params.env;
        SpaParameterBag._debug = params.debug ?? params.env !== 'prod';
        SpaParameterBag._version = params.version ?? '1.0.0';
        SpaParameterBag._booted = true;
    }

    // ── Read API — accessible by all consumers ────────────────────────────────

    /**
     * Returns the current application environment.
     * @returns 'prod' | 'dev' | 'test'
     */
    public static getEnv(): APP_ENV {
        return SpaParameterBag._env;
    }

    /**
     * Returns true when the application runs in debug mode.
     * Automatically true in 'dev' and 'test' environments.
     */
    public static isDebug(): boolean {
        return SpaParameterBag._debug;
    }

    /**
     * Returns the current SPA version string.
     */
    public static getVersion(): string {
        return SpaParameterBag._version;
    }

    /**
     * Returns true if the ParameterBag has been initialized by SpaKernel.
     * Useful for guards in services that need env at construction time.
     */
    public static isBooted(): boolean {
        return SpaParameterBag._booted;
    }

    // ── Token guard ───────────────────────────────────────────────────────────

    /**
     * Throws if the provided token does not match the private write token.
     * This is the enforcement mechanism — no token = no write access.
     */
    private static guardToken(token: symbol): void {
        if (token !== KERNEL_WRITE_TOKEN) {
            throw new Error(
                '[SpaParameterBag] Write access denied. ' +
                'Only SpaKernel can initialize parameters. ' +
                'Use SpaParameterBag.getEnv() / isDebug() for read access.'
            );
        }
    }
}

// ── Export the token for SpaKernel ONLY ──────────────────────────────────────
// This is exported as a named export from this module.
// SpaKernel imports it directly. No other file should import it.
// The TypeScript compiler won't stop someone from importing it,
// but the intent is enforced by convention + code review.
export { KERNEL_WRITE_TOKEN };