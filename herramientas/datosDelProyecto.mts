/**
 * Datos reales del proyecto, leídos del propio código.
 *
 * El informe no repite cifras a mano: las cuenta. Si mañana se añade un módulo
 * o una prueba, el documento generado lo refleja sin que nadie tenga que
 * acordarse de actualizarlo. Un informe con cifras copiadas envejece mal y
 * acaba mintiendo sin que se note.
 */

import { readdirSync, readFileSync, statSync, existsSync } from 'node:fs';
import { join, extname } from 'node:path';

/** Raíz del proyecto, calculada desde este archivo. */
export const RAIZ = join(import.meta.dirname ?? process.cwd(), '..');

function rutaDe(...partes: string[]): string {
  return join(RAIZ, ...partes);
}

/** Archivos de código de una carpeta, recursivamente. */
function archivosDeCodigo(carpeta: string): string[] {
  if (!existsSync(carpeta)) return [];
  const salida: string[] = [];

  for (const nombre of readdirSync(carpeta)) {
    const ruta = join(carpeta, nombre);
    if (statSync(ruta).isDirectory()) {
      salida.push(...archivosDeCodigo(ruta));
    } else if (['.ts', '.tsx'].includes(extname(nombre))) {
      salida.push(ruta);
    }
  }

  return salida;
}

export type Modulo = {
  ruta: string;
  descripcion: string;
  archivos: number;
  lineas: number;
};

const MODULOS: { ruta: string; descripcion: string }[] = [
  { ruta: 'core/espanol', descripcion: 'Números y fechas en letras' },
  { ruta: 'core/pagos', descripcion: 'Cuotas, acumulados, adiciones y suspensiones' },
  { ruta: 'core/docx', descripcion: 'Lectura del .docx, detección de campos y mapeo' },
  { ruta: 'core/generar', descripcion: 'Composición del informe y llenado de tablas' },
  { ruta: 'core/extraccion', descripcion: 'PDF, OCR y redacción de actividades' },
  { ruta: 'core/modelo', descripcion: 'Tipos de datos y papelera' },
  { ruta: 'core/almacenamiento', descripcion: 'Escritura de archivos sin carreras' },
  { ruta: 'electron', descripcion: 'Proceso principal, almacenamiento y canales IPC' },
  { ruta: 'src', descripcion: 'Interfaz en React' },
  { ruta: 'tests', descripcion: 'Pruebas automáticas' },
];

/**
 * Cuenta las líneas de un archivo igual que `wc -l`: por saltos de línea.
 *
 * Usar `split('\n').length` habría sumado una línea de más por archivo —52 en
 * total— porque los archivos terminan en salto. Es poca cosa, pero un informe
 * que presume de contar sus cifras no puede tenerlas mal.
 */
function contarLineas(ruta: string): number {
  const texto = readFileSync(ruta, 'utf8');
  const saltos = (texto.match(/\n/g) ?? []).length;
  const terminaEnSalto = texto.endsWith('\n');
  return terminaEnSalto ? saltos : saltos + 1;
}

export function modulos(): Modulo[] {
  return MODULOS.map((m) => {
    const archivos = archivosDeCodigo(rutaDe(m.ruta));
    const lineas = archivos.reduce((suma, a) => suma + contarLineas(a), 0);
    return { ...m, archivos: archivos.length, lineas };
  });
}

export function totales(): { archivos: number; lineas: number } {
  return modulos().reduce(
    (t, m) => ({ archivos: t.archivos + m.archivos, lineas: t.lineas + m.lineas }),
    { archivos: 0, lineas: 0 },
  );
}

export type ArchivoDePruebas = {
  nombre: string;
  pruebas: number;
  garantiza: string;
};

/** Qué garantiza cada archivo de pruebas. */
const QUE_GARANTIZA: Record<string, string> = {
  'espanol.test.ts': 'Las frases en letras, literales de los informes reales',
  'cronograma.test.ts': 'Las cifras de pagos, acumulados y saldos',
  'docx.test.ts': 'Fusión de runs partidos y mapeo de texto a XML',
  'anclas.test.ts': 'Detección de campos sobre el informe real',
  'papelera.test.ts': 'Caducidad a 30 días y restauración completa',
  'redactar.test.ts': 'Conjugación de las actividades ejecutadas',
  'tablas.test.ts': 'Expansión de filas conservando el formato',
  'generarInforme.test.ts': 'El flujo completo, de plantilla a documento',
  'formaDePago.test.ts': 'El párrafo de FORMA DE PAGO, carácter por carácter',
  'escritura.test.ts': 'Guardado simultáneo sin perder cambios',
  'docxArchivo.test.ts': 'Fidelidad del .docx tras varias generaciones',
};

/**
 * Cuenta las pruebas de cada archivo.
 *
 * Se cuentan las llamadas a `it(` e `it.runIf(` al principio de línea, que es
 * como están escritas en todo el proyecto.
 */
