/**
 * Detección de campos anclada a los rótulos del informe.
 *
 * Es la estrategia principal, y es muy superior a adivinar por la forma del
 * texto. El informe es una sucesión de tablas rótulo → valor, y cada celda cae
 * en su propio párrafo, así que la estructura es directamente aprovechable:
 *
 *     CONTRATISTA:                    ← rótulo
 *     JUAN PEREZ GOMEZ     ← valor
 *     C.C. No.
 *     10.123.456 OLAYA HERRERA
 *
 * Reconocer "la línea que sigue a CONTRATISTA: es el nombre" acierta siempre,
 * mientras que "un texto en mayúsculas puede ser un nombre" acertaba por
 * casualidad y llenaba el asistente de basura.
 *
 * Los rótulos se tomaron de los informes reales del municipio.
 */

import type { CampoId, TipoDocumento } from './campos';
import type { MapaTexto } from './mapaTexto';
import type { Candidato } from './detectarCampos';

export type Linea = {
  /** Número de línea dentro del texto plano */
  n: number;
  texto: string;
  /** Offset del inicio de la línea en `MapaTexto.texto` */
  inicio: number;
  /** Offset del final (exclusivo) */
  fin: number;
};

/** Parte el texto plano en líneas conservando sus offsets. */
export function lineasDe(mapa: MapaTexto): Linea[] {
  const lineas: Linea[] = [];
  let inicio = 0;
  let n = 0;

  for (const texto of mapa.texto.split('\n')) {
    lineas.push({ n, texto, inicio, fin: inicio + texto.length });
    inicio += texto.length + 1; // +1 por el salto
    n += 1;
  }

  return lineas;
}

/**
 * Rótulos que introducen uno o más valores en las líneas siguientes.
 *
 * `campos` se asigna a las siguientes líneas no vacías, en orden. Un `null`
 * salta esa línea sin asignarle nada (por ejemplo, la celda del beneficiario,
 * que no es un campo variable).
 */
type ReglaRotulo = {
  rotulo: RegExp;
  campos: (CampoId | null)[];
  /** Nota que se muestra en el asistente */
  motivo: string;
  /** En qué documentos se aplica. Sin declarar, sólo en el informe. */
  tipos?: TipoDocumento[];
  /**
   * Los valores son las celdas de una fila, y cuentan por posición.
   *
   * Sin esto, una celda vacía se salta y corre todas las demás una columna a la
   * izquierda: con el NÚMERO del CDP en blanco, su número acababa impreso en la
   * columna VALOR y el valor en letras en la de BENEFICIARIO, tapando el nombre
   * del contratista. En una fila de tabla el hueco es una celda como cualquier
   * otra y tiene que consumir su turno.
   */
  posicional?: boolean;
  /**
   * Comprobación extra sobre el primer valor. Necesaria cuando un mismo rótulo
   * aparece en dos sitios con significados distintos — "VALOR" es el valor del
   * contrato en la tabla administrativa, pero también el encabezado de la
   * columna de importes en la tabla de pagos.
   */
  valida?: (texto: string) => boolean;
};

