/**
 * @wlindabla/sonata_spa — FilterBindingManager
 * Intercepts Sonata filter form submit and reset links.
 * Handles column sorting links in list pages.
 *
 * Based on real SonataAdmin source:
 *   - assets/controller/filter_controller.js  (Stimulus controller)
 *   - list.html.twig
 *   - list_filters.html.twig
 *
 * @author AGBOKOUDJO Franck <internationaleswebservices@gmail.com>
 */

import { SonataSpaLogger } from '../Logger';
import type { BindingManagerInterface, SpaRouterInterface } from '../contracts';
import { buildUrlFromForm } from '@wlindabla/form_validator/utils';

/**
 * Manages Sonata list filter form interactions.
 *
 * KEY INSIGHT from Sonata's Stimulus filter_controller.js:
 *
 * Sonata's `prepareSubmit()` runs BEFORE the native form submit event.
 * It is registered via Stimulus action: `submit->sonata-filter#prepareSubmit`
 * Stimulus fires first, then the native submit event bubbles.
 *
 * What prepareSubmit() does:
 *   1. Removes `name` from hidden/unchanged fields → not serialized
 *   2. If all fields = default → adds `<input name="filters" value="reset">`
 *   3. Disables the submit button
 *
 * So when our submit listener fires, the form fields are ALREADY cleaned
 * by Sonata Stimulus. We just:
 *   1. Prevent the native form submission (full page reload)
 *   2. Read the already-prepared FormData
 *   3. Build the URL and navigate via SPA
 *
 * Real Sonata filter form (list_filters.html.twig):
 * ```html
 * <form
 *   class="sonata-filter-form form-horizontal"
 *   action="/admin/app/user/list"
 *   method="GET"
 *   data-sonata-filter-target="form"
 *   data-action="submit->sonata-filter#prepareSubmit"
 * >
 *   <button type="submit" class="btn btn-primary"
 *           data-sonata-filter-target="submitter">
 *     Filter
 *   </button>
 *   <a class="btn btn-default"
 *      href="/admin/app/user/list?filters=reset">
 *     Reset
 *   </a>
 * </form>
 * ```
 *
 * Real Sonata sort link (list.html.twig):
 * ```html
 * <th class="sonata-ba-list-field-header-text">
 *   <a href="/admin/app/user/list?filter[_sort_by]=name&filter[_sort_order]=ASC">
 *     Name
 *   </a>
 * </th>
 * ```
 * @author AGBOKOUDJO Franck <internationaleswebservices@gmail.com>
 */
export class FilterBindingManager implements BindingManagerInterface {
    private static _instance: FilterBindingManager | null = null;
    /** Track bound forms to avoid double binding */
    private readonly boundForms = new WeakSet<HTMLFormElement>();

    private constructor(
        private readonly kernel: SpaRouterInterface
    ) { }

    public static create(kernel: SpaRouterInterface): FilterBindingManager {
        if (FilterBindingManager._instance) {
            SonataSpaLogger.warn('[FilterBindingManager] Instance already exists — returning existing.');
            return FilterBindingManager._instance;
        }
        FilterBindingManager._instance = new FilterBindingManager(kernel);
        return FilterBindingManager._instance;
    }

    public static reset(): void {
        FilterBindingManager._instance = null;
    }

    /**
     * Initial binding on boot.
     * Handles filters already present on the initial page load.
     */
    public bind(): void {
        this.bindFilterForms(document);
    }

    /**
     * Rebind after each DOM swap.
     * Called after each spa:dom:ready with the new container.
     *
     * @param container - The newly swapped container element
     */
    public rebind(container: HTMLElement): void {
        this.bindFilterForms(container);
        this.bindSortingLinks(container);
    }

    /**
     * Find and bind all Sonata filter forms.
     * The real Sonata filter form always has class "sonata-filter-form".
     *
     * @param container - The container to search within
     */
    private bindFilterForms(container: Document | HTMLElement): void {
        container
            .querySelectorAll<HTMLFormElement>('form.sonata-filter-form')
            .forEach((form) => {
                if (this.boundForms.has(form)) return;
                this.boundForms.add(form);

                this.bindFilterSubmit(form);
                this.bindFilterReset(form);
                this.bindFilterAdvancedLink(form);
            });
    }