export function archivosDePruebas(): ArchivoDePruebas[] {
  const carpeta = rutaDe('tests');
  if (!existsSync(carpeta)) return [];

  return readdirSync(carpeta)
    .filter((n) => n.endsWith('.test.ts'))
    .map((nombre) => {
      const texto = readFileSync(join(carpeta, nombre), 'utf8');
      const pruebas = (texto.match(/^\s*it(?:\.runIf\([^)]*\))?\(/gm) ?? []).length;
      return {
        nombre,
        pruebas,
        garantiza: QUE_GARANTIZA[nombre] ?? '—',
      };
    })
    .sort((a, b) => b.pruebas - a.pruebas);
}

export function totalDePruebas(): number {
  return archivosDePruebas().reduce((s, a) => s + a.pruebas, 0);
}

export type Color = { nombre: string; valor: string; uso: string };

/** Para qué se usa cada color; el valor se lee de la configuración real. */
const USO_DEL_COLOR: Record<string, string> = {
  'naranja.500': 'Acciones primarias y estado activo',
  'naranja.50': 'Fondos de resalte y selección',
  'naranja.700': 'Texto sobre fondos claros de marca',
  'tinta.DEFAULT': 'Texto principal',
  'tinta.tenue': 'Texto secundario y descripciones',
  'tinta.suave': 'Texto de menor importancia y marcadores',
  borde: 'Separadores y contornos',
  superficie: 'Barra lateral y encabezados de tabla',
};

/** Lee la paleta desde `tailwind.config.js`, que es la fuente de verdad. */
export function paleta(): Color[] {
  const config = readFileSync(rutaDe('tailwind.config.js'), 'utf8');

  const buscarNaranja = (tono: string): string =>
    new RegExp(`${tono}:\\s*'(#[0-9A-Fa-f]{6})'`).exec(config)?.[1] ?? '?';
  const buscarSuelto = (clave: string): string =>
    new RegExp(`${clave}:\\s*'(#[0-9A-Fa-f]{6})'`).exec(config)?.[1] ?? '?';

  return [
    { nombre: 'Naranja 500', valor: buscarNaranja('500'), uso: USO_DEL_COLOR['naranja.500'] },
    { nombre: 'Naranja 700', valor: buscarNaranja('700'), uso: USO_DEL_COLOR['naranja.700'] },
    { nombre: 'Naranja 50', valor: buscarNaranja('50'), uso: USO_DEL_COLOR['naranja.50'] },
    { nombre: 'Tinta', valor: buscarSuelto('DEFAULT'), uso: USO_DEL_COLOR['tinta.DEFAULT'] },
    { nombre: 'Tinta tenue', valor: buscarSuelto('tenue'), uso: USO_DEL_COLOR['tinta.tenue'] },
    { nombre: 'Tinta suave', valor: buscarSuelto('suave'), uso: USO_DEL_COLOR['tinta.suave'] },
    { nombre: 'Borde', valor: buscarSuelto('borde'), uso: USO_DEL_COLOR['borde'] },
    { nombre: 'Superficie', valor: buscarSuelto('superficie'), uso: USO_DEL_COLOR['superficie'] },
  ];
}

export type Dependencia = { nombre: string; version: string; para: string };

const PARA_QUE: Record<string, string> = {
  '@anthropic-ai/sdk': 'Lectura con IA y redacción de actividades (opcional)',
  'fast-xml-parser': 'Apoyo en el análisis de XML',
  'lucide-react': 'Iconografía de la interfaz',
  'pdfjs-dist': 'Extracción de texto de PDFs',
  pizzip: 'Apertura y escritura del ZIP que es un .docx',
  react: 'Interfaz',
  'react-dom': 'Interfaz',
  'tesseract.js': 'OCR sin conexión, en español',
  electron: 'Aplicación de escritorio',
  'electron-builder': 'Instalador de Windows',
  vite: 'Compilación',
  vitest: 'Pruebas automáticas',
  typescript: 'Tipado estático',
  tailwindcss: 'Estilos de la interfaz',
  docx: 'Generación de este informe (sólo desarrollo)',
};

export function dependencias(): { produccion: Dependencia[]; desarrollo: Dependencia[] } {
  const p = JSON.parse(readFileSync(rutaDe('package.json'), 'utf8')) as {
    dependencies: Record<string, string>;
    devDependencies: Record<string, string>;
  };

  const mapear = (o: Record<string, string>): Dependencia[] =>
    Object.entries(o).map(([nombre, version]) => ({
      nombre,
      version: version.replace(/^\^/, ''),
      para: PARA_QUE[nombre] ?? '',
    }));

  return {
    produccion: mapear(p.dependencies),
    desarrollo: mapear(p.devDependencies).filter((d) => d.para !== ''),
  };
}

/** Logo para la portada. */
export function logo(): Buffer | null {
  const ruta = rutaDe('recursos', 'icono.png');
  return existsSync(ruta) ? readFileSync(ruta) : null;
}

/** Fecha de hoy escrita en largo: "17 de agosto de 2026". */
export function fechaDeHoy(): string {
  const meses = [
    'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
    'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre',
  ];
  const d = new Date();
  return `${d.getDate()} de ${meses[d.getMonth()]} de ${d.getFullYear()}`;
}
