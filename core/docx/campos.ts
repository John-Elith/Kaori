/**
 * Catálogo de campos variables de un informe.
 *
 * Cada entrada describe un dato que cambia entre informes. El asistente de
 * mapeo recorre este catálogo para preguntar dónde vive cada campo dentro de la
 * plantilla, y el generador lo recorre para saber qué escribir.
 *
 * `frecuencia` distingue tres ritmos de cambio y es lo que permite explicarle al
 * usuario por qué se le pregunta cada cosa:
 *   'contrato' → fijo durante toda la vigencia (nombre, cédula, objeto)
 *   'mes'      → cambia en cada informe mensual (fechas, pagos, planilla)
 *   'tabla'    → filas repetidas (obligaciones, cronograma de pagos)
 */

export type Frecuencia = 'contrato' | 'mes' | 'tabla';

/**
 * Los tres documentos que produce el programa.
 *
 * Comparten casi todos los datos —salen del mismo contrato— pero no la misma
 * plantilla ni el mismo ritmo: el informe y la cuenta de cobro son mensuales,
 * el certificado es uno solo por contrato.
 */
export type TipoDocumento = 'informe' | 'cuentaDeCobro' | 'certificado';

export const TIPOS_DOCUMENTO: { id: TipoDocumento; etiqueta: string; ayuda: string }[] = [
  {
    id: 'informe',
    etiqueta: 'Informe de actividad y supervisión',
    ayuda: 'Uno por contratista y mes',
  },
  {
    id: 'cuentaDeCobro',
    etiqueta: 'Cuenta de cobro',
    ayuda: 'Una por contratista y mes',
  },
  {
    id: 'certificado',
    etiqueta: 'Certificado de cumplimiento',
    ayuda: 'Uno por contrato, al terminar',
  },
];

export type DefinicionCampo = {
  id: CampoId;
  /** Rótulo que ve el usuario en el asistente */
  etiqueta: string;
  frecuencia: Frecuencia;
  /** Grupo para ordenar la interfaz */
  grupo: string;
  /** Valor de ejemplo tomado del informe del contrato 078-2025 */
  ejemplo: string;
  /** Ayuda breve mostrada bajo el rótulo */
  ayuda?: string;
  /**
   * En qué documentos aparece este campo.
   *
   * Sin esto el asistente ofrecería los sesenta campos del informe al mapear
   * una cuenta de cobro, que tiene ocho. Si se omite se entiende `['informe']`,
   * que es de donde viene todo el catálogo original.
   */
  tipos?: TipoDocumento[];
};

export type CampoId =
  // Identificación del contrato
  | 'numeroContrato'
  | 'numeroContratoCD'
  | 'anio'
  | 'nombreContratista'
  | 'cedula'
  | 'cedulaExpedidaEn'
  | 'objeto'
  // Plazos y fechas del contrato
  | 'textoPlazo'
  | 'fechaInicio'
  | 'fechaTerminacion'
  | 'fechaFirmaContrato'
  | 'fechaInicioCorta'
  | 'fechaTerminacionCorta'
  | 'fechaTerminacionLarga'
  // Periodo del informe (tabla de días/mes/año)
  | 'periodoDesdeDia'
  | 'periodoDesdeMes'
  | 'periodoDesdeAnio'
  | 'periodoHastaDia'
  | 'periodoHastaMes'
  | 'periodoHastaAnio'
  // Partes
  | 'contratante'
  | 'nitContratante'
  | 'municipio'
  | 'supervisorNombre'
  | 'supervisorCargo'
  // Valores
  | 'valorContratoLetras'
  | 'formaDePago'
  // Presupuesto
  | 'cdpNumero'
  | 'cdpFechaDia'
  | 'cdpFechaMes'
  | 'cdpFechaAnio'
  | 'cdpValorLetras'
  | 'rpNumero'
  | 'rpFechaDia'
  | 'rpFechaMes'
  | 'rpFechaAnio'
  | 'rpValorLetras'
  // Balance del mes
  | 'descripcionPagoMes'
  | 'pagoMesAnio'
  | 'pagoMesValor'
  | 'totalPagado'
  | 'valorInicialContrato'
  | 'valorAdiciones'
  | 'valorAdicionesTotal'
  | 'valorEjecutado'
  | 'valorEjecutadoTotal'
  | 'valorPorEjecutar'
  | 'valorPorEjecutarTotal'
  | 'sumasIguales'
  // Planilla PILA
  | 'planillaNumero'
  | 'planillaDia'
  | 'planillaMes'
  | 'planillaAnio'
  | 'planillaMesAcreditado'
  // Frases en letras
  | 'fraseFirma'
  | 'frasePeriodoSupervision'
  | 'fraseConstancia'
  // Cuenta de cobro
  | 'cuentaValorNumero'
  | 'cuentaValorLetras'
  | 'cuentaConcepto'
  | 'cuentaCiudadYFecha'
  | 'telefono'
  | 'numeroDeCuenta'
  // Certificado de cumplimiento
  | 'certificadoPeriodo'
  | 'certificadoExpedicion'
  // Tablas y listas
  | 'tablaObligaciones'
  | 'tablaObligacionesSupervision'
  | 'tablaPagos'
  | 'listaActividades';

