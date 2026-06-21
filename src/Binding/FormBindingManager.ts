/**
 * @wlindabla/sonata_spa — FormBindingManager
 * Intercepts Sonata form submissions.
 * Integrates @wlindabla/form_validator for client-side validation.
 * Dispatches spa:form:submit for FormSubscriber to handle.
 * @author AGBOKOUDJO Franck <internationaleswebservices@gmail.com>
 */

import type { BrowserEventDispatcher } from '@wlindabla/event_dispatcher/browser';
import { FieldValidationEventData, FormValidateController } from '@wlindabla/form_validator';
import type { BindingManagerInterface, RouteResolverInterface } from '../contracts';
import { SpaEvents, SpaFormSubmitEvent } from '../Events';
import { SonataSpaLogger } from '../Logger';

/**
 * Manages Sonata form submissions with client-side validation.
 *
 * Responsibilities:
 *   1. Find Sonata forms (.sonata-ba-form form) in the content area
 *   2. Initialize @wlindabla/form_validator FormValidateController on each form
 *   3. Keep submit button disabled while form is invalid
 *   4. On valid submit → dispatch spa:form:submit → FormSubscriber handles POST
 *
 * Client-side validation flow:
 *   User fills form fields
 *     → form_validator validates in real-time (blur/input events)
 *     → submit button disabled if any field invalid
 *     → submit button enabled when all fields valid
 *     → User clicks submit
 *     → FormBindingManager intercepts submit event
 *     → Runs final validation check
 *     → If valid → dispatch spa:form:submit
 *     → FormSubscriber handles the HTTP POST
 *
 * HTML structure for forms (AdminLTE 4 + Bootstrap 5):
 * ```html
 * <div class="sonata-ba-form">
 *   <form
 *     class="form-validate"
 *     method="POST"
 *     action="/admin/app/user/create"
 *     novalidate
 *   >
 *     <input
 *       type="text"
 *       name="user[name]"
 *       id="user_name"
 *       data-event-validate="blur"
 *       data-event-validate-blur="blur"
 *       required
 *     />
 *     <button type="submit" class="btn btn-primary">Save</button>
 *   </form>
 * </div>
 * ```
 * @author AGBOKOUDJO Franck <internationaleswebservices@gmail.com>
 */
export class FormBindingManager implements BindingManagerInterface {
    private static _instance: FormBindingManager | null = null;

    /** Track bound forms to avoid double binding */
    private boundForms = new WeakSet<HTMLFormElement>();

    /** FormValidateController instances keyed by form element */
    private formControllers = new WeakMap<HTMLFormElement, FormValidateController>();

    private constructor(
        private readonly dispatcher: BrowserEventDispatcher,
        private readonly mainContentArea: HTMLElement,
        private readonly routeResolver: RouteResolverInterface
    ) { }

    public static create(
        dispatcher: BrowserEventDispatcher,
        mainContentArea: HTMLElement,
        routeResolver: RouteResolverInterface
    ): FormBindingManager {
        if (FormBindingManager._instance) {
            SonataSpaLogger.warn('[FormBindingManager] Instance already exists — returning existing.');
            return FormBindingManager._instance;
        }
        
        FormBindingManager._instance = new FormBindingManager(dispatcher, mainContentArea, routeResolver);
        return FormBindingManager._instance;
    }

    public static reset(): void {
        FormBindingManager._instance = null;
    }
    
    /**
     * Initial binding on boot.
     * Handles forms that may already be present on the initial page.
     */
    public bind(): void {
        this.bindForms(this.mainContentArea);
    }

    /**
     * Rebind after DOM swap.
     * Called after each spa:dom:ready with the new container.
     * New forms appeared in the swapped content — bind them.
     *
     * @param container - The newly swapped container element
     */
    public rebind(container: HTMLElement): void {
        this.bindForms(container);
    }

    /**
     * Find and bind all Sonata forms within a container.
     *
     * Sonata form classes (from real form.html.twig):
     *   class="form-validate form-submit crud-entity form-submission-handle-auto formcreate"
     *   class="form-validate form-submit crud-entity form-submission-handle-auto formedit"
     *
     * @param container - The container to search within
     */
    private bindForms(container: HTMLElement): void {
        const forms = container.querySelectorAll<HTMLFormElement>(
            '.sonata-ba-form form.form-validate'
        );

        forms.forEach((form) => {
            if (this.boundForms.has(form)) return;
            this.boundForms.add(form);

            this.initializeFormValidator(form);
            this.trackSubmitterButton(form);
            this.bindFormSubmit(form);
        });
    }

