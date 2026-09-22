/// <reference types="vitest" />
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import electron from 'vite-plugin-electron/simple';
import { resolve } from 'node:path';

/**
 * El proceso principal y el preload se compilan a CommonJS.
 *
 * No hay `"type": "module"` en package.json, así que vite-plugin-electron emite
 * CommonJS por defecto y resuelve él mismo la interoperación con `electron` y
 * con las dependencias CJS que se usan en el proceso principal (pizzip, pdfjs,
 * tesseract). El renderer sí es ESM, como corresponde.
 */
export default defineConfig({
  resolve: {
    alias: {
      '@core': resolve(__dirname, 'core'),
      '@src': resolve(__dirname, 'src'),
    },
  },
  plugins: [
    react(),
    electron({
      main: {
        entry: 'electron/main.ts',
        vite: {
          build: {
            rollupOptions: {
              // El reconocimiento de voz carga binarios nativos (.node, .dll)
              // que no se pueden meter en un paquete de JavaScript: se dejan
              // fuera y se cargan de node_modules al usarse.
              // Tesseract (el OCR sin conexión) lanza un proceso auxiliar con un
              // archivo propio: empaquetado, no lo encontraba y la lectura se
              // quedaba esperando para siempre.
              external: [
                '@huggingface/transformers',
                'onnxruntime-node',
                'onnxruntime-web',
                'sharp',
                'tesseract.js',
              ],
            },
          },
        },
      },
      preload: { input: resolve(__dirname, 'electron/preload.ts') },
      renderer: {},
    }),
  ],
  test: {
    globals: true,
    environment: 'node',
    include: ['tests/**/*.test.ts'],
  },
});
