/**
 * Llenado de las tablas de obligaciones.
 *
 * A diferencia del resto de los campos, aquí no basta con reemplazar texto: la
 * cantidad de filas cambia entre contratos (el 078-2025 tiene 12 obligaciones y
 * el 084-2025 tiene 9). Se toma la primera fila de datos como molde, se clona
 * tantas veces como haga falta y se rellena cada celda.
 *
 * Clonar la fila —en vez de construirla— hace que los bordes, sombreados,
 * anchos de columna y estilos de párrafo se conserven exactamente.
 */

import type { Parte } from '../docx/mapaTexto';
import { decodificarXml, codificarXml } from '../docx/xml';
import type { Contrato, Cuota, Obligacion, Planilla } from '../modelo/tipos';
import { aTerceraPersona } from '../extraccion/redactarActividades';
import {
  comparar,
  desdeISO,
  dosDigitos,
  formatoCorto,
  nombreMes,
  ultimoDiaDelMes,
} from '../espanol/calendario';
import { formatoMoneda } from '../espanol/numeroALetras';
import { cronogramaVigente, type BalanceDelMes } from '../pagos/cronograma';

export type ResultadoTablas = {
  partes: Parte[];
  avisos: string[];
};

type Bloque = { inicio: number; fin: number; xml: string };

/** Texto legible de un fragmento de XML de Word. */
function textoDe(xml: string): string {
  return [...xml.matchAll(/<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>/g)]
    .map((m) => decodificarXml(m[1]))
    .join('');
}

/**
 * Todas las tablas del documento, a cualquier profundidad.
 *
 * Buscar sólo las de primer nivel no basta: en estos informes la tabla del
 * cronograma (PAGO / FECHA / VALOR) vive **dentro** de la celda de FORMA DE
 * PAGO, debajo de su párrafo. Con una búsqueda de primer nivel esa tabla no
 * aparecía y el cronograma del contrato anterior se quedaba tal cual en el
 * informe generado.
 */
function todasLasTablas(xml: string): Bloque[] {
  const encontradas: Bloque[] = [];
  const pila: number[] = [];
  const re = /<w:tbl(?:\s[^>]*)?>|<\/w:tbl>/g;
  let m: RegExpExecArray | null;

  while ((m = re.exec(xml)) !== null) {
    if (m[0].startsWith('</')) {
      const inicio = pila.pop();
      if (inicio !== undefined) {
        const fin = m.index + m[0].length;
        encontradas.push({ inicio, fin, xml: xml.slice(inicio, fin) });
      }
    } else {
      pila.push(m.index);
    }
  }

  return encontradas.sort((a, b) => a.inicio - b.inicio);
}

/**
 * De un conjunto de tablas candidatas, se queda con las más internas.
 *
 * Una tabla que contiene a otra hereda su texto, así que al buscar por
 * contenido («OBLIGACIONES», «ACTIVIDADES EJECUTADAS») la tabla envolvente
 * también casaría. Reescribir la envolvente destruiría la de dentro.
 */
function soloLasMasInternas(tablas: Bloque[]): Bloque[] {
  return tablas.filter(
    (t) =>
      !tablas.some(
        (otra) =>
          otra !== t && otra.inicio >= t.inicio && otra.fin <= t.fin &&
          (otra.inicio > t.inicio || otra.fin < t.fin),
      ),
  );
}

/**
 * Localiza elementos de nivel superior contando anidamiento.
 *
 * Necesario porque una celda puede contener otra tabla: un `indexOf` ingenuo de
 * `</w:tbl>` cerraría la tabla equivocada.
 */
function bloquesDeNivelSuperior(xml: string, etiqueta: string): Bloque[] {
  const bloques: Bloque[] = [];
  const re = new RegExp(`<${etiqueta}(?:\\s[^>]*)?>|</${etiqueta}>`, 'g');
  let profundidad = 0;
  let inicio = -1;
  let m: RegExpExecArray | null;

  while ((m = re.exec(xml)) !== null) {
    const esApertura = !m[0].startsWith(`</`);
    if (esApertura) {
      if (profundidad === 0) inicio = m.index;
      profundidad += 1;
    } else {
      profundidad -= 1;
      if (profundidad === 0 && inicio !== -1) {
        const fin = m.index + m[0].length;
        bloques.push({ inicio, fin, xml: xml.slice(inicio, fin) });
        inicio = -1;
      }
      if (profundidad < 0) profundidad = 0; // XML mal formado: seguir sin romper
    }
  }

  return bloques;
}

