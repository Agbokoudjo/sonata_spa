/**
 * @wlindabla/sonata_spa — ListSwapStrategy
 * Surgical DOM swap strategy for Sonata list pages.
 * Handles filters, data table, filter actions and CRUD action buttons.
 * @author AGBOKOUDJO Franck <internationaleswebservices@gmail.com>
 */

import { SonataSpaLogger } from '..';
import type { SwapStrategyInterface } from '../contracts';
import type { SwapContext, CRUDPageType } from '../types';

/**
 * Surgical DOM swap strategy for Sonata list pages (crud:list).
 *
 * Instead of replacing the entire page, this strategy replaces
 * only the parts that actually changed:
 *
 *   1. Filter actions  → ul[id^="filter-list-"]     in content-header navbar
 *   2. Filters box     → .sonata-filters-box         in content area
 *   3. Data table      → .list-table-container row   in content area
 *   4. Sonata actions  → ul[id^="container-sonata-actions"] in content-header
 *
 * For each element, handles all 3 cases:
 *   - newEl exists + currentEl exists → replaceWith()
 *   - newEl exists + currentEl absent → append to container
 *   - newEl absent + currentEl exists → remove()
 *
 * Sonata list page HTML structure (AdminLTE 4 + Bootstrap 5):
 * ```html
 * <div id="app-content-header" class="app-content-header content-header">
 *   <nav class="navbar navbar-expand-lg navbar-container navbar-container-header shadow-sm">
 *     <ul class="navbar-nav element-action navbar-nav ms-auto mb-2 mb-lg-0 navbar-nav-scrol">
 *        <li class="nav-item nav-item-list-filters-actions">
 *          <ul id="filter-list-{uniqid}">...</ul>           ← filter actions
 *        </li>
 *        <li class="nav-item">
 *          <ul id="container-sonata-actions-{uniqid}" 
 *              class="nav navbar-nav navbar-right container-sonata-actions" 
 *              id="container-sonata-actions">
 *              ...
 *          </ul> ← crud actions
 *      </li>
 *     </ul>
 *   </nav>
 * </div>
 * <div id="app-content" class="app-content">
 *   <div class="row sonata-ba-filter">
 *     <div class="sonata-filters-box">...</div>          ← filters box
 *   </div>
 *   <div class="row sonata-ba-list">
 *     <div class="col-xs-12 col-md-12">
 *       <div class="list-table-container">...</div>      ← data table
 *     </div>
 *   </div>
 * </div>
 * ```
 * @author AGBOKOUDJO Franck <internationaleswebservices@gmail.com>
 */
export class ListSwapStrategy implements SwapStrategyInterface {

    public supports(pageType: CRUDPageType): boolean {
        return pageType === 'list';
    }

    public swap(context: SwapContext): void {
        const { response,mainContainer, mainContentArea, mainContentHeader } = context;
        const { virtualDoc } = response;

        // Find #app-main in the virtual document
        const virtualMain = virtualDoc.querySelector('#app-main') ||
            virtualDoc.querySelector('.app-main') ||
            virtualDoc.querySelector('.content-wrapper');
        
        if (virtualMain) {
            // Full replacement of #app-main content
            mainContainer.innerHTML = virtualMain.innerHTML;
        } else {
            // Fallback: virtualDoc does not contain #app-main
            // This can happen with partial server responses
            // Fall back to generic content swap
            this.swapSonataActions(virtualDoc, mainContentHeader);
            this.swapFilterActions(virtualDoc, mainContentHeader);
            this.swapFiltersBox(virtualDoc, mainContentArea, context);
            this.swapListTable(virtualDoc, mainContentArea, context);
        }
    }

    // ─── Filter actions (navbar filter toggle buttons) ────────────────────────

    /**
     * Swap the filter action buttons in the content header navbar.
     * These are the buttons that show/hide the filters box.
     * Selector: ul[id^="filter-list-"]
     */
    private swapFilterActions(
        virtualDoc: Document,
        mainContentHeader: HTMLElement | null
    ): void {
        if (!mainContentHeader) return;

        const newFilterActions = virtualDoc.querySelector('ul[id^="filter-list-"]');
        const currentFilterActions = mainContentHeader.querySelector('ul[id^="filter-list-"]');

        if (newFilterActions && currentFilterActions) {
            currentFilterActions.replaceWith(newFilterActions);
            return;
        }

        if (newFilterActions && !currentFilterActions) {
            const navbarRight = mainContentHeader.querySelector('.navbar-nav.element-action');
            if (navbarRight) {
                const filterActionItemContainer = mainContentHeader.querySelector('nav-item.nav-item-list-filters-actions') || document.createElement('li');
                navbarRight.appendChild(filterActionItemContainer);

                if (!filterActionItemContainer.classList.contains('nav-item')) {
                    filterActionItemContainer.classList.add('nav-item', 'nav-item-list-filters-actions')
                }
                
                filterActionItemContainer.appendChild(newFilterActions);
               
            }
            return;
        }

        if (!newFilterActions && currentFilterActions) {
            currentFilterActions.closest('li')?.remove() ?? currentFilterActions.remove();
        }
    }

