/**
 * Fechas de calendario sin zona horaria.
 *
 * Un informe de contrato habla de días de calendario, nunca de instantes.
 * Usar `Date` aquí introduciría corrimientos de zona horaria que harían que
 * "31 de enero" se imprima como "30 de enero" según dónde se ejecute el
 * programa. Por eso el tipo `Fecha` es un simple {año, mes, día}.
 */

export type Fecha = {
  /** Año completo, p. ej. 2025 */
  anio: number;
  /** Mes 1–12 (enero = 1) */
  mes: number;
  /** Día 1–31 */
  dia: number;
};

export const NOMBRES_MES = [
  'enero',
  'febrero',
  'marzo',
  'abril',
  'mayo',
  'junio',
  'julio',
  'agosto',
  'septiembre',
  'octubre',
  'noviembre',
  'diciembre',
] as const;

export function nombreMes(mes: number): string {
  if (mes < 1 || mes > 12) throw new Error(`Mes fuera de rango: ${mes}`);
  return NOMBRES_MES[mes - 1];
}

export function esBisiesto(anio: number): boolean {
  return (anio % 4 === 0 && anio % 100 !== 0) || anio % 400 === 0;
}

/** Cantidad de días que tiene el mes. */
export function diasDelMes(anio: number, mes: number): number {
  if (mes < 1 || mes > 12) throw new Error(`Mes fuera de rango: ${mes}`);
  const dias = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  if (mes === 2 && esBisiesto(anio)) return 29;
  return dias[mes - 1];
}

/** Último día del mes como Fecha. Febrero de 2025 → 28; de 2024 → 29. */
export function ultimoDiaDelMes(anio: number, mes: number): Fecha {
  return { anio, mes, dia: diasDelMes(anio, mes) };
}

export function primerDiaDelMes(anio: number, mes: number): Fecha {
  return { anio, mes, dia: 1 };
}

export function fecha(anio: number, mes: number, dia: number): Fecha {
  const max = diasDelMes(anio, mes);
  if (dia < 1 || dia > max) {
    throw new Error(`Día ${dia} inválido para ${mes}/${anio} (máximo ${max})`);
  }
  return { anio, mes, dia };
}

/** "2025-01-07" → { anio: 2025, mes: 1, dia: 7 } */
export function desdeISO(iso: string): Fecha {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso.trim());
  if (!m) throw new Error(`Fecha ISO inválida: "${iso}"`);
  return fecha(Number(m[1]), Number(m[2]), Number(m[3]));
}

/** { anio: 2025, mes: 1, dia: 7 } → "2025-01-07" */
export function aISO(f: Fecha): string {
  return `${f.anio}-${dosDigitos(f.mes)}-${dosDigitos(f.dia)}`;
}

/** Formato corto usado en las tablas del informe: "07/01/2025" */
export function formatoCorto(f: Fecha): string {
  return `${dosDigitos(f.dia)}/${dosDigitos(f.mes)}/${f.anio}`;
}

export function dosDigitos(n: number): string {
  return n.toString().padStart(2, '0');
}

/** Negativo si a < b, 0 si iguales, positivo si a > b. */
export function comparar(a: Fecha, b: Fecha): number {
  if (a.anio !== b.anio) return a.anio - b.anio;
  if (a.mes !== b.mes) return a.mes - b.mes;
  return a.dia - b.dia;
}

export function esAnterior(a: Fecha, b: Fecha): boolean {
  return comparar(a, b) < 0;
}

export function esPosterior(a: Fecha, b: Fecha): boolean {
  return comparar(a, b) > 0;
}

export function sonIguales(a: Fecha, b: Fecha): boolean {
  return comparar(a, b) === 0;
}

/** ¿`f` cae dentro del rango [desde, hasta], ambos inclusive? */
export function estaEnRango(f: Fecha, desde: Fecha, hasta: Fecha): boolean {
  return comparar(f, desde) >= 0 && comparar(f, hasta) <= 0;
}

/** Días transcurridos desde una época fija; sirve para restar fechas. */
function aNumeroDeDia(f: Fecha): number {
  // Algoritmo de días julianos (Fliegel–Van Flandern), entero y sin zonas horarias.
  const a = Math.floor((14 - f.mes) / 12);
  const y = f.anio + 4800 - a;
  const m = f.mes + 12 * a - 3;
  return (
    f.dia +
    Math.floor((153 * m + 2) / 5) +
    365 * y +
    Math.floor(y / 4) -
    Math.floor(y / 100) +
    Math.floor(y / 400) -
    32045
  );
}

function desdeNumeroDeDia(jdn: number): Fecha {
  const a = jdn + 32044;
  const b = Math.floor((4 * a + 3) / 146097);
  const c = a - Math.floor((146097 * b) / 4);
  const d = Math.floor((4 * c + 3) / 1461);
  const e = c - Math.floor((1461 * d) / 4);
  const m = Math.floor((5 * e + 2) / 153);
  return {
    dia: e - Math.floor((153 * m + 2) / 5) + 1,
    mes: m + 3 - 12 * Math.floor(m / 10),
    anio: 100 * b + d - 4800 + Math.floor(m / 10),
  };
}

/** Días calendario entre dos fechas (b − a). */
export function diferenciaEnDias(a: Fecha, b: Fecha): number {
  return aNumeroDeDia(b) - aNumeroDeDia(a);
}

export function sumarDias(f: Fecha, dias: number): Fecha {
  return desdeNumeroDeDia(aNumeroDeDia(f) + dias);
}

/**
 * Días inclusivos entre dos fechas: del 7 al 31 de enero son 25 días.
 * Es la cuenta que usan los informes para los días efectivamente trabajados.
 */
export function diasInclusive(desde: Fecha, hasta: Fecha): number {
  return diferenciaEnDias(desde, hasta) + 1;
}

/** Avanza `meses` meses ajustando el día si el mes destino es más corto. */
export function sumarMeses(f: Fecha, meses: number): Fecha {
  const total = f.anio * 12 + (f.mes - 1) + meses;
  const anio = Math.floor(total / 12);
  const mes = (total % 12) + 1;
  const dia = Math.min(f.dia, diasDelMes(anio, mes));
  return { anio, mes, dia };
}