export const CATALOGO: DefinicionCampo[] = [
  // ── Identificación ────────────────────────────────────────────────────────
  {
    id: 'numeroContrato',
    etiqueta: 'Número de contrato',
    frecuencia: 'contrato',
    grupo: 'Identificación',
    ejemplo: '078-2025',
    tipos: ['informe', 'cuentaDeCobro', 'certificado'],
  },
  {
    id: 'numeroContratoCD',
    etiqueta: 'Número de contrato con prefijo CD',
    frecuencia: 'contrato',
    grupo: 'Identificación',
    ejemplo: 'CD 078-2025',
    ayuda: 'Aparece en el encabezado del INFORME DE SUPERVISIÓN.',
    tipos: ['informe', 'certificado'],
  },
  {
    id: 'anio',
    etiqueta: 'Año',
    frecuencia: 'contrato',
    grupo: 'Identificación',
    ejemplo: '2025',
  },
  {
    id: 'nombreContratista',
    etiqueta: 'Nombre del contratista',
    frecuencia: 'contrato',
    grupo: 'Identificación',
    ejemplo: 'NOMBRE DEL CONTRATISTA',
    ayuda: 'Se reemplaza en todas sus apariciones, incluida la firma.',
    tipos: ['informe', 'cuentaDeCobro', 'certificado'],
  },
  {
    id: 'cedula',
    etiqueta: 'Cédula',
    frecuencia: 'contrato',
    grupo: 'Identificación',
    ejemplo: '123XXXXXXX',
    tipos: ['informe', 'cuentaDeCobro', 'certificado'],
  },
  {
    id: 'cedulaExpedidaEn',
    etiqueta: 'Cédula expedida en',
    frecuencia: 'contrato',
    grupo: 'Identificación',
    ejemplo: 'OLAYA HERRERA',
    tipos: ['informe', 'cuentaDeCobro', 'certificado'],
  },
  {
    id: 'objeto',
    etiqueta: 'Objeto del contrato',
    frecuencia: 'contrato',
    grupo: 'Identificación',
    ejemplo: 'PRESTACIÓN DE SERVICIOS DE APOYO EN LA EJECUCIÓN DEL PLAN DE ACCIÓN…',
    tipos: ['informe', 'certificado'],
  },

  // ── Plazos ────────────────────────────────────────────────────────────────
  {
    id: 'textoPlazo',
    etiqueta: 'Texto del PLAZO',
    frecuencia: 'contrato',
    grupo: 'Plazos',
    ejemplo: 'DESDE EL DÍA SIETE (07) DE ENERO DEL AÑO DOS MIL VEINTICINCO (2025), HASTA…',
  },
  {
    id: 'fechaInicio',
    etiqueta: 'Fecha de inicio',
    frecuencia: 'contrato',
    grupo: 'Plazos',
    ejemplo: '07 de enero de 2025',
  },
  {
    id: 'fechaTerminacion',
    etiqueta: 'Fecha de terminación',
    frecuencia: 'contrato',
    grupo: 'Plazos',
    ejemplo: '30 de junio de 2025',
  },
  {
    id: 'fechaFirmaContrato',
    etiqueta: 'Fecha de firma del contrato',
    frecuencia: 'contrato',
    grupo: 'Plazos',
    ejemplo: '07/01/2025',
  },
  {
    id: 'fechaInicioCorta',
    etiqueta: 'Fecha de inicio (formato corto)',
    frecuencia: 'contrato',
    grupo: 'Plazos',
    ejemplo: '07/01/2025',
    tipos: ['informe', 'certificado'],
  },
  {
    id: 'fechaTerminacionCorta',
    etiqueta: 'Fecha de terminación (formato corto)',
    frecuencia: 'contrato',
    grupo: 'Plazos',
    ejemplo: '30/06/2025',
  },
  {
    id: 'fechaTerminacionLarga',
    etiqueta: 'Fecha de terminación en letras',
    frecuencia: 'contrato',
    grupo: 'Plazos',
    ejemplo: 'Treinta (30) de junio de dos mil veinticinco (2025)',
  },

  // ── Periodo del informe ───────────────────────────────────────────────────
  {
    id: 'periodoDesdeDia',
    etiqueta: 'Periodo — desde (día)',
    frecuencia: 'mes',
    grupo: 'Periodo del informe',
    ejemplo: '07',
  },
  {
    id: 'periodoDesdeMes',
    etiqueta: 'Periodo — desde (mes)',
    frecuencia: 'mes',
    grupo: 'Periodo del informe',
    ejemplo: '01',
  },
  {
    id: 'periodoDesdeAnio',
    etiqueta: 'Periodo — desde (año)',
    frecuencia: 'mes',
    grupo: 'Periodo del informe',
    ejemplo: '2025',
  },
  {
    id: 'periodoHastaDia',
    etiqueta: 'Periodo — hasta (día)',
    frecuencia: 'mes',
    grupo: 'Periodo del informe',
    ejemplo: '31',
  },
  {
    id: 'periodoHastaMes',
    etiqueta: 'Periodo — hasta (mes)',
    frecuencia: 'mes',
    grupo: 'Periodo del informe',
    ejemplo: '01',
  },
  {
    id: 'periodoHastaAnio',
    etiqueta: 'Periodo — hasta (año)',
    frecuencia: 'mes',
    grupo: 'Periodo del informe',
    ejemplo: '2025',
  },

  // ── Partes ────────────────────────────────────────────────────────────────
  {
    id: 'contratante',
    etiqueta: 'Contratante',
    frecuencia: 'contrato',
    grupo: 'Partes',
    ejemplo: 'MUNICIPIO OLAYA HERRERA',
  },
  {
    id: 'nitContratante',
    etiqueta: 'NIT del contratante',
    frecuencia: 'contrato',
    grupo: 'Partes',
    ejemplo: '800099113-1',
  },
  {
    id: 'municipio',
    etiqueta: 'Municipio',
    frecuencia: 'contrato',
    grupo: 'Partes',
    ejemplo: 'Olaya Herrera',
  },
  {
    id: 'supervisorNombre',
    etiqueta: 'Nombre del supervisor',
    frecuencia: 'contrato',
    grupo: 'Partes',
    ejemplo: 'NOMBRE DEL SUPERVISOR',
    tipos: ['informe', 'certificado'],
  },
  {
    id: 'supervisorCargo',
    etiqueta: 'Cargo del supervisor',
    frecuencia: 'contrato',
    grupo: 'Partes',
    ejemplo: 'Secretario de Planeacion Infraestructura y equipamiento Municipal…',
    tipos: ['informe', 'certificado'],
  },

  // ── Valores ───────────────────────────────────────────────────────────────
  {
    id: 'valorContratoLetras',
    etiqueta: 'Valor del contrato en letras',
    frecuencia: 'contrato',
    grupo: 'Valores',
    ejemplo: 'TRECE MILLONES SEISCIENTOS TREINTA MIL PESOS M/CTE ($13.630.000)',
  },
  {
    id: 'formaDePago',
    etiqueta: 'Forma de pago',
    frecuencia: 'contrato',
    grupo: 'Valores',
    ejemplo: 'El Municipio cancelará al contratista la suma de…',
  },

  // ── Presupuesto ───────────────────────────────────────────────────────────
  { id: 'cdpNumero', etiqueta: 'CDP — número', frecuencia: 'contrato', grupo: 'Presupuesto', ejemplo: '202XXXXXXX' },
  { id: 'cdpFechaDia', etiqueta: 'CDP — día', frecuencia: 'contrato', grupo: 'Presupuesto', ejemplo: '02' },
  { id: 'cdpFechaMes', etiqueta: 'CDP — mes', frecuencia: 'contrato', grupo: 'Presupuesto', ejemplo: '01' },
  { id: 'cdpFechaAnio', etiqueta: 'CDP — año', frecuencia: 'contrato', grupo: 'Presupuesto', ejemplo: '2025' },
  {
    id: 'cdpValorLetras',
    etiqueta: 'CDP — valor en letras',
    frecuencia: 'contrato',
    grupo: 'Presupuesto',
    ejemplo: 'CATORCE MILLONES CIEN MIL PESOS M/CTE ($14.100.000)',
  },
  { id: 'rpNumero', etiqueta: 'RP — número', frecuencia: 'contrato', grupo: 'Presupuesto', ejemplo: '202XXXXXXX' },
  { id: 'rpFechaDia', etiqueta: 'RP — día', frecuencia: 'contrato', grupo: 'Presupuesto', ejemplo: '07' },
  { id: 'rpFechaMes', etiqueta: 'RP — mes', frecuencia: 'contrato', grupo: 'Presupuesto', ejemplo: '01' },
  { id: 'rpFechaAnio', etiqueta: 'RP — año', frecuencia: 'contrato', grupo: 'Presupuesto', ejemplo: '2025' },
  {
    id: 'rpValorLetras',
    etiqueta: 'RP — valor en letras',
    frecuencia: 'contrato',
    grupo: 'Presupuesto',
    ejemplo: 'TRECE MILLONES SEISCIENTOS TREINTA MIL PESOS M/CTE ($13.630.000)',
  },

  // ── Balance del mes ───────────────────────────────────────────────────────
  {
    id: 'descripcionPagoMes',
    etiqueta: 'Descripción del pago del mes',
    frecuencia: 'mes',
    grupo: 'Balance del mes',
    ejemplo: 'Pago realizado, mes de enero',
  },
  { id: 'pagoMesAnio', etiqueta: 'Pago del mes — año', frecuencia: 'mes', grupo: 'Balance del mes', ejemplo: '2025' },
  {
    id: 'pagoMesValor',
    etiqueta: 'Pago del mes — valor',
    frecuencia: 'mes',
    grupo: 'Balance del mes',
    ejemplo: '$1.880.000',
  },
  {
    id: 'totalPagado',
    etiqueta: 'TOTAL PAGADO HASTA LA FECHA',
    frecuencia: 'mes',
    grupo: 'Balance del mes',
    ejemplo: '$1.880.000',
  },
  {
    id: 'valorInicialContrato',
    etiqueta: 'VALOR (INICIAL) DEL CONTRATO',
    frecuencia: 'contrato',
    grupo: 'Balance del mes',
    ejemplo: '$13.630.000',
  },
  {
    id: 'valorAdicionesTotal',
    etiqueta: 'VALOR ADICIONES — columna VALOR TOTAL',
    frecuencia: 'mes',
    grupo: 'Balance del mes',
    ejemplo: '$0',
  },
  {
    id: 'valorAdiciones',
    etiqueta: 'VALOR ADICIONES — columna derecha',
    frecuencia: 'mes',
    grupo: 'Balance del mes',
    ejemplo: '$0',
  },
  {
    id: 'valorEjecutadoTotal',
    etiqueta: 'VALOR EJECUTADO — columna VALOR TOTAL',
    frecuencia: 'mes',
    grupo: 'Balance del mes',
    ejemplo: '(se deja en blanco)',
    ayuda:
      'La plantilla traía "3.000.000" aquí. Esa celda no forma parte de la suma de la ' +
      'columna izquierda, así que se deja vacía para que SUMAS IGUALES cuadre.',
  },
  {
    id: 'valorEjecutado',
    etiqueta: 'VALOR EJECUTADO — columna derecha',
    frecuencia: 'mes',
    grupo: 'Balance del mes',
    ejemplo: '$1.880.000',
  },
  {
    id: 'valorPorEjecutarTotal',
    etiqueta: 'VALOR POR EJECUTAR — columna VALOR TOTAL',
    frecuencia: 'mes',
    grupo: 'Balance del mes',
    ejemplo: '(se deja en blanco)',
    ayuda: 'La plantilla traía "6000000000666" aquí. Se deja vacía por la misma razón.',
  },
  {
    id: 'valorPorEjecutar',
    etiqueta: 'VALOR POR EJECUTAR — columna derecha',
    frecuencia: 'mes',
    grupo: 'Balance del mes',
    ejemplo: '$11.750.000',
  },
  {
    id: 'sumasIguales',
    etiqueta: 'SUMAS IGUALES',
    frecuencia: 'mes',
    grupo: 'Balance del mes',
    ejemplo: '$13.630.000',
  },

  // ── Planilla PILA ─────────────────────────────────────────────────────────
  {
    id: 'planillaNumero',
    etiqueta: 'Planilla — número',
    frecuencia: 'mes',
    grupo: 'Seguridad social',
    ejemplo: '123XXXXXXX',
  },
  { id: 'planillaDia', etiqueta: 'Planilla — día', frecuencia: 'mes', grupo: 'Seguridad social', ejemplo: '04' },
  { id: 'planillaMes', etiqueta: 'Planilla — mes', frecuencia: 'mes', grupo: 'Seguridad social', ejemplo: '02' },
  { id: 'planillaAnio', etiqueta: 'Planilla — año', frecuencia: 'mes', grupo: 'Seguridad social', ejemplo: '2025' },
  {
    id: 'planillaMesAcreditado',
    etiqueta: 'Planilla — mes acreditado',
    frecuencia: 'mes',
    grupo: 'Seguridad social',
    ejemplo: 'enero',
  },

  // ── Frases en letras ──────────────────────────────────────────────────────
  {
    id: 'fraseFirma',
    etiqueta: 'Frase de firma del informe',
    frecuencia: 'mes',
    grupo: 'Frases en letras',
    ejemplo:
      'En constancia de lo anterior, se firma el presente informe a los treinta y un (31) días del mes de enero de dos mil veinticinco (2025).',
  },
  {
    id: 'frasePeriodoSupervision',
    etiqueta: 'Periodo del informe de supervisión',
    frecuencia: 'mes',
    grupo: 'Frases en letras',
    ejemplo:
      'Desde el siete (07) de enero de dos mil veinticinco (2025) a los treinta y un (31) días de enero de dos mil veinticinco (2025).',
  },
  {
    id: 'fraseConstancia',
    etiqueta: 'Frase de constancia final',
    frecuencia: 'mes',
    grupo: 'Frases en letras',
    ejemplo:
      'En constancia se expide en el Municipio de Olaya Herrera a los treinta y un (31) días del mes de enero del año dos mil veinticinco (2025).',
  },

  // ── Tablas ────────────────────────────────────────────────────────────────
  {
    id: 'tablaObligaciones',
    etiqueta: 'Tabla de obligaciones (informe de actividad)',
    frecuencia: 'tabla',
    grupo: 'Tablas',
    ejemplo: 'No. / OBLIGACIONES ESPECIFICAS / ACTIVIDADES EJECUTADAS',
  },
  {
    id: 'tablaObligacionesSupervision',
    etiqueta: 'Tabla de obligaciones (informe de supervisión)',
    frecuencia: 'tabla',
    grupo: 'Tablas',
    ejemplo: 'No. / OBLIGACIONES ESPECIFICAS / ACTIVIDADES EJECUTADAS',
  },
  {
    id: 'tablaPagos',
    etiqueta: 'Tabla del cronograma de pagos',
    frecuencia: 'tabla',
    grupo: 'Tablas',
    ejemplo: 'PAGO / FECHA / VALOR',
  },

  // ── Cuenta de cobro ───────────────────────────────────────────────────────
  {
    id: 'cuentaValorNumero',
    etiqueta: 'Cuenta — valor en números',
    frecuencia: 'mes',
    grupo: 'Cuenta de cobro',
    ejemplo: '$1.298.400',
    ayuda: 'Lo que se cobra ese mes, en el renglón «LA SUMA DE»',
    tipos: ['cuentaDeCobro'],
  },
  {
    id: 'cuentaValorLetras',
    etiqueta: 'Cuenta — valor en letras',
    frecuencia: 'mes',
    grupo: 'Cuenta de cobro',
    ejemplo: 'UN MILLÓN DOSCIENTOS NOVENTA Y OCHO MIL CUATROCIENTOS',
    ayuda: 'Sin la palabra «PESOS», como en el documento',
    tipos: ['cuentaDeCobro'],
  },
  {
    id: 'cuentaConcepto',
    etiqueta: 'Cuenta — por concepto de',
    frecuencia: 'mes',
    grupo: 'Cuenta de cobro',
    ejemplo:
      'PAGO MES DE ENERO DEL CONTRATO No. CD 084-2025 CON OBJETO: PRESTACIÓN DE SERVICIOS…',
    ayuda: 'El párrafo entero; cambia el mes en cada cuenta',
    tipos: ['cuentaDeCobro'],
  },
  {
    id: 'cuentaCiudadYFecha',
    etiqueta: 'Cuenta — ciudad y fecha',
    frecuencia: 'mes',
    grupo: 'Cuenta de cobro',
    ejemplo: 'OLAYA HERRERA ENERO 31 DEL 2025',
    ayuda: 'El último día del mes que se cobra',
    tipos: ['cuentaDeCobro'],
  },
  // Estos dos se ofrecen en los tres documentos. Nacieron para la cuenta de
  // cobro, pero el teléfono del contratista aparece también en los informes de
  // algunos municipios, y un campo que el documento no tenga sencillamente no
  // se mapea: ofrecerlo de más no cuesta nada, y no ofrecerlo deja el dato sin
  // manera de asignarse.
  {
    id: 'telefono',
    etiqueta: 'Teléfono del contratista',
    frecuencia: 'contrato',
    grupo: 'Datos de pago',
    ejemplo: '300XXXXXXX',
    tipos: ['informe', 'cuentaDeCobro', 'certificado'],
  },
  {
    id: 'numeroDeCuenta',
    etiqueta: 'Número de cuenta bancaria',
    frecuencia: 'contrato',
    grupo: 'Datos de pago',
    ejemplo: '123XXXXXXXXX',
    tipos: ['informe', 'cuentaDeCobro', 'certificado'],
  },

  // ── Certificado de cumplimiento ───────────────────────────────────────────
  {
    id: 'certificadoPeriodo',
    etiqueta: 'Certificado — periodo del contrato',
    frecuencia: 'contrato',
    grupo: 'Certificado',
    ejemplo:
      'Entre el periodo comprendido desde el día siete (07) de enero hasta el día treinta (30) de junio del año dos mil veinticinco (2025).',
    tipos: ['certificado'],
  },
  {
    id: 'certificadoExpedicion',
    etiqueta: 'Certificado — frase de expedición',
    frecuencia: 'contrato',
    grupo: 'Certificado',
    ejemplo:
      'Se expide en Olaya Herrera (Nariño), a los treinta (30) días del mes de junio del año dos mil veinticinco (2025).',
    ayuda: 'Siempre con la fecha del último día del contrato',
    tipos: ['certificado'],
  },
  {
    id: 'listaActividades',
    etiqueta: 'Lista de actividades cumplidas',
    frecuencia: 'tabla',
    grupo: 'Certificado',
    ejemplo: 'Las obligaciones del contrato, numeradas',
    ayuda: 'Se regenera entera; no hace falta mapearla',
    tipos: ['certificado'],
  },
];

