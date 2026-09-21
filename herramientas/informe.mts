/**
 * Genera «Informe del proyecto Kaori.docx».
 *
 *   npm run informe
 *
 * Kaori clona plantillas de Word; no sabe crear documentos desde cero. Por eso
 * este informe usa la librería `docx`, que sí construye documentos nuevos con
 * estilos, tablas, imágenes y numeración de páginas. Es una dependencia de
 * desarrollo: no entra en el instalador de la aplicación.
 *
 * Las cifras no están escritas a mano: se cuentan sobre el propio código en
 * `datosDelProyecto.ts`, para que el documento no envejezca en silencio.
 */

import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  AlignmentType,
  BorderStyle,
  Document,
  Footer,
  HeadingLevel,
  ImageRun,
  Packer,
  PageBreak,
  PageNumber,
  Paragraph,
  ShadingType,
  Table,
  TableCell,
  TableOfContents,
  TableRow,
  TextRun,
  WidthType,
} from 'docx';

import {
  RAIZ,
  archivosDePruebas,
  dependencias,
  fechaDeHoy,
  logo,
  modulos,
  paleta,
  totalDePruebas,
  totales,
} from './datosDelProyecto.mts';

// ── Paleta del documento (la misma de la aplicación) ────────────────────────

const NARANJA = 'F26A21';
const NARANJA_OSCURO = 'C4501A';
const TINTA = '1F2328';
const TINTA_TENUE = '6B7280';
const BORDE = 'E8E8E8';
const SUPERFICIE = 'FAFAFA';

// ── Piezas reutilizables ────────────────────────────────────────────────────

function h1(texto: string): Paragraph {
  return new Paragraph({
    heading: HeadingLevel.HEADING_1,
    spacing: { before: 480, after: 180 },
    children: [new TextRun({ text: texto, bold: true, size: 30, color: NARANJA_OSCURO })],
  });
}

function h2(texto: string): Paragraph {
  return new Paragraph({
    heading: HeadingLevel.HEADING_2,
    spacing: { before: 280, after: 120 },
    children: [new TextRun({ text: texto, bold: true, size: 24, color: TINTA })],
  });
}

/** Párrafo normal. Acepta trozos en negrita o monoespaciado. */
function p(...trozos: (string | TextRun)[]): Paragraph {
  return new Paragraph({
    spacing: { after: 140, line: 300 },
    alignment: AlignmentType.JUSTIFIED,
    children: trozos.map((t) =>
      typeof t === 'string' ? new TextRun({ text: t, size: 21, color: TINTA }) : t,
    ),
  });
}

function negrita(texto: string): TextRun {
  return new TextRun({ text: texto, bold: true, size: 21, color: TINTA });
}

/** Texto técnico: nombres de archivo, campos, fragmentos de código. */
function codigo(texto: string): TextRun {
  return new TextRun({ text: texto, font: 'Consolas', size: 19, color: NARANJA_OSCURO });
}

function vinieta(texto: string | TextRun[], nivel = 0): Paragraph {
  return new Paragraph({
    bullet: { level: nivel },
    spacing: { after: 90, line: 290 },
    children:
      typeof texto === 'string'
        ? [new TextRun({ text: texto, size: 21, color: TINTA })]
        : texto,
  });
}

function numerada(texto: (string | TextRun)[]): Paragraph {
  return new Paragraph({
    numbering: { reference: 'lista-numerada', level: 0 },
    spacing: { after: 110, line: 290 },
    children: texto.map((t) =>
      typeof t === 'string' ? new TextRun({ text: t, size: 21, color: TINTA }) : t,
    ),
  });
}

/** Recuadro para observaciones que conviene que resalten. */
function nota(titulo: string, cuerpo: string): Table {
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    borders: {
      top: { style: BorderStyle.SINGLE, size: 2, color: BORDE },
      bottom: { style: BorderStyle.SINGLE, size: 2, color: BORDE },
      left: { style: BorderStyle.SINGLE, size: 18, color: NARANJA },
      right: { style: BorderStyle.SINGLE, size: 2, color: BORDE },
      insideHorizontal: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
      insideVertical: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
    },
    rows: [
      new TableRow({
        children: [
          new TableCell({
            shading: { type: ShadingType.CLEAR, fill: SUPERFICIE },
            margins: { top: 160, bottom: 160, left: 220, right: 220 },
            children: [
              new Paragraph({
                spacing: { after: 60 },
                children: [
                  new TextRun({ text: titulo, bold: true, size: 21, color: NARANJA_OSCURO }),
                ],
              }),
              new Paragraph({
                spacing: { line: 290 },
                alignment: AlignmentType.JUSTIFIED,
                children: [new TextRun({ text: cuerpo, size: 20, color: TINTA })],
              }),
            ],
          }),
        ],
      }),
    ],
  });
}

type Celda = string | TextRun[];

