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

/**
 * Verbos en los que el «se» es del propio verbo y no de la pasiva: «Se reunió
 * con el supervisor» es lo que hizo el contratista, y quitarle el «se» lo
 * rompería («Reunió con el supervisor»). Con estos la frase se deja tal cual,
 * que ya está en pasado y se entiende.
 */
const PRONOMINALES = new Set([
  'reunió', 'reunieron', 'comunicó', 'comunicaron', 'presentó', 'presentaron',
  'desplazó', 'desplazaron', 'trasladó', 'trasladaron', 'capacitó', 'capacitaron',
  'dirigió', 'dirigieron', 'encargó', 'encargaron', 'abstuvo', 'abstuvieron',
  'acogió', 'acogieron', 'ajustó', 'ajustaron', 'adhirió', 'adhirieron',
  'sujetó', 'sujetaron', 'dedicó', 'dedicaron', 'esforzó', 'esforzaron',
  'mantuvo', 'mantuvieron', 'mostró', 'mostraron', 'dispuso', 'dispusieron',
]);

/** «realizaron» → «realizó»; «hicieron» → «hizo». */
function aSingular(plural: string): string | null {
  const v = plural.toLowerCase();
  for (const [infinitivo, forma] of Object.entries(IRREGULARES_PLURAL)) {
    if (forma === v) return IRREGULARES[infinitivo];
  }
  if (v.endsWith('aron')) return `${v.slice(0, -4)}ó`;
  if (v.endsWith('yeron')) return `${v.slice(0, -5)}yó`;
  if (v.endsWith('ieron')) return `${v.slice(0, -5)}ió`;
  return null;
}

/**
 * La actividad en tercera persona, para el informe de supervisión.
 *
 * El contratista redacta su informe en impersonal —«Se apoyó en las
 * labores…»—, pero en DETALLE DE LA EJECUCIÓN es el supervisor quien cuenta lo
 * que hizo el contratista: «Apoyó en las labores…». Las dos tablas salen de la
 * misma lista de actividades, así que la segunda se convierte al escribirla.
 *
 * En la pasiva el verbo concuerda con el objeto y aquí con el contratista:
 *   «Se realizaron actividades de limpieza» → «Realizó actividades de limpieza»
 *   «Se le brindó apoyo al supervisor»      → «Le brindó apoyo al supervisor»
 *
 * Lo que no empieza por «Se» + verbo en pasado se deja como está: ya viene en
 * tercera persona o lo escribió alguien a su manera.
 */
export function aTerceraPersona(actividad: string): string {
  const m = /^(\s*)se\s+(?:(le|les)\s+)?([\p{L}]+)([\s\S]*)$/iu.exec(actividad);
  if (!m) return actividad;
  const [, espacio, cliticos, verbo, resto] = m;
  const v = verbo.toLowerCase();

  if (PRONOMINALES.has(v)) return actividad;

  const esSingular =
    /[óé]$/.test(v) || Object.values(IRREGULARES).includes(v);
  const singular = esSingular ? v : aSingular(v);
  if (!singular) return actividad; // no es un verbo en pasado: mejor no tocar

  return cliticos
    ? `${espacio}${mayuscula(cliticos.toLowerCase())} ${singular}${resto}`
    : `${espacio}${mayuscula(singular)}${resto}`;
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
