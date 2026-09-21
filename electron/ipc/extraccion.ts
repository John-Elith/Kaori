import { manejar } from '../canales';
import { promises as fs } from 'node:fs';
import { extname } from 'node:path';

import { extraerCamposContrato, extraerPlanilla } from '../../core/extraccion/camposContrato';
import { completarActividades } from '../../core/extraccion/redactarActividades';
import {
  extraerContratoConIA,
  extraerPlanillaConIA,
  tipoImagen,
} from '../../core/extraccion/extraerIA';
import {
  NOMBRE_PROVEEDOR,
  proponerObligaciones,
  redactarActividades,
  type RedactorIA,
} from '../../core/extraccion/redaccionIA';

type ObtenerClave = () => Promise<string | null>;
/** La IA con que redactar —Claude o Gemini— y su clave, o null si no hay ninguna. */
type ObtenerRedactor = () => Promise<RedactorIA | null>;

/** Texto embebido de un PDF, cuando lo tiene. Devuelve '' si es un escaneo. */
async function textoDePdf(ruta: string): Promise<string> {
  // La compilación "legacy" es la que funciona fuera del navegador.
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const datos = new Uint8Array(await fs.readFile(ruta));

  const tarea = pdfjs.getDocument({
    data: datos,
    // Sin worker: en el proceso principal de Electron no hay uno disponible.
    useWorkerFetch: false,
    isEvalSupported: false,
    useSystemFonts: false,
  });

  const documento = await tarea.promise;
  const paginas: string[] = [];

  for (let i = 1; i <= documento.numPages; i++) {
    const pagina = await documento.getPage(i);
    const contenido = await pagina.getTextContent();
    paginas.push(
      contenido.items
        .map((it: unknown) => (it as { str?: string }).str ?? '')
        .join(' ')
        .replace(/\s+/g, ' '),
    );
  }

  await documento.destroy();
  return paginas.join('\n\n');
}

/** OCR sin conexión. Se carga bajo demanda porque es pesado. */
async function ocrLocal(ruta: string): Promise<string> {
  const { createWorker } = await import('tesseract.js');
  const worker = await createWorker('spa');
  try {
    const { data } = await worker.recognize(ruta);
    return data.text;
  } finally {
    await worker.terminate();
  }
}

export type TextoExtraido = {
  texto: string;
  motor: 'pdf' | 'ocr';
  aviso?: string;
};

/**
 * Cascada de lectura, de más exacto a menos:
 *   1. PDF con capa de texto → extracción literal, sin pérdida
 *   2. PDF escaneado o imagen → OCR local
 */
export async function leerTexto(ruta: string): Promise<TextoExtraido> {
  const ext = extname(ruta).toLowerCase();

  if (ext === '.pdf') {
    const texto = await textoDePdf(ruta);
    // Un PDF escaneado devuelve casi nada: hay que pasar por OCR.
    if (texto.replace(/\s/g, '').length > 200) {
      return { texto, motor: 'pdf' };
    }
    const porOcr = await ocrLocal(ruta);
    return {
      texto: porOcr,
      motor: 'ocr',
      aviso:
        'El PDF no tiene texto seleccionable (es un escaneo), así que se leyó con OCR. ' +
        'Revise los datos con cuidado antes de guardarlos.',
    };
  }

  if (tipoImagen(ext)) {
    return {
      texto: await ocrLocal(ruta),
      motor: 'ocr',
      aviso: 'Se leyó una imagen con OCR. Revise los datos antes de guardarlos.',
    };
  }

  throw new Error(
    `No se puede leer un archivo ${ext || 'sin extensión'}. Use PDF, PNG, JPG, GIF o WEBP.`,
  );
}