/** Tabla con encabezado sombreado. `anchos` en porcentaje. */
function tabla(encabezados: string[], filas: Celda[][], anchos?: number[]): Table {
  const celda = (contenido: Celda, opciones: { encabezado?: boolean; derecha?: boolean } = {}) =>
    new TableCell({
      shading: opciones.encabezado
        ? { type: ShadingType.CLEAR, fill: SUPERFICIE }
        : undefined,
      margins: { top: 90, bottom: 90, left: 130, right: 130 },
      children: [
        new Paragraph({
          alignment: opciones.derecha ? AlignmentType.RIGHT : AlignmentType.LEFT,
          children:
            typeof contenido === 'string'
              ? [
                  new TextRun({
                    text: contenido,
                    bold: opciones.encabezado,
                    size: opciones.encabezado ? 18 : 20,
                    color: opciones.encabezado ? TINTA_TENUE : TINTA,
                  }),
                ]
              : contenido,
        }),
      ],
    });

  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    columnWidths: anchos,
    borders: {
      top: { style: BorderStyle.SINGLE, size: 2, color: BORDE },
      bottom: { style: BorderStyle.SINGLE, size: 2, color: BORDE },
      left: { style: BorderStyle.SINGLE, size: 2, color: BORDE },
      right: { style: BorderStyle.SINGLE, size: 2, color: BORDE },
      insideHorizontal: { style: BorderStyle.SINGLE, size: 2, color: BORDE },
      insideVertical: { style: BorderStyle.SINGLE, size: 2, color: BORDE },
    },
    rows: [
      new TableRow({
        tableHeader: true,
        children: encabezados.map((e, i) =>
          celda(e, { encabezado: true, derecha: i > 0 && /^(Archivos|Líneas|Pruebas)$/.test(e) }),
        ),
      }),
      ...filas.map(
        (fila) =>
          new TableRow({
            children: fila.map((c, i) =>
              celda(c, {
                derecha:
                  i > 0 && /^(Archivos|Líneas|Pruebas)$/.test(encabezados[i] ?? ''),
              }),
            ),
          }),
      ),
    ],
  });
}

function espacio(): Paragraph {
  return new Paragraph({ spacing: { after: 200 }, children: [] });
}

function saltoDePagina(): Paragraph {
  return new Paragraph({ children: [new PageBreak()] });
}

// ── Portada ─────────────────────────────────────────────────────────────────

function portada(): (Paragraph | Table)[] {
  const imagen = logo();
  const elementos: (Paragraph | Table)[] = [
    new Paragraph({ spacing: { before: 2200 }, children: [] }),
  ];

  if (imagen) {
    elementos.push(
      new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { after: 200 },
        children: [
          new ImageRun({
            data: imagen,
            type: 'png',
            transformation: { width: 130, height: 130 },
          }),
        ],
      }),
    );
  }

  elementos.push(
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 60 },
      children: [new TextRun({ text: 'Kaori', bold: true, size: 72, color: NARANJA })],
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 40 },
      children: [
        new TextRun({ text: 'Generador de informes de contrato', size: 26, color: TINTA }),
      ],
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 700 },
      children: [
        new TextRun({
          text: 'Municipio de Olaya Herrera — Nariño',
          size: 21,
          color: TINTA_TENUE,
        }),
      ],
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 40 },
      children: [
        new TextRun({ text: 'Informe del proyecto', bold: true, size: 24, color: TINTA }),
      ],
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      children: [
        new TextRun({ text: fechaDeHoy(), size: 21, color: TINTA_TENUE }),
      ],
    }),
    saltoDePagina(),
  );

  return elementos;
}

function indice(): (Paragraph | TableOfContents)[] {
  return [
    h1('Índice'),
    p(
      'Word puede pedir permiso para actualizar los campos al abrir el documento: ',
      negrita('conviene aceptar'),
      ', porque es lo que rellena este índice con sus números de página.',
    ),
    new TableOfContents('Índice', { hyperlink: true, headingStyleRange: '1-2' }),
    saltoDePagina(),
  ];
}

// ── Secciones ───────────────────────────────────────────────────────────────

function queEs(): (Paragraph | Table)[] {
  return [
    h1('1. Qué es Kaori y qué problema resuelve'),
    p(
      'Kaori es una aplicación de escritorio para Windows que genera los informes ',
      'mensuales de actividad contractual y de supervisión en Word, conservando ',
      'exactamente el diseño de la plantilla del municipio.',
    ),
    h2('El trabajo que sustituye'),
    p(
      'Hasta ahora el procedimiento era copiar el Word del mes anterior y editar a ',
      'mano una veintena de campos repartidos por dos documentos. Entre ellos:',
    ),
    vinieta('El número de contrato, el nombre del contratista y su cédula, que aparecen en cinco sitios distintos cada uno.'),
    vinieta([
      new TextRun({ text: 'Las fechas escritas en letras, con sus giros irregulares: ', size: 21, color: TINTA }),
      codigo('treinta y un (31) días'),
      new TextRun({ text: ', ', size: 21, color: TINTA }),
      codigo('primero (01) de febrero'),
      new TextRun({ text: ', ', size: 21, color: TINTA }),
      codigo('dos mil veinticinco (2025)'),
      new TextRun({ text: '.', size: 21, color: TINTA }),
    ]),
    vinieta('La cadena de pagos: lo pagado este mes, lo acumulado desde el principio y el saldo por ejecutar, que van sumando y restando mes a mes.'),
    vinieta('El párrafo de FORMA DE PAGO, con el valor total en letras y en números, cuántas mensualidades son y cuánto vale cada una.'),
    vinieta('Las tablas de obligaciones y del cronograma, que cambian de número de filas según el contrato.'),
    p(
      'Cada uno de esos campos editado a mano es una ocasión de equivocarse, y el ',
      'error no se nota hasta que alguien revisa el documento firmado. De hecho la ',
      'plantilla que se venía usando arrastraba dos cifras incorrectas, descritas en ',
      'la sección 9.',
    ),
    h2('Lo que hace en su lugar'),
    p(
      'El contrato de cada trabajador se registra una sola vez. A partir de ahí, ',
      'generar los informes de cualquier mes —para una persona o para todas a la ',
      'vez— es cuestión de elegir el mes y pulsar un botón. Las fechas, las cifras y ',
      'los textos en letras los calcula el programa.',
    ),
  ];
}

