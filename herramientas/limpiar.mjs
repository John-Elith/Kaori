// Borra la compilación anterior del proceso principal antes de compilar.
//
// Vite no vacía dist-electron por su cuenta, así que cada compilación dejaba
// sus trozos al lado de los anteriores: llegaron a acumularse un centenar, y
// el instalador los metía todos.
import { rmSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

rmSync(fileURLToPath(new URL('../dist-electron', import.meta.url)), { recursive: true, force: true });