export function registrarCanalesExtraccion(
  obtenerClave: ObtenerClave,
  obtenerRedactor: ObtenerRedactor,
): void {
  manejar('extraccion:texto', async (_e, ruta: string) => leerTexto(ruta));

  /**
   * Interpreta un contrato. Con clave configurada usa IA (mucho más precisa,
   * porque entiende el documento en vez de reconocer formas); sin clave, cae a
   * las expresiones regulares. En ambos casos el resultado se revisa antes de
   * guardar.
   */
  manejar('extraccion:contrato', async (_e, ruta: string) => {
    const avisos: string[] = [];
    const clave = await obtenerClave();

    if (clave) {
      try {
        const contenido = await fs.readFile(ruta);
        const campos = await extraerContratoConIA(clave, contenido, extname(ruta));
        return { campos, motor: 'ia', avisos };
      } catch (e) {
        avisos.push(
          `No se pudo usar la lectura con IA (${e instanceof Error ? e.message : String(e)}). ` +
            'Se continuó sin conexión.',
        );
      }
    }

    const { texto, aviso } = await leerTexto(ruta);
    if (aviso) avisos.push(aviso);
    avisos.push(
      'Los datos se dedujeron por patrones de texto. Revíselos uno por uno antes de guardar.',
    );
    return { campos: extraerCamposContrato(texto), motor: 'reglas', avisos };
  });

  manejar('extraccion:planilla', async (_e, ruta: string) => {
    const avisos: string[] = [];
    const clave = await obtenerClave();

    if (clave) {
      try {
        const contenido = await fs.readFile(ruta);
        const r = await extraerPlanillaConIA(clave, contenido, extname(ruta));
        return { ...r, motor: 'ia', avisos };
      } catch (e) {
        avisos.push(
          `No se pudo usar la lectura con IA (${e instanceof Error ? e.message : String(e)}). ` +
            'Se continuó sin conexión.',
        );
      }
    }

    const { texto, aviso } = await leerTexto(ruta);
    if (aviso) avisos.push(aviso);
    return { ...extraerPlanilla(texto), motor: 'reglas', avisos };
  });

  manejar(
    'extraccion:redactar',
    async (
      _e,
      obligaciones: { n: number; texto: string; actividad?: string }[],
      impersonal: boolean,
    ) => {
      const faltantes = obligaciones.filter(
        (o) => !o.actividad || o.actividad.trim().length === 0,
      );

      if (faltantes.length === 0) {
        return { actividades: obligaciones.map((o) => o.actividad ?? ''), motor: 'reglas' as const };
      }

      const redactor = await obtenerRedactor();
      if (redactor) {
        try {
          const redactadas = await redactarActividades(
            redactor,
            faltantes.map((o) => o.texto),
            impersonal,
          );
          // Devolver en el orden original, conservando las ya escritas.
          let i = 0;
          const actividades = obligaciones.map((o) =>
            o.actividad && o.actividad.trim().length > 0
              ? o.actividad
              : (redactadas[i++] ?? ''),
          );
          if (actividades.every((a) => a.length > 0)) {
            return { actividades, motor: 'ia' as const };
          }
        } catch {
          // Si la IA falla, se sigue con las reglas: nunca se deja al usuario sin salida.
        }
      }

      return {
        actividades: completarActividades(obligaciones, impersonal),
        motor: 'reglas' as const,
      };
    },
  );

  /**
   * Propone las obligaciones específicas a partir de una indicación.
   *
   * Esto sí necesita la clave de IA sin remedio. Redactar obligaciones nuevas
   * es escribir de cero, no transformar algo que ya está: por reglas sólo se
   * podría copiar las de la plantilla, que son las de otro contrato, y eso es
   * exactamente lo que hay que dejar de hacer. Se dice con todas las letras en
   * vez de devolver algo inventado.
   */
  manejar(
    'extraccion:proponerObligaciones',
    async (_e, indicacion: string, cuantas: number, objeto?: string) => {
      const texto = indicacion.trim();
      if (texto.length === 0) {
        return { ok: false as const, error: 'Escriba primero una indicación.' };
      }

      const redactor = await obtenerRedactor();
      if (!redactor) {
        return {
          ok: false as const,
          error:
            'Para proponer obligaciones hace falta una clave de IA —de Claude o de Gemini—, ' +
            'porque hay que redactarlas de cero. Configúrela en Ajustes, o escríbalas y ' +
            'péguelas usted mismo en el cuadro de arriba.',
        };
      }

      try {
        const obligaciones = await proponerObligaciones(
          redactor,
          texto,
          Math.min(Math.max(cuantas, 1), 30),
          objeto,
        );
        if (obligaciones.length === 0) {
          return { ok: false as const, error: 'El servicio no devolvió ninguna obligación.' };
        }
        return { ok: true as const, obligaciones };
      } catch (e) {
        return {
          ok: false as const,
          error: `${NOMBRE_PROVEEDOR[redactor.proveedor]}: ${e instanceof Error ? e.message : String(e)}`,
        };
      }
    },
  );
}
