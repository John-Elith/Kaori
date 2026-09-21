/**
 * Reproduce el fallo que veía el usuario:
 *
 *   No se pudieron guardar los cambios: ENOENT, rename
 *   'datos.json.tmp' -> 'datos.json'
 *
 * Ocurría porque el asistente de mapeo guarda en cada pulsación y dos
 * escrituras simultáneas compartían el mismo archivo temporal: la primera lo
 * renombraba y la segunda ya no lo encontraba.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { promises as fs } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  escribirEnCola,
  escribirAtomico,
  esperarEscrituras,
} from '../core/almacenamiento/escrituraSegura';

let carpeta: string;
let archivo: string;

beforeEach(async () => {
  carpeta = await fs.mkdtemp(join(tmpdir(), 'kaori-prueba-'));
  archivo = join(carpeta, 'datos.json');
});

afterEach(async () => {
  await fs.rm(carpeta, { recursive: true, force: true });
});

describe('escrituraAtomica', () => {
  it('crea la carpeta si no existe', async () => {
    const anidado = join(carpeta, 'a', 'b', 'datos.json');
    await escribirAtomico(anidado, 'hola');
    expect(await fs.readFile(anidado, 'utf8')).toBe('hola');
  });

  it('no deja archivos temporales tras escribir', async () => {
    await escribirAtomico(archivo, '{"a":1}');
    const restantes = await fs.readdir(carpeta);
    expect(restantes).toEqual(['datos.json']);
  });

  it('sobrescribe el contenido anterior', async () => {
    await escribirAtomico(archivo, 'primero');
    await escribirAtomico(archivo, 'segundo');
    expect(await fs.readFile(archivo, 'utf8')).toBe('segundo');
  });
});

describe('escrituras simultáneas', () => {
  it('veinte guardados a la vez no fallan ni dejan basura', async () => {
    // Sin la cola, esto lanzaba ENOENT en casi todas las escrituras.
    const escrituras = Array.from({ length: 20 }, (_, i) =>
      escribirEnCola(archivo, JSON.stringify({ paso: i })),
    );

    await expect(Promise.all(escrituras)).resolves.toBeDefined();

    const restantes = await fs.readdir(carpeta);
    expect(restantes).toEqual(['datos.json']);
  });

  it('gana la última escritura, no una intermedia', async () => {
    for (let i = 0; i < 15; i++) {
      void escribirEnCola(archivo, JSON.stringify({ paso: i }));
    }
    await esperarEscrituras(archivo);

    const final = JSON.parse(await fs.readFile(archivo, 'utf8'));
    expect(final.paso).toBe(14);
  });

  it('el archivo nunca queda a medias', async () => {
    // Cada escritura deja un JSON válido y completo; una lectura en cualquier
    // momento debe poder parsearlo.
    const grande = { datos: 'x'.repeat(200_000) };
    const escrituras = Array.from({ length: 10 }, () =>
      escribirEnCola(archivo, JSON.stringify(grande)),
    );
    await Promise.all(escrituras);

    const leido = JSON.parse(await fs.readFile(archivo, 'utf8'));
    expect(leido.datos).toHaveLength(200_000);
  });

  it('un fallo no bloquea las escrituras siguientes', async () => {
    // Una ruta imposible hace fallar la primera escritura.
    const imposible = join(carpeta, 'datos.json', 'no-puede-ser', 'x.json');
    await fs.writeFile(archivo, 'ocupado');

    const fallida = escribirEnCola(imposible, 'nada').catch(() => 'falló');
    const buena = escribirEnCola(archivo, 'sí funcionó');

    expect(await fallida).toBe('falló');
    await expect(buena).resolves.toBeUndefined();
    expect(await fs.readFile(archivo, 'utf8')).toBe('sí funcionó');
  });

  it('archivos distintos no se esperan entre sí', async () => {
    const otro = join(carpeta, 'plantillas.json');
    await Promise.all([
      escribirEnCola(archivo, 'uno'),
      escribirEnCola(otro, 'dos'),
    ]);
    expect(await fs.readFile(archivo, 'utf8')).toBe('uno');
    expect(await fs.readFile(otro, 'utf8')).toBe('dos');
  });
});