/**
 * Escribe un texto en una celda conservando el formato del primer run.
 *
 * Si la celda contiene una tabla anidada, su contenido se respeta por completo:
 * sólo se tocan los `<w:t>` que pertenecen directamente a esta celda. Sin esta
 * salvedad, escribir en la celda borraría en silencio la tabla de adentro.
 */
function fijarTextoCelda(celdaXml: string, texto: string): string {
  const anidadas = bloquesDeNivelSuperior(celdaXml, 'w:tbl');
  const dentroDeAnidada = (pos: number) =>
    anidadas.some((t) => pos >= t.inicio && pos < t.fin);

  const nodos = [...celdaXml.matchAll(/<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>/g)].filter(
    (m) => !dentroDeAnidada(m.index!),
  );

  // Una celda vacía no tiene ningún `<w:t>` donde escribir. Antes se devolvía
  // sin tocar, y por eso el balance salía en blanco cuando la plantilla traía
  // esas casillas vacías: no había hueco donde poner la cifra. Se le añade un
  // run al último párrafo propio de la celda, que conserva su alineación y su
  // estilo porque el `<w:pPr>` no se toca.
  if (nodos.length === 0) return conRunNuevo(celdaXml, texto, dentroDeAnidada);

  let resultado = celdaXml;
  // De atrás hacia adelante para no correr los offsets.
  for (let i = nodos.length - 1; i >= 0; i--) {
    const m = nodos[i];
    const contenido = m[1];
    const inicioContenido = m.index! + m[0].length - '</w:t>'.length - contenido.length;
    const finContenido = inicioContenido + contenido.length;
    const nuevo = i === 0 ? codificarXml(texto) : '';
    resultado =
      resultado.slice(0, inicioContenido) + nuevo + resultado.slice(finContenido);
  }

  // Garantizar que el primer <w:t> propio de la celda preserve los espacios.
  const primero = nodos[0];
  if (primero[0].startsWith('<w:t>')) {
    resultado =
      resultado.slice(0, primero.index!) +
      '<w:t xml:space="preserve">' +
      resultado.slice(primero.index! + '<w:t>'.length);
  }

  return resultado;
}

/** ¿Esta tabla es una de obligaciones? */
function esTablaDeObligaciones(tablaXml: string): boolean {
  const t = textoDe(tablaXml).toUpperCase();
  return t.includes('OBLIGACIONES') && t.includes('ACTIVIDADES EJECUTADAS');
}

/**
 * ¿Es la tabla del cronograma de pagos (PAGO / FECHA / VALOR)?
 *
 * La comparación es celda a celda y exacta a propósito. Con una comprobación
 * laxa —"el encabezado contiene PAGO, FECHA y VALOR"— también casaba la tabla
 * «Relación de pagos efectuados», cuyos encabezados son DESCRIPCIÓN / FECHA DE
 * PAGO / VALOR, y el cronograma acababa sobrescribiéndola.
 */
function esTablaDePagos(tablaXml: string): boolean {
  const filas = bloquesDeNivelSuperior(tablaXml, 'w:tr');
  if (filas.length < 2) return false;

  const celdas = bloquesDeNivelSuperior(filas[0].xml, 'w:tc').map((c) =>
    textoDe(c.xml).trim().toUpperCase(),
  );
  if (celdas.length < 3) return false;

  return celdas[0] === 'PAGO' && celdas[1] === 'FECHA' && celdas[2] === 'VALOR';
}

/**
 * Reescribe el cuerpo de una tabla clonando su primera fila de datos.
 *
 * Clonar la fila —en vez de construirla— conserva bordes, sombreados, anchos de
 * columna y estilos de párrafo exactamente como están en la plantilla.
 *
 * @param buscarEncabezado Reconoce cuál de las filas es la de encabezados.
 * @param filasNuevas Contenido de cada celda, fila por fila.
 */