function comoSeUsa(): (Paragraph | Table)[] {
  return [
    h1('2. Cómo se usa'),
    p('El programa tiene cinco pantallas y se recorren en este orden la primera vez:'),
    espacio(),
    tabla(
      ['Paso', 'Pantalla', 'Qué se hace', 'Cada cuánto'],
      [
        ['1', 'Ajustes', 'Elegir la carpeta donde se guardarán los informes y los valores por defecto del municipio y del supervisor.', 'Una vez'],
        ['2', 'Plantillas', 'Subir un informe de Word ya diligenciado y confirmar el mapeo de campos que propone el programa.', 'Una vez por plantilla'],
        ['3', 'Contratos', 'Registrar el contrato: subiendo su PDF o escribiéndolo a mano. Asignarle la plantilla.', 'Una vez por contrato'],
        ['4', 'Generar mes', 'Elegir el mes, marcar los contratistas y pulsar Generar.', 'Cada mes'],
      ],
      [8, 18, 56, 18],
    ),
    espacio(),
    p(
      'La quinta pantalla es ',
      negrita('Contratistas'),
      ', donde se registran las personas. Se rellena sola cuando se importa un ',
      'contrato desde un PDF.',
    ),
    espacio(),
    nota(
      'El programa propone y la persona confirma',
      'Ni el mapeo de campos ni la lectura de un PDF se aplican a ciegas. En ambos ' +
        'casos el programa muestra lo que ha deducido y espera confirmación. Un campo ' +
        'mal asignado escribiría el dato en el lugar equivocado del informe, y eso es ' +
        'peor que no automatizarlo.',
    ),
  ];
}

function diseno(): (Paragraph | Table)[] {
  const elementos: (Paragraph | Table)[] = [
    h1('3. El diseño'),
    h2('Logo e identidad'),
  ];

  const imagen = logo();
  if (imagen) {
    elementos.push(
      new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { before: 100, after: 160 },
        children: [
          new ImageRun({
            data: imagen,
            type: 'png',
            transformation: { width: 96, height: 96 },
          }),
        ],
      }),
    );
  }

  elementos.push(
    p(
      'El logo original es vertical: el símbolo de un documento firmado con una pluma, ',
      'y debajo la palabra «Kaori». Para el ícono de la aplicación —el que se ve en la ',
      'barra de tareas, a 32 píxeles— esa palabra sería ilegible, así que el ícono se ',
      'genera recortando sólo el símbolo.',
    ),
    p(
      'El recorte no se hizo a ojo: un script detecta el contorno del contenido no ',
      'blanco en la mitad superior de la imagen, lo centra y lo cuadra con un margen. ',
      'Así, si algún día cambia el logo, el ícono se regenera sin volver a medir nada.',
    ),
    h2('Paleta de colores'),
    p(
      'Blanco y naranja, como se pidió. La decisión de fondo es que ',
      negrita('el naranja se reserva para acciones y estados'),
      ' —botones primarios, la sección activa, los resaltados— y nunca se usa como ',
      'fondo de áreas grandes: en jornadas largas cansa la vista y, sobre todo, deja ',
      'de señalar dónde hay que pulsar.',
    ),
    espacio(),
    tabla(
      ['Color', 'Valor', 'Dónde se usa'],
      paleta().map((c) => [c.nombre, [codigo(c.valor)], c.uso]),
      [24, 18, 58],
    ),
    espacio(),
    h2('Tipografía e iconografía'),
    p(
      'La tipografía es ',
      negrita('Inter'),
      ', con las variantes de Segoe UI como respaldo. Los íconos son de ',
      negrita('lucide-react'),
      ': íconos SVG profesionales, empaquetados dentro de la aplicación para que ',
      'funcionen sin conexión.',
    ),
    h2('Criterios de interfaz'),
    vinieta('Las tablas anchas se desplazan dentro de su propia caja; la página nunca se desplaza en horizontal.'),
    vinieta('El foco del teclado siempre es visible, para que la aplicación se pueda usar sin ratón.'),
    vinieta('Cuando algo no se puede hacer, la aplicación dice qué falta y ofrece un enlace directo a donde se resuelve, en lugar de limitarse a desactivar el botón.'),
    vinieta('Los avisos distinguen entre información, advertencia y error, cada uno con su color y su ícono.'),
  );

  return elementos;
}