const REGLAS: ReglaRotulo[] = [
  {
    rotulo: /^CONTRATO DE PRESTACI[ÓO]N DE SERVICIOS\s*N[o°]\.?:?$/i,
    campos: ['numeroContrato'],
    motivo: 'Valor de la celda "CONTRATO DE PRESTACIÓN DE SERVICIOS No:"',
  },
  // Los dos puntos son imprescindibles: "Año" a secas es el encabezado de la
  // tabla del periodo, y "Contratista" a secas es el rótulo bajo la firma.
  { rotulo: /^A[ñn]o:$/i, campos: ['anio'], motivo: 'Valor de la celda "Año:"' },
  {
    rotulo: /^CONTRATISTA:$/i,
    campos: ['nombreContratista'],
    motivo: 'Valor de la celda "CONTRATISTA:"',
  },
  {
    rotulo: /^CONTRATISTA O PARTE CONTRACTUAL$/i,
    campos: ['nombreContratista'],
    motivo: 'Valor de la celda "CONTRATISTA O PARTE CONTRACTUAL"',
  },
  { rotulo: /^PLAZO:?$/i, campos: ['textoPlazo'], motivo: 'Valor de la celda "PLAZO:"' },
  {
    rotulo: /^PLAZO DE EJECUCI[ÓO]N$/i,
    campos: ['textoPlazo'],
    motivo: 'Valor de la celda "PLAZO DE EJECUCIÓN"',
  },
  { rotulo: /^OBJETO$/i, campos: ['objeto'], motivo: 'Valor de la celda "OBJETO"' },
  {
    rotulo: /^FECHA DE INICIO$/i,
    campos: ['fechaInicio'],
    motivo: 'Valor de la celda "FECHA DE INICIO"',
  },
  {
    rotulo: /^FECHA DE TERMINACI[ÓO]N$/i,
    campos: ['fechaTerminacion'],
    motivo: 'Valor de la celda "FECHA DE TERMINACIÓN"',
  },
  {
    rotulo: /^FECHA DE FIRMA DEL CONTRATO$/i,
    campos: ['fechaFirmaContrato'],
    motivo: 'Valor de la celda "FECHA DE FIRMA DEL CONTRATO"',
  },
  {
    rotulo: /^FECHA DE INICIO CONTRATO$/i,
    campos: ['fechaInicioCorta'],
    motivo: 'Valor de la celda "FECHA DE INICIO CONTRATO"',
  },
  {
    rotulo: /^FECHA DE TERMINACI[ÓO]N DEL CONTRATO\.?$/i,
    campos: ['fechaTerminacionLarga'],
    motivo: 'Valor de la celda "FECHA DE TERMINACIÓN DEL CONTRATO"',
  },
  {
    rotulo: /^PERIODO DEL INFORME DE SUPERVISI[ÓO]N$/i,
    campos: ['frasePeriodoSupervision'],
    motivo: 'Valor de la celda "PERIODO DEL INFORME DE SUPERVISIÓN"',
  },
  {
    rotulo: /^CONTRATANTE$/i,
    campos: ['contratante'],
    motivo: 'Valor de la celda "CONTRATANTE"',
  },
  {
    rotulo: /^VALOR$/i,
    campos: ['valorContratoLetras'],
    motivo: 'Valor de la celda "VALOR"',
    // Distingue el valor del contrato (escrito en letras) del encabezado
    // "VALOR" de la tabla de pagos, cuya celda siguiente es sólo un número.
    valida: (t) => /PESOS|M\/?CTE|M\/?TCE/i.test(t),
  },
  {
    rotulo: /^FORMA DE PAGO$/i,
    campos: ['formaDePago'],
    motivo: 'Valor de la celda "FORMA DE PAGO"',
  },
  {
    rotulo: /^SUPERVISOR$/i,
    campos: ['supervisorNombre', 'supervisorCargo'],
    motivo: 'Nombre y cargo bajo la celda "SUPERVISOR"',
  },
  // Estas dos son filas de tabla: DD | MM | AAA | NÚMERO | VALOR | BENEFICIARIO.
  // Van por posición para que una celda vacía no corra las demás de columna.
  {
    rotulo: /^CERTIFICADO DE DISPONIBILIDAD PRESUPUESTAL$/i,
    campos: ['cdpFechaDia', 'cdpFechaMes', 'cdpFechaAnio', 'cdpNumero', 'cdpValorLetras'],
    motivo: 'Fila del CDP: día, mes, año, número y valor',
    posicional: true,
  },
  {
    rotulo: /^REGISTRO PRESUPUESTAL$/i,
    campos: ['rpFechaDia', 'rpFechaMes', 'rpFechaAnio', 'rpNumero', 'rpValorLetras'],
    motivo: 'Fila del RP: día, mes, año, número y valor',
    posicional: true,
  },
  {
    rotulo: /^TOTAL,?\s*PAGADO HASTA LA FECHA$/i,
    campos: ['totalPagado'],
    motivo: 'Valor de "TOTAL, PAGADO HASTA LA FECHA"',
  },
  {
    rotulo: /^VALOR \(INICIAL\) DEL CONTRATO$/i,
    campos: ['valorInicialContrato'],
    motivo: 'Columna VALOR TOTAL de "VALOR (INICIAL) DEL CONTRATO"',
  },
  {
    rotulo: /^VALOR ADICIONES/i,
    campos: ['valorAdicionesTotal', 'valorAdiciones'],
    motivo: 'Las dos columnas de "VALOR ADICIONES"',
  },
  {
    rotulo: /^VALOR EJECUTADO$/i,
    campos: ['valorEjecutadoTotal', 'valorEjecutado'],
    motivo: 'Las dos columnas de "VALOR EJECUTADO"',
  },
  {
    rotulo: /^VALOR POR EJECUTAR/i,
    campos: ['valorPorEjecutarTotal', 'valorPorEjecutar'],
    motivo: 'Las dos columnas de "VALOR POR EJECUTAR"',
  },
  {
    rotulo: /^SUMAS IGUALES$/i,
    campos: ['sumasIguales', 'sumasIguales'],
    motivo: 'Las dos columnas de "SUMAS IGUALES"',
  },

  // ── Cuenta de cobro ───────────────────────────────────────────────────────
  // Aquí sí vale la forma «rótulo arriba, valor debajo»: el nombre del
  // contratista va en su propio renglón bajo "DEBE A:".
  {
    rotulo: /^DEBE A:?$/i,
    campos: ['nombreContratista'],
    motivo: 'Nombre bajo el rótulo "DEBE A:"',
    tipos: ['cuentaDeCobro'],
  },
];

