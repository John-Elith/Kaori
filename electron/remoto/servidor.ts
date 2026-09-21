/**
 * El servidor por el que el teléfono usa Kaori.
 *
 * Sirve la misma interfaz que ve el PC y traduce sus peticiones a los mismos
 * canales que usa la ventana. No hay una «versión para teléfono» aparte que
 * mantener: lo que se añada al programa, el teléfono lo tiene también.
 *
 * Sólo escucha en la red local y sólo atiende a quien haya entrado con el
 * código que muestra el PC (ver acceso.ts). No usa nada de Electron para poder
 * probarlo con pruebas automáticas normales.
 */

import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { promises as fs } from 'node:fs';
import { basename, extname, join, resolve, sep } from 'node:path';
import { randomBytes } from 'node:crypto';

import type { ControlDeAcceso } from './acceso';
import { paginaDeEntrada } from './paginaEntrar';

export type Remitente = {
  send(canal: string, ...datos: unknown[]): void;
  isDestroyed(): boolean;
};

export type OpcionesServidor = {
  acceso: ControlDeAcceso;
  /** Carpeta con la interfaz ya compilada (dist). */
  raizEstatica: string;
  /** Dónde se guardan los archivos que sube el teléfono. */
  carpetaSubidas: string;
  /** Ejecuta un canal del programa en nombre del teléfono. */
  invocar: (canal: string, remitente: Remitente, args: unknown[]) => Promise<unknown>;
  /** Apunta al teléfono para los avisos que no pidió él (cambios en los datos). */
  registrarDestino: (r: Remitente) => () => void;
  /** Carpetas cuyos archivos puede descargar el teléfono. */
  carpetasDescargables: () => Promise<string[]>;
  /** Avisa al PC de que entró o salió un teléfono. */
  alCambiarSesiones?: () => void;
};

/**
 * Lo que el teléfono puede pedir. Es una lista de permitidos, no de prohibidos:
 * un canal nuevo no queda expuesto por olvido. Quedan fuera los que abren
 * ventanas en el PC (elegir carpeta, abrir un archivo), los que no tienen
 * sentido desde lejos (el color de la ventana) y, sobre todo, los que
 * gestionan este mismo acceso: desde el teléfono no se pueden crear códigos.
 */
const PREFIJOS_PERMITIDOS = ['datos:', 'plantillas:', 'generacion:', 'extraccion:'];
const CANALES_PERMITIDOS = new Set([
  'sistema:guardarClave',
  'sistema:hayClave',
  'sistema:borrarClave',
  'sistema:guardarClaveGemini',
  'sistema:hayClaveGemini',
  'sistema:borrarClaveGemini',
]);

/**
 * Canales que reciben la ruta de un archivo del PC en algún argumento. Desde
 * el teléfono, esa ruta sólo puede ser la de algo que el propio teléfono subió.
 */
const ARGUMENTO_CON_RUTA: Record<string, number> = {
  'plantillas:registrar': 0,
  'extraccion:texto': 0,
  'extraccion:contrato': 0,
  'extraccion:planilla': 0,
};

export function canalPermitido(canal: string): boolean {
  return CANALES_PERMITIDOS.has(canal) || PREFIJOS_PERMITIDOS.some((p) => canal.startsWith(p));
}

/** Si `ruta` queda dentro de alguna de las carpetas, sin escaparse con «..». */
export function dentroDe(ruta: string, carpetas: string[]): boolean {
  const r = resolve(ruta).toLowerCase();
  return carpetas.some((c) => {
    const base = resolve(c).toLowerCase();
    return r.startsWith(base.endsWith(sep) ? base : base + sep);
  });
}

const COOKIE = 'kaori_sesion';
const LIMITE_JSON = 25 * 1024 * 1024;
const LIMITE_SUBIDA = 60 * 1024 * 1024;

const TIPOS: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.json': 'application/json',
  '.woff2': 'font/woff2',
  '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  '.pdf': 'application/pdf',
};