function comoFunciona(): (Paragraph | Table)[] {
  return [
    h1('4. La decisión central: clonar el .docx, no recrearlo'),
    p(
      'Para conservar el diseño del informe había dos caminos, y sólo uno funciona de ',
      'verdad.',
    ),
    p(
      negrita('El camino que no se tomó'),
      ' es analizar el documento y reconstruirlo con una librería de generación. ',
      'Siempre pierde algo: el espaciado exacto, los logos del encabezado, los bordes ',
      'de las tablas, los estilos de numeración.',
    ),
    p(
      negrita('El camino que se tomó'),
      ' aprovecha que un archivo ',
      codigo('.docx'),
      ' es en realidad un ZIP con XML dentro. El programa copia ese ZIP entero y sólo ',
      'reemplaza el texto marcado en el mapeo. Los logos, las imágenes, los tipos de ',
      'letra, los estilos y los márgenes ',
      negrita('no se abren siquiera'),
      ', así que salen idénticos al original.',
    ),
    espacio(),
    nota(
      'Está comprobado, no supuesto',
      'La prueba de tests/docxArchivo.test.ts genera tres informes encadenados y ' +
        'verifica que los bytes del logo y del archivo de estilos siguen siendo ' +
        'exactamente los mismos. La prueba de extremo a extremo hace lo mismo sobre el ' +
        'informe real del contrato 084-2025, comparando todas las partes del ZIP que no ' +
        'son contenido editable.',
    ),
    espacio(),
    h2('El detalle delicado: los runs partidos'),
    p(
      'Word no guarda un texto seguido como un bloque. Cada corrección de tipeo, cada ',
      'marca del corrector ortográfico, parte el texto en fragmentos llamados ',
      codigo('<w:r>'),
      '. Un número de contrato como ',
      codigo('078-2025'),
      ' puede estar guardado en tres trozos: ',
      codigo('078'),
      ', ',
      codigo('-20'),
      ' y ',
      codigo('25'),
      '. Buscarlo tal cual no lo encontraría.',
    ),
    p(
      'Por eso, al registrar una plantilla, lo primero que hace el programa es ',
      negrita('fusionar los fragmentos contiguos que comparten formato'),
      '. Sólo fusiona los que contienen texto simple: si uno lleva un salto de línea, ',
      'una imagen o un campo, se deja intacto, porque fusionarlo destruiría contenido. ',
      'El archivo normalizado es el que se guarda como plantilla, y ya no vuelve a ',
      'cambiar. De ahí que las coordenadas del mapeo sigan siendo válidas para siempre.',
    ),
  ];
}

function deteccion(): (Paragraph | Table)[] {
  return [
    h1('5. Cómo reconoce los campos'),
    p(
      'La primera versión buscaba por la forma del texto: «esto parece una cédula», ',
      '«esto está en mayúsculas, será un nombre». Sobre el informe real producía ',
      negrita('99 candidatos, la mayoría basura'),
      ' —fragmentos como «OLAYA HERRERA PLAZO», que mezclaban el final de una celda ',
      'con el rótulo de la siguiente—, y obligaba a revisarlos uno por uno.',
    ),
    p(
      'La versión actual se ancla a la estructura real del documento. El informe es ',
      'una sucesión de tablas rótulo → valor, y cada celda cae en su propio párrafo:',
    ),
    espacio(),
    tabla(
      ['En el documento', 'Lo que deduce'],
      [
        [[codigo('CONTRATISTA:')], 'La celda siguiente es el nombre del contratista'],
        [[codigo('OBJETO')], 'La celda siguiente es el objeto del contrato'],
        [[codigo('CERTIFICADO DE DISPONIBILIDAD PRESUPUESTAL')], 'Las cinco celdas siguientes son día, mes, año, número y valor'],
        [[codigo('PERIODO DEL INFORME:')], 'Tras los encabezados vienen las seis cifras del periodo'],
      ],
      [42, 58],
    ),
    espacio(),
    p(
      'Después propaga cada dato ya resuelto al resto del documento: el nombre del ',
      'contratista aparece en el encabezado, bajo su firma y como beneficiario del CDP ',
      'y del RP, y las cuatro apariciones quedan marcadas a la vez.',
    ),
    p(
      'Por último excluye las zonas que se regeneran enteras —la tabla del cronograma ',
      'y las de obligaciones—, porque no tiene sentido marcar celda por celda algo que ',
      'se va a reconstruir.',
    ),
    espacio(),
    tabla(
      ['Sobre el informe real del contrato 084-2025', 'Antes', 'Ahora'],
      [
        ['Candidatos propuestos', '99', '67'],
        ['Proporción en confianza alta', 'minoría', 'más del 90 %'],
        ['Campos principales reconocidos sin ayuda', '—', '20 de 20'],
      ],
      [58, 21, 21],
    ),
    espacio(),
    p(
      'Aun así, la detección ',
      negrita('propone y la persona confirma'),
      '. Hay un botón para aceptar de golpe las sugerencias seguras y otro para ',
      'empezar el mapeo de cero.',
    ),
  ];
}

