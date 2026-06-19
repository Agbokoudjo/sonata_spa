/**
 * @wlindabla/sonata_spa — ActionBindingManager
 * Intercepts action link clicks in content-header and mainContainer.
 * Handles show and delete links inside the content area.
 * Must rebind after each DOM swap since these links are inside swapped content.
 * @author AGBOKOUDJO Franck <internationaleswebservices@gmail.com>
 */

import type {
    BindingManagerInterface,
    RequestMatcherInterface,
    SpaRouterInterface
} from '../contracts';

import { SonataSpaLogger } from '../Logger';

/**
 * Manages action link clicks in:
 *   - Content header (.content-header / #app-content-header)
 *     → Sonata action buttons: Show, Edit, Delete, Back
 *   - Main content area (#app-content / .app-content)
 *     → Row action links in list tables: view_link, edit_link, delete_link
 *
 * Uses event delegation on mainContainer — one listener per container
 * handles all action links. rebind() is called after each DOM swap
 * because the mainContainer content is replaced.
 *
 * Sonata action link HTML structure:
 * ```html
 * <!-- In content-header -->
 * <a href="/admin/app/user/42/show" class="sonata-action-element btn btn-info">
 *   <i class="fas fa-eye"></i> Show
 * </a>
 *
 * <!-- In list table -->
 * <a href="/admin/app/user/42/show" class="view_link">
 *   <i class="fas fa-eye"></i>
 * </a>
 * <a href="/admin/app/user/42/delete" class="delete_link">
 *   <i class="fas fa-trash"></i>
 * </a>
 * ```
 * @author AGBOKOUDJO Franck <internationaleswebservices@gmail.com>
 */
export class ActionBindingManager implements BindingManagerInterface {
    private static _instance: ActionBindingManager | null = null;
    /** Track bound containers to avoid double binding */
    private boundContainers = new WeakSet<HTMLElement>();

    private constructor(
        private readonly mainContainer: HTMLElement,
        private readonly kernel: SpaRouterInterface,
        private readonly requestMatcher: RequestMatcherInterface
    ) { }

    public static create(
        mainContainer: HTMLElement,
        kernel: SpaRouterInterface,
        requestMatcher: RequestMatcherInterface
    ): ActionBindingManager {
        if (ActionBindingManager._instance) {
            SonataSpaLogger.warn('[ActionBindingManager] Instance already exists — returning existing.');
            return ActionBindingManager._instance;
        }
        ActionBindingManager._instance = new ActionBindingManager(mainContainer, kernel, requestMatcher);
        return ActionBindingManager._instance;
    }

    public static reset(): void {
        ActionBindingManager._instance = null;
    }

    /**
     * Bind event delegation on mainContainer and content-header.
     * Called once during SpaKernel.boot().
     */
    public bind(): void {
        this.bindOnContainer(this.mainContainer);
    }

    /**
     * Rebind after DOM swap.
     * The mainContainer content is replaced — we need to re-delegate.
     * However since we use delegation on mainContainer itself (not its children),
     * we only need to rebind if mainContainer itself was replaced.
     *
     * @param container - The newly swapped container element
     */
    public rebind(container: HTMLElement): void {
        // If the swapped container IS the mainContainer or contains it,
        // rebind delegation on the new mainContainer
        if (container === this.mainContainer || container.contains(this.mainContainer)) {
            this.bindOnContainer(container);
        }
    }

    /**
     * Bind click event delegation on a container element.
     * Handles all action links within that container.
     *
     * @param container - The container to bind on
     */
    private bindOnContainer(container: HTMLElement): void {
        if (this.boundContainers.has(container)) return;
        this.boundContainers.add(container);

        container.addEventListener('click', async (e: MouseEvent) => {
            await this.handleClick(e);
        });
    }

    /**
     * Handle a click event on an action link.
     * Intercepts show, delete and other Sonata action links.
     */
    private async handleClick(e: MouseEvent): Promise<void> {
        const target = e.target;
        if (!(target instanceof Element)) return;

        // Find the closest anchor element that is an action link
        const link = target.closest('a[href]') as HTMLAnchorElement | null;

        if (!link) return;

        const href = link.getAttribute('href');
        if (!href) return;

        // Check if this link should be ignored
        if (this.requestMatcher.shouldIgnoreLink(link)) {
            // If it's a "#" link, we prevent the default behavior
            // to let Stimulus work undisturbed
            if (href === '#' || href.startsWith('#') ||
                href.startsWith('#') || href.indexOf('#') !== -1) {
                e.preventDefault();
            }
            return;
        }
        // Only intercept known Sonata action link patterns
        if (!this.isSpaActionLink(link,href)) return;

        e.preventDefault();
        await this.kernel.handle({
            url: href,
            target: link,
            trigger: 'click',
        });
    }

    /**
     * Determine if a link is a Sonata action link that should be
     * intercepted by the SPA router.
     *
     * Intercepts:
     *   - .view_link       → show page
     *   - .delete_link     → delete confirmation
     *   - .sonata-action-element → header action buttons (show, back)
     *
     * Does NOT intercept:
     *   - .edit_link       → server-managed (CSRF token)
     *   - Regular text links that are not Sonata actions
     *
     * @param link - The anchor element to check
     * @param url - url 
     */
    private isSpaActionLink(link: Element,url:string): boolean {
        return (
            link.classList.contains('view_link') ||
            link.classList.contains('delete_link') ||
            link.classList.contains('sonata-action-element') ||
            url.includes('/show') || //for the link on template relation as list_many_to_many.html.twig etc.
            url.includes('/list') || //for the link on template relation as list_many_to_many.html.twig etc.
            url.includes('/delete') //for the link on template relation as list_many_to_many.html.twig etc.
        );
    }
}
