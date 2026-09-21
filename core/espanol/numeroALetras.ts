/**
 * Conversión de números a letras en español (variante colombiana),
 * con las formas apocopadas que exigen los informes de contrato.
 *
 * Referencias tomadas de los informes reales:
 *   13.630.000 → "TRECE MILLONES SEISCIENTOS TREINTA MIL PESOS M/CTE ($13.630.000)"
 *    1.880.000 → "UN MILLÓN OCHOCIENTOS OCHENTA MIL PESOS M/CTE ($1.880.000)"
 *    9.413.400 → "NUEVE MILLONES CUATROCIENTOS TRECE MIL CUATROCIENTOS PESOS M/CTE ($9.413.400)"
 *   14.100.000 → "CATORCE MILLONES CIEN MIL PESOS M/CTE ($14.100.000)"
 */

const UNIDADES = [
  '',
  'uno',
  'dos',
  'tres',
  'cuatro',
  'cinco',
  'seis',
  'siete',
  'ocho',
  'nueve',
  'diez',
  'once',
  'doce',
  'trece',
  'catorce',
  'quince',
  'dieciséis',
  'diecisiete',
  'dieciocho',
  'diecinueve',
  'veinte',
  'veintiuno',
  'veintidós',
  'veintitrés',
  'veinticuatro',
  'veinticinco',
  'veintiséis',
  'veintisiete',
  'veintiocho',
  'veintinueve',
];

const DECENAS = [
  '',
  '',
  'veinte',
  'treinta',
  'cuarenta',
  'cincuenta',
  'sesenta',
  'setenta',
  'ochenta',
  'noventa',
];

const CENTENAS = [
  '',
  'ciento',
  'doscientos',
  'trescientos',
  'cuatrocientos',
  'quinientos',
  'seiscientos',
  'setecientos',
  'ochocientos',
  'novecientos',
];

/** 0–999 en letras. `apocope` convierte el "uno" final en "un" (p. ej. "treinta y un"). */
function tresDigitos(n: number, apocope: boolean): string {
  if (n === 0) return '';
  if (n === 100) return 'cien';

  const centena = Math.floor(n / 100);
  const resto = n % 100;

  const partes: string[] = [];
  if (centena > 0) partes.push(CENTENAS[centena]);

  if (resto > 0) {
    if (resto < 30) {
      // 21 apocopado es "veintiún" (lleva tilde al perder la sílaba final)
      if (apocope && resto === 21) partes.push('veintiún');
      else if (apocope && resto === 1) partes.push('un');
      else partes.push(UNIDADES[resto]);
    } else {
      const decena = Math.floor(resto / 10);
      const unidad = resto % 10;
      if (unidad === 0) {
        partes.push(DECENAS[decena]);
      } else {
        const u = apocope && unidad === 1 ? 'un' : UNIDADES[unidad];
        partes.push(`${DECENAS[decena]} y ${u}`);
      }
    }
  }

  return partes.join(' ');
}

/**
 * Convierte un entero no negativo a letras en minúscula.
 *
 * @param apocope Si el número acompaña a un sustantivo masculino
 *   ("treinta y un días" en vez de "treinta y uno días").
 */
export function numeroALetras(n: number, apocope = false): string {
  if (!Number.isInteger(n)) {
    throw new Error(`numeroALetras espera un entero, recibió ${n}`);
  }
  if (n < 0) {
    throw new Error(`numeroALetras espera un número no negativo, recibió ${n}`);
  }
  if (n === 0) return 'cero';
  if (n >= 1_000_000_000_000) {
    throw new Error(`numeroALetras no soporta valores tan grandes: ${n}`);
  }

  const partes: string[] = [];

  const millones = Math.floor(n / 1_000_000);
  const restoMillones = n % 1_000_000;

  if (millones > 0) {
    if (millones === 1) {
      partes.push('un millón');
    } else {
      // El multiplicador de "millones" siempre va apocopado: "veintiún millones".
      partes.push(`${numeroALetras(millones, true)} millones`);
    }
  }

  const miles = Math.floor(restoMillones / 1000);
  const resto = restoMillones % 1000;

  if (miles > 0) {
    // "mil", nunca "un mil"; pero sí "veintiún mil", "treinta y un mil".
    if (miles === 1) partes.push('mil');
    else partes.push(`${tresDigitos(miles, true)} mil`);
  }

  if (resto > 0) {
    partes.push(tresDigitos(resto, apocope));
  }

  return partes.join(' ');
}

/** Formato de moneda colombiano: 13630000 → "$13.630.000" */
export function formatoMoneda(valor: number): string {
  const entero = Math.round(valor);
  const signo = entero < 0 ? '-' : '';
  const digitos = Math.abs(entero)
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return `${signo}$${digitos}`;
}

/**
 * Monto completo en el formato de los informes:
 *   13630000 → "TRECE MILLONES SEISCIENTOS TREINTA MIL PESOS M/CTE ($13.630.000)"
 *    1000000 → "UN MILLÓN DE PESOS M/CTE ($1.000.000)"
 *
 * La preposición «de» aparece sólo cuando la cifra termina justo en millón o
 * millones: se dice «un millón DE pesos», pero «trece millones seiscientos
 * treinta mil pesos», sin «de», porque ahí el sustantivo va pegado al último
 * elemento de la cifra y no a «millones».
 */
export function montoALetras(valor: number): string {
  const entero = Math.round(valor);
  const letras = numeroALetras(entero, true).toUpperCase();
  const terminaEnMillones = /MILL[OÓ]N(ES)?$/.test(letras);
  const de = terminaEnMillones ? ' DE' : '';
  return `${letras}${de} PESOS M/CTE (${formatoMoneda(valor)})`;
}

/**
 * La cifra en letras y nada más, en mayúsculas.
 *
 *   1298400 → "UN MILLÓN DOSCIENTOS NOVENTA Y OCHO MIL CUATROCIENTOS"
 *
 * Es lo que pide el renglón «VALOR EN LETRAS:» de la cuenta de cobro, donde la
 * palabra «PESOS» no aparece. Por eso tampoco lleva el «de» de `montoALetras`:
 * ese «de» existe para enlazar con el sustantivo —«un millón DE pesos»— y sin
 * sustantivo detrás quedaría colgando.
 *
 * La cuenta de cobro del municipio trae aquí «NOVEINTA»; se escribe «NOVENTA»,
 * que es lo correcto y lo que produce el motor de números.
 */
export function montoEnLetrasSolo(valor: number): string {
  return numeroALetras(Math.round(valor), true).toUpperCase();
}
