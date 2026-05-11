/**
 * @wlindabla/sonata_spa — DomSwapManager
 * Selects and executes the appropriate SwapStrategy based on the RouteMatch.
 * Dispatches spa:swap:before (stoppable) and spa:swap:after events.
 * @author AGBOKOUDJO Franck <internationaleswebservices@gmail.com>
 */

import type { BrowserEventDispatcher } from '@wlindabla/event_dispatcher/browser';
import type { DomSwapManagerInterface, SwapStrategyInterface } from '../contracts';
import type { SwapContext } from '../types';
import { SpaEvents, SpaSwapEvent, SpaSwapAfterEvent } from '../Events';
import { ListSwapStrategy } from './ListSwapStrategy';
import { ShowSwapStrategy } from './ShowSwapStrategy';
import { FormSwapStrategy } from './FormSwapStrategy';
import { GenericSwapStrategy } from './GenericSwapStrategy';
import { SonataSpaLogger } from '../Logger';

/**
 * Orchestrates the DOM swap process using the Strategy Pattern.
 *
 * On each navigation, DomSwapManager:
 *   1. Dispatches SpaSwapEvent (spa:swap:before) — STOPPABLE
 *      → Developer can cancel the swap and perform a custom one
 *   2. Selects the appropriate SwapStrategy based on routeMatch.pageType
 *      → Custom strategies are checked first (registered via addStrategy())
 *      → Built-in strategies: List, Show/Dashboard, Form, Generic (fallback)
 *   3. Executes strategy.swap(context)
 *   4. Dispatches SpaSwapAfterEvent (spa:swap:after)
 *
 * Strategy selection order:
 *   1. Custom strategies (registered by developer)
 *   2. ListSwapStrategy    → 'list'
 *   3. ShowSwapStrategy    → 'show' | 'dashboard'
 *   4. FormSwapStrategy    → 'create' | 'edit'
 *   5. GenericSwapStrategy → everything else (fallback)
 *
 * @example
 * ```typescript
 * // Register a custom strategy before boot()
 * spa.getDomSwapManager().addStrategy(new MyCustomStrategy());
 * ```
 * @author AGBOKOUDJO Franck <internationaleswebservices@gmail.com>
 */
export class DomSwapManager implements DomSwapManagerInterface {

    /** Custom strategies registered by the developer — checked first */
    private readonly customStrategies: SwapStrategyInterface[] = [];

    /** Built-in strategies — checked after custom ones */
    private readonly builtInStrategies: SwapStrategyInterface[];

    public constructor(
        private readonly dispatcher: BrowserEventDispatcher,
        genericSelectors: string[] = []
    ) {
        // Built-in strategies in priority order
        // GenericSwapStrategy is always last (supports all page types)
        this.builtInStrategies = [
            new ListSwapStrategy(),
            new ShowSwapStrategy(),
            new FormSwapStrategy(),
            new GenericSwapStrategy(genericSelectors),
        ];
    }

    /**
     * Select the appropriate strategy and perform the DOM swap.
     *
     * @param context - The full swap context with virtualDoc and DOM references
     */
    public swap(context: SwapContext): void {
        const { routeMatch } = context;

        // ── Step 1: dispatch spa:swap:before (STOPPABLE) ──────────────────────
        const swapBeforeEvent = new SpaSwapEvent(context);
        this.dispatcher.dispatch(swapBeforeEvent, SpaEvents.SWAP_BEFORE);

        if (swapBeforeEvent.isPropagationStopped()) {
            // Developer cancelled the swap — they handle it themselves
                SonataSpaLogger.info(
                    '[DomSwapManager] Swap cancelled by spa:swap:before listener.',
                    routeMatch
                );
            return;
        }

        // ── Step 2: Select and execute the appropriate strategy ───────────────
        const strategy = this.selectStrategy(context);
            SonataSpaLogger.info(
                `[DomSwapManager] Using ${strategy.constructor.name} for pageType "${routeMatch.pageType}"`,
                routeMatch
            );

        strategy.swap(context);

        // ── Step 3: dispatch spa:swap:after ───────────────────────────────────
        const swapAfterEvent = new SpaSwapAfterEvent(context);
        this.dispatcher.dispatch(swapAfterEvent, SpaEvents.SWAP_AFTER);
    }

    /**
     * Register a custom swap strategy.
     * Custom strategies are checked before built-in strategies.
     * Useful for pages with a unique layout outside standard Sonata CRUD.
     *
     * @param strategy - The strategy to register
     * @returns this — for method chaining 
     *
     * @example
     * ```typescript
     * swapManager.addStrategy(new MyDashboardStrategy());
     * ```
     */
    public addStrategy(strategy: SwapStrategyInterface): this {
        this.customStrategies.push(strategy);
        return this;
    }

    /**
     * Select the first strategy that supports the current page type.
     * Custom strategies are checked before built-in ones.
     * GenericSwapStrategy is always the final fallback.
     *
     * @param context - The swap context
     * @returns The matching SwapStrategy
     */
    private selectStrategy(context: SwapContext): SwapStrategyInterface {
        const { pageType } = context.routeMatch;

        // Check custom strategies first
        for (const strategy of this.customStrategies) {
            if (strategy.supports(pageType)) {
                return strategy;
            }
        }

        // Check built-in strategies
        // GenericSwapStrategy (last) always returns true from supports()
        for (const strategy of this.builtInStrategies) {
            if (strategy.supports(pageType)) {
                return strategy;
            }
        }

        // Should never reach here — GenericSwapStrategy is always the fallback
        throw new Error(
            `[DomSwapManager] No strategy found for pageType "${pageType}". ` +
            'This should never happen — GenericSwapStrategy is always the fallback.'
        );
    }

    /**
     * Get all registered strategies (custom + built-in).
     * Useful for debugging.
     */
    public getStrategies(): SwapStrategyInterface[] {
        return [...this.customStrategies, ...this.builtInStrategies];
    }
}