/** Líneas que son rótulos o encabezados: nunca son un valor. */
const ES_ROTULO_O_ENCABEZADO = [
  ...REGLAS.map((r) => r.rotulo),
  /^No\.?$/i,
  /^D[íi]a$/i,
  /^Mes$/i,
  /^A[ñn]o$/i,
  /^Desde:?$/i,
  /^Hasta:?$/i,
  /^DD$/i,
  /^MM$/i,
  /^AAA A?$/i,
  /^AAA$/i,
  /^aaa$/i,
  /^dd$/i,
  /^mm$/i,
  /^FECHA$/i,
  /^FECHA DE PAGO$/i,
  /^N[ÚU]MERO$/i,
  /^BENEFICIARIO$/i,
  /^CONCEPTO$/i,
  /^DESCRIPCI[ÓO]N$/i,
  /^PAGO$/i,
  /^valor total$/i,
  /^recursos ejecutados y por ejecutar$/i,
  /^OBLIGACIONES ESPECIFICAS$/i,
  /^ACTIVIDADES EJECUTADAS$/i,
  /^DETALLE DE LA EJECUCI[ÓO]N$/i,
  /^ELEMENTOS DE ORDEN/i,
  /^MES DE PAGO$/i,
  /^N[ÚU]MERO DE PLANILLA$/i,
  /^Observaciones$/i,
  /^Garant[íi]as del proceso:?$/i,
  /^Relaci[óo]n de pagos efectuados$/i,
  /^P[ÓO]LIZA No\.?$/i,
  /^AMPAROS$/i,
  /^VALORES ASEGURADOS$/i,
  /^APROBADAS SI O NO$/i,
  /^VIGENCIAS$/i,
  /^SALDO A LIBERAR/i,
  /^PERIODO DEL INFORME:?$/i,
];

function esRotulo(texto: string): boolean {
  const t = texto.trim();
  return ES_ROTULO_O_ENCABEZADO.some((re) => re.test(t));
}

const MESES =
  'enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|setiembre|octubre|noviembre|diciembre';

/** Recorta los espacios de un rango, para no marcar el relleno de la celda. */
function recortar(linea: Linea): { inicio: number; fin: number; texto: string } | null {
  const bruto = linea.texto;
  const iniRel = bruto.length - bruto.trimStart().length;
  const finRel = bruto.trimEnd().length;
  if (finRel <= iniRel) return null;
  return {
    inicio: linea.inicio + iniRel,
    fin: linea.inicio + finRel,
    texto: bruto.slice(iniRel, finRel),
  };
}

function candidato(
  linea: Linea,
  campo: CampoId,
  motivo: string,
): Candidato | null {
  const r = recortar(linea);
  if (!r) return null;
  return {
    inicio: r.inicio,
    fin: r.fin,
    texto: r.texto,
    sugerencias: [campo],
    confianza: 'alta',
    motivo,
  };
}

