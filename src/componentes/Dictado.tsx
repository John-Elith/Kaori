/**
 * Dictado por voz en los campos de texto.
 *
 * Envuelve un `<input>` o `<textarea>` y le pone en la esquina un botón con un
 * micrófono. Se pulsa, se habla, se vuelve a pulsar, y lo dicho se escribe en
 * el campo, donde estaba el cursor.
 *
 * La grabación se hace aquí y la transcripción en el PC, con un modelo que no
 * manda la voz a ninguna parte (ver electron/voz.ts). Mientras se escucha,
 * debajo del campo se ve el nivel del micrófono: así se sabe al momento si
 * está captando o si hay que acercarse.
 *
 * En el teléfono el botón no graba: enfoca el campo para que salga el teclado,
 * cuyo micrófono ya hace eso mismo.
 */

import { useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { Loader2, Mic, Square } from 'lucide-react';

import { esRemoto } from '../apiRemota';

type Campo = HTMLInputElement | HTMLTextAreaElement;
type Fase = 'inactivo' | 'escuchando' | 'transcribiendo';

/** Un dictado largo olvidado no debe quedarse grabando para siempre. */
const DURACION_MAXIMA_MS = 3 * 60 * 1000;

/** Sólo se graba en un campo a la vez: empezar en otro para el anterior. */
let pararElActivo: (() => void) | null = null;

export function Dictable({ children }: { children: ReactNode }) {
  const caja = useRef<HTMLDivElement>(null);
  const [fase, setFase] = useState<Fase>('inactivo');
  const [nivel, setNivel] = useState(0);
  const [aviso, setAviso] = useState<{ tipo: 'error' | 'info'; texto: string } | null>(null);
  const [preparando, setPreparando] = useState<string | null>(null);

  const grabacion = useRef<{
    recorder: MediaRecorder;
    flujo: MediaStream;
    contexto: AudioContext;
    trozos: Blob[];
    cursor: number;
    limite: number;
  } | null>(null);

  // Si el campo desaparece a mitad de un dictado —se cambia de pestaña—, se
  // suelta el micrófono.
  useEffect(
    () => () => {
      const g = grabacion.current;
      grabacion.current = null;
      if (g?.recorder.state !== 'inactive') g?.recorder.stop();
      soltarMicrofono(g);
    },
    [],
  );

  function campo(): Campo | null {
    return caja.current?.querySelector<Campo>('input, textarea') ?? null;
  }

  function soltarMicrofono(g = grabacion.current) {
    if (!g) return;
    window.clearTimeout(g.limite);
    g.flujo.getTracks().forEach((t) => t.stop());
    void g.contexto.close().catch(() => undefined);
  }

  async function empezar() {
    const c = campo();
    if (!c) return;

    if (esRemoto()) {
      // En el teléfono: el teclado trae su propio micrófono.
      c.focus();
      setAviso({
        tipo: 'info',
        texto: 'Pulse el micrófono de su teclado y hable: el texto se escribirá aquí.',
      });
      window.setTimeout(() => setAviso(null), 6000);
      return;
    }

    pararElActivo?.();
    setAviso(null);

    let flujo: MediaStream;
    try {
      flujo = await navigator.mediaDevices.getUserMedia({
        audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true },
      });
    } catch (e) {
      const nombre = e instanceof DOMException ? e.name : '';
      setAviso({
        tipo: 'error',
        texto:
          nombre === 'NotFoundError'
            ? 'No se encontró ningún micrófono. Conecte uno y vuelva a intentarlo.'
            : nombre === 'NotAllowedError' || nombre === 'SecurityError'
              ? 'Windows no deja usar el micrófono. Actívelo en Configuración → Privacidad → Micrófono, ' +
                'incluida la opción «Permitir que las aplicaciones de escritorio accedan al micrófono».'
              : `No se pudo usar el micrófono: ${e instanceof Error ? e.message : String(e)}`,
      });
      return;
    }

    // El nivel del micrófono, para ver que capta.
    const contexto = new AudioContext();
    const analizador = contexto.createAnalyser();
    analizador.fftSize = 512;
    contexto.createMediaStreamSource(flujo).connect(analizador);
    const muestras = new Float32Array(analizador.fftSize);
    let ultimo = 0;
    const medir = (t: number) => {
      if (contexto.state === 'closed') return;
      if (t - ultimo > 80) {
        ultimo = t;
        analizador.getFloatTimeDomainData(muestras);
        let suma = 0;
        for (const m of muestras) suma += m * m;
        // La raíz cuadrática media de la voz ronda 0,02–0,2: se lleva a 0–1.
        setNivel(Math.min(1, Math.sqrt(suma / muestras.length) * 8));
      }
      requestAnimationFrame(medir);
    };
    requestAnimationFrame(medir);

    const recorder = new MediaRecorder(flujo);
    const trozos: Blob[] = [];
    recorder.ondataavailable = (ev) => {
      if (ev.data.size > 0) trozos.push(ev.data);
    };
    recorder.onstop = () => void terminar();
    recorder.start();

    // Lo dictado entra donde estaba el cursor; si el campo no tenía el foco,
    // al final.
    const cursor = document.activeElement === c ? (c.selectionStart ?? c.value.length) : c.value.length;

    grabacion.current = {
      recorder,
      flujo,
      contexto,
      trozos,
      cursor,
      limite: window.setTimeout(() => parar(), DURACION_MAXIMA_MS),
    };
    pararElActivo = parar;
    setFase('escuchando');
  }

  function parar() {
    const g = grabacion.current;
    if (!g || g.recorder.state === 'inactive') return;
    if (pararElActivo === parar) pararElActivo = null;
    g.recorder.stop();
  }

  async function terminar() {
    const g = grabacion.current;
    grabacion.current = null;
    if (!g) return;
    soltarMicrofono(g);
    setNivel(0);
    setFase('transcribiendo');

    const quitar = window.api.voz.alProgreso((p) => {
      if (p.fase === 'descargando') {
        setPreparando(
          `Descargando el reconocimiento de voz, sólo esta vez: ${p.porcentaje ?? 0} %`,
        );
      } else if (p.fase === 'cargando') {
        setPreparando('Preparando el reconocimiento de voz…');
      } else {
        setPreparando(null);
      }
    });

    try {
      const audio = await a16kHz(new Blob(g.trozos, { type: g.recorder.mimeType }));

      // Con silencio total, el reconocimiento se inventa palabras sueltas
      // («de la», «gracias»). Si no llegó sonido, no hay nada que transcribir:
      // lo más probable es que el micrófono esté silenciado o sea otro.
      if (volumenMaximo(audio) < UMBRAL_DE_VOZ) {
        setAviso({
          tipo: 'error',
          texto:
            'No llegó sonido del micrófono. Compruebe que no esté silenciado y que en ' +
            'Windows (Configuración → Sistema → Sonido → Entrada) esté elegido el correcto.',
        });
        return;
      }

      const r = await window.api.voz.transcribir(audio);
      if (!r.ok) {
        setAviso({ tipo: 'error', texto: r.error ?? 'No se pudo transcribir.' });
      } else if (!r.texto) {
        setAviso({ tipo: 'info', texto: 'No se entendió nada. Hable un poco más cerca y vuelva a intentarlo.' });
      } else {
        insertar(r.texto, g.cursor);
      }
    } catch (e) {
      setAviso({ tipo: 'error', texto: `No se pudo transcribir: ${e instanceof Error ? e.message : String(e)}` });
    } finally {
      quitar();
      setPreparando(null);
      setFase('inactivo');
    }
  }

  /**
   * Escribe el texto en el campo como si se hubiera tecleado, para que React
   * se entere: asignar `value` a secas no dispara su `onChange`.
   */
  function insertar(texto: string, cursor: number) {
    const c = campo();
    if (!c) return;
    const antes = c.value.slice(0, cursor);
    const despues = c.value.slice(cursor);
    const separador = antes.length > 0 && !/\s$/.test(antes) ? ' ' : '';
    const union = despues.length > 0 && !/^\s/.test(despues) ? ' ' : '';
    const nuevo = antes + separador + texto + union + despues;

    const proto = c instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(proto, 'value')?.set?.call(c, nuevo);
    c.dispatchEvent(new Event('input', { bubbles: true }));

    const fin = antes.length + separador.length + texto.length;
    c.focus();
    c.setSelectionRange(fin, fin);
  }

  const escuchando = fase === 'escuchando';
  const ocupado = fase === 'transcribiendo';

  return (
    <>
      <div ref={caja} className="dictable relative">
        {children}
        <span className="group absolute right-1.5 top-1.5">
          <button
            type="button"
            aria-label={escuchando ? 'Terminar el dictado' : 'Dictar con la voz'}
            aria-pressed={escuchando}
            disabled={ocupado}
            // Sin esto, pulsar el botón le quita el foco al campo y se pierde
            // la posición del cursor.
            onMouseDown={(e) => e.preventDefault()}
            onClick={(e) => {
              // Dentro de un <label>, el clic acabaría también en el campo.
              e.preventDefault();
              if (escuchando) parar();
              else void empezar();
            }}
            className={`flex h-7 w-7 items-center justify-center rounded-md transition-colors
                        disabled:cursor-wait ${
                          escuchando
                            ? 'bg-error-fuerte text-white'
                            : 'text-tinta-tenue hover:bg-naranja-50 hover:text-naranja-600 focus-visible:text-naranja-600'
                        }`}
          >
            {ocupado ? (
              <Loader2 size={15} className="animate-spin" />
            ) : escuchando ? (
              <Square size={11} fill="currentColor" />
            ) : (
              <Mic size={15} />
            )}
          </button>

          {!escuchando && !ocupado && (
            <span
              role="tooltip"
              className="pointer-events-none absolute bottom-full right-0 z-20 mb-1.5 w-56
                         rounded-lg bg-tinta px-3 py-2 text-left text-xs leading-snug text-fondo
                         opacity-0 shadow-elevada transition-opacity duration-150
                         group-hover:opacity-100 group-focus-within:opacity-100"
            >
              <span className="block font-semibold">Dictar con la voz</span>
              <span className="mt-0.5 block opacity-80">
                Pulse, hable y vuelva a pulsar al terminar. Lo que diga se escribe en
                este campo.
              </span>
            </span>
          )}
        </span>
      </div>

      {escuchando && (
        <span className="mt-1.5 flex items-center gap-2 text-xs font-medium text-error-fuerte">
          <span className="relative flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-error-fuerte opacity-60" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-error-fuerte" />
          </span>
          Escuchando… hable ahora y pulse ■ al terminar
          <Nivel valor={nivel} />
        </span>
      )}
      {ocupado && (
        <span className="mt-1.5 flex items-center gap-1.5 text-xs text-tinta-tenue">
          <Loader2 size={12} className="animate-spin" />
          {preparando ?? 'Escribiendo lo que dijo…'}
        </span>
      )}
      {aviso && (
        <span
          className={`mt-1.5 block text-xs ${aviso.tipo === 'error' ? 'text-error-fuerte' : 'text-tinta-tenue'}`}
        >
          {aviso.texto}
        </span>
      )}
    </>
  );
}

