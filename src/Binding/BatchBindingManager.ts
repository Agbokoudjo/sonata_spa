/**
 * @wlindabla/sonata_spa — BatchBindingManager
 * Intercepts Sonata batch form submissions and routes them through the SPA kernel.
 * @author AGBOKOUDJO Franck <internationaleswebservices@gmail.com>
 */

import type { BindingManagerInterface, SpaRouterInterface } from '../contracts';
import { SonataSpaLogger } from '../Logger';

/**
 * Binds the Sonata batch submit button so it routes through the SPA kernel
 * instead of triggering a full page reload.
 *
 * Sonata batch forms live in the list view. The submit button is either:
 *   - An `<input type="submit">` or `<button type="submit">` with class `.btn-batch-submit`
 *   - Or the default Sonata submit input (no specific class)
 *
 * Batch actions are NOT limited to delete — developers can register any custom
 * batch action (approve, activate, deactivate, merge, etc.) via configureBatchActions().
 * This manager intercepts ALL batch submissions regardless of the action type.
 *
 * The kernel then dispatches crud:batch which is handled by {@link BatchPageSubscriber}.
 */
export class BatchBindingManager implements BindingManagerInterface {
    private static _instance: BatchBindingManager | null = null;

    /**
     * Tracks already-bound containers to prevent double-binding on re-renders.
     * WeakSet ensures containers are garbage-collected when removed from the DOM.
     */
    private readonly boundContainers = new WeakSet<HTMLElement>();

    private constructor(
        private readonly mainContainer: HTMLElement,
        private readonly kernel: SpaRouterInterface
    ) { }

    public static create(
        mainContainer: HTMLElement,
        kernel: SpaRouterInterface
    ): BatchBindingManager {
        if (BatchBindingManager._instance) {
            SonataSpaLogger.warn('[BatchBindingManager] Instance already exists — returning existing.');
            return BatchBindingManager._instance;
        }
        BatchBindingManager._instance = new BatchBindingManager(mainContainer, kernel);
        return BatchBindingManager._instance;
    }

    public static reset(): void {
        BatchBindingManager._instance = null;
    }
    
    public bind(): void {
        this.bindBatchForms(this.mainContainer);
    }

    public rebind(container: HTMLElement): void {
        this.bindBatchForms(container);
    }

    /**
     * Find and bind the batch submit button inside the given container.
     *
     * Uses a two-step selector strategy:
     *   1. Look for `.btn-batch-submit` (custom or overridden templates)
     *   2. Fall back to `[type=submit]` inside a form with a batch action URL
     *
     * Uses `data-spabound` on the button itself (not the container) because
     * the same container can be reused across SPA navigations while the button
     * is re-created each time.
     *
     * @param container - The DOM subtree to search within
     */
    private bindBatchForms(container: HTMLElement): void {
        if (this.boundContainers.has(container)) return;
        this.boundContainers.add(container);

        // Strategy 1 — explicit batch submit button class
        // Strategy 2 — any submit button inside a form whose action contains /batch
        const batchSubmit =
            container.querySelector<HTMLElement | HTMLButtonElement>('.btn-batch-submit') ??
            container.querySelector<HTMLInputElement | HTMLButtonElement>(
                'form[action*="/batch"] [type="submit"]'
            );

        if (!batchSubmit) return;

        // Guard against double-binding when rebind() is called after a partial swap
        if (batchSubmit.dataset['spabound'] === 'true') return;
        batchSubmit.dataset['spabound'] = 'true';

        batchSubmit.addEventListener('click', async (e: MouseEvent) => {
            e.preventDefault();
            e.stopPropagation();

            const form = batchSubmit.closest<HTMLFormElement>('form');
            if (!form) return;

            let url = form.getAttribute('action');
            if (!url) {
                throw new Error('[BatchBindingManager] Form action attribute is missing');
            }

            if (!url.includes('?') && !url.endsWith('/')) {
                url += '/';
            } else if (url.includes('?')) {
                const parts = url.split('?');
                if (parts[0] && !parts[0].endsWith('/')) {
                    url = parts[0] + '/?' + parts[1];
                }
            }

            await this.kernel.handle({
                url: url,
                trigger: 'batch',
                target: form,
            });
        });
    }
}