export type Zona = { desde: number; hasta: number };

/**
 * Zonas del documento que el programa regenera completas y que, por tanto, no
 * deben mapearse celda por celda: la tabla del cronograma de pagos y las tablas
 * de obligaciones. Marcarlas evitaba llenar el asistente de filas inútiles como
 * "31/01/2025" o "$ 1.623.000", que además se confundían con otros campos.
 */
export function zonasIgnoradas(lineas: Linea[]): Zona[] {
  const zonas: Zona[] = [];

  for (let i = 0; i + 2 < lineas.length; i++) {
    if (!/^PAGO$/i.test(lineas[i].texto.trim())) continue;
    if (!/^FECHA$/i.test(lineas[i + 1].texto.trim())) continue;
    if (!/^VALOR$/i.test(lineas[i + 2].texto.trim())) continue;

    // Consumir las filas «número / fecha / importe» hasta que dejen de aparecer.
    let j = i + 3;
    while (j + 2 < lineas.length) {
      const n = lineas[j].texto.trim();
      const f = lineas[j + 1].texto.trim();
      const v = lineas[j + 2].texto.trim();
      const esFila =
        /^\d{1,2}$/.test(n) && /^\d{2}\/\d{2}\/\d{4}$/.test(f) && /^\$?\s?[\d.]+$/.test(v);
      if (!esFila) break;
      j += 3;
    }

    zonas.push({ desde: lineas[i].inicio, hasta: lineas[j - 1]?.fin ?? lineas[i].fin });
    i = j;
  }

  return zonas;
}

function enZona(inicio: number, fin: number, zonas: Zona[]): boolean {
  return zonas.some((z) => inicio < z.hasta && fin > z.desde);
}

/**
 * Recorre el documento aplicando las reglas de rótulo y los bloques especiales.
 */
export function detectarPorAnclas(
  mapa: MapaTexto,
  tipo: TipoDocumento = 'informe',
): Candidato[] {
  const lineas = lineasDe(mapa);
  const zonas = tipo === 'informe' ? zonasIgnoradas(lineas) : zonasDeLista(lineas);
  const encontrados: Candidato[] = [];
  const aplica = (r: { tipos?: TipoDocumento[] }) =>
    (r.tipos ?? ['informe']).includes(tipo);

  // ── Rótulo → valores en las líneas siguientes ────────────────────────────
  for (let i = 0; i < lineas.length; i++) {
    const t = lineas[i].texto.trim();
    if (t.length === 0) continue;
    if (enZona(lineas[i].inicio, lineas[i].fin, zonas)) continue;

    const regla = REGLAS.filter(aplica).find((r) => r.rotulo.test(t));
    if (!regla) continue;

    // Localizar el primer valor para poder validarlo antes de aceptar la regla.
    let primero = i + 1;
    while (primero < lineas.length && lineas[primero].texto.trim().length === 0) primero++;
    if (primero >= lineas.length || esRotulo(lineas[primero].texto)) continue;
    if (regla.valida && !regla.valida(lineas[primero].texto.trim())) continue;

    let j = primero;
    let esElPrimero = true;

    for (const campo of regla.campos) {
      // Los huecos se saltan… salvo en las reglas posicionales, donde una celda
      // vacía es una celda igualmente y ocupa su sitio en la fila.
      if (esElPrimero || !regla.posicional) {
        while (j < lineas.length && lineas[j].texto.trim().length === 0) j++;
      }
      esElPrimero = false;

      if (j >= lineas.length) break;
      if (esRotulo(lineas[j].texto)) break;

      if (campo) {
        const c = candidato(lineas[j], campo, regla.motivo);
        if (c) encontrados.push(c);
      }
      j++;
    }
  }

  // ── Valor dentro de la misma línea que su rótulo ──────────────────────────
  //
  // La cuenta de cobro y el certificado no son tablas de rótulo y valor sino
  // prosa: «TELEFONO: 3001234567» va todo seguido. Ahí no sirve mirar la línea
  // siguiente, hay que recortar dentro de la propia línea.
  const enLinea = REGLAS_EN_LINEA.filter(aplica);
  for (const linea of lineas) {
    if (enZona(linea.inicio, linea.fin, zonas)) continue;
    for (const regla of enLinea) {
      encontrados.push(...aplicarEnLinea(linea, regla));
    }
  }

  // Los bloques de abajo son de la estructura del informe: sus tablas de días,
  // planillas y balances no existen en los otros dos documentos.
  if (tipo === 'informe') {
    encontrados.push(...detectarCedula(lineas));
    encontrados.push(...detectarPeriodo(lineas));
    encontrados.push(...detectarPagoDelMes(lineas));
    encontrados.push(...detectarPlanilla(lineas));
    encontrados.push(...detectarFrases(lineas));
    encontrados.push(...detectarNumeroCd(lineas));
    encontrados.push(...detectarNit(lineas));
  }

  return encontrados.filter((c) => !enZona(c.inicio, c.fin, zonas));
}

