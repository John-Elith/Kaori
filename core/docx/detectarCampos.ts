/**
 * Detección automática de campos variables dentro de una plantilla.
 *
 * Hay dos estrategias, y la segunda es mucho mejor cuando se puede usar:
 *
 *  1. `detectarPorPatron` — busca formas reconocibles (números de contrato,
 *     cédulas, montos, fechas, frases en letras). Funciona siempre, pero acierta
 *     de forma aproximada y necesita que el usuario confirme.
 *
 *  2. `sugerirDesdeValores` — si el usuario indica a qué contrato y mes
 *     corresponde la plantilla que subió, se buscan sus valores exactos. Esto
 *     acierta casi siempre, porque no adivina: compara contra el dato real.
 *
 * El asistente de mapeo usa las dos: propone, y la persona confirma. Nunca se
 * aplica una detección a ciegas.
 */

import type { CampoId, TipoDocumento } from './campos';
import type { MapaTexto } from './mapaTexto';
import { detectarPorAnclas, zonasIgnoradasDe } from './anclas';

export type Confianza = 'alta' | 'media' | 'baja';

export type Candidato = {
  inicio: number;
  fin: number;
  texto: string;
  /** Campos posibles, del más probable al menos */
  sugerencias: CampoId[];
  confianza: Confianza;
  /** Por qué se propuso, para mostrarlo en el asistente */
  motivo: string;
};

type Patron = {
  re: RegExp;
  sugerencias: CampoId[];
  confianza: Confianza;
  motivo: string;
};

const MESES =
  'enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|octubre|noviembre|diciembre';

const PATRONES: Patron[] = [
  {
    re: /\bCD\s+\d{3}-\d{4}\b/g,
    sugerencias: ['numeroContratoCD'],
    confianza: 'alta',
    motivo: 'Número de contrato con prefijo CD',
  },
  {
    re: /\b\d{3}-\d{4}\b/g,
    sugerencias: ['numeroContrato'],
    confianza: 'alta',
    motivo: 'Formato de número de contrato (NNN-AAAA)',
  },
  {
    re: /\b\d{1,3}(?:\.\d{3})+\b(?!\s*\))/g,
    sugerencias: ['cedula'],
    confianza: 'media',
    motivo: 'Número con separadores de miles: puede ser una cédula',
  },
  {
    re: /\$\s?\d{1,3}(?:\.\d{3})*/g,
    sugerencias: [
      'pagoMesValor',
      'totalPagado',
      'valorInicialContrato',
      'valorEjecutado',
      'valorPorEjecutar',
      'sumasIguales',
      'valorAdiciones',
    ],
    confianza: 'media',
    motivo: 'Monto en pesos',
  },
  {
    re: /\b\d{2}\/\d{2}\/\d{4}\b/g,
    sugerencias: ['fechaFirmaContrato', 'fechaInicioCorta', 'fechaTerminacionCorta'],
    confianza: 'media',
    motivo: 'Fecha en formato dd/mm/aaaa',
  },
  {
    // Un móvil colombiano son diez dígitos que empiezan por 3, así que ahí el
    // teléfono va primero. Las planillas y los CDP también tienen diez, de modo
    // que se ofrecen detrás en vez de descartarlos.
    re: /\b3\d{9}\b/g,
    sugerencias: ['telefono', 'planillaNumero', 'cdpNumero', 'rpNumero'],
    confianza: 'media',
    motivo: 'Diez dígitos empezando por 3: teléfono, o planilla PILA',
  },
  {
    re: /\b\d{10}\b/g,
    sugerencias: ['planillaNumero', 'cdpNumero', 'rpNumero', 'telefono'],
    confianza: 'media',
    motivo: 'Número de 10 dígitos: planilla PILA, CDP o RP',
  },
  {
    re: new RegExp(`\\b\\d{2} de (?:${MESES}) de \\d{4}\\b`, 'gi'),
    sugerencias: ['fechaInicio', 'fechaTerminacion'],
    confianza: 'alta',
    motivo: 'Fecha escrita como "07 de enero de 2025"',
  },
  {
    re: /En constancia de lo anterior[^.]*\./g,
    sugerencias: ['fraseFirma'],
    confianza: 'alta',
    motivo: 'Frase de firma del informe de actividad',
  },
  {
    re: /En constancia se expide[^.]*\./g,
    sugerencias: ['fraseConstancia'],
    confianza: 'alta',
    motivo: 'Frase de constancia del informe de supervisión',
  },
  {
    re: /Desde el [^.]*?\(\d{4}\)\./g,
    sugerencias: ['frasePeriodoSupervision'],
    confianza: 'alta',
    motivo: 'Periodo del informe de supervisión en letras',
  },
  {
    re: /\bPago realizado, mes de (?:\w+)/gi,
    sugerencias: ['descripcionPagoMes'],
    confianza: 'alta',
    motivo: 'Descripción del pago del mes',
  },
  {
    re: /\b\d{9}-\d\b/g,
    sugerencias: ['nitContratante'],
    confianza: 'alta',
    motivo: 'Formato de NIT',
  },
  {
    re: /[A-ZÁÉÍÓÚÑ ]*MILLONES?[^)]*\([^)]*\)/g,
    sugerencias: ['valorContratoLetras', 'cdpValorLetras', 'rpValorLetras'],
    confianza: 'alta',
    motivo: 'Monto escrito en letras',
  },
];

