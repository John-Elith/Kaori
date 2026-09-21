import type { BrowserWindow } from 'electron';
import { avisarATodos, manejar } from '../canales';
import { repararCamposCruzados } from '../../core/docx/repararMapa';
import { promises as fs } from 'node:fs';
import { join } from 'node:path';

import { abrirDocx, normalizarDocumento, guardarDocx } from '../../core/docx/leerDocx';
import { construirMapa } from '../../core/docx/mapaTexto';
import { detectar } from '../../core/docx/detectarCampos';
import { mapaVacio, type MapaPlantilla } from '../../core/docx/mapaPlantilla';
import { olfatearTipo } from '../../core/docx/tipoDelDocumento';
import { valoresDelRegistro } from '../../core/docx/valoresConocidos';
import { leer as leerDatos } from '../almacen';
import type { CampoId, TipoDocumento } from '../../core/docx/campos';
import { carpetaDePlantillas, nuevoId } from '../almacen';
import { escribirEnCola } from '../../core/almacenamiento/escrituraSegura';
import { DIAS_EN_PAPELERA } from '../../core/modelo/tipos';
import {
  haCaducado,
  type PlantillaEnPapelera,
} from '../../core/modelo/papeleraPlantillas';

const INDICE = 'indice.json';
const PAPELERA = 'papelera.json';
/** Los .docx de las plantillas eliminadas esperan aquí su recuperación. */
const CARPETA_PAPELERA = 'papelera';

async function rutaEn(archivo: string): Promise<string> {
  const carpeta = carpetaDePlantillas();
  await fs.mkdir(carpeta, { recursive: true });
  return join(carpeta, archivo);
}

async function leerJson<T>(archivo: string, vacio: T): Promise<T> {
  try {
    return JSON.parse(await fs.readFile(await rutaEn(archivo), 'utf8')) as T;
  } catch {
    return vacio;
  }
}

function escribirJson(archivo: string, valor: unknown): Promise<void> {
  // Misma utilidad que la base de datos, por el mismo motivo: evitar carreras.
  return rutaEn(archivo).then((ruta) =>
    escribirEnCola(ruta, JSON.stringify(valor, null, 2)),
  );
}

const leerIndice = () => leerJson<MapaPlantilla[]>(INDICE, []);
const escribirIndice = (lista: MapaPlantilla[]) => escribirJson(INDICE, lista);

/**
 * Papelera de plantillas, ya depurada.
 *
 * Lo caducado se borra al consultarla, que es cuando importa: no hace falta un
 * proceso en segundo plano para algo que sólo tiene que dejar de aparecer.
 */
async function leerPapelera(): Promise<PlantillaEnPapelera[]> {
  const entradas = await leerJson<PlantillaEnPapelera[]>(PAPELERA, []);
  const vigentes = entradas.filter((e) => !haCaducado(e));
  if (vigentes.length !== entradas.length) {
    for (const e of entradas.filter((x) => haCaducado(x))) {
      await fs.unlink(e.mapa.archivo).catch(() => undefined);
    }
    await escribirJson(PAPELERA, vigentes);
  }
  return vigentes;
}

/**
 * Los datos del registro que aparecen en la plantilla, más los que venga a
 * indicar la interfaz.
 *
 * Lo que llegue por parámetro manda: es una indicación explícita de quien está
 * mapeando, y pesa más que una coincidencia encontrada por el programa.
 */
async function conocidos(
  texto: string,
  explicitos?: Partial<Record<CampoId, string>>,
): Promise<Partial<Record<CampoId, string>>> {
  try {
    const base = await leerDatos();
    return { ...valoresDelRegistro(texto, base), ...explicitos };
  } catch {
    // Que no se pueda leer la base no debe impedir mapear una plantilla.
    return explicitos ?? {};
  }
}

/**
 * Repasa las plantillas guardadas y devuelve a su campo las apariciones que
 * quedaron cruzadas (ver core/docx/repararMapa.ts). Se hace al abrir Kaori:
 * así las plantillas registradas antes de la corrección se arreglan solas, sin
 * que nadie tenga que volver a mapearlas.
 */