/** Las mismas zonas, calculadas directamente desde el mapa de texto. */
export function zonasIgnoradasDe(
  mapa: MapaTexto,
  tipo: TipoDocumento = 'informe',
): Zona[] {
  const lineas = lineasDe(mapa);
  return tipo === 'informe' ? zonasIgnoradas(lineas) : zonasDeLista(lineas);
}

/**
 * La lista de actividades del certificado, que se regenera entera.
 *
 * No hay ninguna marca en el texto que diga «aquí empieza la lista», así que se
 * delimita por sus extremos: arranca tras «…las siguientes actividades:» y
 * termina donde empieza «Dentro del contrato». Si la redacción cambiara, lo
 * único que se pierde es que el asistente proponga unas líneas de más.
 */
export function zonasDeLista(lineas: Linea[]): Zona[] {
  const inicio = lineas.findIndex((l) => /siguientes actividades:?\s*$/i.test(l.texto));
  if (inicio === -1 || inicio + 1 >= lineas.length) return [];

  const corte = lineas.findIndex(
    (l, i) => i > inicio && /^\s*Dentro del contrato/i.test(l.texto),
  );
  const ultima = corte === -1 ? lineas.length - 1 : corte - 1;
  if (ultima <= inicio) return [];

  return [{ desde: lineas[inicio + 1].inicio, hasta: lineas[ultima].fin }];
}

/**
 * "C.C. No. 10.123.456 OLAYA HERRERA" — la cédula y el lugar de expedición
 * comparten celda, así que se marcan como dos trozos dentro de la misma línea.
 */
function detectarCedula(lineas: Linea[]): Candidato[] {
  const salida: Candidato[] = [];

  for (let i = 0; i < lineas.length; i++) {
    const t = lineas[i].texto;
    if (!/C\.?\s?C\.?\s*N[o°]/i.test(t)) continue;

    // El valor puede estar en la misma línea o en la siguiente.
    const objetivos = [lineas[i]];
    if (i + 1 < lineas.length) objetivos.push(lineas[i + 1]);

    for (const linea of objetivos) {
      const m = /(\d{1,3}(?:\.\d{3})+)(\s+(?:DE\s+)?([A-ZÁÉÍÓÚÑ][A-ZÁÉÍÓÚÑ ]*[A-ZÁÉÍÓÚÑ]))?/.exec(
        linea.texto,
      );
      if (!m) continue;

      const iniCedula = linea.inicio + m.index;
      salida.push({
        inicio: iniCedula,
        fin: iniCedula + m[1].length,
        texto: m[1],
        sugerencias: ['cedula'],
        confianza: 'alta',
        motivo: 'Cédula en la celda "C.C. No."',
      });

      if (m[3]) {
        const iniLugar = linea.inicio + m.index + m[0].indexOf(m[3]);
        salida.push({
          inicio: iniLugar,
          fin: iniLugar + m[3].length,
          texto: m[3],
          sugerencias: ['cedulaExpedidaEn'],
          confianza: 'alta',
          motivo: 'Lugar de expedición de la cédula',
        });
      }
      break; // sólo el primer sitio donde aparece tras el rótulo
    }
  }

  return salida;
}