function motores(): (Paragraph | Table)[] {
  return [
    h1('6. Los motores de cálculo'),
    h2('Español: números y fechas en letras'),
    p(
      'Convierte cifras a palabras respetando los giros que exigen los informes, que ',
      'no son los que produciría una conversión ingenua:',
    ),
    espacio(),
    tabla(
      ['Caso', 'Lo correcto', 'Por qué'],
      [
        [[codigo('31')], 'treinta y un (31) días', 'Apócope delante del sustantivo, no «treinta y uno»'],
        [[codigo('1')], 'primero (01) de febrero', 'El día uno se dice «primero»'],
        [[codigo('$1.000.000')], 'UN MILLÓN DE PESOS', 'La preposición «de» aparece si la cifra termina en millones'],
        [[codigo('$13.630.000')], 'TRECE MILLONES … MIL PESOS', 'Sin «de», porque tras los millones viene algo más'],
      ],
      [16, 36, 48],
    ),
    espacio(),
    p(
      'Las fechas se manejan como ',
      negrita('días de calendario, sin zona horaria'),
      '. Usar el tipo de fecha habitual habría introducido corrimientos que harían ',
      'imprimir «30 de enero» donde debe decir «31», según dónde se ejecute el programa.',
    ),
    h2('Pagos: acumulados, adiciones y suspensiones'),
    p('Las fórmulas están verificadas contra los informes reales:'),
    espacio(),
    tabla(
      ['Campo del informe', 'Cómo se calcula'],
      [
        ['Pago del mes', 'La cuota programada para ese mes'],
        ['TOTAL PAGADO HASTA LA FECHA', 'La suma de todas las cuotas hasta ese mes, inclusive'],
        ['VALOR EJECUTADO', 'Igual al acumulado'],
        ['VALOR POR EJECUTAR', 'Valor vigente menos el acumulado'],
        ['SUMAS IGUALES', 'El valor vigente: valor inicial más adiciones'],
      ],
      [40, 60],
    ),
    espacio(),
    p(
      'Una ',
      negrita('adición'),
      ' aumenta el valor, prorroga el plazo, o ambas cosas; sus cuotas se intercalan ',
      'en el cronograma por fecha. Una ',
      negrita('suspensión'),
      ' congela el contrato: los días suspendidos se excluyen del periodo del informe ',
      'y corren la fecha de terminación. Si un mes queda suspendido por completo, no se ',
      'genera informe y el contratista no aparece en el lote de ese mes.',
    ),
    h2('FORMA DE PAGO'),
    p(
      'El párrafo que va encima de la tabla de pagos se compone solo desde el ',
      'cronograma, porque casi todo en él cambia: el valor total, cuántas ',
      'mensualidades son, el importe de la primera —distinto cuando el contrato ',
      'arranca a mitad de mes, «los veinticuatro (24) días del mes de enero»— y el de ',
      'las demás. Si los importes fueran irregulares, los enumera uno por uno en lugar ',
      'de inventar un valor único que no correspondería a ninguna cuota.',
    ),
    h2('Extracción: PDF, OCR e IA'),
    p('La lectura de documentos va en cascada, de más exacto a menos:'),
    numerada([negrita('PDF con texto seleccionable'), ': se extrae literalmente, sin pérdida.']),
    numerada([negrita('PDF escaneado o imagen'), ': OCR local con Tesseract en español.']),
    numerada([
      negrita('Con clave de API configurada'),
      ': la lectura la hace la IA, que además ',
      negrita('entiende'),
      ' qué es cada dato en vez de deducirlo por su forma, y redacta las actividades ejecutadas.',
    ]),
    p(
      'Todo lo esencial funciona sin conexión. La clave, si se configura, se guarda ',
      'cifrada por Windows y nunca sale del equipo salvo hacia el servicio.',
    ),
  ];
}

function construido(): (Paragraph | Table)[] {
  const m = modulos();
  const t = totales();

  return [
    h1('7. Qué está construido'),
    p(
      'El programa está organizado en tres capas. En ',
      codigo('core/'),
      ' vive la lógica pura, sin interfaz ni Electron: es lo que cubren las pruebas. ',
      'En ',
      codigo('electron/'),
      ' está el proceso principal, el almacenamiento y los canales de comunicación. ',
      'En ',
      codigo('src/'),
      ' está la interfaz.',
    ),
    espacio(),
    tabla(
      ['Módulo', 'Qué contiene', 'Archivos', 'Líneas'],
      [
        ...m.map((x) => [x.ruta, x.descripcion, String(x.archivos), x.lineas.toLocaleString('es')]),
        [
          [negrita('Total')],
          [negrita('')],
          [negrita(String(t.archivos))],
          [negrita(t.lineas.toLocaleString('es'))],
        ],
      ],
      [22, 46, 14, 18],
    ),
    espacio(),
    p(
      'Los datos se guardan en un único archivo JSON dentro de la carpeta de datos de ',
      'la aplicación. Para hacer una copia de seguridad basta con copiar ese archivo. ',
      'Se descartó una base de datos porque obligaría a recompilar un módulo nativo y ',
      'no aporta nada para el volumen esperado.',
    ),
  ];
}

