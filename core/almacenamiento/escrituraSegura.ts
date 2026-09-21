/**
 * Escritura de archivos a prueba de carreras y de cortes de luz.
 *
 * Dos problemas reales que resuelve:
 *
 * 1. **Escrituras simultáneas.** La interfaz guarda en cada pulsación, así que
 *    llegan varias escrituras casi a la vez. Con un único archivo temporal fijo,
 *    la primera lo renombraba y la segunda fallaba con ENOENT porque el temporal
 *    ya no existía — el usuario veía «No se pudieron guardar los cambios» y el
 *    cambio se perdía. La cola garantiza que sólo haya una escritura en vuelo, y
 *    el nombre temporal único evita que dos se pisen.
 *
 * 2. **Escritura a medias.** Se escribe primero en un temporal y luego se
 *    renombra. El renombrado es atómico dentro del mismo volumen, así que el
 *    archivo final nunca queda parcialmente escrito.
 */

import { promises as fs } from 'node:fs';
import { dirname } from 'node:path';

/** Una cola por archivo: dos archivos distintos no necesitan esperarse. */
const colas = new Map<string, Promise<void>>();

/**
 * Guarda `contenido` en `ruta`, en orden y sin pisarse con otras llamadas.
 *
 * El contenido se captura en el momento de la llamada, así que aunque varias
 * escrituras se encolen, cada una escribe exactamente lo que le correspondía.
 */
export function escribirEnCola(ruta: string, contenido: string): Promise<void> {
  const anterior = colas.get(ruta) ?? Promise.resolve();

  const siguiente = anterior
    // Un fallo previo no debe bloquear las escrituras que vienen detrás.
    .catch(() => undefined)
    .then(() => escribirAtomico(ruta, contenido));

  colas.set(ruta, siguiente);
  return siguiente;
}

/** Escritura atómica: temporal único + renombrado. */
export async function escribirAtomico(ruta: string, contenido: string): Promise<void> {
  await fs.mkdir(dirname(ruta), { recursive: true });

  const temporal = `${ruta}.${process.pid}.${Date.now().toString(36)}.${Math.random()
    .toString(36)
    .slice(2, 8)}.tmp`;

  try {
    await fs.writeFile(temporal, contenido, 'utf8');
    await fs.rename(temporal, ruta);
  } catch (e) {
    // Si algo falla, no dejar basura suelta junto al archivo de datos.
    await fs.unlink(temporal).catch(() => undefined);
    throw e;
  }
}

/** Espera a que terminen las escrituras pendientes de un archivo. */
export function esperarEscrituras(ruta: string): Promise<void> {
  return (colas.get(ruta) ?? Promise.resolve()).catch(() => undefined);
}
