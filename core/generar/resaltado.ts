/**
 * Qué va en negrita dentro de los párrafos que Kaori redacta.
 *
 * El párrafo de FORMA DE PAGO no se copia de la plantilla: se compone entero
 * desde el cronograma. Eso significa que tampoco hereda su formato, y en los
 * informes reales los importes van en negrita:
 *
 *   El Municipio cancelará al contratista la suma de **TRECE MILLONES
 *   SEISCIENTOS TREINTA MIL PESOS M/CTE ($13.630.000)**, por medio seis (06)
 *   mensualidades vencidas…
 *
 * La regla se aplica sobre el texto final y no sobre las piezas con que se
 * armó, a propósito: así vale también para lo que la persona escriba a mano en
 * el cuadro de FORMA DE PAGO, mientras siga el estilo de la casa.
 */

import type { Fragmento } from '../docx/mapaTexto';

/**
 * Un importe escrito como lo escribe `montoALetras`: la cifra en mayúsculas,
 * «PESOS M/CTE» y el número entre paréntesis.
 *
 * Se exige el paréntesis con la cifra para no marcar cualquier mayúscula
 * suelta. El grupo de letras admite tildes y la eñe porque «MILLÓN» las lleva.
 */
const IMPORTE = /[A-ZÁÉÍÓÚÜÑ][A-ZÁÉÍÓÚÜÑ ]*PESOS\s*M\/CTE\s*\(\$[\d.]+\)/g;

/**
 * Parte un texto en tramos, marcando en negrita los importes.
 *
 * Devuelve un solo fragmento sin marcar cuando no hay ninguno, que es lo que
 * permite tratar por igual el caso con formato y el caso sin él.
 */
export function resaltarImportes(texto: string): Fragmento[] {
  const fragmentos: Fragmento[] = [];
  let desde = 0;

  for (const m of texto.matchAll(IMPORTE)) {
    const i = m.index ?? 0;
    if (i > desde) fragmentos.push({ texto: texto.slice(desde, i) });
    fragmentos.push({ texto: m[0], negrita: true });
    desde = i + m[0].length;
  }

  if (desde < texto.length) fragmentos.push({ texto: texto.slice(desde) });
  if (fragmentos.length === 0) fragmentos.push({ texto });

  return fragmentos;
}

/** ¿Este texto lleva algún importe que resaltar? */
export function tieneImportes(texto: string): boolean {
  return resaltarImportes(texto).some((f) => f.negrita === true);
}