/** En qué documentos aparece un campo. Sin declarar, sólo en el informe. */
export function tiposDe(d: DefinicionCampo): TipoDocumento[] {
  return d.tipos ?? ['informe'];
}

/** Los campos que tienen sentido en un documento concreto. */
export function camposDe(tipo: TipoDocumento): DefinicionCampo[] {
  return CATALOGO.filter((d) => tiposDe(d).includes(tipo));
}

export const POR_ID = new Map<CampoId, DefinicionCampo>(
  CATALOGO.map((c) => [c.id, c]),
);

export function definicion(id: CampoId): DefinicionCampo {
  const d = POR_ID.get(id);
  if (!d) throw new Error(`Campo desconocido: ${id}`);
  return d;
}

/** Campos agrupados en el orden en que los muestra el asistente. */
export function porGrupo(
  tipo: TipoDocumento = 'informe',
): { grupo: string; campos: DefinicionCampo[] }[] {
  const grupos: { grupo: string; campos: DefinicionCampo[] }[] = [];
  for (const c of camposDe(tipo)) {
    let g = grupos.find((x) => x.grupo === c.grupo);
    if (!g) {
      g = { grupo: c.grupo, campos: [] };
      grupos.push(g);
    }
    g.campos.push(c);
  }
  return grupos;
}
