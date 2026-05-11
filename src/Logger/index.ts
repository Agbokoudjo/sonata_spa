/**
 * @wlindabla/sonata_spa — SonataSpaLogger
 * Wraps @wlindabla/form_validator Logger utility.
 * @author AGBOKOUDJO Franck <internationaleswebservices@gmail.com>
 */

import { Logger } from '@wlindabla/form_validator/utils';
import type { APP_ENV } from '../types';

/**
 * Logger for @wlindabla/sonata_spa.
 * Delegates to @wlindabla/form_validator Logger.
 * Only active when env !== "prod".
 * @author AGBOKOUDJO Franck <internationaleswebservices@gmail.com>
 */
export class SonataSpaLogger {

    static config(env: APP_ENV, debug: boolean): void {
        Logger.config(env, debug);
    }

    static log(...args: any[]): void {
        Logger.log(args);
    }

    static info(...args: any[]): void {
        Logger.info(args);
    }

    static warn(...args: any[]): void {
        Logger.warn(args);
    }

    static error(...args: any[]): void {
        Logger.error(args);
    }
}