function reescribirFilas(
  tablaXml: string,
  buscarEncabezado: (textoFila: string) => boolean,
  filasNuevas: string[][],
  avisos: string[],
  etiqueta: string,
  columnasMinimas: number,
  /**
   * Reconoce las filas de cierre que hay que conservar tal cual.
   *
   * La tabla de pagos efectuados termina con «TOTAL, PAGADO HASTA LA FECHA»,
   * que es un renglón de la misma tabla y no un dato: sin esto se reemplazaba
   * junto con los pagos y el total desaparecía del informe.
   */
  esFilaDeCierre?: (textoFila: string) => boolean,
): string {
  const filas = bloquesDeNivelSuperior(tablaXml, 'w:tr');
  const iEncabezado = filas.findIndex((f) =>
    buscarEncabezado(textoDe(f.xml).toUpperCase()),
  );

  if (iEncabezado === -1 || iEncabezado === filas.length - 1) {
    avisos.push(
      `No se encontraron filas de datos en la ${etiqueta}; se dejó tal como está en la plantilla.`,
    );
    return tablaXml;
  }

  const molde = filas[iEncabezado + 1];
  const celdasMolde = bloquesDeNivelSuperior(molde.xml, 'w:tc');

  if (celdasMolde.length < columnasMinimas) {
    avisos.push(
      `La ${etiqueta} no tiene las ${columnasMinimas} columnas esperadas; ` +
        'se dejó tal como está en la plantilla.',
    );
    return tablaXml;
  }

  if (filasNuevas.length === 0) {
    avisos.push(
      `No hay datos para la ${etiqueta}; se dejaron los que trae la plantilla.`,
    );
    return tablaXml;
  }

  const nuevas = filasNuevas.map((contenidos) => {
    let fila = molde.xml;
    const celdas = bloquesDeNivelSuperior(fila, 'w:tc');

    // De derecha a izquierda para no invalidar los offsets de las anteriores.
    for (let c = Math.min(celdas.length, contenidos.length) - 1; c >= 0; c--) {
      const celda = celdas[c];
      const nueva = fijarTextoCelda(celda.xml, contenidos[c]);
      fila = fila.slice(0, celda.inicio) + nueva + fila.slice(celda.fin);
    }

    return fila;
  });

  const primeraFilaDatos = filas[iEncabezado + 1];

  // Las filas de cierre del final se conservan; sólo se sustituyen las de datos.
  let ultimaDeDatos = filas.length - 1;
  if (esFilaDeCierre) {
    while (
      ultimaDeDatos > iEncabezado &&
      esFilaDeCierre(textoDe(filas[ultimaDeDatos].xml).toUpperCase())
    ) {
      ultimaDeDatos -= 1;
    }
  }

  // Si el cierre se comió también la fila molde, no hay datos que sustituir.
  if (ultimaDeDatos <= iEncabezado) return tablaXml;

  return (
    tablaXml.slice(0, primeraFilaDatos.inicio) +
    nuevas.join('') +
    tablaXml.slice(filas[ultimaDeDatos].fin)
  );
}

/** Tabla de obligaciones: No. / obligación / actividad. */
function reescribirTabla(
  tablaXml: string,
  obligaciones: Obligacion[],
  avisos: string[],
  etiqueta: string,
  /** Cómo escribir cada actividad en esta tabla. */
  redactar: (actividad: string) => string = (a) => a,
): string {
  return reescribirFilas(
    tablaXml,
    (t) => t.includes('OBLIGACIONES') && t.includes('ACTIVIDADES'),
    obligaciones.map((o, i) => [`${o.n ?? i + 1}.`, o.texto, redactar(o.actividad ?? '')]),
    avisos,
    etiqueta,
    3,
  );
}

/**
 * Rellena las tablas de obligaciones del documento.
 *
 * La primera tabla de obligaciones que aparece corresponde al INFORME DE
 * ACTIVIDAD CONTRACTUAL; la segunda, al apartado ELEMENTOS DE ORDEN TÉCNICO del
 * informe de supervisión. Si el contrato no define obligaciones de supervisión
 * aparte, se reutilizan las mismas.
 */