    /**
     * Track which submit button was clicked on a form.
     * Sonata forms have multiple submit buttons with different name attributes:
     *   btn_update_and_list, btn_update_and_edit, btn_preview,
     *   btn_create_and_list, btn_create_and_edit, btn_create_and_create
     *
     * We store the last clicked button so bindFormSubmit() can read it
     * from SubmitEvent.submitter or our tracked reference.
     */
    private trackSubmitterButton(form: HTMLFormElement): void {
        form.querySelectorAll<HTMLButtonElement>('button[type="submit"][name]').forEach((btn) => {
            btn.addEventListener('click', () => {
                // Store which button was clicked — SubmitEvent.submitter
                // is not always reliable cross-browser so we track it ourselves
                form.dataset['lastSubmitter'] = btn.getAttribute('name') ?? '';
            });
        });
    }

    /**
     * Initialize @wlindabla/form_validator FormValidateController on a form.
     * This sets up real-time validation on all form fields and manages
     * the submit button disabled state.
     *
     * Only initializes if the form has the 'form-validate' class
     * (Sonata forms that opt-in to client-side validation).
     *
     * @param form - The form element to initialize validation on
     */
    private initializeFormValidator(form: HTMLFormElement): void {
        if (!form.classList.contains('form-validate')) return;

        try {
            const controller = new FormValidateController(`#${form.id}`);
            this.formControllers.set(form, controller);

            // Bind validation events using the controller
            this.bindValidationEvents(form, controller);

        } catch (error) {
            console.warn('[FormBindingManager] Could not initialize form validator:', error);
        }
    }

    /**
     * Bind all validation events on the form using event delegation.
     * One listener per event type on the form — no per-field listeners.
     *
     * blur/focus require capture phase (true) because they do not bubble natively.
     * input, change, dragenter, drop bubble naturally (false).
     *
     * @param form       - The form element — single delegation point
     * @param controller - The FormValidateController instance
     */
    private bindValidationEvents(
        form: HTMLFormElement,
        controller: FormValidateController
    ): void {
        // Build CSS selector strings from the controller's ID lists
        const selectorBlur = controller.idChildrenUsingEventBlur;
        const selectorInput = controller.idChildrenUsingEventInput;
        const selectorChange = controller.idChildrenUsingEventChange;
        const selectorDragenter =controller.idChildrenUsingEventDragenter;
        const selectorDrop = controller.idChildrenUsingEventDrop;
        const selectorDragleave = controller.idChildrenUsingEventDragleave;
        // Blur validation — validate on field blur
        form.addEventListener('blur', async (e: FocusEvent) => {
            const target = e.target as HTMLElement;
            if (!selectorBlur.includes(target.id)) return;

            if (
                (target instanceof HTMLInputElement ||
                 target instanceof HTMLTextAreaElement) &&
                target.type !== 'file'
            ) {
                await controller.validateChildrenForm(target);
            }

            //for input filed don't drap and drop
            if (
                target instanceof HTMLInputElement &&
                target.type === 'file'
            ) {
                controller.clearErrorDataChildren(target);
            }

        }, true); 

        // Input — clear errors on input
        form.addEventListener('input', (e: Event) => {
            const target = e.target as HTMLElement;
            if (!selectorInput.includes(target.id)) return;

            if (
                (target instanceof HTMLInputElement ||
                    target instanceof HTMLTextAreaElement) &&
                target.type !== 'file'
            ) {
                controller.clearErrorDataChildren(target);
            }
        },true);

        // Change — validate file inputs and selects
        form.addEventListener('change', async (e: Event) => {
            const target = e.target as HTMLElement;
            if (!selectorChange.includes(target.id)) return;

            if (
                target instanceof HTMLInputElement &&
                target.type === 'file'
            ) {
                await controller.validateChildrenForm(target);
            }
        },true);

        // Dragenter — clear errors on file drag
        form.addEventListener('dragenter', (e: DragEvent) => {
            const target = e.target as HTMLElement;
            if (!selectorDragenter.includes(target.id)) return;

            if (
                target instanceof HTMLInputElement &&
                target.type === 'file'
            ) {
                controller.clearErrorDataChildren(target);
            }
        },true);

        form.addEventListener('dragleave', (e: DragEvent) => {
            const target = e.target as HTMLElement;
            if (!selectorDragleave.includes(target.id)) return;

            if (
                target instanceof HTMLInputElement &&
                target.type === 'file'
            ) {
                controller.clearErrorDataChildren(target);
            }
        }, true);

        form.addEventListener('drop', async (e: DragEvent) => {
            const target = e.target as HTMLElement;
            if (!selectorDrop.includes(target.id)) return;
                e.preventDefault();
            if (
                target instanceof HTMLInputElement &&
                target.type === 'file'
            ) {
                await controller.validateChildrenForm(target);
            }
        },true);

        // Listen to validation events to update submit button state
        form.addEventListener('field:validation:failed', (event) => {
            const data = (event as CustomEvent).detail as FieldValidationEventData;
            this.updateSubmitButtonState(form, false);
            console.log('field:validation:failed',data)
            controller.addErrorMessageChildrenForm(
                data.targetChildrenForm,
                data.message!,
                'container-div-error-message');
        },true);

        form.addEventListener('field:validation:success',(event) => {
            const data = (event as CustomEvent).detail as FieldValidationEventData;
            controller.clearErrorDataChildren(data.targetChildrenForm);
           this.updateSubmitButtonState(form,true);
        },true);
    }

