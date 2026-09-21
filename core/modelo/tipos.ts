/** Modelo de datos del programa. Fechas siempre en ISO "AAAA-MM-DD". */

export type Contratista = {
  id: string;
  /** "ANDRES FELIPE MORALES ROJAS" */
  nombre: string;
  /** "10.345.678" — con puntos, tal como aparece en el informe */
  cedula: string;
  /** "OLAYA HERRERA" — municipio de expedición de la cédula */
  expedidaEn: string;
};

export type Cuota = {
  /** Número de la cuota, empezando en 1 */
  n: number;
  /** Fecha de pago, ISO */
  fecha: string;
  valor: number;
};

export type Adicion = {
  id: string;
  /** Fecha del otrosí, ISO */
  fecha: string;
  /** Monto adicionado. Puede ser 0 si el otrosí sólo prorroga el plazo. */
  valor: number;
  /** Si el otrosí además prorroga, la nueva fecha de terminación (ISO). */
  nuevaFechaTerminacion?: string;
  /** Cómo se paga la adición. Vacío si sólo prorroga. */
  cuotasAgregadas: Cuota[];
  observacion?: string;
};

export type Suspension = {
  id: string;
  /** ISO, inclusive */
  desde: string;
  /** ISO, inclusive. `null` mientras la suspensión siga vigente. */
  hasta: string | null;
  motivo?: string;
};

export type Obligacion = {
  n: number;
  /** Texto de la obligación específica, tomado del contrato */
  texto: string;
  /** Redacción de la actividad ejecutada. Se genera si viene vacía. */
  actividad?: string;
};

export type DatosPresupuestales = {
  /** "2025000021" */
  numero: string;
  /** ISO */
  fecha: string;
  valor: number;
};

export type Supervisor = {
  nombre: string;
  cargo: string;
};

export type Contrato = {
  id: string;
  contratistaId: string;
  /** "078-2025" */
  numero: string;
  anio: number;
  objeto: string;
  /** ISO */
  fechaInicio: string;
  /** ISO */
  fechaTerminacion: string;
  /** ISO — fecha de firma del contrato */
  fechaFirma: string;
  valorInicial: number;
  cuotas: Cuota[];
  adiciones: Adicion[];
  suspensiones: Suspension[];

  /** Texto libre de FORMA DE PAGO tal como lo redacta el contrato. */
  formaDePago: string;
  /** Texto libre de PLAZO, en mayúsculas. */
  textoPlazo: string;

  /** Estos cambian entre contratos; arrancan desde Ajustes. */
  contratante: string;
  nitContratante: string;
  municipio: string;
  /** "Nariño" — sale en la frase de expedición del certificado. */
  departamento?: string;
  supervisor: Supervisor;

  /**
   * Cómo se le paga al contratista. Van en la cuenta de cobro.
   *
   * Viven en el contrato y no en la persona porque una cuenta bancaria puede
   * cambiar entre un contrato y el siguiente, y las cuentas de cobro ya
   * emitidas deben seguir diciendo lo que decían. La interfaz ofrece los
   * valores ya usados por esa persona, así que en la práctica se rellena solo.
   */
  telefono?: string;
  numeroDeCuenta?: string;

  cdp: DatosPresupuestales;
  rp: DatosPresupuestales;

  /** Obligaciones del INFORME DE ACTIVIDAD CONTRACTUAL */
  obligaciones: Obligacion[];
  /** Obligaciones del apartado ELEMENTOS DE ORDEN TÉCNICO del informe de supervisión */
  obligacionesSupervision: Obligacion[];

  /** Plantilla del informe mensual. */
  plantillaId: string;
  /** Plantilla de la cuenta de cobro, si se le asignó una. */
  plantillaCuentaId?: string;
  /** Plantilla del certificado de cumplimiento, si se le asignó una. */
  plantillaCertificadoId?: string;
  activo: boolean;
  /**
   * Última vez que se cambió algo del contrato, en ISO.
   *
   * Sirve para saber con cuál se está trabajando: en «Generar mes» cada mes
   * muestra primero el último contrato tocado. Los contratos de antes de este
   * campo no lo tienen; cuentan como no tocados hasta su próximo cambio.
   */
  actualizadoEn?: string;
};

export type Planilla = {
  /** "9000000001" */
  numero: string;
  /** ISO — fecha de pago de la planilla */
  fecha: string;
  /** "enero" — mes acreditado */
  mesAcreditado: string;
};