/** Marca con que viaja `undefined` dentro de la lista de argumentos. */
const INDEFINIDO = '__kaori_indefinido__';

export async function iniciarServidor(
  op: OpcionesServidor,
  puerto: number,
  host = '0.0.0.0',
): Promise<{ puerto: number; cerrar: () => Promise<void> }> {
  /**
   * Un remitente por sesión, que reparte a todas sus conexiones de avisos.
   * Se crea al entrar y se borra al salir.
   */
  type EntradaSesion = {
    remitente: Remitente;
    flujos: Set<ServerResponse>;
    soltar: () => void;
    cerrado: boolean;
  };
  const porSesion = new Map<string, EntradaSesion>();

  function remitenteDe(token: string): EntradaSesion {
    const existente = porSesion.get(token);
    if (existente) return existente;

    const flujos = new Set<ServerResponse>();
    const entrada: EntradaSesion = { flujos, cerrado: false, soltar: () => {}, remitente: null! };
    entrada.remitente = {
      send: (canal: string, ...datos: unknown[]) => {
        const linea = `data: ${JSON.stringify({ canal, datos: datos[0] })}\n\n`;
        for (const f of flujos) f.write(linea);
      },
      // Una sesión cerrada desde el PC deja de recibir avisos al momento.
      isDestroyed: () => entrada.cerrado || !op.acceso.existe(token),
    };
    entrada.soltar = op.registrarDestino(entrada.remitente);
    porSesion.set(token, entrada);
    return entrada;
  }

  function olvidarSesion(token: string) {
    const r = porSesion.get(token);
    if (!r) return;
    r.cerrado = true;
    r.soltar();
    for (const f of r.flujos) f.end();
    porSesion.delete(token);
  }

  const servidor = createServer((req, res) => {
    atender(req, res).catch((e: unknown) => {
      if (!res.headersSent) {
        responderJson(res, 500, {
          ok: false,
          error: e instanceof Error ? e.message : String(e),
        });
      } else {
        res.end();
      }
    });
  });

  async function atender(req: IncomingMessage, res: ServerResponse) {
    const url = new URL(req.url ?? '/', 'http://kaori');
    const ruta = url.pathname;
    const direccion = req.socket.remoteAddress ?? '?';

    // Cabeceras comunes: que ninguna otra página pueda incrustar Kaori.
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'no-referrer');

    // ── Sin sesión ──────────────────────────────────────────────────────────
    if (ruta === '/entrar' && req.method === 'GET') {
      res.writeHead(200, { 'Content-Type': TIPOS['.html'], 'Cache-Control': 'no-store' });
      res.end(paginaDeEntrada());
      return;
    }

    if (ruta === '/api/entrar' && req.method === 'POST') {
      const cuerpo = (await leerJson(req, 4096)) as { codigo?: unknown };
      const r = op.acceso.entrar(
        String(cuerpo?.codigo ?? ''),
        String(req.headers['user-agent'] ?? ''),
        direccion,
      );
      if (!r.ok) {
        responderJson(res, 401, { ok: false, error: r.motivo });
        return;
      }
      res.setHeader(
        'Set-Cookie',
        `${COOKIE}=${r.token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${12 * 3600}`,
      );
      responderJson(res, 200, { ok: true });
      op.alCambiarSesiones?.();
      return;
    }

    // ── Con sesión ──────────────────────────────────────────────────────────
    const token = leerCookie(req, COOKIE);
    const sesion = op.acceso.validar(token);
    if (!sesion || !token) {
      if (ruta.startsWith('/api/')) {
        responderJson(res, 401, {
          ok: false,
          error: 'La sesión terminó. Vuelva a entrar con el código del PC.',
          sinSesion: true,
        });
      } else {
        res.writeHead(302, { Location: '/entrar', 'Cache-Control': 'no-store' });
        res.end();
      }
      return;
    }

    if (ruta === '/api/salir' && req.method === 'POST') {
      op.acceso.cerrarPorToken(token);
      olvidarSesion(token);
      res.setHeader('Set-Cookie', `${COOKIE}=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0`);
      responderJson(res, 200, { ok: true });
      op.alCambiarSesiones?.();
      return;
    }

    if (ruta === '/api/sesion' && req.method === 'GET') {
      responderJson(res, 200, { ok: true, dispositivo: sesion.dispositivo });
      return;
    }

    if (ruta === '/api/invocar' && req.method === 'POST') {
      const { canal, args } = (await leerJson(req, LIMITE_JSON)) as {
        canal?: unknown;
        args?: unknown;
      };
      if (typeof canal !== 'string' || !canalPermitido(canal)) {
        responderJson(res, 403, { ok: false, error: 'Esa acción sólo se puede hacer desde el PC.' });
        return;
      }
      const lista = (Array.isArray(args) ? args : []).map((a) => (a === INDEFINIDO ? undefined : a));

      const iRuta = ARGUMENTO_CON_RUTA[canal];
      if (iRuta !== undefined) {
        const r = lista[iRuta];
        if (typeof r !== 'string' || !dentroDe(r, [op.carpetaSubidas])) {
          responderJson(res, 403, {
            ok: false,
            error: 'Desde el teléfono sólo se pueden usar archivos subidos desde el teléfono.',
          });
          return;
        }
      }

      const valor = await op.invocar(canal, remitenteDe(token).remitente, lista);
      responderJson(res, 200, { ok: true, valor });
      return;
    }

    if (ruta === '/api/eventos' && req.method === 'GET') {
      res.writeHead(200, {
        'Content-Type': 'text/event-stream; charset=utf-8',
        'Cache-Control': 'no-store',
        Connection: 'keep-alive',
      });
      res.write(': hola\n\n');
      const r = remitenteDe(token);
      r.flujos.add(res);
      // Un comentario de vez en cuando para que ni el teléfono ni ningún
      // router den la conexión por muerta.
      const latido = setInterval(() => res.write(': latido\n\n'), 25_000);
      req.on('close', () => {
        clearInterval(latido);
        r.flujos.delete(res);
      });
      return;
    }

    if (ruta === '/api/subir' && req.method === 'POST') {
      const nombre = limpiarNombre(decodeURIComponent(String(req.headers['x-nombre'] ?? 'archivo')));
      const datos = await leerCuerpo(req, LIMITE_SUBIDA);
      await fs.mkdir(op.carpetaSubidas, { recursive: true });
      const destino = join(op.carpetaSubidas, `${randomBytes(4).toString('hex')}-${nombre}`);
      await fs.writeFile(destino, datos);
      responderJson(res, 200, { ok: true, ruta: destino });
      return;
    }

    if (ruta === '/api/descargar' && req.method === 'GET') {
      const pedida = url.searchParams.get('ruta') ?? '';
      const permitidas = [...(await op.carpetasDescargables()), op.carpetaSubidas];
      if (!pedida || !dentroDe(pedida, permitidas)) {
        responderJson(res, 403, { ok: false, error: 'Ese archivo no se puede descargar.' });
        return;
      }
      let datos: Buffer;
      try {
        datos = await fs.readFile(pedida);
      } catch {
        responderJson(res, 404, {
          ok: false,
          error: 'El archivo ya no está en el PC. Puede que se haya movido o borrado.',
        });
        return;
      }
      const nombre = basename(pedida);
      res.writeHead(200, {
        'Content-Type': TIPOS[extname(nombre).toLowerCase()] ?? 'application/octet-stream',
        'Content-Length': datos.length,
        'Content-Disposition': `attachment; filename="${nombre.replace(/[^\x20-\x7e]/g, '_').replace(/"/g, '')}"; filename*=UTF-8''${encodeURIComponent(nombre)}`,
        'Cache-Control': 'no-store',
      });
      res.end(datos);
      return;
    }

    if (ruta.startsWith('/api/')) {
      responderJson(res, 404, { ok: false, error: 'No existe.' });
      return;
    }

    // ── La interfaz ─────────────────────────────────────────────────────────
    await servirEstatico(op.raizEstatica, ruta, res);
  }

  await new Promise<void>((ok, mal) => {
    servidor.once('error', mal);
    servidor.listen(puerto, host, () => ok());
  });

  const dir = servidor.address();
  return {
    puerto: typeof dir === 'object' && dir ? dir.port : puerto,
    cerrar: () =>
      new Promise<void>((ok) => {
        for (const t of [...porSesion.keys()]) olvidarSesion(t);
        servidor.close(() => ok());
        servidor.closeAllConnections();
      }),
  };
}

