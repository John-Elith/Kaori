/**
 * Persistencia en un archivo JSON dentro de la carpeta de datos del usuario.
 *
 * Se descartó SQLite a propósito: obliga a recompilar un módulo nativo y no
 * aporta nada para el volumen esperado (cientos de contratos). Un JSON es
 * inspeccionable, respaldable copiando un archivo, y no puede corromperse por
 * una versión incompatible de una librería nativa.
 *
 * La escritura es atómica (archivo temporal + rename) para que un corte de luz
 * a mitad de guardado no deje la base a medias.
 */

import { app } from 'electron';
import { promises as fs } from 'node:fs';
import { join, dirname } from 'node:path';
import type { BaseDeDatos } from '../core/modelo/tipos';
import { escribirEnCola } from '../core/almacenamiento/escrituraSegura';
import { depurarPapelera } from '../core/modelo/papelera';
import { podarHistorial } from '../core/modelo/historial';
import { AJUSTES_INICIALES } from '../core/modelo/tipos';

let rutaBase: string | null = null;

export function rutaDeDatos(): string {
  if (!rutaBase) rutaBase = join(app.getPath('userData'), 'datos.json');
  return rutaBase;
}

export function carpetaDePlantillas(): string {
  return join(app.getPath('userData'), 'plantillas');
}

function baseVacia(): BaseDeDatos {
  return {
    version: 1,
    contratistas: [],
    contratos: [],
    informes: [],
    certificados: [],
    papelera: [],
    ajustes: {
      ...AJUSTES_INICIALES,
      carpetaSalida: join(app.getPath('documents'), 'Informes de Contrato'),
    },
  };
}

/**
 * Traslada los datos de la versión anterior, cuando el programa se llamaba
 * "programa-alcaldia" y guardaba en otra carpeta.
 *
 * Se ejecuta una sola vez: sólo actúa si la carpeta nueva aún no tiene datos.
 * Sin esto, al renombrar el programa a Kaori los contratos y las plantillas ya
 * registrados quedarían huérfanos en la carpeta vieja.
 */
async function migrarDesdeNombreAnterior(): Promise<void> {
  const nueva = rutaDeDatos();
  try {
    await fs.access(nueva);
    return; // ya hay datos con el nombre nuevo: nada que migrar
  } catch {
    /* seguir */
  }

  const anterior = join(app.getPath('appData'), 'programa-alcaldia');
  try {
    await fs.access(join(anterior, 'datos.json'));
  } catch {
    return; // no hay instalación anterior
  }

  try {
    await fs.mkdir(dirname(nueva), { recursive: true });
    await fs.copyFile(join(anterior, 'datos.json'), nueva);

    // Las plantillas viven aparte y también hay que traerlas.
    const plantillasViejas = join(anterior, 'plantillas');
    const plantillasNuevas = carpetaDePlantillas();
    const archivos = await fs.readdir(plantillasViejas).catch(() => [] as string[]);
    if (archivos.length > 0) {
      await fs.mkdir(plantillasNuevas, { recursive: true });
      for (const nombre of archivos) {
        await fs
          .copyFile(join(plantillasViejas, nombre), join(plantillasNuevas, nombre))
          .catch(() => undefined);
      }
    }

    console.log(`Datos migrados desde ${anterior} a ${dirname(nueva)}.`);
  } catch (e) {
    // Que falle la migración no debe impedir abrir el programa; los datos
    // antiguos siguen intactos en su carpeta.
    console.error('No se pudieron migrar los datos anteriores:', e);
  }
}

let cache: BaseDeDatos | null = null;

export async function leer(): Promise<BaseDeDatos> {
  if (cache) return cache;

  await migrarDesdeNombreAnterior();

  try {
    const texto = await fs.readFile(rutaDeDatos(), 'utf8');
    const datos = JSON.parse(texto) as BaseDeDatos;

    // Rellenar campos que falten si el archivo viene de una versión anterior,
    // y aplicar de entrada los dos límites: los 30 días de la papelera y el
    // tope del historial. Un archivo de una versión sin tope puede traer
    // cientos de informes anotados.
    cache = podarHistorial(
      depurarPapelera({
        ...baseVacia(),
        ...datos,
        papelera: datos.papelera ?? [],
        certificados: datos.certificados ?? [],
        ajustes: { ...baseVacia().ajustes, ...datos.ajustes },
      }),
    );
    return cache;
  } catch (e: unknown) {
    const err = e as NodeJS.ErrnoException;
    if (err.code === 'ENOENT') {
      cache = baseVacia();
      return cache;
    }
    // Un JSON corrupto no debe impedir abrir el programa: se respalda y se
    // arranca en limpio, avisando por consola dónde quedó el archivo anterior.
    const respaldo = `${rutaDeDatos()}.roto-${Date.now()}`;
    try {
      await fs.rename(rutaDeDatos(), respaldo);
      console.error(
        `El archivo de datos estaba dañado. Se guardó una copia en ${respaldo}.`,
      );
    } catch {
      /* si tampoco se puede renombrar, se continúa igual */
    }
    cache = baseVacia();
    return cache;
  }
}

export function escribir(datos: BaseDeDatos): Promise<void> {
  cache = datos;
  // El contenido se serializa aquí, no dentro de la cola, para capturar el
  // estado exacto de esta llamada aunque después lleguen otras.
  return escribirEnCola(rutaDeDatos(), JSON.stringify(datos, null, 2));
}

/** Lee, aplica un cambio y guarda. Devuelve la base ya actualizada. */
export async function actualizar(
  cambio: (base: BaseDeDatos) => BaseDeDatos,
): Promise<BaseDeDatos> {
  const actual = await leer();
  const nueva = cambio(structuredClone(actual));
  await escribir(nueva);
  return nueva;
}

export function nuevoId(prefijo: string): string {
  return `${prefijo}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}