/** Candidatos hallados por forma. Se ordenan por posición en el documento. */
export function detectarPorPatron(mapa: MapaTexto): Candidato[] {
  const bruto: Candidato[] = [];

  for (const p of PATRONES) {
    const re = new RegExp(p.re.source, p.re.flags);
    let m: RegExpExecArray | null;
    while ((m = re.exec(mapa.texto)) !== null) {
      if (m[0].trim().length === 0) {
        re.lastIndex += 1;
        continue;
      }
      bruto.push({
        inicio: m.index,
        fin: m.index + m[0].length,
        texto: m[0],
        sugerencias: p.sugerencias,
        confianza: p.confianza,
        motivo: p.motivo,
      });
    }
  }

  return resolverSolapamientos(bruto);
}

const RANGO: Record<Confianza, number> = { alta: 3, media: 2, baja: 1 };

/**
 * Cuando dos patrones cubren el mismo texto se conserva el más específico:
 * primero por confianza, y a igual confianza el que abarque más caracteres.
 * Así "CD 078-2025" gana sobre "078-2025", y la frase completa de firma gana
 * sobre el "(31)" que lleva dentro.
 */
function resolverSolapamientos(candidatos: Candidato[]): Candidato[] {
  const ordenados = candidatos.slice().sort((a, b) => {
    if (RANGO[b.confianza] !== RANGO[a.confianza]) {
      return RANGO[b.confianza] - RANGO[a.confianza];
    }
    return b.fin - b.inicio - (a.fin - a.inicio);
  });

  const aceptados: Candidato[] = [];
  for (const c of ordenados) {
    const chocaConOtro = aceptados.some((a) => c.inicio < a.fin && c.fin > a.inicio);
    if (!chocaConOtro) aceptados.push(c);
  }

  return aceptados.sort((a, b) => a.inicio - b.inicio);
}

/**
 * Localiza los valores exactos que el usuario ya conoce.
 *
 * Es la vía fiable: en lugar de adivinar qué significa "10.345.678", se busca
 * la cédula real del contratista y se marca cada aparición. Devuelve un
 * candidato por aparición, con confianza alta.
 */
export function sugerirDesdeValores(
  mapa: MapaTexto,
  valores: Partial<Record<CampoId, string>>,
): Candidato[] {
  const encontrados: Candidato[] = [];

  // Un mismo valor puede ser el de varios campos: el CDP y el RP de un contrato
  // llevan a veces el mismo número. Entonces el valor no dice cuál es cuál, y
  // asignar todas sus apariciones al primero dejaba el RP sin ninguna: el
  // documento generado ponía el número del CDP en la casilla del RP.
  const camposPorValor = new Map<string, CampoId[]>();
  for (const [campo, valor] of Object.entries(valores) as [CampoId, string | undefined][]) {
    if (typeof valor !== 'string' || valor.length === 0) continue;
    camposPorValor.set(valor, [...(camposPorValor.get(valor) ?? []), campo]);
  }

  // Los valores más largos se buscan primero para que un texto contenido en
  // otro (p. ej. la cédula dentro de la frase completa) no gane la posición.
  const entradas = [...camposPorValor.entries()].sort((a, b) => b[0].length - a[0].length);

  for (const [valor, campos] of entradas) {
    const ambiguo = campos.length > 1;
    let desde = 0;
    while (true) {
      const i = mapa.texto.indexOf(valor, desde);
      if (i === -1) break;
      encontrados.push({
        inicio: i,
        fin: i + valor.length,
        texto: valor,
        sugerencias: campos,
        // Ambiguo: confianza media, para que decida el rótulo o la fila de la
        // tabla (las anclas), que sí sabe si esa casilla es la del CDP o la
        // del RP.
        confianza: ambiguo ? 'media' : 'alta',
        motivo: ambiguo
          ? 'Coincide con varios datos registrados a la vez; confirme cuál es'
          : 'Coincide exactamente con el dato registrado del contrato',
      });
      desde = i + valor.length;
    }
  }

  return resolverSolapamientos(encontrados);
}

