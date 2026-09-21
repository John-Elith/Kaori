import { defineConfig } from 'vitest/config';
import { resolve } from 'node:path';

/**
 * Configuración propia para las pruebas, separada de `vite.config.ts`.
 *
 * Las pruebas ejercitan `core/`, que es lógica pura de Node. El plugin de
 * Electron que usa la aplicación reescribe los módulos nativos (`node:fs`,
 * `node:path`) para el renderer, y eso rompe cualquier prueba que lea un
 * archivo del disco. Aquí no se carga ese plugin.
 */
export default defineConfig({
  resolve: {
    alias: {
      '@core': resolve(__dirname, 'core'),
      '@src': resolve(__dirname, 'src'),
    },
  },
  test: {
    globals: true,
    environment: 'node',
    include: ['tests/**/*.test.ts'],
  },
});
