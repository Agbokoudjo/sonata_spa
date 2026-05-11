/**
 * @wlindabla/sonata_spa
 * Symfony-inspired SPA router for SonataAdmin with AdminLTE >= 4 and Bootstrap >= 5.3
 *
 * @author AGBOKOUDJO Franck <internationaleswebservices@gmail.com>
 * @company INTERNATIONALES WEB APPS & SERVICES
 * @license MIT
 *
 * @example
 * ```typescript
 * import { SpaKernel, SpaEvents } from '@wlindabla/sonata_spa';
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
 *     /\/create(\?.*)?$/,
 *     /\/batch(\?.*)?$/,
 *   ],
 * },
 * env:APP_ENV,
 * new BrowserEventDispatcher(window,{ bubbles: true })
 * );
 *
 * // Add custom subscribers before boot
 * spa.addSubscriber(new MyAnalyticsSubscriber());
 *
 * // Boot the SPA kernel
 * spa.boot();
 * ```
 */

// ─── Kernel ───────────────────────────────────────────────────────────────────
export { SpaKernel } from './Kernel/SpaKernel';
// ─── Extension system ─────────────────────────────────────────────────────────
export { SpaExtensionContext } from "./Extension";
export { SpaParameterBag } from "./ParameterBag";

// ─── Logger ───────────────────────────────────────────────────────────────────
export { SonataSpaLogger } from './Logger';

// ─── Events ───────────────────────────────────────────────────────────────────
export {
    SpaEvents,
    SpaRequestEvent,
    SpaRouteResolvedEvent,
    SpaResponseEvent,
    SpaSwapEvent,
    SpaSwapAfterEvent,
    SpaDomReadyEvent,
    SpaNavigateCompletedEvent,
    SpaCrudEvent,
    SpaFormSubmitEvent,
    SpaFetchErrorEvent,
    SpaDeleteConfirmRequestedEvent,
    SpaServerRedirectEvent,
    SonataSubmitButton,
    SpaDeleteFailedEvent,
    SpaDeleteProcessingEvent,
    SpaDeleteSucceededEvent,
    SpaBatchConfirmRequestedEvent,
    SpaBatchFailedEvent,
    SpaBatchProcessingEvent,
    SpaBatchSucceededEvent
} from './Events';

export type { SonataSubmitButtonName } from './Events';

// ─── Subscribers ─────────────────────────────────────────────────────────────
export { DefaultDeletionOperationSubscriber } from "./Subscribers/DefaultDeletionOperationSubscriber";
export { DefaultBatchSubscriber } from "./Subscribers/DefaultBatchSubscriber";
export { AbstractCRUDPageSubscriber } from './Subscribers/AbstractCRUDPageSubscriber';
// ─── DomSwapper ───────────────────────────────────────────────────────────────
export { DomSwapManager } from './DomSwapper/DomSwapManager';

export type {
    SpaRouterInterface,
    SwapStrategyInterface,
    BindingManagerInterface,
    SpaSubscriberInterface,
    HistoryManagerInterface,
    RouteResolverInterface,
    RequestMatcherInterface,
    SpaExtensionContextInterface,
    SpaKernelExtensionInterface
} from './contracts';

// ─── Types ────────────────────────────────────────────────────────────────────
export type {
    CRUDPageType,
    CRUDSuffixURL,
    RouteMatch,
    SpaRequest,
    SpaResponse,
    SwapContext,
    FetchConfirmDeleteOptions,
    SpaRouterOptions,
    APP_ENV,
    BatchConfirmData,
    SpaRedirectType
} from './types';

export { SpaRedirectResponse } from "./Http";