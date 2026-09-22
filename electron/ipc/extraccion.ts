import { app } from 'electron';
import { manejar } from '../canales';
import { promises as fs } from 'node:fs';
import { extname, join } from 'node:path';

import { extraerCamposContrato, extraerPlanilla } from '../../core/extraccion/camposContrato';
import { completarActividades } from '../../core/extraccion/redactarActividades';
import { extraerObligacionesNumeradas } from '../../core/extraccion/obligacionesNumeradas';
import {
  extraerContratoConIA,
  extraerPlanillaConIA,
  tipoImagen,
} from '../../core/extraccion/extraerIA';
import {
  NOMBRE_PROVEEDOR,
  leerObligaciones,
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

/**
 * La imagen preparada para el OCR: ampliada, en gris, con el contraste
 * estirado y enfocada.
 *
 * Una foto de un contrato hecha con el teléfono sale a unos 180 ppp y con
 * sombras; así, Tesseract mezclaba líneas y la leía con un 75 % de confianza.
 * Preparada, la misma foto sube al 88 % y las líneas salen en orden.
 */
async function prepararImagen(ruta: string, ancho = 2400): Promise<Buffer | string> {
  try {
    // Según cómo se cargue, sharp llega como la función o dentro de `default`.
    const modulo = await import('sharp');
    type Sharp = typeof modulo.default;
    const sharp: Sharp =
      (modulo as unknown as { default?: Sharp }).default ?? (modulo as unknown as Sharp);
    return await sharp(ruta)
      // Las fotos del teléfono vienen «acostadas» y con una marca de cómo
      // girarlas; sin enderezarlas, el OCR las lee de lado y no encuentra nada.
      .rotate()
      .resize({ width: ancho })
      .grayscale()
      .normalize()
      .sharpen()
      .png()
      .toBuffer();
  } catch {
    // Sin sharp, o con un formato que no entiende: se lee tal cual.
    return ruta;
  }
}

/**
 * Una foto lista para mandarla a la IA: derecha y de un tamaño razonable.
 *
 * Las fotos hechas con la cámara del teléfono pesan de 4 a 12 MB y vienen
 * acostadas, con una marca de cómo girarlas. Enviadas tal cual rozaban el
 * límite de lo que acepta Gemini por petición y tardaban en subir. A 2400 px
 * por el lado largo se sigue leyendo cada letra y pesan menos de 1 MB.
 * Un PDF, o lo que sharp no sepa abrir, se manda como está.
 */
async function fotoParaIA(ruta: string, ext: string): Promise<{ datos: Buffer; ext: string }> {
  const original = await fs.readFile(ruta);
  if (!tipoImagen(ext)) return { datos: original, ext };
  try {
    const modulo = await import('sharp');
    type Sharp = typeof modulo.default;
    const sharp: Sharp =
      (modulo as unknown as { default?: Sharp }).default ?? (modulo as unknown as Sharp);
    const datos = await sharp(original)
      .rotate()
      .resize({ width: 2400, height: 2400, fit: 'inside', withoutEnlargement: true })
      .jpeg({ quality: 88 })
      .toBuffer();
    return { datos, ext: '.jpg' };
  } catch {
    return { datos: original, ext };
  }
}

/**
 * OCR sin conexión. Se carga bajo demanda porque es pesado.
 *
 * `bloque` lee la página como un solo bloque de texto, que es lo que es la
 * cláusula de un contrato; evita que Tesseract crea ver columnas.
 */
async function ocrLocal(ruta: string, bloque = false): Promise<string> {
  const { createWorker } = await import('tesseract.js');
  // El diccionario de español se descarga la primera vez y se guarda con los
  // datos del programa. Por defecto iría a la carpeta desde la que se abre
  // Kaori, que en el programa instalado es Archivos de programa: sin permiso
  // para escribir.
  const cachePath = join(app.getPath('userData'), 'ocr');
  await fs.mkdir(cachePath, { recursive: true });
  const worker = await createWorker('spa', undefined, { cachePath });
  try {
    if (bloque) {
      await worker.setParameters({ tessedit_pageseg_mode: '6' as never, user_defined_dpi: '300' });
    }
    const entrada = tipoImagen(extname(ruta)) ? await prepararImagen(ruta) : ruta;
    const { data } = await worker.recognize(entrada);
    return data.text;
  } finally {
    await worker.terminate();
  }
}

/**
 * Las obligaciones de una foto, leídas sin IA.
 *
 * El OCR es muy sensible a la escala y al modo de página: con la misma foto,
 * ampliada a 2000 px y leída como un bloque salían las 15 obligaciones; a
 * 3000 px y en el mismo modo, una. No hay un ajuste que sirva siempre, así que
 * se prueban hasta tres y se queda la lectura que encuentra más. Si la primera
 * ya sale clara, no se prueban las demás.
 */
async function ocrObligaciones(ruta: string): Promise<string[]> {
  const { createWorker } = await import('tesseract.js');
  const cachePath = join(app.getPath('userData'), 'ocr');
  await fs.mkdir(cachePath, { recursive: true });
  const worker = await createWorker('spa', undefined, { cachePath });
  const intentos: [number, string][] = [
    [2000, '6'], // un solo bloque de texto
    [2500, '4'], // una columna
    [3000, '3'], // automático
  ];
  let mejor: { obligaciones: string[]; confianza: number } = { obligaciones: [], confianza: 0 };
  try {
    for (const [ancho, psm] of intentos) {
      const imagen = await prepararImagen(ruta, ancho);
      await worker.setParameters({ tessedit_pageseg_mode: psm as never, user_defined_dpi: '300' });
      const { data } = await worker.recognize(imagen);
      const obligaciones = extraerObligacionesNumeradas(data.text);
      if (
        obligaciones.length > mejor.obligaciones.length ||
        (obligaciones.length === mejor.obligaciones.length && data.confidence > mejor.confianza)
      ) {
        mejor = { obligaciones, confianza: data.confidence };
      }
      if (obligaciones.length >= 3 && data.confidence >= 86) break;
    }
  } finally {
    await worker.terminate();
  }
  return mejor.obligaciones;
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
      // Con una IA configurada, si falla no se escribe por reglas a escondidas:
      // se devuelve el motivo y la persona decide si reintenta o usa las reglas.
      // Antes se callaba, y el resultado parecía de la IA sin serlo.
      let aviso: string | undefined;
      if (redactor) {
        const nombre = NOMBRE_PROVEEDOR[redactor.proveedor];
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
            return { actividades, motor: 'ia' as const, proveedor: nombre };
          }
          aviso =
            `${nombre} devolvió ${redactadas.length} actividad(es) para ${faltantes.length} ` +
            'obligación(es). Vuelva a intentarlo.';
        } catch (e) {
          aviso = `No se pudo redactar con ${nombre}. ${e instanceof Error ? e.message : String(e)}`;
        }
        return {
          actividades: obligaciones.map((o) => o.actividad ?? ''),
          motor: 'fallo' as const,
          proveedor: nombre,
          error: aviso,
        };
      }

      // Sin ninguna IA configurada, las reglas son el camino previsto.
      return {
        actividades: completarActividades(obligaciones, impersonal),
        motor: 'reglas' as const,
      };
    },
  );

  /**
   * Lee las obligaciones específicas de la imagen o el PDF de un contrato.
   *
   * Con IA, se le manda el documento y las transcribe: con una foto de
   * teléfono es lo único que sale limpio. Sin IA —o si falla— se lee el texto
   * (el del PDF o el del OCR) y se busca la lista numerada hasta el
   * «Parágrafo». Lo que salga se revisa: un escaneo puede confundir letras.
   */
  manejar('extraccion:obligaciones', async (_e, ruta: string) => {
    const ext = extname(ruta).toLowerCase();
    if (ext !== '.pdf' && !tipoImagen(ext)) {
      return {
        ok: false as const,
        error: `No se puede leer un archivo ${ext || 'sin extensión'}. Use una foto (JPG, PNG) o un PDF.`,
      };
    }

    let aviso: string | undefined;
    const redactor = await obtenerRedactor();
    if (redactor) {
      const nombre = NOMBRE_PROVEEDOR[redactor.proveedor];
      try {
        const foto = await fotoParaIA(ruta, ext);
        const obligaciones = await leerObligaciones(redactor, foto.datos, foto.ext);
        if (obligaciones.length > 0) {
          return { ok: true as const, obligaciones, motor: 'ia' as const, proveedor: nombre };
        }
        aviso = `${nombre} no encontró una lista numerada de obligaciones.`;
      } catch (e) {
        aviso = `No se pudo leer con ${nombre} (${e instanceof Error ? e.message : String(e)}).`;
      }
    }

    // Sin IA, o si falló: el texto del documento y la lista numerada.
    let texto: string;
    try {
      texto = ext === '.pdf' ? (await leerTexto(ruta)).texto : '';
    } catch (e) {
      return {
        ok: false as const,
        error: `${aviso ? aviso + ' ' : ''}No se pudo leer el documento: ${e instanceof Error ? e.message : String(e)}`,
      };
    }
    const obligaciones = ext === '.pdf' ? extraerObligacionesNumeradas(texto) : await ocrObligaciones(ruta);
    if (obligaciones.length === 0) {
      return {
        ok: false as const,
        error:
          `${aviso ? aviso + ' ' : ''}No se encontró la lista numerada de obligaciones (1., 2., 3.…). ` +
          'Compruebe que la foto se vea nítida y derecha, o pegue el texto en el cuadro de abajo.',
      };
    }
    return {
      ok: true as const,
      obligaciones,
      motor: 'ocr' as const,
      aviso:
        (aviso ? `${aviso} ` : '') +
        'Se leyeron sin IA, con reconocimiento de texto: revíselas, porque el escaneo puede confundir letras.',
    };
  });

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