/**
 * Tabla del periodo: tras "PERIODO DEL INFORME" vienen los encabezados
 * (Desde / Día / Mes / Año / Hasta / …) y luego seis cifras.
 */
function detectarPeriodo(lineas: Linea[]): Candidato[] {
  const i = lineas.findIndex((l) => /^PERIODO DEL INFORME:?$/i.test(l.texto.trim()));
  if (i === -1) return [];

  const campos: CampoId[] = [
    'periodoDesdeDia',
    'periodoDesdeMes',
    'periodoDesdeAnio',
    'periodoHastaDia',
    'periodoHastaMes',
    'periodoHastaAnio',
  ];

  const valores: Linea[] = [];
  for (let j = i + 1; j < lineas.length && valores.length < 6; j++) {
    const t = lineas[j].texto.trim();
    if (t.length === 0) continue;
    if (/^\d{1,4}$/.test(t)) valores.push(lineas[j]);
    else if (!esRotulo(t)) break; // se salió de la tabla del periodo
  }

  if (valores.length < 6) return [];

  return valores
    .map((l, k) =>
      candidato(l, campos[k], 'Tabla "PERIODO DEL INFORME": día, mes y año'),
    )
    .filter((c): c is Candidato => c !== null);
}

/** "Pago realizado, mes de enero" seguido del año y del valor. */
function detectarPagoDelMes(lineas: Linea[]): Candidato[] {
  const salida: Candidato[] = [];
  const i = lineas.findIndex((l) =>
    new RegExp(`^Pago realizado,?\\s*mes de\\s+(${MESES})`, 'i').test(l.texto.trim()),
  );
  if (i === -1) return salida;

  const c = candidato(lineas[i], 'descripcionPagoMes', 'Descripción del pago del mes');
  if (c) salida.push(c);

  const campos: CampoId[] = ['pagoMesAnio', 'pagoMesValor'];
  let j = i + 1;
  for (const campo of campos) {
    while (j < lineas.length && lineas[j].texto.trim().length === 0) j++;
    if (j >= lineas.length || esRotulo(lineas[j].texto)) break;
    const x = candidato(lineas[j], campo, 'Año y valor del pago del mes');
    if (x) salida.push(x);
    j++;
  }

  return salida;
}

/** Bloque de la planilla PILA: número, día, mes, año y mes acreditado. */
function detectarPlanilla(lineas: Linea[]): Candidato[] {
  const i = lineas.findIndex((l) => /^N[ÚU]MERO DE PLANILLA$/i.test(l.texto.trim()));
  if (i === -1) return [];

  const salida: Candidato[] = [];
  const reMes = new RegExp(`^(${MESES})$`, 'i');
  let numero: Linea | null = null;
  const fecha: Linea[] = [];
  let mes: Linea | null = null;

  for (let j = i + 1; j < lineas.length && j < i + 20; j++) {
    const t = lineas[j].texto.trim();
    if (t.length === 0 || esRotulo(t)) continue;

    if (!numero && /^\d{8,}$/.test(t)) {
      numero = lineas[j];
    } else if (numero && fecha.length < 3 && /^\d{1,4}$/.test(t)) {
      fecha.push(lineas[j]);
    } else if (reMes.test(t)) {
      mes = lineas[j];
      break;
    }
  }

  if (numero) {
    const c = candidato(numero, 'planillaNumero', 'Número de la planilla PILA');
    if (c) salida.push(c);
  }
  const camposFecha: CampoId[] = ['planillaDia', 'planillaMes', 'planillaAnio'];
  fecha.forEach((l, k) => {
    const c = candidato(l, camposFecha[k], 'Fecha de pago de la planilla');
    if (c) salida.push(c);
  });
  if (mes) {
    const c = candidato(mes, 'planillaMesAcreditado', 'Mes acreditado en la planilla');
    if (c) salida.push(c);
  }

  return salida;
}

