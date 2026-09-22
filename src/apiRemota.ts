/**
 * La API de Kaori vista desde el teléfono.
 *
 * En el PC, `window.api` la pone Electron y habla con el proceso principal por
 * IPC. En el teléfono no hay Electron: la misma interfaz se sirve desde el PC
 * por la Wi-Fi y esta API hace las mismas llamadas por la red. El resto del
 * programa no nota la diferencia, y por eso el teléfono puede hacer todo lo
 * que hace el PC.
 *
 * Lo único que cambia es lo que en el PC abre una ventana de Windows:
 *
 * - **Elegir un archivo** abre el selector del teléfono y lo sube al PC.
 * - **Abrir un documento generado** lo descarga en el teléfono.
 * - **Abrir una carpeta** o **elegir la carpeta de salida** no tienen sentido
 *   lejos del PC; la interfaz no los ofrece.
 * - **El micrófono** de Kaori graba en el PC; en el teléfono se usa el del
 *   teclado, que ya hace eso mismo y mejor.
 */

import type { Api } from '../electron/preload';

declare global {
  interface Window {
    /** Presente cuando Kaori se usa desde el teléfono. */
    kaoriRemoto?: boolean;
  }
}

export function esRemoto(): boolean {
  return window.kaoriRemoto === true;
}

/** Marca con que viaja `undefined`, que JSON convertiría en `null`. */
const INDEFINIDO = '__kaori_indefinido__';

function sinSesion(): never {
  window.location.replace('/entrar');
  throw new Error('La sesión terminó.');
}

async function invocar<T>(canal: string, args: unknown[]): Promise<T> {
  let r: Response;
  try {
    r = await fetch('/api/invocar', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ canal, args: args.map((a) => (a === undefined ? INDEFINIDO : a)) }),
    });
  } catch {
    throw new Error(
      'No hay conexión con el PC. Compruebe que Kaori sigue abierto y que el teléfono está en la misma Wi-Fi.',
    );
  }
  const j = (await r.json().catch(() => ({ ok: false, error: `Error ${r.status}` }))) as {
    ok: boolean;
    valor?: T;
    error?: string;
    sinSesion?: boolean;
  };
  if (j.sinSesion) sinSesion();
  if (!j.ok) throw new Error(j.error ?? 'Error desconocido');
  return j.valor as T;
}

/** Atajo: una función que invoca el canal con sus argumentos. */
function canal<F extends (...args: never[]) => Promise<unknown>>(nombre: string): F {
  return ((...args: unknown[]) => invocar(nombre, args)) as unknown as F;
}

// ── Avisos del PC ───────────────────────────────────────────────────────────

type Oyente = (datos: unknown) => void;
const oyentes = new Map<string, Set<Oyente>>();
let fuente: EventSource | null = null;

/** Una sola conexión de avisos para todo, abierta cuando alguien escucha. */
function escuchar(canalAviso: string, cb: Oyente): () => void {
  if (!fuente) {
    fuente = new EventSource('/api/eventos');
    fuente.onmessage = (ev) => {
      try {
        const { canal: c, datos } = JSON.parse(ev.data) as { canal: string; datos: unknown };
        for (const o of oyentes.get(c) ?? []) o(datos);
      } catch {
        /* aviso mal formado: se ignora */
      }
    };
    // EventSource se reconecta solo si se corta la Wi-Fi. Si lo que pasó es
    // que la sesión terminó, la próxima llamada normal lo detectará.
  }
  let s = oyentes.get(canalAviso);
  if (!s) oyentes.set(canalAviso, (s = new Set()));
  s.add(cb);
  return () => {
    s!.delete(cb);
  };
}

// ── Archivos ────────────────────────────────────────────────────────────────

/** Abre el selector del teléfono y sube lo elegido al PC. Devuelve su ruta allí. */
function elegirYSubir(filtros: { name: string; extensions: string[] }[]): Promise<string | null> {
  return new Promise((resolver, rechazar) => {
    const entrada = document.createElement('input');
    entrada.type = 'file';
    const extensiones = filtros.flatMap((f) => f.extensions).filter((e) => e !== '*');
    if (extensiones.length > 0) entrada.accept = extensiones.map((e) => `.${e}`).join(',');
    entrada.style.display = 'none';
    document.body.appendChild(entrada);

    let resuelto = false;
    const terminar = (v: string | null) => {
      if (resuelto) return;
      resuelto = true;
      entrada.remove();
      resolver(v);
    };

    entrada.addEventListener('change', async () => {
      const archivo = entrada.files?.[0];
      if (!archivo) return terminar(null);
      try {
        const r = await fetch('/api/subir', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/octet-stream',
            'X-Nombre': encodeURIComponent(archivo.name),
          },
          body: archivo,
        });
        const j = (await r.json()) as { ok: boolean; ruta?: string; error?: string; sinSesion?: boolean };
        if (j.sinSesion) sinSesion();
        if (!j.ok || !j.ruta) throw new Error(j.error ?? 'No se pudo subir el archivo.');
        resuelto = true;
        entrada.remove();
        resolver(j.ruta);
      } catch (e) {
        resuelto = true;
        entrada.remove();
        rechazar(e);
      }
    });
    // Si se cierra el selector sin elegir, algunos teléfonos avisan con
    // «cancel»; otros no avisan de nada y la promesa queda pendiente, que es
    // inofensivo: nadie espera un resultado.
    entrada.addEventListener('cancel', () => terminar(null));
    entrada.click();
  });
}