    /**
     * Bind form submit interception.
     * Captures the clicked submitter button and passes it to SpaFormSubmitEvent.
     * FormSubscriber uses the submitter name to know which Sonata action to perform.
     *
     * Also handles data-iwas-confirm — FormSubmission from @wlindabla/form_validator
     * reads this attribute on the submitter button to show a confirmation dialog.
     *
     * @param form - The form element to bind submit on
     */
    private bindFormSubmit(form: HTMLFormElement): void {
        form.addEventListener('submit', async (e: SubmitEvent) => {
            e.preventDefault();

            const controller = this.formControllers.get(form);

            // Run final validation if form_validator is initialized
            if (controller) {
                const isValid = await controller.isFormValid(); 
                if (!isValid) {
                    this.updateSubmitButtonState(form, false);
                    return;
                }
            }

            // Get the clicked submit button
            // Priority: SubmitEvent.submitter → tracked dataset → first submit button
            const submitter = (
                e.submitter as HTMLButtonElement | null
            ) ?? (
                    form.querySelector<HTMLButtonElement>(
                        `button[type="submit"][name="${form.dataset['lastSubmitter'] ?? ''}"]`
                    )
                ) ?? (
                    form.querySelector<HTMLButtonElement>('button[type="submit"]')
                );

            // Resolve route from form action
            const formAction = form.getAttribute('action') ?? window.location.href;
            const routeMatch = this.routeResolver.resolve(formAction);

            // Dispatch spa:form:submit with submitter button info
            // FormSubscriber handles the HTTP POST via FormSubmission
            // which also reads data-iwas-confirm from the submitter button
            const formSubmitEvent = new SpaFormSubmitEvent(form, routeMatch, submitter);
            await this.dispatcher.dispatchAsync(formSubmitEvent, SpaEvents.FORM_SUBMIT);

            // Clean up tracked submitter
            delete form.dataset['lastSubmitter'];
        });
    }

     /**
     * Enable or disable all submit buttons on a form.
     *
     * Manages both the native `disabled` attribute and the Bootstrap `.disabled`
     * class to ensure consistent visual and functional state across browsers.
     *
     * Uses querySelectorAll scoped to the form — safe because submit buttons
     * are never shared across forms.
     *
     * @param form    - The form element whose submit buttons to update
     * @param enabled - true to enable all submit buttons, false to disable them
     */
    private updateSubmitButtonState(form: HTMLFormElement, enabled: boolean): void {
        form.querySelectorAll<HTMLButtonElement>('button[type="submit"]')
            .forEach((btn) => {
                btn.disabled = !enabled;
                btn.classList.toggle('disabled', !enabled);
                // Bootstrap 5 also reads aria-disabled for accessibility
                btn.setAttribute('aria-disabled', String(!enabled));
            });
    }

    /**
     * Check overall form validity and update submit button state accordingly.
     * Always checks ALL fields — not just the one that just changed.
     *
     * @param form       - The form element
     * @param controller - The FormValidateController instance
     */
    private async checkFormValidityAndUpdateButton(
        form: HTMLFormElement,
        controller: FormValidateController
    ): Promise<void> {
        const isValid = await controller.isFormValid();
        this.updateSubmitButtonState(form, isValid);
    }

    /**
     * Build a CSS selector string from a list of element IDs.
     * Equivalent of jQuery's addHashToIds(ids).join(",").
     *
     * @param ids - Array of element IDs (without #)
     * @returns CSS selector string like "#id1, #id2, #id3"
     *          or empty string if the array is empty
     *
     * @example
     * buildSelector(['user_name', 'user_email'])
     * // → '#user_name, #user_email'
     */
    private buildSelector(ids: string[]): string {
        if (ids.length === 0) return '';
        return ids.map(id => `#${id}`).join(', ');
    }
}