async function repararPlantillasGuardadas(): Promise<void> {
  const lista = await leerIndice();
  let cambio = false;
  for (let i = 0; i < lista.length; i++) {
    try {
      const doc = abrirDocx(await fs.readFile(lista[i].archivo));
      const r = repararCamposCruzados(lista[i], construirMapa(doc.partes));
      if (r.reparaciones.length > 0) {
        lista[i] = r.mapa;
        cambio = true;
        for (const x of r.reparaciones) {
          console.log(
            `Plantilla «${lista[i].nombre}»: «${x.texto}» pasa de ${x.tomadoDe} a ${x.campo}.`,
          );
        }
      }
    } catch {
      // Una plantilla cuyo archivo no se puede leer se deja como está: ya
      // avisará al intentar generar con ella.
    }
  }
  if (cambio) {
    await escribirIndice(lista);
    avisarATodos('datos:cambiados', { canal: 'plantillas:reparar' });
  }
}

export function registrarCanalesPlantillas(_ventana: () => BrowserWindow | null): void {
  void repararPlantillasGuardadas();

  /**
   * Registra un .docx como plantilla.
   *
   * El paso decisivo es normalizar los runs ANTES de guardar: a partir de ahí,
   * el archivo de la plantilla no vuelve a cambiar nunca, y por eso los offsets
   * del mapa de campos siguen siendo válidos indefinidamente.
   */
  manejar(
    'plantillas:registrar',
    async (
      _e,
      ruta: string,
      nombre: string,
      tipo: TipoDocumento = 'informe',
      valoresConocidos?: Partial<Record<CampoId, string>>,
    ) => {
      const original = await fs.readFile(ruta);
      const doc = normalizarDocumento(abrirDocx(original));
      const normalizado = guardarDocx(doc, doc.partes);

      const id = nuevoId('pl');
      const carpeta = carpetaDePlantillas();
      await fs.mkdir(carpeta, { recursive: true });
      const destino = join(carpeta, `${id}.docx`);
      await fs.writeFile(destino, normalizado);

      const texto = construirMapa(doc.partes);

      // Manda lo que diga el documento, no lo que se haya dejado en el
      // desplegable. Ese desplegable empieza en «Informe» y se pasa por alto,
      // y entonces un certificado se registraba como informe y no detectaba
      // ninguno de sus campos: el asistente salía con tres candidatos sueltos
      // y la plantilla no se podía asignar a nada.
      const olfateo = olfatearTipo(texto.texto);
      const usado = olfateo.confianza === 'ninguna' ? tipo : olfateo.tipo;

      const candidatos = detectar(texto, await conocidos(texto.texto, valoresConocidos), usado);

      const mapa: MapaPlantilla = { ...mapaVacio(id, nombre, destino), tipo: usado };
      const lista = await leerIndice();
      lista.push(mapa);
      await escribirIndice(lista);

      return {
        mapa,
        texto: texto.texto,
        candidatos,
        // Para que la interfaz pueda decir por qué lo clasificó así.
        olfateo: usado === tipo ? undefined : olfateo,
      };
    },
  );

  /** Relee una plantilla ya guardada, para retomar o revisar el mapeo. */
  manejar(
    'plantillas:inspeccionar',
    async (
      _e,
      mapa: MapaPlantilla,
      valoresConocidos?: Partial<Record<CampoId, string>>,
    ) => {
      const contenido = await fs.readFile(mapa.archivo);
      const doc = abrirDocx(contenido);
      const texto = construirMapa(doc.partes);
      const candidatos = detectar(
        texto,
        await conocidos(texto.texto, valoresConocidos),
        mapa.tipo ?? 'informe',
      );
      return { mapa, texto: texto.texto, candidatos };
    },
  );

  manejar('plantillas:listar', async () => leerIndice());

  /**
   * Cambia de qué documento es una plantilla ya registrada.
   *
   * Sirve para arreglar una que se subió con el tipo equivocado sin tener que
   * volver a subirla. El mapeo anterior **se descarta**, y no por comodidad: los
   * campos de un informe no existen en un certificado, así que conservarlos
   * dejaría ocurrencias apuntando a campos que ese documento no tiene y el
   * generador escribiría datos en sitios sin sentido.
   */
  manejar(
    'plantillas:cambiarTipo',
    async (_e, id: string, tipo: TipoDocumento) => {
      const lista = await leerIndice();
      const i = lista.findIndex((p) => p.id === id);
      if (i === -1) {
        return { ok: false as const, error: 'Esa plantilla ya no existe.' };
      }

      const mapa: MapaPlantilla = { ...lista[i], tipo, campos: [] };
      lista[i] = mapa;
      await escribirIndice(lista);

      const doc = abrirDocx(await fs.readFile(mapa.archivo));
      const texto = construirMapa(doc.partes);
      return {
        ok: true as const,
        mapa,
        texto: texto.texto,
        candidatos: detectar(texto, await conocidos(texto.texto), tipo),
      };
    },
  );

  manejar('plantillas:guardarMapa', async (_e, mapa: MapaPlantilla) => {
    const lista = await leerIndice();
    const i = lista.findIndex((p) => p.id === mapa.id);
    if (i === -1) lista.push(mapa);
    else lista[i] = mapa;
    await escribirIndice(lista);
    return { ok: true as const };
  });

  /**
   * Eliminar es enviar a la papelera, no borrar.
   *
   * Una plantilla cuesta subirla y mapearla campo por campo, y los contratos
   * la referencian por su id. Al conservar el id, recuperarla vuelve a
   * enlazarla sola con los contratos que la tenían asignada.
   *
   * El .docx se mueve a una subcarpeta en vez de copiarse: así no hay dos
   * archivos con el mismo contenido ocupando sitio, y el índice deja de verlo.
   */
  manejar('plantillas:eliminar', async (_e, id: string) => {
    const lista = await leerIndice();
    const plantilla = lista.find((p) => p.id === id);
    if (!plantilla) return { ok: true as const };

    await escribirIndice(lista.filter((p) => p.id !== id));

    const destino = join(carpetaDePlantillas(), CARPETA_PAPELERA, `${id}.docx`);
    await fs.mkdir(join(carpetaDePlantillas(), CARPETA_PAPELERA), { recursive: true });
    let archivo = plantilla.archivo;
    try {
      await fs.rename(plantilla.archivo, destino);
      archivo = destino;
    } catch {
      // Si el .docx ya no estaba, la entrada se guarda igual: al menos queda
      // constancia de qué se eliminó, y al recuperarla el aviso lo dirá.
    }

    const papelera = await leerPapelera();
    await escribirJson(PAPELERA, [
      { mapa: { ...plantilla, archivo }, eliminadaEn: new Date().toISOString() },
      ...papelera,
    ]);
    return { ok: true as const };
  });

  manejar('plantillas:papelera', async () => leerPapelera());

  manejar('plantillas:restaurar', async (_e, id: string) => {
    const papelera = await leerPapelera();
    const entrada = papelera.find((e) => e.mapa.id === id);
    if (!entrada) return { ok: false as const, error: 'Esa plantilla ya no está en la papelera.' };

    const destino = join(carpetaDePlantillas(), `${id}.docx`);
    try {
      await fs.rename(entrada.mapa.archivo, destino);
    } catch {
      return {
        ok: false as const,
        error:
          'No se encontró el archivo de la plantilla. Vuelva a subir el .docx desde Plantillas.',
      };
    }

    await escribirJson(
      PAPELERA,
      papelera.filter((e) => e.mapa.id !== id),
    );

    const lista = await leerIndice();
    if (!lista.some((p) => p.id === id)) {
      lista.push({ ...entrada.mapa, archivo: destino });
      await escribirIndice(lista);
    }
    return { ok: true as const };
  });

  manejar('plantillas:borrarDefinitivo', async (_e, id: string) => {
    const papelera = await leerPapelera();
    const entrada = papelera.find((e) => e.mapa.id === id);
    if (entrada) await fs.unlink(entrada.mapa.archivo).catch(() => undefined);
    await escribirJson(
      PAPELERA,
      papelera.filter((e) => e.mapa.id !== id),
    );
    return { ok: true as const };
  });

  manejar('plantillas:vaciarPapelera', async () => {
    for (const e of await leerPapelera()) {
      await fs.unlink(e.mapa.archivo).catch(() => undefined);
    }
    await escribirJson(PAPELERA, []);
    return { ok: true as const, dias: DIAS_EN_PAPELERA };
  });
}

/** Utilidad para otros canales: obtener una plantilla por id. */
export async function plantillaPorId(id: string): Promise<MapaPlantilla | undefined> {
  return (await leerIndice()).find((p) => p.id === id);
}