export type InformeMes = {
  contratoId: string;
  anio: number;
  /** 1–12 */
  mes: number;
  planilla?: Planilla;
  /** ISO — cuándo se generó */
  generadoEn?: string;
  /** Ruta del .docx producido */
  rutaArchivo?: string;
  /** Nombre del archivo, para poder mostrarlo sin volver a mirar el disco */
  nombreArchivo?: string;

  /**
   * La cuenta de cobro de ese mismo mes.
   *
   * Comparte registro con el informe porque comparte clave —contrato, año y
   * mes—, y así el historial puede enseñar los dos documentos de un mes en la
   * misma fila sin cruzar dos listas.
   */
  cuentaGeneradaEn?: string;
  rutaCuenta?: string;
  nombreCuenta?: string;
  /**
   * Pago del mes que quedó impreso en el informe.
   *
   * Se guarda con el registro en vez de recalcularse al vuelo porque el
   * historial debe mostrar lo que decía el documento entregado, aunque el
   * cronograma del contrato se haya corregido después.
   */
  pagoDelMes?: number;
};

/** Modo de la interfaz. «sistema» sigue lo que tenga configurado Windows. */
export type Tema = 'claro' | 'oscuro' | 'sistema';

export type Ajustes = {
  carpetaSalida: string;
  contratantePorDefecto: string;
  nitPorDefecto: string;
  municipioPorDefecto: string;
  departamentoPorDefecto: string;
  supervisorPorDefecto: Supervisor;
  /** Clave de Anthropic (Claude). Se guarda cifrada con safeStorage; nunca en texto plano. */
  apiKeyCifrada?: string;
  /** Clave de Google Gemini, cifrada igual. */
  geminiClaveCifrada?: string;
  /**
   * Con qué IA se redactan las obligaciones y las actividades. Sin elegir, o
   * si la elegida no tiene clave, se usa la que la tenga.
   */
  proveedorIA?: ProveedorIA;
  tema?: Tema;
};

export type ProveedorIA = 'claude' | 'gemini';

/**
 * Los campos de `Ajustes` que son secretos. Sólo los maneja el proceso
 * principal: no se envían a la interfaz y un guardado de la interfaz no los
 * pisa.
 */
export const AJUSTES_SECRETOS = ['apiKeyCifrada', 'geminiClaveCifrada'] as const;

/**
 * Un contrato eliminado, a la espera de recuperación o de caducar.
 *
 * Se guarda fuera de `contratos` a propósito: así el resto del programa deja de
 * verlo sin necesidad de filtrar en cada consulta, que es donde se olvidaría un
 * caso y reaparecería un contrato borrado. Sus informes viajan con él para que
 * al restaurarlo vuelva completo.
 */
export type EnPapelera = {
  contrato: Contrato;
  informes: InformeMes[];
  certificados?: CertificadoGenerado[];
  /** ISO — momento de la eliminación */
  eliminadoEn: string;
};

/**
 * Un certificado de cumplimiento ya producido.
 *
 * No va con los informes porque no es mensual: hay uno por contrato, con la
 * fecha del último día de su vigencia.
 */
export type CertificadoGenerado = {
  contratoId: string;
  /** ISO — cuándo se generó */
  generadoEn: string;
  rutaArchivo?: string;
  nombreArchivo?: string;
};

export type BaseDeDatos = {
  version: 1;
  contratistas: Contratista[];
  contratos: Contrato[];
  informes: InformeMes[];
  certificados: CertificadoGenerado[];
  papelera: EnPapelera[];
  ajustes: Ajustes;
};

/** Días que un contrato eliminado permanece recuperable. */
export const DIAS_EN_PAPELERA = 30;

/**
 * Los ajustes de un programa recién instalado: en blanco.
 *
 * Kaori no trae datos de ningún municipio ni de ninguna persona. Quien lo
 * instala escribe los suyos en Ajustes —contratante, NIT, municipio,
 * supervisor— y a partir de ahí cada contrato nuevo arranca con ellos.
 */
export const AJUSTES_INICIALES: Ajustes = {
  carpetaSalida: '',
  contratantePorDefecto: '',
  nitPorDefecto: '',
  municipioPorDefecto: '',
  departamentoPorDefecto: '',
  supervisorPorDefecto: { nombre: '', cargo: '' },
  // `tema` se deja sin valor a propósito: mientras nadie lo elija, manda la
  // copia local del renderer, que es la que puede aplicarse antes de que la
  // ventana pinte. Poner aquí un valor haría que al abrir se sobrescribiera
  // la elección de la última vez.
};
