/**
 * Dictado: convierte en texto lo que se grabó con el micrófono.
 *
 * Se hace aquí, en el propio PC, con Whisper —un modelo de reconocimiento de
 * voz— y no con un servicio de internet:
 *
 * - El reconocimiento del navegador no funciona dentro de Electron: depende de
 *   un servicio de Google que sólo trae Chrome.
 * - El dictado de Windows funciona a medias según la versión y la
 *   configuración del equipo, y se abre en una barra aparte.
 * - Lo que se dicta son datos de contratos con nombres y cédulas; así no salen
 *   del equipo.
 *
 * Se usa `whisper-small`: probado con una frase de contrato, la transcribió sin
 * un error, mientras que `whisper-base` —tres veces más rápido— escribió «del
 * impiezas» por «de limpieza». En documentos que se firman, corregir errores
 * cuesta más que esperar unos segundos.
 *
 * El modelo (unos 240 MB) se descarga la primera vez que se usa el micrófono y
 * se guarda en la carpeta de datos del programa. A partir de ahí funciona sin
 * internet.
 */

import { app } from 'electron';
import { join } from 'node:path';

const MODELO = 'onnx-community/whisper-small';

type Transcriptor = (
  audio: Float32Array,
  opciones: Record<string, unknown>,
) => Promise<{ text: string } | { text: string }[]>;

export type ProgresoVoz = {
  fase: 'descargando' | 'cargando' | 'listo';
  /** 0–100, sólo mientras se descarga. */
  porcentaje?: number;
};

let cargando: Promise<Transcriptor> | null = null;

/**
 * El modelo se carga una vez y se queda en memoria: cargarlo tarda unos
 * segundos, y cada dictado posterior sólo paga la transcripción.
 */
function transcriptor(avisar: (p: ProgresoVoz) => void): Promise<Transcriptor> {
  if (cargando) return cargando;

  cargando = (async () => {
    // Se importa aquí y no arriba: arrastra el motor de ONNX, que ocupa
    // memoria y tarda en cargar, y la mayoría de las veces no se dicta nada.
    const { pipeline, env } = await import('@huggingface/transformers');
    env.cacheDir = join(app.getPath('userData'), 'modelos');

    // El modelo son varios archivos; el avance se calcula sobre el total.
    const porArchivo = new Map<string, { cargado: number; total: number }>();
    let ultimo = -1;

    const t = await pipeline('automatic-speech-recognition', MODELO, {
      dtype: 'q8',
      progress_callback: (info: {
        status: string;
        file?: string;
        loaded?: number;
        total?: number;
      }) => {
        if (info.status === 'progress' && info.file && info.total) {
          porArchivo.set(info.file, { cargado: info.loaded ?? 0, total: info.total });
          let c = 0;
          let tot = 0;
          for (const a of porArchivo.values()) {
            c += a.cargado;
            tot += a.total;
          }
          const pct = Math.floor((c / tot) * 100);
          if (pct !== ultimo) {
            ultimo = pct;
            avisar({ fase: 'descargando', porcentaje: pct });
          }
        } else if (info.status === 'done') {
          avisar({ fase: 'cargando' });
        }
      },
    });
    avisar({ fase: 'listo' });
    return t as unknown as Transcriptor;
  })();

  // Si falla —sin internet la primera vez, por ejemplo— se podrá reintentar.
  cargando.catch(() => {
    cargando = null;
  });
  return cargando;
}

export async function transcribir(
  audio: Float32Array,
  avisar: (p: ProgresoVoz) => void,
): Promise<{ ok: boolean; texto?: string; error?: string }> {
  // Menos de un cuarto de segundo es un clic sin hablar.
  if (audio.length < 4000) return { ok: true, texto: '' };

  // Con silencio, Whisper se inventa palabras sueltas («de la»): comprobado
  // con un micrófono mudo. Sin sonido no se transcribe.
  let pico = 0;
  for (const x of audio) pico = Math.max(pico, Math.abs(x));
  if (pico < 0.02) return { ok: true, texto: '' };

  let t: Transcriptor;
  try {
    t = await transcriptor(avisar);
  } catch (e) {
    return {
      ok: false,
      error:
        'No se pudo preparar el reconocimiento de voz. La primera vez hace falta ' +
        'internet para descargarlo (unos 240 MB); después funciona sin conexión. ' +
        `Detalle: ${e instanceof Error ? e.message : String(e)}`,
    };
  }

  try {
    const r = await t(audio, {
      language: 'spanish',
      task: 'transcribe',
      // Dictados de más de 30 segundos se procesan por tramos.
      chunk_length_s: 30,
      stride_length_s: 5,
    });
    const texto = (Array.isArray(r) ? r.map((x) => x.text).join(' ') : r.text).trim();
    return { ok: true, texto: limpiar(texto) };
  } catch (e) {
    return {
      ok: false,
      error: `No se pudo transcribir: ${e instanceof Error ? e.message : String(e)}`,
    };
  }
}

/**
 * Whisper, ante silencio o ruido, a veces «oye» frases de relleno sacadas de
 * los subtítulos con que se entrenó. Se descartan las conocidas.
 */
function limpiar(texto: string): string {
  const relleno = /^(\[.*\]|\(.*\)|¡?gracias( por ver(lo)?)?[.!]*|subtítulos .*|amara\.org.*)$/i;
  return relleno.test(texto) ? '' : texto;
}