function verificacion(): (Paragraph | Table)[] {
  const archivos = archivosDePruebas();

  return [
    h1('8. Verificación'),
    p(
      'Hay ',
      negrita(`${totalDePruebas()} pruebas automáticas`),
      ' que se ejecutan con ',
      codigo('npm test'),
      '. El criterio de fondo es que ',
      negrita('las expectativas están copiadas literalmente de los informes reales'),
      ', no inventadas: si una prueba dice que febrero debe decir «a los veintiocho ',
      '(28) días», es porque así lo dice el documento del municipio.',
    ),
    espacio(),
    tabla(
      ['Archivo', 'Pruebas', 'Qué garantiza'],
      archivos.map((a) => [[codigo(a.nombre)], String(a.pruebas), a.garantiza]),
      [28, 12, 60],
    ),
    espacio(),
    h2('Las comprobaciones que más importan'),
    vinieta('Las ocho frases en letras de los tres informes de ejemplo se reproducen carácter por carácter.'),
    vinieta('Las cifras de enero y febrero cuadran: saldo de 11.750.000 y 9.400.000 en el contrato 078-2025; 8.115.000 en el 084-2025.'),
    vinieta('El logo, los estilos y las relaciones del .docx sobreviven intactos a tres generaciones encadenadas.'),
    vinieta('El flujo completo funciona sobre el documento real: registrar la plantilla, aceptar el mapeo automático y producir el informe de otro mes.'),
  ];
}

function erratas(): (Paragraph | Table)[] {
  return [
    h1('9. Erratas de la plantilla corregidas'),
    p(
      'La plantilla que se venía usando arrastraba dos cifras incorrectas en la ',
      'columna «VALOR TOTAL» del balance:',
    ),
    espacio(),
    tabla(
      ['Campo', 'Lo que traía', 'Lo que hace Kaori'],
      [
        ['VALOR EJECUTADO', [codigo('3.000.000')], 'Se deja en blanco'],
        ['VALOR POR EJECUTAR', [codigo('6000000000666')], 'Se deja en blanco'],
      ],
      [32, 30, 38],
    ),
    espacio(),
    p(
      'Se dejan vacías, y no con otra cifra, porque ',
      negrita('esa columna ya cuadra sin ellas'),
      ': valor inicial más adiciones da SUMAS IGUALES. Poner cualquier número ahí ',
      'descuadraría la tabla. Las cifras de la columna derecha siempre fueron ',
      'correctas y se reproducen igual.',
    ),
  ];
}

