/**
 * Redacción de ACTIVIDADES EJECUTADAS sin conexión.
 *
 * Convierte una obligación en infinitivo ("Prestar su colaboración en…") a la
 * actividad en pasado ("Se prestó colaboración en…"), que es exactamente la
 * transformación que hacen a mano los informes reales.
 *
 * Es el camino de respaldo: cuando hay clave de API configurada, la redacción
 * la hace la IA y queda mucho mejor. Esto garantiza que el programa siga siendo
 * útil sin internet.
 */

/** Pretérito de 3.ª persona del singular para los verbos irregulares usuales. */
const IRREGULARES: Record<string, string> = {
  hacer: 'hizo',
  ser: 'fue',
  ir: 'fue',
  estar: 'estuvo',
  tener: 'tuvo',
  poner: 'puso',
  poder: 'pudo',
  saber: 'supo',
  dar: 'dio',
  ver: 'vio',
  decir: 'dijo',
  traer: 'trajo',
  conducir: 'condujo',
  producir: 'produjo',
  querer: 'quiso',
  venir: 'vino',
  andar: 'anduvo',
  caber: 'cupo',
  satisfacer: 'satisfizo',
  mantener: 'mantuvo',
  obtener: 'obtuvo',
  proponer: 'propuso',
  suponer: 'supuso',
  contribuir: 'contribuyó',
  incluir: 'incluyó',
  construir: 'construyó',
  leer: 'leyó',
  creer: 'creyó',
};

/** Pretérito de 3.ª persona del plural. */
const IRREGULARES_PLURAL: Record<string, string> = {
  hacer: 'hicieron',
  ser: 'fueron',
  ir: 'fueron',
  estar: 'estuvieron',
  tener: 'tuvieron',
  poner: 'pusieron',
  poder: 'pudieron',
  saber: 'supieron',
  dar: 'dieron',
  ver: 'vieron',
  decir: 'dijeron',
  traer: 'trajeron',
  conducir: 'condujeron',
  producir: 'produjeron',
  querer: 'quisieron',
  venir: 'vinieron',
  andar: 'anduvieron',
  caber: 'cupieron',
  satisfacer: 'satisficieron',
  mantener: 'mantuvieron',
  obtener: 'obtuvieron',
  proponer: 'propusieron',
  suponer: 'supusieron',
  contribuir: 'contribuyeron',
  incluir: 'incluyeron',
  construir: 'construyeron',
  leer: 'leyeron',
  creer: 'creyeron',
};

/**
 * Conjuga un infinitivo al pretérito perfecto simple, 3.ª persona.
 *   prestar → prestó / prestaron
 *   brindar → brindó / brindaron
 *   acreditar → acreditó / acreditaron
 */
export function aPreterito(infinitivo: string, plural = false): string | null {
  const v = infinitivo.toLowerCase();

  const tabla = plural ? IRREGULARES_PLURAL : IRREGULARES;
  if (tabla[v]) return tabla[v];

  if (v.endsWith('ar')) {
    const raiz = v.slice(0, -2);
    return plural ? `${raiz}aron` : `${raiz}ó`;
  }
  if (v.endsWith('er') || v.endsWith('ir')) {
    const raiz = v.slice(0, -2);
    return plural ? `${raiz}ieron` : `${raiz}ió`;
  }

  return null; // no parece un infinitivo
}

/** Quita el determinante posesivo inicial: "su colaboración" → "colaboración". */
function limpiarPosesivo(resto: string): string {
  return resto.replace(/^\s*(su|sus)\s+/i, ' ');
}

/**
 * ¿La acción recae sobre algo plural?
 *
 * En la pasiva refleja el verbo concuerda con el objeto, no con el contratista:
 *   "Prestar su colaboración…"  → "Se prestó colaboración"    (singular)
 *   "Prestar sus servicios…"    → "Se prestaron servicios"    (plural)
 *   "Realizar actividades de…"  → "Se realizaron actividades" (plural)
 *
 * Así lo redactan los informes reales: «Se prestaron los servicios contratados».
 */
function pareceplural(resto: string): boolean {
  const primeraPalabra = limpiarPosesivo(resto).trim().split(/\s+/)[0] ?? '';
  return /\w(?:es|s)$/i.test(primeraPalabra);
}

/**
 * Redacta la actividad ejecutada a partir del texto de la obligación.
 *
 * @param impersonal `true` produce "Se prestó…" (estilo del informe de
 *   actividad); `false` produce "Prestó…" (estilo del informe de supervisión).
 *   Ambos aparecen en los informes reales.
 */
export function redactarActividad(obligacion: string, impersonal = true): string {
  const texto = obligacion.trim().replace(/\s+/g, ' ');
  if (texto.length === 0) return '';

  // Casos que no arrancan con infinitivo, como "Y las demás inherentes…".
  const generico = /^y\s+(las|los)\s+dem[áa]s/i.test(texto);
  if (generico) {
    const cola = texto.replace(/^y\s+/i, '');
    return impersonal
      ? `Se atendieron de forma diligente y oportuna ${minuscula(cola)}`
      : `Atendió de forma diligente y oportuna ${minuscula(cola)}`;
  }

  const m = /^([A-Za-zÁÉÍÓÚÜÑáéíóúüñ]+)(\s[\s\S]*)?$/.exec(texto);
  if (!m) return texto;

  const infinitivo = m[1];
  const resto = m[2] ?? '';
  const plural = pareceplural(resto);
  const conjugado = aPreterito(infinitivo, plural);

  if (!conjugado) {
    // No se reconoció el verbo: se devuelve la obligación como enunciado
    // cumplido, sin inventar. La persona puede corregirlo antes de generar.
    return impersonal
      ? `Se dio cumplimiento a lo relativo a: ${minuscula(texto)}`
      : `Dio cumplimiento a lo relativo a: ${minuscula(texto)}`;
  }

  const cuerpo = limpiarPosesivo(resto).replace(/\s+/g, ' ').trimEnd();
  const cierre = /[.!?]$/.test(cuerpo) ? '' : '.';

  if (impersonal) {
    return `Se ${conjugado}${cuerpo}${cierre}`;
  }
  return `${mayuscula(conjugado)}${cuerpo}${cierre}`;
}

function minuscula(s: string): string {
  return s.charAt(0).toLowerCase() + s.slice(1);
}

function mayuscula(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** Redacta todas las actividades que falten, conservando las ya escritas. */
export function completarActividades(
  obligaciones: { n: number; texto: string; actividad?: string }[],
  impersonal = true,
): string[] {
  return obligaciones.map((o) =>
    o.actividad && o.actividad.trim().length > 0
      ? o.actividad
      : redactarActividad(o.texto, impersonal),
  );
}