    // ─── Sonata CRUD action buttons ───────────────────────────────────────────

    /**
     * Swap the Sonata CRUD action buttons (Add new, Export, etc.)
     * in the content header navbar.
     * Selector: ul[id^="container-sonata-actions"]
     */
    private swapSonataActions(
        virtualDoc: Document,
        mainContentHeader: HTMLElement | null
    ): void {
        if (!mainContentHeader) return;

        const newActions = virtualDoc.querySelector('ul[id^="container-sonata-actions"]');
        const currentActions = mainContentHeader.querySelector('ul[id^="container-sonata-actions"]');

        if (newActions && currentActions) {
            currentActions.replaceWith(newActions);
            return;
        }

        if (newActions && !currentActions) {
            const navbarRightContainerElementActions = mainContentHeader.querySelector('.navbar-nav.element-action');

            if (navbarRightContainerElementActions) {
                navbarRightContainerElementActions.append(newActions);
            }
            return;
        }

        if (!newActions && currentActions) {
            currentActions.remove();
        }
    }

    // ─── Filters box ──────────────────────────────────────────────────────────

    /**
     * Swap the filters box (search/filter form).
     * Selector: configurable via filtersBoxSelector option,
     * defaults to '.sonata-filters-box'
     */
    private swapFiltersBox(
        virtualDoc: Document,
        mainContentArea: HTMLElement,
        context: SwapContext
    ): void {
        const selector = '.sonata-filters-box';

        const newFilters = virtualDoc.querySelector(selector);
        const currentFilters = mainContentArea.querySelector(selector);
        
        if (newFilters && currentFilters) {
            currentFilters.replaceWith(newFilters);
            return;
        }

        if (newFilters && !currentFilters) {
            /**
             * {% block notice %}
                    {% include '@SonataTwig/FlashMessage/render.html.twig' %}
                {% endblock %} {# endblock notice #}
             * {% if _list_filters is not empty %}
                    <div class="row">
                        {{ _list_filters|raw }}
                    </div>
                {% endif %} //for template standard_layout.html.twig old  of sonataAdmin
                or
                {% if _list_filters is not empty %}
                    <div class="row sonata-ba-filter">
                        {{ _list_filters|raw }}
                    </div>
                {% endif %} //for template standard_layout.html.twig customer with adminLte4  of sonataAdmin
             */
            let filterRow = mainContentArea.querySelector('.sonata-ba-filter');

            if (!filterRow) {
                filterRow = document.createElement('div');
                filterRow.classList.add('row', 'sonata-ba-filter');
                const noticeFlashMessage = mainContentArea.querySelector('div[class^="alert"]');

                if (noticeFlashMessage) {
                    noticeFlashMessage.after(filterRow)
                } else {
                    mainContentArea.prepend(filterRow);
                }
            }

            filterRow.replaceChildren(newFilters);
            return;
        }

        if (!newFilters && currentFilters) {
            // Remove the entire filter row if it only contained the filters box
            const filterRow = currentFilters.closest('.sonata-ba-filter');
            if (filterRow && filterRow.children.length === 1) {
                filterRow.remove();
            } else {
                currentFilters.remove();
            }
        }
    }

    // ─── Data table ───────────────────────────────────────────────────────────

    /**
     * Swap the list data table.
     * Selector: configurable via listDataTableContainerSelector option,
     * defaults to '.col-xs-12.col-md-12:has(.list-table-container)'
     *
     * Sonata wraps the table in:
     * ```html
     * <div class="row sonata-ba-list">
     *   <div class="col-xs-12 col-md-12 list-table-container">       ← this is what we swap
     *     <div class="box box-primary card">
     *       <table>...</table>
     *     </div>
     *   </div>
     * </div>
     * ```
     */
    private swapListTable(
        virtualDoc: Document,
        mainContentArea: HTMLElement,
        context: SwapContext
    ): void {
        const newRow = virtualDoc.querySelector('.list-table-container')
            ?? virtualDoc.querySelector('.col-xs-12.col-md-12.list-container')
            ?? virtualDoc.querySelector('.sonata-ba-list .col-xs-12');

        const currentRow = mainContentArea.querySelector('.list-table-container')
            ?? mainContentArea.querySelector('.col-xs-12.col-md-12.list-container')
            ?? mainContentArea.querySelector('.sonata-ba-list .col-xs-12');
        
        if (newRow && currentRow) {
            currentRow.replaceWith(newRow);
            return;
        }

        if (newRow && !currentRow) {
            let listRow = mainContentArea.querySelector('.row.sonata-ba-list');

            if (!listRow) {
                listRow = document.createElement('div');
                listRow.classList.add('row', 'sonata-ba-list');
                mainContentArea.appendChild(listRow);
            }

            listRow.replaceChildren(newRow);
            return;
        }

        if (!newRow && currentRow) {
            const listRow = currentRow.closest('.sonata-ba-list');
            if (listRow && listRow.children.length === 1) {
                listRow.remove();
            } else {
                currentRow.remove();
            }
        }
    }
}