function fallos(): (Paragraph | Table)[] {
  const fallo = (titulo: string, sintoma: string, causa: string, arreglo: string) => [
    new Paragraph({
      spacing: { before: 220, after: 80 },
      children: [new TextRun({ text: titulo, bold: true, size: 21, color: NARANJA_OSCURO })],
    }),
    p(negrita('Síntoma. '), sintoma),
    p(negrita('Causa. '), causa),
    p(negrita('Corrección. '), arreglo),
  ];

  return [
    h1('10. Fallos encontrados durante el desarrollo'),
    p(
      'Esta sección es la que más valor tiene como registro, porque documenta trampas ',
      'que volverían a aparecer si el proyecto se retoma más adelante. Casi todas las ',
      'encontraron las pruebas automáticas, no la vista.',
    ),

    ...fallo(
      'Los campos se escribían en el lugar equivocado',
      'Al generar el informe de otro contrato, los datos aparecían desplazados o el programa fallaba diciendo que un reemplazo no caía sobre ningún texto.',
      'Las tablas de obligaciones se rellenaban ANTES de sustituir los campos. Cambiar el número de filas —el contrato 078 tiene doce obligaciones y el 084 nueve— corría todas las posiciones posteriores, y las coordenadas del mapeo dejaban de valer.',
      'Se invirtió el orden: primero los campos, con el documento intacto; después las tablas, que localizan su posición sobre la marcha y no dependen de coordenadas guardadas.',
    ),

    ...fallo(
      'La tabla del cronograma nunca se rellenaba',
      'El informe salía con las fechas y los importes del contrato que había servido de plantilla, es decir, los de otra persona.',
      'La tabla se había excluido del mapeo de campos, pero nunca se escribió el código que la regenera. Quedó un hueco silencioso.',
      'Se implementó su llenado a partir de las cuotas del contrato, clonando la fila molde igual que en las obligaciones.',
    ),

    ...fallo(
      'Y al implementarlo, no la encontraba',
      'El código nuevo no localizaba la tabla, aunque estaba claramente en el documento.',
      'La tabla PAGO / FECHA / VALOR está anidada DENTRO de la celda de FORMA DE PAGO, debajo de su párrafo. La búsqueda sólo miraba tablas de primer nivel.',
      'Se buscan tablas a cualquier profundidad, quedándose con las más internas para no destruir la que las contiene.',
    ),

    ...fallo(
      'Una tabla sobrescribía a otra',
      'Al rellenar el cronograma desaparecía el contenido de «Relación de pagos efectuados».',
      'El detector comprobaba que el encabezado «contuviera» las palabras PAGO, FECHA y VALOR, y eso también casa con DESCRIPCIÓN / FECHA DE PAGO / VALOR.',
      'La comparación pasó a ser celda por celda y exacta. Hay una prueba dedicada a que esa tabla no se toque.',
    ),

    ...fallo(
      'No se podían guardar los cambios',
      'Al mapear una plantilla aparecía un error de archivo no encontrado y el mapeo se perdía.',
      'La interfaz guarda en cada pulsación, y dos guardados simultáneos compartían el mismo archivo temporal: el primero lo renombraba y el segundo ya no lo encontraba.',
      'Las escrituras se encolan por archivo y cada una usa un nombre temporal único. Ocho pruebas cubren el caso.',
    ),

    ...fallo(
      'La selección de contratistas se rehacía sola',
      'Desmarcar un contratista no servía de nada, y tras generar, el panel con el enlace al documento desaparecía al instante.',
      'Guardar cualquier cosa disparaba un recálculo de la pantalla, y ese recálculo volvía a marcar todo y borraba el resultado.',
      'El recálculo dejó de tocar ambas cosas: la selección sólo se rellena al cambiar de mes, y el resultado sólo se limpia al empezar una generación nueva.',
    ),

    ...fallo(
      'Un documento sobrescribía a otro',
      'Al generar dos contratos duplicados sólo aparecía un archivo en la carpeta.',
      'Dos contratos con el mismo número y el mismo contratista producían el mismo nombre de archivo.',
      'Si un nombre ya se usó en el lote, se numera. Además la pantalla avisa de que hay contratos repetidos.',
    ),

    ...fallo(
      'Escribir en una celda borraba su tabla interior',
      'Una celda que contenía otra tabla perdía ese contenido al rellenarse.',
      'Se reemplazaban todos los fragmentos de texto de la celda, incluidos los que pertenecían a la tabla de dentro.',
      'Ahora sólo se tocan los fragmentos propios de la celda.',
    ),

    ...fallo(
      'Faltaba una preposición',
      'Los importes redondos se escribían como «TRES MILLONES PESOS».',
      'En español, «de» aparece cuando la cifra termina justo en millón o millones. Nunca se notó porque ninguna cifra de los contratos reales es redonda.',
      'La conversión distingue ambos casos, con pruebas para cada uno.',
    ),

    ...fallo(
      'La detección producía basura',
      'El asistente de mapeo mostraba fragmentos absurdos que mezclaban dos celdas.',
      'La expresión que buscaba nombres en mayúsculas cruzaba los saltos de línea que separan las celdas.',
      'Se eliminó ese criterio por completo y se sustituyó por la detección anclada a rótulos.',
    ),

    ...fallo(
      'Rótulos que se confundían entre sí',
      'El año del contrato tomaba el valor de otra tabla, y el nombre del contratista capturaba un encabezado entero.',
      'Tres colisiones: «Año» (encabezado de la tabla del periodo) con «Año:» (dato); «Contratista» (rótulo bajo la firma) con «CONTRATISTA:» (celda de datos); y «VALOR» (valor del contrato) con «VALOR» (encabezado de la tabla de pagos).',
      'Los dos primeros se distinguen exigiendo los dos puntos. El tercero, comprobando que la celda siguiente contenga un importe escrito en letras.',
    ),
  ];
}

function estado(): (Paragraph | Table)[] {
  return [
    h1('11. Estado actual y pendientes'),
    h2('Lo que está terminado y verificado'),
    vinieta('Los motores de español, pagos y generación de documentos, con sus pruebas contra los informes reales.'),
    vinieta('El mapeo de plantillas con detección automática anclada a rótulos.'),
    vinieta('El registro de contratistas y contratos, con importación desde PDF.'),
    vinieta('La generación por lotes mensuales, con barra de progreso y explicación de lo que falta cuando no se puede generar.'),
    vinieta('La papelera con recuperación durante 30 días.'),
    vinieta('La aplicación arrancando, verificada visualmente.'),

    h2('Lo que queda abierto'),
    espacio(),
    tabla(
      ['Pendiente', 'Detalle'],
      [
        [
          'Suspensiones sin validar',
          'Se asume que la fecha de terminación se corre tantos días como duró la suspensión. Es el criterio habitual en contratación estatal colombiana, pero ninguno de los informes de ejemplo ejercita ese caso, así que conviene contrastarlo con un contrato real antes de darlo por definitivo.',
        ],
        [
          'Instalador sin firmar',
          'Windows SmartScreen mostrará «editor desconocido» la primera vez. Quitarlo requiere comprar un certificado de firma de código.',
        ],
        [
          'Sólo Windows',
          'El código no es específico de Windows, pero el instalador de Mac no se puede compilar desde este equipo: Apple lo impide.',
        ],
        [
          'La lectura con IA no se ha probado con una clave real',
          'La ruta sin conexión sí está probada. La de IA está implementada y compila, pero no se ha ejecutado contra el servicio.',
        ],
        [
          'Dos pantallas sin verificación visual',
          'El desplegable de contratos en Contratistas y la papelera en Ajustes se verificaron con pruebas y comprobación de tipos, pero no se han visto renderizadas.',
        ],
      ],
      [30, 70],
    ),
    espacio(),
    nota(
      'Sobre la corrección de las erratas',
      'La decisión de dejar en blanco las dos celdas erróneas se tomó tras analizar la ' +
        'tabla, y cambia lo que se había dicho al principio, que era calcularlas. ' +
        'Conviene revisar el primer informe generado por si quien lo recibe espera ver ' +
        'algo en esas casillas.',
    ),
  ];
}

