/**
 * Fusión de runs adyacentes con el mismo formato.
 *
 * Word parte un texto en varios `<w:r>` cada vez que hubo una corrección de
 * tipeo, un cambio de revisión o una marca de corrector ortográfico. Así, un
 * número de contrato como "078-2025" puede quedar guardado como:
 *
 *   <w:r><w:rPr>…</w:rPr><w:t>078</w:t></w:r>
 *   <w:r><w:rPr>…</w:rPr><w:t>-20</w:t></w:r>
 *   <w:r><w:rPr>…</w:rPr><w:t>25</w:t></w:r>
 *
 * Buscar "078-2025" en el XML crudo fallaría. Este módulo fusiona los runs
 * consecutivos cuyo `<w:rPr>` sea byte a byte idéntico, dejando un solo
 * `<w:t>` con el texto completo. Es lo que hace posible el mapeo de campos.
 *
 * Se trabaja sobre la cadena XML y no sobre un DOM a propósito: cualquier
 * reserialización puede reordenar atributos o cerrar etiquetas de otra forma,
 * y Word es sensible a eso. Aquí sólo se tocan los runs que se fusionan; el
 * resto del documento queda intacto carácter por carácter.
 */

import { decodificarXml, codificarXml } from './xml';

type Run = {
  /** Offset del `<w:r>` en el XML */
  inicio: number;
  /** Offset justo después del `</w:r>` */
  fin: number;
  /** `<w:rPr>…</w:rPr>` completo, o cadena vacía si el run no tiene formato */
  rPr: string;
  /** Texto decodificado del `<w:t>` */
  texto: string;
  /** ¿Es un run de texto simple, sin saltos, imágenes ni campos? */
  simple: boolean;
};

/**
 * Un run es "simple" — y por tanto fusionable — si sólo contiene `<w:rPr>` y
 * un único `<w:t>`. Cualquier otra cosa (saltos `<w:br/>`, tabulaciones
 * `<w:tab/>`, imágenes `<w:drawing>`, campos, notas al pie) lo descalifica:
 * fusionarlo destruiría contenido.
 */
function analizarRun(xml: string, inicio: number, fin: number): Run {
  const cuerpo = xml.slice(inicio, fin);

  const mRPr = /<w:rPr>[\s\S]*?<\/w:rPr>|<w:rPr\s*\/>/.exec(cuerpo);
  const rPr = mRPr ? mRPr[0] : '';

  // Todo lo que no sea la etiqueta de apertura/cierre del run ni su rPr.
  const restante = cuerpo
    .replace(/^<w:r(\s[^>]*)?>/, '')
    .replace(/<\/w:r>$/, '')
    .replace(rPr, '');

  const mT = /<w:t(\s[^>]*)?>([\s\S]*?)<\/w:t>|<w:t\s*\/>/.exec(restante);
  const texto = mT ? decodificarXml(mT[2] ?? '') : '';

  // Simple = lo que queda tras quitar el <w:t> es sólo espacios en blanco.
  const sinT = mT ? restante.replace(mT[0], '') : restante;
  const simple = mT !== null && sinT.trim() === '';

  return { inicio, fin, rPr, texto, simple };
}

/** Localiza todos los `<w:r>…</w:r>` de nivel superior dentro del XML. */
function ubicarRuns(xml: string): Run[] {
  const runs: Run[] = [];
  const apertura = /<w:r(\s[^>]*)?>/g;
  let m: RegExpExecArray | null;

  while ((m = apertura.exec(xml)) !== null) {
    // Evita capturar <w:rPr>, <w:rFonts>, etc.: exige que tras "<w:r" venga
    // un espacio o el cierre de la etiqueta.
    const siguiente = xml[m.index + 4];
    if (siguiente !== '>' && siguiente !== ' ') continue;

    const cierre = xml.indexOf('</w:r>', m.index);
    if (cierre === -1) continue;

    const fin = cierre + '</w:r>'.length;
    runs.push(analizarRun(xml, m.index, fin));
    apertura.lastIndex = fin;
  }

  return runs;
}

/**
 * Devuelve el XML con los runs de texto adyacentes y de igual formato fusionados.
 *
 * Sólo se fusionan runs que sean vecinos inmediatos: si entre dos runs hay
 * cualquier otro contenido (un `<w:proofErr>`, un `<w:bookmarkStart>`, otro
 * elemento), no se fusionan, porque ese contenido intermedio se perdería.
 */
export function normalizarRuns(xml: string): string {
  const runs = ubicarRuns(xml);
  if (runs.length < 2) return xml;

  type Grupo = { runs: Run[] };
  const grupos: Grupo[] = [];
  let actual: Grupo | null = null;

  for (let i = 0; i < runs.length; i++) {
    const r = runs[i];

    if (!r.simple) {
      actual = null;
      continue;
    }

    if (actual) {
      const anterior = actual.runs[actual.runs.length - 1];
      const pegados = xml.slice(anterior.fin, r.inicio).trim() === '';
      const mismoFormato = anterior.rPr === r.rPr;
      if (pegados && mismoFormato) {
        actual.runs.push(r);
        continue;
      }
    }

    actual = { runs: [r] };
    grupos.push(actual);
  }

  // Reconstruir de atrás hacia adelante para que los offsets no se corran.
  let resultado = xml;
  for (let g = grupos.length - 1; g >= 0; g--) {
    const grupo = grupos[g];
    if (grupo.runs.length < 2) continue;

    const primero = grupo.runs[0];
    const ultimo = grupo.runs[grupo.runs.length - 1];
    const textoUnido = grupo.runs.map((r) => r.texto).join('');

    const nuevoRun =
      `<w:r>${primero.rPr}` +
      `<w:t xml:space="preserve">${codificarXml(textoUnido)}</w:t>` +
      `</w:r>`;

    resultado = resultado.slice(0, primero.inicio) + nuevoRun + resultado.slice(ultimo.fin);
  }

  return resultado;
}

/** Cuántos runs fusionaría `normalizarRuns`. Útil para diagnóstico. */
export function contarFusiones(xml: string): number {
  const antes = ubicarRuns(xml).length;
  const despues = ubicarRuns(normalizarRuns(xml)).length;
  return antes - despues;
}