export function llenarTablaObligaciones(
  partes: Parte[],
  contrato: Contrato,
): ResultadoTablas {
  const avisos: string[] = [];
  let indiceGlobal = 0;

  const nuevas = partes.map((parte) => {
    const objetivo = soloLasMasInternas(
      todasLasTablas(parte.xml).filter((t) => esTablaDeObligaciones(t.xml)),
    );
    if (objetivo.length === 0) return parte;

    let xml = parte.xml;
    // De atrás hacia adelante: reescribir una tabla corre todo lo que sigue.
    for (let i = objetivo.length - 1; i >= 0; i--) {
      const posicion = indiceGlobal + i;
      const obligaciones =
        posicion === 0
          ? contrato.obligaciones
          : contrato.obligacionesSupervision.length > 0
            ? contrato.obligacionesSupervision
            : contrato.obligaciones;

      const etiqueta =
        posicion === 0
          ? 'tabla de obligaciones del informe de actividad'
          : 'tabla de obligaciones del informe de supervisión';

      const t = objetivo[i];
      // En la del supervisor —DETALLE DE LA EJECUCIÓN— se cuenta lo que hizo
      // el contratista: «Apoyó…», no «Se apoyó…».
      const reescrita = reescribirTabla(
        t.xml,
        obligaciones,
        avisos,
        etiqueta,
        posicion === 0 ? undefined : aTerceraPersona,
      );
      xml = xml.slice(0, t.inicio) + reescrita + xml.slice(t.fin);
    }

    indiceGlobal += objetivo.length;
    return { ...parte, xml };
  });

  if (indiceGlobal === 0) {
    avisos.push(
      'No se encontró ninguna tabla de obligaciones en la plantilla. ' +
        'Verifique que los encabezados digan "OBLIGACIONES" y "ACTIVIDADES EJECUTADAS".',
    );
  }

  return { partes: nuevas, avisos };
}

/**
 * Rellena la tabla del cronograma de pagos (PAGO / FECHA / VALOR) con las
 * cuotas del contrato.
 *
 * Sin esto, el informe salía con el cronograma del contrato que sirvió de
 * plantilla: fechas e importes de otra persona. Las cuotas también varían en
 * cantidad —seis mensualidades no es una constante—, así que hay que clonar la
 * fila molde tantas veces como haga falta, igual que con las obligaciones.
 */
export function llenarTablaPagos(
  partes: Parte[],
  cuotas: Cuota[],
): ResultadoTablas {
  const avisos: string[] = [];
  let encontradas = 0;

  const nuevas = partes.map((parte) => {
    const objetivo = soloLasMasInternas(
      todasLasTablas(parte.xml).filter((t) => esTablaDePagos(t.xml)),
    );
    if (objetivo.length === 0) return parte;

    let xml = parte.xml;
    // De atrás hacia adelante: reescribir una tabla corre todo lo que sigue.
    for (let i = objetivo.length - 1; i >= 0; i--) {
      const t = objetivo[i];
      const reescrita = reescribirFilas(
        t.xml,
        // La fila de encabezado ya se identificó al elegir la tabla; aquí basta
        // con reconocerla dentro de ella.
        (texto) => texto.replace(/\s+/g, '') === 'PAGOFECHAVALOR',
        cuotas.map((c, n) => [
          String(c.n ?? n + 1),
          formatoCorto(desdeISO(c.fecha)),
          formatoMoneda(c.valor),
        ]),
        avisos,
        'tabla del cronograma de pagos',
        3,
      );
      xml = xml.slice(0, t.inicio) + reescrita + xml.slice(t.fin);
    }

    encontradas += objetivo.length;
    return { ...parte, xml };
  });

  if (encontradas === 0) {
    avisos.push(
      'No se encontró la tabla del cronograma de pagos en la plantilla. ' +
        'Verifique que sus encabezados digan "PAGO", "FECHA" y "VALOR".',
    );
  }

  return { partes: nuevas, avisos };
}