function descargar(ruta: string): void {
  const a = document.createElement('a');
  a.href = `/api/descargar?ruta=${encodeURIComponent(ruta)}`;
  a.download = ruta.split(/[\\/]/).pop() ?? 'documento.docx';
  document.body.appendChild(a);
  a.click();
  a.remove();
}

// ── La API ──────────────────────────────────────────────────────────────────

export function crearApiRemota(): Api {
  const api: Api = {
    datos: {
      leer: canal('datos:leer'),
      escribir: canal('datos:escribir'),
      nuevoId: canal('datos:nuevoId'),
      rutaArchivo: canal('datos:rutaArchivo'),
    },
    sistema: {
      elegirCarpeta: async () => null,
      elegirArchivo: elegirYSubir,
      leerArchivo: async () => {
        throw new Error('No disponible desde el teléfono.');
      },
      abrirCarpeta: async () => undefined,
      abrirArchivo: async (ruta: string) => descargar(ruta),
      guardarClave: canal('sistema:guardarClave'),
      hayClave: canal('sistema:hayClave'),
      borrarClave: canal('sistema:borrarClave'),
      guardarClaveGemini: canal('sistema:guardarClaveGemini'),
      hayClaveGemini: canal('sistema:hayClaveGemini'),
      borrarClaveGemini: canal('sistema:borrarClaveGemini'),
      // El color de la ventana del PC no se toca desde el teléfono.
      temaDelSistema: async () => ({ ok: true as const }),
    },
    plantillas: {
      registrar: canal('plantillas:registrar'),
      inspeccionar: canal('plantillas:inspeccionar'),
      listar: canal('plantillas:listar'),
      cambiarTipo: canal('plantillas:cambiarTipo'),
      guardarMapa: canal('plantillas:guardarMapa'),
      eliminar: canal('plantillas:eliminar'),
      papelera: canal('plantillas:papelera'),
      restaurar: canal('plantillas:restaurar'),
      borrarDefinitivo: canal('plantillas:borrarDefinitivo'),
      vaciarPapelera: canal('plantillas:vaciarPapelera'),
    },
    generacion: {
      uno: canal('generacion:uno'),
      lote: canal('generacion:lote'),
      certificados: canal('generacion:certificados'),
      alProgreso: (cb) => escuchar('generacion:progreso', (d) => cb(d as Parameters<typeof cb>[0])),
      previsualizar: canal('generacion:previsualizar'),
    },
    voz: {
      transcribir: async () => ({
        ok: false,
        error: 'En el teléfono, use el micrófono del teclado.',
      }),
      alProgreso: () => () => {},
    },
    eventos: {
      alCambiarDatos: (cb) => escuchar('datos:cambiados', () => cb()),
    },
    remoto: {
      estado: async () => ({ activo: false, sesiones: [] }),
      activar: async () => ({ activo: false, sesiones: [] }),
      desactivar: async () => ({ activo: false, sesiones: [] }),
      nuevoCodigo: async () => ({ activo: false, sesiones: [] }),
      usarDireccion: async () => ({ activo: false, sesiones: [] }),
      cerrarSesion: async () => ({ activo: false, sesiones: [] }),
      alCambiar: () => () => {},
    },
    extraccion: {
      texto: canal('extraccion:texto'),
      contrato: canal('extraccion:contrato'),
      planilla: canal('extraccion:planilla'),
      obligaciones: canal('extraccion:obligaciones'),
      proponerObligaciones: canal('extraccion:proponerObligaciones'),
      redactarActividades: canal('extraccion:redactar'),
    },
  };
  return api;
}

/** Cierra la sesión del teléfono. */
export async function salir(): Promise<void> {
  await fetch('/api/salir', { method: 'POST' }).catch(() => undefined);
  window.location.replace('/entrar');
}
