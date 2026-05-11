import { fetchErrorTranslator } from "@wlindabla/form_validator";
import { HttpRequestSubscriber } from "@wlindabla/form_validator/subscriber";
import type { EventSubscriberInterface } from '@wlindabla/event_dispatcher';

/**
 * Bridges the exactOptionalPropertyTypes incompatibility between
 * HttpRequestSubscriber (compiled with `priority?: number | undefined`)
 * and EventSubscriberInterface (declared with `priority?: number`).
 *
 * The cast through `unknown` is intentional and safe here — both types
 * are structurally identical at runtime; the difference only exists at
 * the TypeScript type-checking level due to exactOptionalPropertyTypes.
 */
export class SonataHttpRequestSubscriber extends HttpRequestSubscriber {
    public constructor() {
        super(fetchErrorTranslator);
    }

    public override getSubscribedEvents(): ReturnType<EventSubscriberInterface['getSubscribedEvents']> {
        return super.getSubscribedEvents() as unknown as ReturnType<EventSubscriberInterface['getSubscribedEvents']
            >;
    }
}