async function servirEstatico(raiz: string, ruta: string, res: ServerResponse) {
  let relativa: string;
  try {
    relativa = decodeURIComponent(ruta);
  } catch {
    relativa = '/';
  }
  const base = resolve(raiz);
  let archivo = resolve(join(base, relativa));
  if (archivo !== base && !archivo.startsWith(base + sep)) {
    res.writeHead(403).end();
    return;
  }
  if (relativa === '/' || relativa === '') archivo = join(base, 'index.html');

  let datos: Buffer;
  try {
    datos = await fs.readFile(archivo);
  } catch {
    // La interfaz es de una sola página: lo que no es un archivo, es ella.
    archivo = join(base, 'index.html');
    datos = await fs.readFile(archivo);
  }

  const ext = extname(archivo).toLowerCase();
  res.writeHead(200, {
    'Content-Type': TIPOS[ext] ?? 'application/octet-stream',
    // Los archivos de assets/ llevan un resumen en el nombre y no cambian;
    // index.html sí, con cada versión.
    'Cache-Control': relativa.startsWith('/assets/')
      ? 'public, max-age=31536000, immutable'
      : 'no-cache',
  });
  res.end(datos);
}

function responderJson(res: ServerResponse, estado: number, cuerpo: unknown) {
  const texto = JSON.stringify(cuerpo);
  res.writeHead(estado, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
  });
  res.end(texto);
}

