/**
 * @wlindabla/sonata_spa — SidebarBindingManager
 * Intercepts sidebar link clicks and converts them to SpaRequests.
 * Uses event delegation — bound once, never needs rebinding.
 * @author AGBOKOUDJO Franck <internationaleswebservices@gmail.com>
 */

import type {
    BindingManagerInterface,
    RequestMatcherInterface,
    SpaRouterInterface
} from '../contracts';

import { SonataSpaLogger } from '../Logger';

/**
 * Manages click event binding on the AdminLTE sidebar.
 *
 * Uses event delegation on the sidebar root element — one listener
 * handles all link clicks regardless of how many links exist.
 * This means bind() is called once during boot() and rebind() is a no-op
 * because the sidebar is never swapped during SPA navigation.
 *
 * Sidebar HTML structure (AdminLTE 4):
 * ```html
 * <aside id="app-sidebar" 
 *  data-enable-persistence="true"
 * class="app-sidebar app-sidebar-custom shadow overflow-auto">
 *  <div class="sidebar-brand overflow-hidden" id="sidebar-brand">
        {% block logo %}
            <a class="logo" href="{{ path('sonata_admin_dashboard') }}" class="brand-link">
                {% if 'icon' == sonata_config.getOption('logo_content') or 'all' == sonata_config.getOption('logo_content') %}
                    <img src="{{ asset(sonata_config.logo) }}" alt="{{ sonata_config.title }}" 
                        class="img-fluid brand-image" id="logo-image">
                {% endif %}
            </a> 
        {% endblock %} {# endblock logo #}
    </div>
*   <div class="sidebar-wrapper" id="sidebar-wrapper">
 *      <nav class="sonata-admin-sidebar" id="sonata-admin-sidebar">
 *          <ul class="nav sidebar-menu flex-column">
 *              <li class="nav-item">
 *                  <a href="/admin/app/user/list" class="nav-link">
 *                  <i class="nav-icon fas fa-users"></i>
 *                  <p>Users</p>
 *                  </a>
 *              </li>
 *          </ul>
 *      </nav>
 *  </div>
 * </aside>
 * ```
 * @author AGBOKOUDJO Franck <internationaleswebservices@gmail.com>
 */
export class SidebarBindingManager implements BindingManagerInterface {
    private static _instance: SidebarBindingManager | null = null;

    private constructor(
        private readonly sidebar: HTMLElement,
        private readonly kernel: SpaRouterInterface,
        private readonly requestMatcher: RequestMatcherInterface
    ) { }

    public static create(
        sidebar: HTMLElement,
        kernel: SpaRouterInterface,
        requestMatcher: RequestMatcherInterface
    ): SidebarBindingManager {
        if (SidebarBindingManager._instance) {
            SonataSpaLogger.warn('[SidebarBindingManager] Instance already exists — returning existing.');
            return SidebarBindingManager._instance;
        }
        SidebarBindingManager._instance = new SidebarBindingManager(sidebar, kernel, requestMatcher);
        return SidebarBindingManager._instance;
    }

    public static reset(): void {
        SidebarBindingManager._instance = null;
    }
    
    /**
     * Bind click event delegation on the sidebar.
     * Called once during SpaKernel.boot().
     */
    public bind(): void {
        this.sidebar.addEventListener('click', async (e: MouseEvent) => {
            await this.handleClick(e);
        });
    }

    /**
     * No-op — the sidebar is never swapped during navigation.
     * The event delegation bound in bind() covers all sidebar links forever.
     */
    public rebind(_container: HTMLElement): void {
        // Sidebar is never replaced — no rebinding needed
    }

    /**
     * Handle a click event on the sidebar.
     * Finds the closest anchor element and converts it to a SPA navigation.
     */
    private async handleClick(e: MouseEvent): Promise<void> {
        const target = e.target;
        if (!(target instanceof Element)) return;

        // Find the closest anchor element
        const link = target.closest('a[href]') as HTMLAnchorElement | null;
      
        if (!link) return;

        // Check if this link should be ignored
        if (this.requestMatcher.shouldIgnoreLink(link)) return;

        const href = link.getAttribute('href');
        if (!href) return;

        e.preventDefault();

        // Update active state in sidebar
        this.setActiveLink(link);
        // Delegate to SpaKernel
        await this.kernel.handle({
            url: href,
            target: link,
            trigger: 'click',
        });
    }

    /**
     * Update the active CSS class on sidebar links.
     * Removes 'active' from all links and adds it to the clicked one.
     *
     * @param activeLink - The link that was clicked
     */
    private setActiveLink(activeLink: HTMLElement): void {
        // Remove active from all sidebar links and their parent li
        this.sidebar
            .querySelectorAll('a.active, li.active, .nav-item.active')
            .forEach((el) => el.classList.remove('active'));

        // Add active to the clicked link
        activeLink.classList.add('active');

        // Add active to the parent li / nav-item
        activeLink.closest('li')?.classList.add('active');
        activeLink.closest('.nav-item')?.classList.add('active');

        // Handle nested menus — expand parent if needed
        const parentMenu = activeLink.closest('.nav-treeview');
        if (parentMenu) {
            parentMenu.closest('.nav-item')?.classList.add('menu-open');
        }
    }
}