/**
 * ¿Es la tabla «Relación de pagos efectuados»?
 *
 * Sus encabezados son DESCRIPCIÓN | FECHA DE PAGO | VALOR, y la fila siguiente
 * parte la fecha en DD | MM | AAA. Se distingue así del cronograma de pagos,
 * que es PAGO | FECHA | VALOR: las dos hablan de pagos y llevan una columna
 * VALOR, y confundirlas hacía que una sobrescribiera a la otra.
 */
function esTablaDePagosEfectuados(tablaXml: string): boolean {
  const filas = bloquesDeNivelSuperior(tablaXml, 'w:tr');
  if (filas.length < 2) return false;

  const celdas = bloquesDeNivelSuperior(filas[0].xml, 'w:tc').map((c) =>
    textoDe(c.xml).replace(/\s+/g, ' ').trim().toUpperCase(),
  );
  if (celdas.length < 3) return false;

  return (
    celdas[0].startsWith('DESCRIPCI') &&
    celdas.some((c) => c === 'FECHA DE PAGO') &&
    celdas[celdas.length - 1] === 'VALOR'
  );
}

/** La fila de subencabezados DD | MM | AAA que cierra la cabecera. */
function esSubencabezadoDeFecha(textoFila: string): boolean {
  return /^DD\s*MM\s*A+/.test(textoFila.replace(/\s+/g, ' ').trim());
}

/**
 * Rellena «Relación de pagos efectuados» con un renglón por mes transcurrido.
 *
 * El informe de marzo no lleva sólo el pago de marzo: lleva enero, febrero y
 * marzo, porque la tabla es el histórico de lo pagado hasta la fecha y es lo
 * que justifica el TOTAL PAGADO de debajo. Antes se rellenaba como un campo
 * suelto —una única fila, la del mes— y el acumulado de al lado no cuadraba
 * con lo que la tabla mostraba.
 *
 * El año se escribe en el primer renglón y cada vez que cambia, no en todos:
 * es como está redactado el informe del municipio, y en un contrato que cruza
 * de año sigue quedando claro dónde se pasa de uno a otro.
 */
export function llenarTablaPagosEfectuados(
  partes: Parte[],
  contrato: Contrato,
  anio: number,
  mes: number,
): ResultadoTablas {
  const avisos: string[] = [];

  // Las cuotas hasta el final del mes del informe, inclusive.
  const corte = ultimoDiaDelMes(anio, mes);
  const cuotas = cronogramaVigente(contrato).filter(
    (c) => comparar(desdeISO(c.fecha), corte) <= 0,
  );

  if (cuotas.length === 0) {
    return {
      partes,
      avisos: [
        'El contrato no tiene cuotas hasta este mes, así que la tabla de pagos ' +
          'efectuados conserva lo que traiga la plantilla. Genere el cronograma ' +
          'en Contratos → Pagos.',
      ],
    };
  }

  let anioEscrito = 0;
  const filasNuevas = cuotas.map((c) => {
    const f = desdeISO(c.fecha);
    const muestraAnio = f.anio !== anioEscrito;
    anioEscrito = f.anio;

    return [
      `Pago realizado, mes de ${nombreMes(f.mes)}`,
      '',
      '',
      muestraAnio ? String(f.anio) : '',
      formatoMoneda(c.valor),
    ];
  });

  let encontradas = 0;

  const nuevas = partes.map((parte) => {
    const objetivo = soloLasMasInternas(
      todasLasTablas(parte.xml).filter((t) => esTablaDePagosEfectuados(t.xml)),
    );
    if (objetivo.length === 0) return parte;

    let xml = parte.xml;
    // De atrás hacia adelante: reescribir una tabla corre todo lo que sigue.
    for (let i = objetivo.length - 1; i >= 0; i--) {
      const t = objetivo[i];
      const reescrita = reescribirFilas(
        t.xml,
        esSubencabezadoDeFecha,
        filasNuevas,
        avisos,
        'tabla de pagos efectuados',
        5,
        // «TOTAL, PAGADO HASTA LA FECHA» cierra la tabla y se queda donde está;
        // su cifra la escribe el campo mapeado, no esta reescritura.
        (t) => /TOTAL,?\s*PAGADO HASTA LA FECHA/.test(t.replace(/\s+/g, ' ')),
      );
      xml = xml.slice(0, t.inicio) + reescrita + xml.slice(t.fin);
    }

    encontradas += objetivo.length;
    return { ...parte, xml };
  });

  if (encontradas === 0) {
    avisos.push(
      'No se encontró la tabla «Relación de pagos efectuados» en la plantilla. ' +
        'Verifique que sus encabezados digan «DESCRIPCIÓN», «FECHA DE PAGO» y «VALOR».',
    );
  }

  return { partes: nuevas, avisos };
}