function apendice(): (Paragraph | Table)[] {
  const d = dependencias();

  return [
    h1('12. Apéndice técnico'),
    h2('Comandos'),
    espacio(),
    tabla(
      ['Comando', 'Para qué'],
      [
        [[codigo('npm install')], 'Instalar las dependencias, una sola vez'],
        [[codigo('npm run dev')], 'Abrir Kaori en modo desarrollo'],
        [[codigo('npm test')], 'Ejecutar las pruebas automáticas'],
        [[codigo('npm run build')], 'Comprobar los tipos y compilar'],
        [[codigo('npm run dist')], 'Crear el instalador .exe en la carpeta release/'],
        [[codigo('npm run informe')], 'Regenerar este documento'],
      ],
      [30, 70],
    ),
    espacio(),
    h2('Dependencias de la aplicación'),
    espacio(),
    tabla(
      ['Paquete', 'Versión', 'Para qué'],
      d.produccion.map((x) => [[codigo(x.nombre)], x.version, x.para]),
      [30, 14, 56],
    ),
    espacio(),
    h2('Dependencias de desarrollo'),
    espacio(),
    tabla(
      ['Paquete', 'Versión', 'Para qué'],
      d.desarrollo.map((x) => [[codigo(x.nombre)], x.version, x.para]),
      [30, 14, 56],
    ),
    espacio(),
    h2('Dónde están los datos'),
    p(
      'Todo se guarda en la carpeta de datos de la aplicación, dentro del perfil del ',
      'usuario de Windows. La ruta exacta aparece en la pantalla de Ajustes, con un ',
      'botón para abrirla. Contiene el archivo ',
      codigo('datos.json'),
      ' —contratistas, contratos, informes, papelera y ajustes— y la carpeta ',
      codigo('plantillas/'),
      ' con los .docx normalizados y su índice de mapeos.',
    ),
    p(
      'Si se venía usando la versión anterior, que se llamaba «programa-alcaldia», ',
      'Kaori traslada esos datos automáticamente la primera vez que arranca.',
    ),
  ];
}

// ── Documento ───────────────────────────────────────────────────────────────

function construirDocumento(): Document {
  return new Document({
    creator: 'Kaori',
    title: 'Informe del proyecto Kaori',
    description: 'Registro del proyecto: qué es, cómo está hecho y qué queda pendiente',
    // Hace que Word ofrezca actualizar el índice al abrir el documento.
    features: { updateFields: true },
    styles: {
      default: {
        document: {
          run: { font: 'Calibri', size: 21, color: TINTA },
        },
      },
    },
    numbering: {
      config: [
        {
          reference: 'lista-numerada',
          levels: [
            {
              level: 0,
              format: 'decimal',
              text: '%1.',
              alignment: AlignmentType.START,
              style: { paragraph: { indent: { left: 480, hanging: 260 } } },
            },
          ],
        },
      ],
    },
    sections: [
      {
        properties: {
          page: { margin: { top: 1200, bottom: 1200, left: 1200, right: 1200 } },
        },
        footers: {
          default: new Footer({
            children: [
              new Paragraph({
                alignment: AlignmentType.CENTER,
                children: [
                  new TextRun({ text: 'Kaori · ', size: 17, color: TINTA_TENUE }),
                  new TextRun({ children: [PageNumber.CURRENT], size: 17, color: TINTA_TENUE }),
                ],
              }),
            ],
          }),
        },
        children: [
          ...portada(),
          ...indice(),
          ...queEs(),
          ...comoSeUsa(),
          ...diseno(),
          ...comoFunciona(),
          ...deteccion(),
          ...motores(),
          ...construido(),
          ...verificacion(),
          ...erratas(),
          ...fallos(),
          ...estado(),
          ...apendice(),
        ],
      },
    ],
  });
}

export async function generar(): Promise<string> {
  const documento = construirDocumento();
  const contenido = await Packer.toBuffer(documento);
  const destino = join(RAIZ, 'Informe del proyecto Kaori.docx');
  writeFileSync(destino, contenido);
  return destino;
}

// Ejecutado directamente con `npm run informe`.
const ruta = await generar();
console.log(`Informe generado: ${ruta}`);