/**
 * Campos cuyo valor se repite a lo largo del documento: el nombre aparece en el
 * encabezado, bajo la firma del contratista y como beneficiario del CDP y del
 * RP; el número de contrato, en las dos portadas. Una vez que las anclas
 * resuelven el valor, se marcan todas las demás apariciones.
 */
const REPETIBLES: CampoId[] = [
  'nombreContratista',
  'cedula',
  'numeroContrato',
  'supervisorNombre',
  'supervisorCargo',
  'objeto',
  'contratante',
  'nitContratante',
  'textoPlazo',
  'valorContratoLetras',
  'fechaFirmaContrato',
  'fechaInicioCorta',
];

/**
 * Estrategia completa, en tres pasadas de mayor a menor fiabilidad:
 *
 *   1. Valores que el usuario ya tiene registrados (si los hay): coincidencia
 *      exacta, imbatible.
 *   2. Anclas por rótulo: "la celda que sigue a CONTRATISTA: es el nombre".
 *   3. Propagación: buscar las demás apariciones de lo que ya se resolvió.
 *   4. Patrones de forma, sólo para lo que quedó sin cubrir.
 *
 * Las coincidencias de una pasada anterior ganan siempre sobre las posteriores.
 */
export function detectar(
  mapa: MapaTexto,
  valoresConocidos?: Partial<Record<CampoId, string>>,
  tipo: TipoDocumento = 'informe',
): Candidato[] {
  const aceptados: Candidato[] = [];

  const solapa = (c: Candidato) =>
    aceptados.some((a) => c.inicio < a.fin && c.fin > a.inicio);

  const agregar = (nuevos: Candidato[]) => {
    for (const c of resolverSolapamientos(nuevos)) {
      if (!solapa(c)) aceptados.push(c);
    }
  };

  // 1 y 2. Los valores que pertenecen a un solo campo van primero; los que
  // comparten varios (CDP y RP con el mismo número) van después de las anclas,
  // para que el rótulo o la fila decida cuál es cuál y el valor sólo rellene
  // lo que las anclas no alcancen.
  const deValores = valoresConocidos ? sugerirDesdeValores(mapa, valoresConocidos) : [];
  agregar(deValores.filter((c) => c.sugerencias.length === 1));
  agregar(detectarPorAnclas(mapa, tipo));
  agregar(deValores.filter((c) => c.sugerencias.length > 1));

  // 3 — propagar lo ya resuelto al resto del documento
  const resueltos: Partial<Record<CampoId, string>> = {};
  for (const c of aceptados) {
    const campo = c.sugerencias[0];
    if (campo && REPETIBLES.includes(campo) && !resueltos[campo]) {
      resueltos[campo] = c.texto;
    }
  }
  if (Object.keys(resueltos).length > 0) {
    agregar(
      sugerirDesdeValores(mapa, resueltos).map((c) => ({
        ...c,
        motivo: 'Otra aparición del mismo dato en el documento',
      })),
    );
  }

  // 4 — patrones de forma, sin entrar en las zonas que se regeneran solas.
  //
  // Sólo en el informe: la cuenta y el certificado se reconocen enteros por
  // sus rótulos, y añadir ahí «esto parece una cédula» volvería a llenar el
  // asistente de la basura que las anclas vinieron a quitar.
  if (tipo === 'informe') {
    const zonas = zonasIgnoradasDe(mapa, tipo);
    agregar(
      detectarPorPatron(mapa).filter(
        (c) => !zonas.some((z) => c.inicio < z.hasta && c.fin > z.desde),
      ),
    );
  }

  return aceptados.sort((a, b) => a.inicio - b.inicio);
}

/** Fragmento de texto alrededor de un candidato, para mostrarlo en contexto. */
export function contexto(mapa: MapaTexto, c: Candidato, margen = 60): string {
  const inicio = Math.max(0, c.inicio - margen);
  const fin = Math.min(mapa.texto.length, c.fin + margen);
  const antes = mapa.texto.slice(inicio, c.inicio).replace(/\n/g, ' ');
  const despues = mapa.texto.slice(c.fin, fin).replace(/\n/g, ' ');
  return `${inicio > 0 ? '…' : ''}${antes}«${c.texto}»${despues}${fin < mapa.texto.length ? '…' : ''}`;
}