/**
 * Mete un run con texto en una celda que no tenía ninguno.
 *
 * Se cuelga del último párrafo propio de la celda para no alterar su
 * alineación ni su estilo, que viven en el `<w:pPr>` de ese párrafo. Si la
 * celda no tuviera ni un párrafo —cosa que Word no produce, pero un .docx
 * editado a mano sí— se le añade uno.
 */
function conRunNuevo(
  celdaXml: string,
  texto: string,
  dentroDeAnidada: (pos: number) => boolean,
): string {
  if (texto.length === 0) return celdaXml;
  const run = `<w:r><w:t xml:space="preserve">${codificarXml(texto)}</w:t></w:r>`;

  const cierres = [...celdaXml.matchAll(/<\/w:p>/g)].filter(
    (m) => !dentroDeAnidada(m.index!),
  );
  const ultimo = cierres.at(-1);
  if (ultimo) {
    return celdaXml.slice(0, ultimo.index!) + run + celdaXml.slice(ultimo.index!);
  }

  const cierreCelda = celdaXml.lastIndexOf('</w:tc>');
  if (cierreCelda === -1) return celdaXml;
  return (
    celdaXml.slice(0, cierreCelda) + `<w:p>${run}</w:p>` + celdaXml.slice(cierreCelda)
  );
}

/**
 * ¿Es la tabla del balance de recursos?
 *
 * Sus encabezados son CONCEPTO | VALOR TOTAL | RECURSOS EJECUTADOS Y POR
 * EJECUTAR. Se distingue por el tercero, que no se parece a ningún otro.
 */
function esTablaDeBalance(tablaXml: string): boolean {
  const filas = bloquesDeNivelSuperior(tablaXml, 'w:tr');
  if (filas.length < 2) return false;

  const celdas = bloquesDeNivelSuperior(filas[0].xml, 'w:tc').map((c) =>
    textoDe(c.xml).replace(/\s+/g, ' ').trim().toUpperCase(),
  );
  if (celdas.length < 3) return false;

  return (
    celdas[0] === 'CONCEPTO' &&
    celdas.some((c) => c.startsWith('VALOR TOTAL')) &&
    celdas.some((c) => c.includes('EJECUTADOS Y POR EJECUTAR'))
  );
}

/**
 * Qué va en cada renglón del balance, por columna.
 *
 * `undefined` significa «no tocar»: es lo que se hace con SALDO A LIBERAR, que
 * no se calcula a partir del contrato. La cadena vacía sí escribe, y es
 * deliberada en las dos casillas que arrastraban las erratas de la plantilla.
 */
type RenglonDelBalance = {
  rotulo: RegExp;
  total?: string;
  ejecutado?: string;
};

/**
 * Rellena el balance de recursos del informe.
 *
 * Va por posición de celda y no por el mapeo de campos porque las casillas
 * pueden venir **vacías** en la plantilla: sin texto que reemplazar, el mapeo
 * no tenía dónde escribir y el balance salía en blanco. Aquí se localiza cada
 * renglón por su rótulo y se escribe en su columna, exista o no algo antes.
 *
 * Las dos casillas de la columna VALOR TOTAL de VALOR EJECUTADO y VALOR POR
 * EJECUTAR se dejan vacías a propósito: son las erratas de la plantilla
 * («3.000.000» y «6000000000666»). Esa columna ya cuadra sin ellas —valor
 * inicial más adiciones da SUMAS IGUALES— y poner cualquier cifra la
 * descuadraría.
 */