function leerCookie(req: IncomingMessage, nombre: string): string | undefined {
  const cabecera = req.headers.cookie ?? '';
  for (const parte of cabecera.split(';')) {
    const [k, ...v] = parte.trim().split('=');
    if (k === nombre) return v.join('=');
  }
  return undefined;
}

function leerCuerpo(req: IncomingMessage, limite: number): Promise<Buffer> {
  return new Promise((ok, mal) => {
    const trozos: Buffer[] = [];
    let total = 0;
    req.on('data', (t: Buffer) => {
      total += t.length;
      if (total > limite) {
        mal(new Error('El archivo es demasiado grande.'));
        req.destroy();
        return;
      }
      trozos.push(t);
    });
    req.on('end', () => ok(Buffer.concat(trozos)));
    req.on('error', mal);
  });
}

async function leerJson(req: IncomingMessage, limite: number): Promise<unknown> {
  // Exigir JSON impide que un formulario de otra página dispare acciones:
  // un formulario no puede enviar este tipo de contenido.
  if (!String(req.headers['content-type'] ?? '').startsWith('application/json')) {
    throw new Error('Se esperaba JSON.');
  }
  const datos = await leerCuerpo(req, limite);
  return JSON.parse(datos.toString('utf8') || 'null');
}

/** Nombre de archivo sin rutas ni caracteres que Windows no admite. */
export function limpiarNombre(nombre: string): string {
  const limpio = basename(nombre.replace(/\\/g, '/'))
    .replace(/[<>:"/\\|?*\x00-\x1f]/g, '_')
    .replace(/^\.+/, '')
    .slice(0, 120);
  return limpio || 'archivo';
}

export { INDEFINIDO };