/** Las frases largas en letras, que se reescriben completas cada mes. */
function detectarFrases(lineas: Linea[]): Candidato[] {
  const salida: Candidato[] = [];

  const frases: { re: RegExp; campo: CampoId; motivo: string }[] = [
    {
      re: /En constancia de lo anterior[\s\S]*?\./,
      campo: 'fraseFirma',
      motivo: 'Frase de firma del informe de actividad',
    },
    {
      re: /En constancia se expide[\s\S]*?\./,
      campo: 'fraseConstancia',
      motivo: 'Frase de constancia del informe de supervisión',
    },
    {
      re: /^Desde el .*?\(\d{4}\)\./,
      campo: 'frasePeriodoSupervision',
      motivo: 'Periodo del informe de supervisión, en letras',
    },
  ];

  for (const linea of lineas) {
    for (const f of frases) {
      const m = f.re.exec(linea.texto);
      if (!m) continue;
      salida.push({
        inicio: linea.inicio + m.index,
        fin: linea.inicio + m.index + m[0].length,
        texto: m[0],
        sugerencias: [f.campo],
        confianza: 'alta',
        motivo: f.motivo,
      });
    }
  }

  return salida;
}

/** "INFORME DE SUPERVISIÓN CONTRATO NO. CD 084-2025" */
function detectarNumeroCd(lineas: Linea[]): Candidato[] {
  const salida: Candidato[] = [];
  for (const linea of lineas) {
    const m = /\bCD\s+\d{3}-\d{4}\b/.exec(linea.texto);
    if (!m) continue;
    salida.push({
      inicio: linea.inicio + m.index,
      fin: linea.inicio + m.index + m[0].length,
      texto: m[0],
      sugerencias: ['numeroContratoCD'],
      confianza: 'alta',
      motivo: 'Número de contrato con prefijo CD, en el encabezado de supervisión',
    });
  }
  return salida;
}

/** "NIT: 800099113-1" */
function detectarNit(lineas: Linea[]): Candidato[] {
  const salida: Candidato[] = [];
  for (const linea of lineas) {
    const m = /\b\d{9}-\d\b/.exec(linea.texto);
    if (!m) continue;
    salida.push({
      inicio: linea.inicio + m.index,
      fin: linea.inicio + m.index + m[0].length,
      texto: m[0],
      sugerencias: ['nitContratante'],
      confianza: 'alta',
      motivo: 'NIT del contratante',
    });
  }
  return salida;
}

// ── Valores dentro de la misma línea ────────────────────────────────────────

/**
 * Reglas cuyo valor va en la misma línea que su rótulo.
 *
 * Cada grupo de captura del patrón se corresponde, en orden, con una entrada de
 * `campos`. Un `null` deja el grupo sin asignar, lo que permite capturar
 * contexto para afinar el patrón sin marcarlo como campo.
 */
type ReglaEnLinea = {
  patron: RegExp;
  campos: (CampoId | null)[];
  motivo: string;
  tipos: TipoDocumento[];
};