export function llenarTablaBalance(
  partes: Parte[],
  balance: BalanceDelMes,
): ResultadoTablas {
  const avisos: string[] = [];

  const renglones: RenglonDelBalance[] = [
    { rotulo: /^VALOR \(INICIAL\) DEL CONTRATO/, total: formatoMoneda(balance.valorInicial) },
    {
      rotulo: /^VALOR ADICIONES/,
      total: formatoMoneda(balance.valorAdiciones),
      ejecutado: formatoMoneda(balance.valorAdiciones),
    },
    { rotulo: /^VALOR EJECUTADO/, total: '', ejecutado: formatoMoneda(balance.valorEjecutado) },
    {
      rotulo: /^VALOR POR EJECUTAR/,
      total: '',
      ejecutado: formatoMoneda(balance.valorPorEjecutar),
    },
    // SALDO A LIBERAR no se toca: no sale del contrato.
    {
      rotulo: /^SUMAS IGUALES/,
      total: formatoMoneda(balance.sumasIguales),
      ejecutado: formatoMoneda(balance.sumasIguales),
    },
  ];

  let encontradas = 0;

  const nuevas = partes.map((parte) => {
    const objetivo = soloLasMasInternas(
      todasLasTablas(parte.xml).filter((t) => esTablaDeBalance(t.xml)),
    );
    if (objetivo.length === 0) return parte;

    let xml = parte.xml;
    for (let i = objetivo.length - 1; i >= 0; i--) {
      const t = objetivo[i];
      xml = xml.slice(0, t.inicio) + reescribirBalance(t.xml, renglones) + xml.slice(t.fin);
    }

    encontradas += objetivo.length;
    return { ...parte, xml };
  });

  if (encontradas === 0) {
    avisos.push(
      'No se encontró la tabla del balance de recursos en la plantilla. ' +
        'Verifique que sus encabezados digan «CONCEPTO», «VALOR TOTAL» y ' +
        '«RECURSOS EJECUTADOS Y POR EJECUTAR».',
    );
  }

  return { partes: nuevas, avisos };
}

/** Escribe cada renglón del balance en las dos columnas de cifras. */
function reescribirBalance(tablaXml: string, renglones: RenglonDelBalance[]): string {
  const filas = bloquesDeNivelSuperior(tablaXml, 'w:tr');
  let xml = tablaXml;

  // De atrás hacia adelante: reescribir una fila corre todo lo que sigue.
  for (let f = filas.length - 1; f >= 0; f--) {
    const fila = filas[f];
    const celdas = bloquesDeNivelSuperior(fila.xml, 'w:tc');
    if (celdas.length < 3) continue;

    const rotulo = textoDe(celdas[0].xml).replace(/\s+/g, ' ').trim().toUpperCase();
    const renglon = renglones.find((r) => r.rotulo.test(rotulo));
    if (!renglon) continue;

    // La última columna es la de recursos ejecutados; la segunda, VALOR TOTAL.
    const aEscribir: [number, string | undefined][] = [
      [1, renglon.total],
      [celdas.length - 1, renglon.ejecutado],
    ];

    let nuevaFila = fila.xml;
    // De derecha a izquierda dentro de la fila, por lo mismo.
    for (const [c, valor] of [...aEscribir].sort((a, b) => b[0] - a[0])) {
      if (valor === undefined || c <= 0 || c >= celdas.length) continue;
      const celda = celdas[c];
      const reescrita = fijarTextoCelda(celda.xml, valor);
      nuevaFila = nuevaFila.slice(0, celda.inicio) + reescrita + nuevaFila.slice(celda.fin);
    }

    xml = xml.slice(0, fila.inicio) + nuevaFila + xml.slice(fila.fin);
  }

  return xml;
}


/**
 * ¿Es la tabla de acreditación de la planilla PILA?
 *
 * Sus encabezados son NÚMERO DE PLANILLA | FECHA | MES DE PAGO, y la fila
 * siguiente parte la fecha en DD | MM | AAA.
 */
function esTablaDePlanilla(tablaXml: string): boolean {
  const filas = bloquesDeNivelSuperior(tablaXml, 'w:tr');
  if (filas.length < 2) return false;

  const celdas = bloquesDeNivelSuperior(filas[0].xml, 'w:tc').map((c) =>
    textoDe(c.xml).replace(/\s+/g, ' ').trim().toUpperCase(),
  );
  if (celdas.length < 3) return false;

  return (
    celdas[0].startsWith('NÚMERO DE PLANILLA') ||
    celdas[0].startsWith('NUMERO DE PLANILLA')
  );
}