    /**
     * Intercept filter form submit AFTER Sonata Stimulus prepareSubmit() runs.
     *
     * Stimulus registers: data-action="submit->sonata-filter#prepareSubmit"
     * Stimulus fires FIRST. By the time our listener fires, prepareSubmit()
     * has already cleaned the form fields.
     *
     * We prevent the native submit and navigate via SPA.
     *
     * @param form - The Sonata filter form element
     */
    private bindFilterSubmit(form: HTMLFormElement): void {
        form.addEventListener('submit', async (e: SubmitEvent) => {
            e.preventDefault();
            await this.navigateWithFormData(form);
        }, false);
    }

    private bindFilterAdvancedLink(form: HTMLFormElement):void{
        // Intercepte le lien "Filtres avancés" pour éviter la navigation SPA
        // Ce lien est géré par Stimulus toggleAdvanced() — on doit juste stopper
        const link = form.closest('.sonata-filters-box')
            ?.querySelector<HTMLAnchorElement>('a.advanced-link[href="#"]');
        if (!link) return;
        
        if (link.dataset['spabound'] === 'true') return;
        link.dataset['spabound'] = 'true';

        link.addEventListener('click', (e: MouseEvent) => {
            e.preventDefault();
            e.stopPropagation(); // empêche la propagation vers nos binding managers
            return;
        });
    }

    /**
     * Intercept the Sonata filter reset link.
     *
     * In Sonata template, reset is a plain <a> link:
     *   href="{{ admin.generateUrl('list', {filters: 'reset'}) }}"
     * which generates: /admin/app/user/list?filters=reset
     *
     * We intercept and navigate via SPA.
     *
     * @param form - The filter form element
     */
    private bindFilterReset(form: HTMLFormElement): void {
        const filterBox = form.closest('.sonata-filters-box');
        if (!filterBox) return;

        filterBox
            .querySelectorAll<HTMLAnchorElement>('a.btn[href]')
            .forEach((link) => {
                const href = link.getAttribute('href') ?? '';

                // Only intercept the reset link
                if ((!href.includes('filters=reset') && !href.includes('filters%3Dreset'))
                    || href.includes('#')) {
                    return;
                }

                if (link.dataset['spabound'] === 'true') return;
                link.dataset['spabound'] = 'true';

                link.addEventListener('click', async (e: MouseEvent) => {
                    e.preventDefault();
                    await this.kernel.handle({
                        url: href,
                        target: link,
                        trigger: 'click',
                    });
                });
            });
    }

    /**
     * Intercept column sort links in the Sonata list table header.
     *
     * From list.html.twig — sort links are inside <th> elements
     * with class starting with "sonata-ba-list-field-header".
     *
     * @param container - The container to search within
     */
    private bindSortingLinks(container: HTMLElement): void {
        container
            .querySelectorAll<HTMLAnchorElement>(
                'th[class*="sonata-ba-list-field-header"] a[href]'
            )
            .forEach((link) => {
                if (link.dataset['spabound'] === 'true') return;
                link.dataset['spabound'] = 'true';

                link.addEventListener('click', async (e: MouseEvent) => {
                    e.preventDefault();

                    const href = link.getAttribute('href');
                    if (!href) return;

                    await this.kernel.handle({
                        url: href,
                        target: link,
                        trigger: 'click',
                    });
                });
            });
    }

    /**
     * Build the navigation URL from the already-prepared form data.
     *
     * At this point Sonata's prepareSubmit() has already run:
     *   - Fields with unchanged values have no name attribute → ignored by FormData
     *   - If all fields = default → hidden input `filters=reset` was added
     *
     * Uses buildUrlFromForm() from @wlindabla/form_validator to build
     * the final URL from the prepared FormData.
     *
     * @param form - The already-prepared filter form
     */
    private async navigateWithFormData(form: HTMLFormElement): Promise<void> {
        const action = form.getAttribute('action') ?? window.location.pathname;

        // FormData only includes fields that still have a name attribute
        // (Sonata prepareSubmit() removed names from unchanged fields)
        const formData = new FormData(form);

        // buildUrlFromForm from @wlindabla/form_validator builds the URL
        // from FormData and appends all parameters cleanly
        const url = buildUrlFromForm(
            formData,
            action,
            undefined,  // no additional params
            true,       // returnUrl as string
            window.location.origin
        ) as string;

        await this.kernel.handle({
            url,
            trigger: 'programmatic',
        });
    }
}