/** Cinco barras que se encienden con la voz. */
function Nivel({ valor }: { valor: number }) {
  return (
    <span className="flex h-3 items-end gap-0.5" aria-hidden>
      {[0.1, 0.25, 0.45, 0.65, 0.85].map((umbral, i) => (
        <span
          key={i}
          className={`w-1 rounded-sm transition-colors ${valor > umbral ? 'bg-error-fuerte' : 'bg-borde'}`}
          style={{ height: `${40 + i * 15}%` }}
        />
      ))}
    </span>
  );
}

/**
 * Por debajo de este pico no hay voz: el ruido de fondo de un micrófono
 * encendido ya ronda 0,005–0,02, y la voz normal pasa de 0,1.
 */
const UMBRAL_DE_VOZ = 0.02;

function volumenMaximo(audio: Float32Array): number {
  let max = 0;
  for (const x of audio) {
    const a = Math.abs(x);
    if (a > max) max = a;
  }
  return max;
}

/** Lo grabado, a una sola pista de 16 kHz: lo que espera el reconocimiento. */
async function a16kHz(grabado: Blob): Promise<Float32Array> {
  const datos = await grabado.arrayBuffer();
  const contexto = new AudioContext({ sampleRate: 16000 });
  try {
    const audio = await contexto.decodeAudioData(datos);
    if (audio.numberOfChannels === 1) return audio.getChannelData(0).slice();
    // Varias pistas: se promedian.
    const mezcla = new Float32Array(audio.length);
    for (let c = 0; c < audio.numberOfChannels; c++) {
      const pista = audio.getChannelData(c);
      for (let i = 0; i < pista.length; i++) mezcla[i] += pista[i] / audio.numberOfChannels;
    }
    return mezcla;
  } finally {
    void contexto.close();
  }
}