/**
 * Rellena la fila de la planilla PILA del mes.
 *
 * Va por posición de celda y no por el mapeo, por dos motivos que se dieron los
 * dos a la vez:
 *
 * - **Sin planilla, la fila tiene que quedar vacía.** Antes esos campos se
 *   dejaban sin escribir y sobrevivía lo que trajera la plantilla, que es la
 *   planilla de otro contratista. Un número de seguridad social ajeno en un
 *   documento firmado es de lo peor que puede colarse.
 * - **Las celdas vacías no se pueden mapear.** Si la plantilla traía el número
 *   en blanco pero el año escrito, el mapeo se desplazaba de columna y el año
 *   acababa donde iba el día.
 *
 * Escribiendo por posición, la fila queda entera y coherente en los dos casos.
 *
 * Sin planilla, el número y la fecha quedan en blanco para escribirlos a mano,
 * pero **el mes de pago sí se pone**: es el del informe, se sabe de antemano y
 * así el documento sale al menos con eso.
 */
export function llenarTablaPlanilla(
  partes: Parte[],
  planilla?: Planilla,
  /** Mes del informe (1–12): va en MES DE PAGO cuando no hay planilla. */
  mesDelInforme?: number,
): ResultadoTablas {
  const avisos: string[] = [];

  let celdas: string[];
  if (planilla) {
    const f = desdeISO(planilla.fecha);
    celdas = [
      planilla.numero,
      dosDigitos(f.dia),
      dosDigitos(f.mes),
      String(f.anio),
      planilla.mesAcreditado,
    ];
  } else {
    celdas = ['', '', '', '', mesDelInforme ? nombreMes(mesDelInforme) : ''];
  }

  let encontradas = 0;

  const nuevas = partes.map((parte) => {
    const objetivo = soloLasMasInternas(
      todasLasTablas(parte.xml).filter((t) => esTablaDePlanilla(t.xml)),
    );
    if (objetivo.length === 0) return parte;

    let xml = parte.xml;
    for (let i = objetivo.length - 1; i >= 0; i--) {
      const t = objetivo[i];
      xml = xml.slice(0, t.inicio) + reescribirFilaDePlanilla(t.xml, celdas) + xml.slice(t.fin);
    }

    encontradas += objetivo.length;
    return { ...parte, xml };
  });

  if (encontradas === 0) {
    avisos.push(
      'No se encontró la tabla de la planilla en la plantilla del informe. ' +
        'Verifique que su primer encabezado diga «NÚMERO DE PLANILLA».',
    );
  }

  return { partes: nuevas, avisos };
}

/** Escribe las cinco casillas de la fila de datos de la planilla. */
function reescribirFilaDePlanilla(tablaXml: string, celdas: string[]): string {
  const filas = bloquesDeNivelSuperior(tablaXml, 'w:tr');

  // La fila de datos es la que sigue a la de subencabezados DD | MM | AAA.
  const iSub = filas.findIndex((f) =>
    /^DD\s*MM\s*A+/.test(textoDe(f.xml).replace(/\s+/g, ' ').trim().toUpperCase()),
  );
  const iDatos = iSub === -1 ? 1 : iSub + 1;
  if (iDatos >= filas.length) return tablaXml;

  const fila = filas[iDatos];
  const celdasFila = bloquesDeNivelSuperior(fila.xml, 'w:tc');
  if (celdasFila.length < celdas.length) return tablaXml;

  let nuevaFila = fila.xml;
  // De derecha a izquierda para no invalidar los offsets de las anteriores.
  for (let c = celdas.length - 1; c >= 0; c--) {
    const celda = celdasFila[c];
    const reescrita = fijarTextoCelda(celda.xml, celdas[c]);
    nuevaFila = nuevaFila.slice(0, celda.inicio) + reescrita + nuevaFila.slice(celda.fin);
  }

  return tablaXml.slice(0, fila.inicio) + nuevaFila + tablaXml.slice(fila.fin);
}

