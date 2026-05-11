import { defineConfig } from 'tsup';

/**
 * Entry points — what the developer can import.
 *
 * NOT included (internal):
 *   - Binding/       → BindingManagers are internal
 *   - DomReinit/     → DomManager is internal
 *   - Fetcher/       → Fetchers are internal
 *   - Router/        → RouteResolver/RequestMatcher sealed with create()
 *   - ParameterBag/  → SpaParameterBag is internal
 *   - Kernel/        → SpaKernel exported via index only
 */
const entries = {
  index: 'src/index.ts',
  events: 'src/Events/index.ts',

  subscribers: 'src/Subscribers/index.ts',
  contracts: 'src/contracts/index.ts',
  http: 'src/Http/index.ts',
  exceptions: 'src/Exceptions/index.ts',
  extension: 'src/Extension/index.ts',
  swapper: 'src/DomSwapper/index.ts',
  logger: 'src/Logger/index.ts',
  types: 'src/types/index.ts',
};

export default defineConfig([
  // ── ESM build ─────────────────────────────────────────────────────────
  {
    entry: entries,
    format: ['esm'],
    dts: true,
    sourcemap: true,
    clean: true,
    bundle: true,
    splitting: true,   // chunks partagés → pas de duplication
    treeshake: true,
    minify: false,
    target: 'esnext',
    outDir: 'dist/esm',
    tsconfig: './tsconfig.json',
    keepNames: true,
    esbuildOptions(options) {
      options.target = 'esnext';
    },
    outExtension: () => ({ js: '.js' }),
  },
  // ── CJS build ─────────────────────────────────────────────────────────
  {
    entry: entries,
    format: ['cjs'],
    dts: true,
    splitting: true,
    sourcemap: true,
    clean: false,      // false → ne pas effacer dist/esm déjà généré
    treeshake: false,
    bundle: false,
    minify: false,
    target: 'esnext',
    outDir: 'dist/cjs',
    tsconfig: './tsconfig.json',
    keepNames: true,
    esbuildOptions(options) {
      options.target = 'esnext';
    },
    outExtension: () => ({ js: '.js' }),
  }
]);