const REGLAS_EN_LINEA: ReglaEnLinea[] = [
  // ── Cuenta de cobro ───────────────────────────────────────────────────────
  {
    patron: /^CC\.?\s*([\d.]+)\s+DE\s+(.+?)\s*$/i,
    campos: ['cedula', 'cedulaExpedidaEn'],
    motivo: 'Cédula y lugar de expedición del renglón "CC."',
    tipos: ['cuentaDeCobro'],
  },
  {
    // Se captura TODO lo que siga a «LA SUMA DE», no sólo una cifra con «$».
    // Algunas plantillas lo traen escrito en letras y en números a la vez; si
    // el patrón exigía el «$» al principio, no casaba, el campo se quedaba sin
    // mapear y el documento salía con el importe del contratista anterior.
    // Ese renglón lleva sólo la cifra: las letras van en «VALOR EN LETRAS».
    patron: /^LA SUMA DE\s*_*\s*(\S.*?)\s*$/i,
    campos: ['cuentaValorNumero'],
    motivo: 'Importe del renglón "LA SUMA DE"',
    tipos: ['cuentaDeCobro'],
  },
  {
    patron: /^VALOR EN LETRAS:\s*(.+?)\s*$/i,
    campos: ['cuentaValorLetras'],
    motivo: 'Valor en letras de la cuenta de cobro',
    tipos: ['cuentaDeCobro'],
  },
  {
    patron: /^POR CONCEPTO DE:\s*_*\s*(.+?)\s*$/i,
    campos: ['cuentaConcepto'],
    motivo: 'Párrafo de "POR CONCEPTO DE"',
    tipos: ['cuentaDeCobro'],
  },
  {
    patron: /^C\.C\.?\s*N[o°]\.?\s*([\d.]+)\s*$/i,
    campos: ['cedula'],
    motivo: 'Cédula bajo la firma',
    tipos: ['cuentaDeCobro'],
  },
  {
    patron: /^TEL[EÉ]FONO:\s*(.+?)\s*$/i,
    campos: ['telefono'],
    motivo: 'Teléfono del contratista',
    tipos: ['cuentaDeCobro'],
  },
  {
    patron: /^N[úu]mero de cuenta:\s*(.+?)\s*$/i,
    campos: ['numeroDeCuenta'],
    motivo: 'Número de cuenta bancaria',
    tipos: ['cuentaDeCobro'],
  },
  {
    patron: /^CIUDAD Y FECHA:\s*(.+?)\s*$/i,
    campos: ['cuentaCiudadYFecha'],
    motivo: 'Ciudad y fecha de la cuenta de cobro',
    tipos: ['cuentaDeCobro'],
  },

  // ── Certificado de cumplimiento ───────────────────────────────────────────
  {
    // "Qué; JUAN PEREZ GOMEZ, identificado con Cedula No 10.123.456
    //  de Olaya Herrera – Nariño. Cumplió satisfactoriamente…"
    patron:
      /Qu[eé];?\s*(.+?),\s*identificad[oa] con C[eé]dula\s*N[o°]\.?\s*([\d.]+)\s*de\s*(.+?)\s*\.\s*Cumpli/i,
    campos: ['nombreContratista', 'cedula', 'cedulaExpedidaEn'],
    motivo: 'Nombre, cédula y lugar de expedición del "HACE CONSTAR"',
    tipos: ['certificado'],
  },
  {
    // "No. C.D 084 -2025 de fecha, 07/01/2025"
    patron:
      /N[o°]\.?\s*C\.?\s?D\.?\s*(\d{2,4}\s*-\s*\d{4})\s*de fecha,?\s*(\d{2}\/\d{2}\/\d{4})/i,
    campos: ['numeroContrato', 'fechaInicioCorta'],
    motivo: 'Número y fecha del contrato citados en el certificado',
    tipos: ['certificado'],
  },
  {
    patron: /tiene por objeto\s*[“"”]\s*(.+?)\s*[“"”]/i,
    campos: ['objeto'],
    motivo: 'Objeto entrecomillado del certificado',
    tipos: ['certificado'],
  },
  {
    patron: /(Entre el periodo comprendido\s.+?\.)/i,
    campos: ['certificadoPeriodo'],
    motivo: 'Periodo que cubre el certificado',
    tipos: ['certificado'],
  },
  {
    patron: /(Se expide en\s.+?\(\d{4}\)\.)/i,
    campos: ['certificadoExpedicion'],
    motivo: 'Frase de expedición del certificado',
    tipos: ['certificado'],
  },
];

/**
 * Sitúa cada grupo capturado dentro de la línea.
 *
 * Se buscan los textos capturados uno tras otro, avanzando el punto de
 * búsqueda, en vez de pedirle los índices a la expresión regular: los grupos
 * van siempre en orden dentro de la línea, y así el código no depende de la
 * marca `d` de las expresiones regulares.
 */
function aplicarEnLinea(linea: Linea, regla: ReglaEnLinea): Candidato[] {
  const m = regla.patron.exec(linea.texto);
  if (!m) return [];

  const salida: Candidato[] = [];
  let desde = 0;

  for (let g = 0; g < regla.campos.length; g++) {
    const texto = m[g + 1];
    if (texto === undefined || texto.length === 0) continue;

    const rel = linea.texto.indexOf(texto, desde);
    if (rel === -1) continue;
    desde = rel + texto.length;

    const campo = regla.campos[g];
    if (!campo) continue;

    salida.push({
      inicio: linea.inicio + rel,
      fin: linea.inicio + rel + texto.length,
      texto,
      sugerencias: [campo],
      confianza: 'alta',
      motivo: regla.motivo,
    });
  }

  return salida;
}
