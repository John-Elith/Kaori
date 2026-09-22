/**
 * Las obligaciones específicas de un contrato, sacadas de su texto.
 *
 * En los contratos van en una cláusula como «Actividades específicas del
 * Contrato», escritas de corrido y numeradas —«1. Realizar… 2. Ayudar… 15. En
 * todo caso…»— hasta que empieza el «Parágrafo 1». Se busca esa lista y se
 * parte en una obligación por número.
 *
 * El texto suele venir de un escaneo o una foto, así que el OCR deja basura:
 * letras sueltas al final de las líneas, palabras partidas con guion o algún
 * número perdido («10.» leído como «El»). Por eso:
 *
 * - La lista es la secuencia 1, 2, 3… más larga, no cualquier número con punto.
 *   Un «2.» suelto en otra cláusula no la parte.
 * - Se admite que falte un número: si tras el 9 viene el 11, la obligación 10
 *   queda pegada a la 9. Es mejor eso que perder las que siguen.
 * - La última termina en «Parágrafo», o en la siguiente cláusula si no lo hay.
 */

/** Dónde empieza la cláusula de las obligaciones, si se reconoce. */
const INICIO_CLAUSULA =
  /(actividades|obligaciones)\s+espec[ií]ficas|siguientes\s+(actividades|obligaciones)/i;

/**
 * Dónde termina la lista. Además de «Parágrafo» y la cláusula siguiente:
 *
 * - «1: Todas…». En una foto, el OCR puede dejar «Parágrafo 1:» ilegible
 *   («rien 1:»), pero el número con dos puntos y mayúscula detrás sobrevive.
 * - El pie de la página: «Página 2 de 6», una web, un correo, «Cel:».
 */
const FIN_LISTA =
  /par[áa]grafo|cl[áa]usula\s+\d|obligaciones\s+del\s+contratante|(?<![\d.])[1-3]\s*:\s+(?=[A-ZÁÉÍÓÚÑ])|p[áa]gina\s+\d+\s+de\s+\d+|www\.|@|\bcel\s*:|centro\s+administrativo/i;

type Marca = { n: number; inicio: number; fin: number };

/** Los «N.» que parecen empezar una obligación: número, punto y mayúscula. */
function marcas(texto: string): Marca[] {
  const lista: Marca[] = [];
  const re = /(^|[\s.:;,)])(\d{1,2})\s*[.)-]\s+(?=[A-ZÁÉÍÓÚÑ¿"“])/g;
  for (let m = re.exec(texto); m; m = re.exec(texto)) {
    const inicio = m.index + m[1].length;
    lista.push({ n: Number(m[2]), inicio, fin: m.index + m[0].length });
  }
  return lista;
}

/**
 * La secuencia 1, 2, 3… más larga que empiece en un «1.». Admite que falte un
 * número suelto (el OCR se come alguno), no dos seguidos.
 */
function mejorSecuencia(ms: Marca[]): Marca[] {
  let mejor: Marca[] = [];
  for (let i = 0; i < ms.length; i++) {
    if (ms[i].n !== 1) continue;
    const seq = [ms[i]];
    for (let j = i + 1; j < ms.length; j++) {
      const ultimo = seq[seq.length - 1].n;
      if (ms[j].n === ultimo + 1 || ms[j].n === ultimo + 2) seq.push(ms[j]);
    }
    if (seq.length > mejor.length) mejor = seq;
  }
  return mejor;
}

/** Une las líneas, recompone las palabras partidas y deja un punto al final. */
export function limpiarObligacion(texto: string): string {
  let t = texto
    .replace(/(\p{L})-\s*\n\s*(\p{Ll})/gu, '$1$2') // «da-\nñinos» → «dañinos»
    .replace(/\s+/g, ' ')
    // Signos sueltos que deja el OCR entre palabras: «—», «>», «|».
    .replace(/(^|\s)[—–>|<*“”"-]+(?=\s|$)/g, '$1')
    .replace(/\s+/g, ' ')
    .trim();
  // Restos del escaneo al final: uno a tres caracteres sueltos tras el último
  // punto («. E“», «. e», «. -»). Una palabra de verdad no cabe en eso.
  t = t.replace(/([.;:])\s+\S{1,3}$/u, '$1').trim();
  t = t.replace(/[\s,;:–—-]+$/u, '');
  if (t.length > 0 && !/[.!?)]$/.test(t)) t += '.';
  return t.charAt(0).toUpperCase() + t.slice(1);
}

export function extraerObligacionesNumeradas(texto: string): string[] {
  if (!texto.trim()) return [];

  // Se busca a partir de la cláusula si se reconoce; si no, en todo el texto.
  const ancla = INICIO_CLAUSULA.exec(texto);
  const desde = ancla ? ancla.index : 0;
  const zona = texto.slice(desde);

  const seq = mejorSecuencia(marcas(zona));
  // Una o dos no son una lista de obligaciones: es más probable que sean
  // números sueltos de otra cosa.
  if (seq.length < 3) return [];

  const obligaciones: string[] = [];
  for (let i = 0; i < seq.length; i++) {
    const ini = seq[i].fin;
    let fin = i + 1 < seq.length ? seq[i + 1].inicio : zona.length;
    if (i === seq.length - 1) {
      const corte = FIN_LISTA.exec(zona.slice(ini));
      if (corte) fin = ini + corte.index;
    }
    const o = limpiarObligacion(zona.slice(ini, fin));
    if (o.length > 3) obligaciones.push(o);
  }
  return obligaciones;
}
