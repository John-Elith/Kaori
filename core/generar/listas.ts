/**
 * Listas numeradas de Word.
 *
 * El certificado de cumplimiento enumera las actividades del contrato, y cada
 * contrato tiene las suyas: el 084 tiene nueve, otro puede tener doce. Hay que
 * clonar el párrafo molde tantas veces como haga falta, igual que se clona la
 * fila molde de las tablas de obligaciones.
 *
 * La numeración no se escribe: la pone Word a partir del `<w:numPr>` que cada
 * párrafo lleva en sus propiedades. Basta con conservarlo al clonar y la lista
 * sale 1, 2, 3… sola. Por eso aquí no aparece ningún contador.
 */

import { codificarXml, decodificarXml } from '../docx/xml';
import type { Parte } from '../docx/mapaTexto';

export type ResultadoListas = {
  partes: Parte[];
  avisos: string[];
};

type Bloque = { inicio: number; fin: number; xml: string };

/** Rótulo tras el que empieza la lista de actividades del certificado. */
const ANCLA = /siguientes actividades/i;

/**
 * Párrafos de primer nivel, contando anidamiento.
 *
 * Un párrafo puede contener otro dentro de una tabla anidada, así que un
 * `indexOf` de `</w:p>` cerraría el equivocado.
 */
function parrafosDeNivelSuperior(xml: string): Bloque[] {
  const bloques: Bloque[] = [];
  const re = /<w:p(?:\s[^>]*)?>|<\/w:p>|<w:p(?:\s[^>]*)?\/>/g;
  let profundidad = 0;
  let inicio = -1;
  let m: RegExpExecArray | null;

  while ((m = re.exec(xml)) !== null) {
    // Un párrafo vacío autocerrado no abre nada: es un bloque por sí mismo.
    if (m[0].endsWith('/>')) {
      if (profundidad === 0) {
        bloques.push({ inicio: m.index, fin: m.index + m[0].length, xml: m[0] });
      }
      continue;
    }

    if (m[0].startsWith('</')) {
      profundidad -= 1;
      if (profundidad === 0 && inicio !== -1) {
        const fin = m.index + m[0].length;
        bloques.push({ inicio, fin, xml: xml.slice(inicio, fin) });
        inicio = -1;
      }
      if (profundidad < 0) profundidad = 0; // XML raro: seguir sin romper
    } else {
      if (profundidad === 0) inicio = m.index;
      profundidad += 1;
    }
  }

  return bloques;
}

function textoDe(xml: string): string {
  return [...xml.matchAll(/<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>/g)]
    .map((m) => decodificarXml(m[1]))
    .join('');
}

/** ¿Este párrafo pertenece a una lista numerada? */
function esDeLista(parrafoXml: string): boolean {
  return /<w:numPr>/.test(parrafoXml);
}

/**
 * Escribe un texto en un párrafo conservando el formato de su primer run.
 *
 * Los demás `<w:t>` se vacían en vez de borrarse: quitar los runs se llevaría
 * por delante sus propiedades, y con ellas el tipo de letra del párrafo.
 */
function fijarTextoParrafo(parrafoXml: string, texto: string): string {
  const nodos = [...parrafoXml.matchAll(/<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>/g)];
  if (nodos.length === 0) return parrafoXml;

  let resultado = parrafoXml;
  // De atrás hacia adelante para no correr los offsets.
  for (let i = nodos.length - 1; i >= 0; i--) {
    const m = nodos[i];
    const contenido = m[1];
    const inicioContenido = m.index! + m[0].length - '</w:t>'.length - contenido.length;
    const finContenido = inicioContenido + contenido.length;
    const nuevo = i === 0 ? codificarXml(texto) : '';
    resultado =
      resultado.slice(0, inicioContenido) + nuevo + resultado.slice(finContenido);
  }

  // El primer <w:t> tiene que preservar espacios: los textos de las actividades
  // llevan espacios al final con más frecuencia de la que uno esperaría.
  const primero = nodos[0];
  if (primero[0].startsWith('<w:t>')) {
    resultado =
      resultado.slice(0, primero.index!) +
      '<w:t xml:space="preserve">' +
      resultado.slice(primero.index! + '<w:t>'.length);
  }

  return resultado;
}

/**
 * Rellena la lista de actividades del certificado con las del contrato.
 *
 * La lista se localiza por su rótulo y no por el `numId`, que es un número
 * interno de Word: si el documento tuviera otra lista con el mismo identificador
 * —cosa que pasa cuando se copian y pegan párrafos entre documentos— buscar por
 * `numId` reescribiría las dos. Anclarse al texto que la introduce apunta a la
 * que se quiere.
 *
 * Si el contrato no tiene obligaciones registradas la lista se deja como está,
 * igual que hacen las tablas de obligaciones del informe: es preferible el
 * texto de la plantilla a un certificado sin actividades.
 */
export function llenarListaActividades(
  partes: Parte[],
  actividades: string[],
): ResultadoListas {
  const avisos: string[] = [];

  if (actividades.length === 0) {
    return {
      partes,
      avisos: [
        'El contrato no tiene obligaciones registradas, así que el certificado ' +
          'conserva la lista de actividades que traiga la plantilla.',
      ],
    };
  }

  let encontrada = false;

  const nuevas = partes.map((parte) => {
    if (encontrada || parte.nombre !== 'word/document.xml') return parte;

    const parrafos = parrafosDeNivelSuperior(parte.xml);
    const rotulo = parrafos.findIndex((p) => ANCLA.test(textoDe(p.xml)));
    if (rotulo === -1) return parte;

    // Los párrafos de lista que siguen al rótulo. Entre uno y otro el
    // certificado intercala párrafos vacíos como separación, así que un vacío
    // no termina la lista: sólo la termina un párrafo con texto que no numera.
    let primero = -1;
    let ultimo = -1;
    /** El párrafo vacío que separa un elemento del siguiente, si lo hay. */
    let separador = '';

    for (let i = rotulo + 1; i < parrafos.length; i++) {
      const p = parrafos[i];

      if (esDeLista(p.xml)) {
        if (primero === -1) primero = i;
        ultimo = i;
        continue;
      }

      if (textoDe(p.xml).trim() === '') {
        // Un vacío entre dos elementos es la separación de la lista; hay que
        // reproducirlo entre los clones o el certificado saldría apretado.
        if (primero !== -1 && separador === '') separador = p.xml;
        continue;
      }

      if (primero !== -1) break; // texto de verdad: la lista terminó
    }

    if (primero === -1) return parte;
    encontrada = true;

    const molde = parrafos[primero].xml;
    const cuerpo = actividades
      .map((t) => fijarTextoParrafo(molde, t))
      .join(separador);

    return {
      ...parte,
      xml:
        parte.xml.slice(0, parrafos[primero].inicio) +
        cuerpo +
        parte.xml.slice(parrafos[ultimo].fin),
    };
  });

  if (!encontrada) {
    avisos.push(
      'No se encontró la lista de actividades en la plantilla del certificado. ' +
        'Verifique que va precedida de «…las siguientes actividades:».',
    );
  }

  return { partes: nuevas, avisos };
}
