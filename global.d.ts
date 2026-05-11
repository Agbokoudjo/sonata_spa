import { fetchErrorTranslator, appTranslation } from "@wlindabla/form_validator";

declare global {
  interface Window {
	SonataTranslator: typeof appTranslation;
	fetchErrorTranslator: typeof fetchErrorTranslator;
	}
}