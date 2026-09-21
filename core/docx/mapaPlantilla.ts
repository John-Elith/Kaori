/**
 * El mapa de una plantilla: dónde vive cada campo dentro del documento.
 *
 * Se construye una sola vez, con el asistente, y se guarda junto al .docx ya
 * normalizado. Como toda generación parte siempre del mismo archivo original,
 * los offsets guardados siguen siendo válidos indefinidamente.
 */

import type { CampoId, TipoDocumento } from './campos';
import type { VariantePeriodo } from '../espanol/fechaEnLetras';
import {
  construirMapa,
  type Fragmento,
  type MapaTexto,
  type Parte,
  type Reemplazo,
} from './mapaTexto';

export type Ocurrencia = {
  /** Offset inicial en el texto plano de la plantilla, inclusive */
  inicio: number;
  /** Offset final, exclusivo */
  fin: number;
  /** Texto original en esa posición; sirve para verificar que el mapa sigue vigente */
  textoOriginal: string;
};

export type CampoMapeado = {
  campo: CampoId;
  ocurrencias: Ocurrencia[];
};

export type MapaPlantilla = {
  id: string;
  nombre: string;
  /** Ruta del .docx normalizado que se guarda como plantilla */
  archivo: string;
  /**
   * Qué documento produce esta plantilla.
   *
   * Ausente significa 'informe': es lo único que existía cuando se escribió el
   * índice de plantillas, así que las ya registradas siguen valiendo sin
   * migrar nada.
   */
  tipo?: TipoDocumento;
  /** Cuál de las dos redacciones del periodo de supervisión usa esta plantilla */
  variantePeriodo: VariantePeriodo;
  campos: CampoMapeado[];
  creadoEn: string;
};

export function mapaVacio(id: string, nombre: string, archivo: string): MapaPlantilla {
  return {
    id,
    nombre,
    archivo,
    variantePeriodo: 'dias',
    campos: [],
    creadoEn: new Date().toISOString(),
  };
}

export function campoMapeado(mapa: MapaPlantilla, campo: CampoId): CampoMapeado | undefined {
  return mapa.campos.find((c) => c.campo === campo);
}

export function estaMapeado(mapa: MapaPlantilla, campo: CampoId): boolean {
  const c = campoMapeado(mapa, campo);
  return c !== undefined && c.ocurrencias.length > 0;
}

/** Agrega una aparición a un campo, evitando duplicados exactos. */
export function agregarOcurrencia(
  mapa: MapaPlantilla,
  campo: CampoId,
  ocurrencia: Ocurrencia,
): MapaPlantilla {
  const campos = mapa.campos.map((c) => ({ ...c, ocurrencias: [...c.ocurrencias] }));
  let entrada = campos.find((c) => c.campo === campo);
  if (!entrada) {
    entrada = { campo, ocurrencias: [] };
    campos.push(entrada);
  }
  const yaEsta = entrada.ocurrencias.some(
    (o) => o.inicio === ocurrencia.inicio && o.fin === ocurrencia.fin,
  );
  if (!yaEsta) entrada.ocurrencias.push(ocurrencia);
  entrada.ocurrencias.sort((a, b) => a.inicio - b.inicio);

  return { ...mapa, campos };
}

/** Quita una aparición concreta; si el campo se queda sin ninguna, lo elimina. */
export function quitarOcurrencia(
  mapa: MapaPlantilla,
  campo: CampoId,
  inicio: number,
): MapaPlantilla {
  const campos = mapa.campos
    .map((c) =>
      c.campo === campo
        ? { ...c, ocurrencias: c.ocurrencias.filter((o) => o.inicio !== inicio) }
        : c,
    )
    .filter((c) => c.ocurrencias.length > 0);
  return { ...mapa, campos };
}

export type ProblemaMapa = {
  campo: CampoId;
  inicio: number;
  esperado: string;
  encontrado: string;
};

/**
 * Comprueba que cada aparición registrada siga apuntando al mismo texto.
 *
 * Si alguien reemplaza el archivo de la plantilla por otra versión, los offsets
 * dejan de coincidir. Antes de generar nada conviene verificarlo: es preferible
 * un aviso claro a un informe con los datos escritos en el lugar equivocado.
 */
export function verificarMapa(
  mapa: MapaPlantilla,
  partes: Parte[],
): ProblemaMapa[] {
  const texto = construirMapa(partes);
  const problemas: ProblemaMapa[] = [];

  for (const c of mapa.campos) {
    for (const o of c.ocurrencias) {
      const actual = texto.texto.slice(o.inicio, o.fin);
      if (actual !== o.textoOriginal) {
        problemas.push({
          campo: c.campo,
          inicio: o.inicio,
          esperado: o.textoOriginal,
          encontrado: actual,
        });
      }
    }
  }

  return problemas;
}

/** Traduce los valores de cada campo a reemplazos concretos sobre el texto. */
export function construirReemplazos(
  mapa: MapaPlantilla,
  valores: Partial<Record<CampoId, string>>,
  /**
   * Campos cuyo texto se escribe con formato propio en vez de heredar el del
   * run que había. Sólo hace falta para los párrafos que Kaori redacta enteros.
   */
  conFormato?: Partial<Record<CampoId, Fragmento[]>>,
): Reemplazo[] {
  const reemplazos: Reemplazo[] = [];

  for (const c of mapa.campos) {
    const valor = valores[c.campo];
    if (valor === undefined) continue; // campo sin dato: se deja como está
    const fragmentos = conFormato?.[c.campo];
    for (const o of c.ocurrencias) {
      reemplazos.push({ inicio: o.inicio, fin: o.fin, texto: valor, fragmentos });
    }
  }

  // De atrás hacia adelante, para que el generador los aplique sin correr offsets.
  return reemplazos.sort((a, b) => b.inicio - a.inicio);
}

/** Campos del catálogo que aún no tienen ninguna aparición asignada. */
export function camposSinMapear(mapa: MapaPlantilla, todos: CampoId[]): CampoId[] {
  return todos.filter((id) => !estaMapeado(mapa, id));
}

/** Ayuda al asistente: convierte una selección de texto en una ocurrencia. */
export function ocurrenciaDesdeSeleccion(
  texto: MapaTexto,
  inicio: number,
  fin: number,
): Ocurrencia {
  return { inicio, fin, textoOriginal: texto.texto.slice(inicio, fin) };
}
