/**
 * Convierte un texto pegado en una lista de obligaciones.
 *
 * Las obligaciones se copian del contrato, que llega en Word o en PDF, así que
 * lo natural es pegar el bloque entero y que el programa lo parta. Viene de mil
 * formas —numerado con puntos, con paréntesis, con viñetas, o a secas— y todas
 * tienen que funcionar sin pedirle a nadie que las limpie antes.
 *
 * No usa IA: es partir y quitar la numeración, y para eso no hace falta.
 */

/** Numeración o viñeta al principio de una línea: "1.", "1)", "a)", "-", "•". */
const MARCA = /^\s*(?:\d{1,3}\s*[.)\-–]|[a-zA-Z]\s*[.)]|[-–•*])\s+/;

/** ¿Esta línea empieza un elemento nuevo de la lista? */
function abreElemento(linea: string): boolean {
  return MARCA.test(linea);
}

/**
 * Parte el texto en obligaciones.
 *
 * Si hay líneas numeradas, cada número abre una obligación y lo que sigue sin
 * numerar se le pega: el contrato del municipio parte las obligaciones largas
 * en varias líneas y unirlas es lo correcto. Si no hay ninguna numeración, cada
 * línea no vacía es una obligación.
 */
export function partirEnObligaciones(texto: string): string[] {
  const lineas = texto.split(/\r?\n/);
  const hayNumeracion = lineas.some(abreElemento);

  if (!hayNumeracion) {
    return lineas.map(limpiar).filter((t) => t.length > 0);
  }

  const partes: string[] = [];
  for (const linea of lineas) {
    if (linea.trim().length === 0) continue;

    if (abreElemento(linea) || partes.length === 0) {
      partes.push(limpiar(linea));
    } else {
      // Continuación de la obligación anterior.
      partes[partes.length - 1] = `${partes[partes.length - 1]} ${linea.trim()}`.trim();
    }
  }

  return partes.map((t) => t.replace(/\s+/g, ' ').trim()).filter((t) => t.length > 0);
}

/** Quita la marca de lista y los espacios de sobra. */
function limpiar(linea: string): string {
  return linea.replace(MARCA, '').replace(/\s+/g, ' ').trim();
}

/**
 * Renumera una lista de obligaciones desde 1.
 *
 * El número no es decorativo: es el que sale en la columna «No.» de las tablas
 * del informe y el que ordena la lista del certificado, así que tiene que
 * quedar corrido después de agregar o quitar cualquiera.
 */
export function renumerar<T extends { texto: string }>(
  obligaciones: T[],
): (T & { n: number })[] {
  return obligaciones.map((o, i) => ({ ...o, n: i + 1 }));
}
