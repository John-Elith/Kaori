/**
 * Extracción de campos desde el texto plano de un contrato, con expresiones
 * regulares ancladas a los rótulos del documento.
 *
 * Es el camino sin conexión: menos preciso que la IA, pero suficiente para
 * proponer valores que la persona revisa y corrige antes de guardar. Nunca se
 * guarda nada sin confirmación.
 */

export type CamposContratoDetectados = {
  numero?: string;
  anio?: number;
  nombreContratista?: string;
  cedula?: string;
  cedulaExpedidaEn?: string;
  objeto?: string;
  valorInicial?: number;
  fechaInicio?: string;
  fechaTerminacion?: string;
  contratante?: string;
  nitContratante?: string;
  supervisorNombre?: string;
  cdpNumero?: string;
  cdpValor?: number;
  rpNumero?: string;
  rpValor?: number;
  obligaciones?: string[];
};

const MESES: Record<string, number> = {
  enero: 1,
  febrero: 2,
  marzo: 3,
  abril: 4,
  mayo: 5,
  junio: 6,
  julio: 7,
  agosto: 8,
  septiembre: 9,
  setiembre: 9,
  octubre: 10,
  noviembre: 11,
  diciembre: 12,
};

/** "$13.630.000" o "13.630.000" → 13630000 */
export function aNumero(monto: string): number | undefined {
  const limpio = monto.replace(/[^\d]/g, '');
  if (limpio.length === 0) return undefined;
  const n = Number(limpio);
  return Number.isFinite(n) ? n : undefined;
}

/** "07 de enero de 2025" → "2025-01-07" */
export function fechaTextualAISO(texto: string): string | undefined {
  const m = new RegExp(
    `(\\d{1,2})\\s+de\\s+(${Object.keys(MESES).join('|')})\\s+de[l]?\\s+(?:año\\s+)?(?:[a-záéíóúñ\\s]*\\()?(\\d{4})`,
    'i',
  ).exec(texto);
  if (!m) return undefined;

  const dia = Number(m[1]);
  const mes = MESES[m[2].toLowerCase()];
  const anio = Number(m[3]);
  if (!mes || dia < 1 || dia > 31) return undefined;

  return `${anio}-${String(mes).padStart(2, '0')}-${String(dia).padStart(2, '0')}`;
}

/** Toma el texto que sigue a un rótulo hasta el siguiente salto o rótulo. */
function trasRotulo(texto: string, rotulo: RegExp, largoMax = 400): string | undefined {
  const m = rotulo.exec(texto);
  if (!m) return undefined;
  const desde = m.index + m[0].length;
  const trozo = texto.slice(desde, desde + largoMax);
  const corte = trozo.search(/\n\s*\n|\n[A-ZÁÉÍÓÚÑ ]{6,}:/);
  return (corte === -1 ? trozo : trozo.slice(0, corte)).trim();
}

export function extraerCamposContrato(texto: string): CamposContratoDetectados {
  const t = texto.replace(/\r/g, '');
  const campos: CamposContratoDetectados = {};

  // Número de contrato: "078-2025"
  const mNumero = /\b(\d{3}-(\d{4}))\b/.exec(t);
  if (mNumero) {
    campos.numero = mNumero[1];
    campos.anio = Number(mNumero[2]);
  }

  // Cédula: el primer número con separadores de miles tras "C.C."
  const mCedula = /C\.?\s?C\.?\s*(?:No\.?)?\s*:?\s*([\d.]{7,15})\s*(?:DE\s+([A-ZÁÉÍÓÚÑ ]+))?/i.exec(t);
  if (mCedula) {
    campos.cedula = mCedula[1].replace(/\.$/, '');
    if (mCedula[2]) campos.cedulaExpedidaEn = mCedula[2].trim();
  }

  // Contratista
  const nombre = trasRotulo(t, /CONTRATISTA\s*:?\s*/i, 120);
  if (nombre) {
    const soloNombre = /^[A-ZÁÉÍÓÚÑ][A-ZÁÉÍÓÚÑ\s]{6,}/.exec(nombre);
    if (soloNombre) campos.nombreContratista = soloNombre[0].trim();
  }

  // Objeto
  const objeto = trasRotulo(t, /\bOBJETO\s*:?\s*/i, 900);
  if (objeto && objeto.length > 20) campos.objeto = objeto.replace(/\s+/g, ' ').trim();

  // Valor: el mayor monto que aparezca junto a la palabra VALOR
  const montos = [...t.matchAll(/\$\s?([\d.]{5,})/g)]
    .map((m) => aNumero(m[1]))
    .filter((n): n is number => n !== undefined);
  if (montos.length > 0) campos.valorInicial = Math.max(...montos);

  // Fechas
  const inicio = trasRotulo(t, /FECHA DE INICIO[^\n:]*:?\s*/i, 80);
  if (inicio) campos.fechaInicio = fechaTextualAISO(inicio) ?? fechaCortaAISO(inicio);

  const fin = trasRotulo(t, /FECHA DE TERMINACI[ÓO]N[^\n:]*:?\s*/i, 120);
  if (fin) campos.fechaTerminacion = fechaTextualAISO(fin) ?? fechaCortaAISO(fin);

  // Contratante y NIT
  const mNit = /NIT\s*:?\s*(\d{9}-\d)/i.exec(t);
  if (mNit) campos.nitContratante = mNit[1];

  const contratante = trasRotulo(t, /CONTRATANTE\s*:?\s*/i, 120);
  if (contratante) {
    campos.contratante = contratante.split(/\n/)[0].replace(/\s+/g, ' ').trim();
  }

  // Supervisor
  const supervisor = trasRotulo(t, /SUPERVISOR\s*:?\s*/i, 120);
  if (supervisor) {
    const m = /^[A-ZÁÉÍÓÚÑ][A-ZÁÉÍÓÚÑ\s]{6,}/.exec(supervisor);
    if (m) campos.supervisorNombre = m[0].trim();
  }

  // CDP y RP
  const mCdp = /CERTIFICADO DE DISPONIBILIDAD PRESUPUESTAL[\s\S]{0,200}?\b(\d{10})\b/i.exec(t);
  if (mCdp) campos.cdpNumero = mCdp[1];

  const mRp = /REGISTRO PRESUPUESTAL[\s\S]{0,200}?\b(\d{10})\b/i.exec(t);
  if (mRp) campos.rpNumero = mRp[1];

  // Obligaciones: líneas numeradas dentro del bloque de obligaciones
  campos.obligaciones = extraerObligaciones(t);

  return campos;
}

/** "07/01/2025" → "2025-01-07" */
export function fechaCortaAISO(texto: string): string | undefined {
  const m = /\b(\d{2})\/(\d{2})\/(\d{4})\b/.exec(texto);
  if (!m) return undefined;
  return `${m[3]}-${m[2]}-${m[1]}`;
}

/**
 * Obligaciones específicas: se busca el bloque que las enumera y se parten por
 * la numeración "1.", "2." … al inicio de línea.
 */
export function extraerObligaciones(texto: string): string[] {
  const m = /OBLIGACIONES\s+(?:ESPEC[ÍI]FICAS|DEL\s+CONTRATISTA)([\s\S]{0,12000})/i.exec(
    texto,
  );
  const bloque = m ? m[1] : texto;

  const partes = bloque.split(/(?:^|\n)\s*(\d{1,2})[.)]\s+/).slice(1);
  const obligaciones: string[] = [];

  for (let i = 0; i + 1 < partes.length; i += 2) {
    const cuerpo = partes[i + 1]
      .split(/\n\s*\n/)[0]
      .replace(/\s+/g, ' ')
      .trim();
    // Descartar fragmentos que claramente no son obligaciones.
    if (cuerpo.length >= 25 && cuerpo.length <= 1200) obligaciones.push(cuerpo);
  }

  return obligaciones;
}

/** Extrae el número de planilla PILA y su fecha. */
export function extraerPlanilla(texto: string): {
  numero?: string;
  fecha?: string;
  mesAcreditado?: string;
} {
  const r: { numero?: string; fecha?: string; mesAcreditado?: string } = {};

  const mNumero =
    /(?:planilla|n[úu]mero\s+de\s+planilla|no\.?\s*planilla)\D{0,40}(\d{8,14})/i.exec(texto) ??
    /\b(\d{10})\b/.exec(texto);
  if (mNumero) r.numero = mNumero[1];

  r.fecha = fechaCortaAISO(texto) ?? fechaTextualAISO(texto);

  const mMes = new RegExp(`\\b(${Object.keys(MESES).join('|')})\\b`, 'i').exec(texto);
  if (mMes) r.mesAcreditado = mMes[1].toLowerCase();

  return r;
}
