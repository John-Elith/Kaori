import {
  app,
  BrowserWindow,
  dialog,
  shell,
  safeStorage,
  nativeTheme,
} from 'electron';
import { promises as fs } from 'node:fs';
import { existsSync } from 'node:fs';
import { join } from 'node:path';

import * as almacen from './almacen';
import { manejar, registrarDestino } from './canales';
import { transcribir } from './voz';
import { registrarCanalesRemoto } from './remoto';
import { registrarCanalesPlantillas } from './ipc/plantillas';
import { registrarCanalesGeneracion } from './ipc/generacion';
import { registrarCanalesExtraccion } from './ipc/extraccion';
import type { BaseDeDatos, ProveedorIA } from '../core/modelo/tipos';
import { conSecretosDe, sinSecretos } from '../core/modelo/secretos';
import type { RedactorIA } from '../core/extraccion/redaccionIA';

// El proceso principal se compila a CommonJS (ver vite.config.ts), así que
// `__dirname` está disponible y no hace falta derivarlo de import.meta.url.
const __dirname_ = __dirname;

// Para pruebas: una carpeta de datos aparte, que no toque los datos de verdad
// aunque haya otro Kaori abierto usándolos. Tiene que fijarse antes de que
// nada lea la carpeta.
if (process.env.KAORI_CARPETA_DATOS) {
  app.setPath('userData', process.env.KAORI_CARPETA_DATOS);
}

process.env.APP_ROOT = join(__dirname_, '..');
const RENDERER_DIST = join(process.env.APP_ROOT, 'dist');
const VITE_DEV_SERVER_URL = process.env.VITE_DEV_SERVER_URL;

let ventana: BrowserWindow | null = null;

/**
 * El icono de la ventana y de la barra de tareas.
 *
 * Se prefiere el .ico porque lleva dentro las resoluciones ya reducidas —16,
 * 24, 32…— y Windows escoge la que toca. Con un PNG de 512 el sistema lo
 * reduce él mismo a 32 y el resultado sale blando. El PNG queda de reserva por
 * si alguien borra el .ico sin regenerarlo con `npm run icono`.
 */
function rutaDelIcono(): string {
  const recursos = join(process.env.APP_ROOT ?? __dirname_, 'recursos');
  const ico = join(recursos, 'icono.ico');
  return existsSync(ico) ? ico : join(recursos, 'icono.png');
}

function crearVentana(): void {
  ventana = new BrowserWindow({
    width: 1280,
    height: 860,
    minWidth: 1024,
    minHeight: 700,
    show: false,
    // El fondo con el que Windows rellena la ventana antes de que la interfaz
    // pinte nada. En oscuro se corrige en cuanto el renderer avisa del tema.
    backgroundColor: nativeTheme.shouldUseDarkColors ? '#15181C' : '#F1ECE2',
    title: 'Kaori',
    icon: rutaDelIcono(),
    autoHideMenuBar: true,
    webPreferences: {
      preload: join(__dirname_, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  ventana.once('ready-to-show', () => ventana?.show());

  // La ventana también recibe los avisos de cambios hechos desde el teléfono.
  const w = ventana.webContents;
  const soltar = registrarDestino(w);
  w.once('destroyed', soltar);

  // Los enlaces externos se abren en el navegador, nunca dentro de la app.
  ventana.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('https://')) shell.openExternal(url);
    return { action: 'deny' };
  });

  if (VITE_DEV_SERVER_URL) {
    void ventana.loadURL(VITE_DEV_SERVER_URL);
  } else {
    void ventana.loadFile(join(RENDERER_DIST, 'index.html'));
  }
}

// ── Canales de datos ────────────────────────────────────────────────────────

function registrarCanalesDatos(): void {
  // Las claves de IA se quedan aquí: ni se mandan a la interfaz ni un guardado
  // suyo las pisa (ver core/modelo/secretos.ts).
  manejar('datos:leer', async (): Promise<BaseDeDatos> => sinSecretos(await almacen.leer()));

  manejar('datos:escribir', async (_e, datos: BaseDeDatos) => {
    await almacen.escribir(conSecretosDe(datos, await almacen.leer()));
    return { ok: true as const };
  });

  manejar('datos:nuevoId', (_e, prefijo: string) => almacen.nuevoId(prefijo));

  manejar('datos:rutaArchivo', () => almacen.rutaDeDatos());
}

// ── Canales de sistema ──────────────────────────────────────────────────────

function registrarCanalesSistema(): void {
  manejar('sistema:elegirCarpeta', async () => {
    if (!ventana) return null;
    const r = await dialog.showOpenDialog(ventana, {
      title: 'Carpeta donde guardar los informes',
      properties: ['openDirectory', 'createDirectory'],
    });
    return r.canceled ? null : r.filePaths[0];
  });

  manejar(
    'sistema:elegirArchivo',
    async (_e, filtros: { name: string; extensions: string[] }[]) => {
      if (!ventana) return null;
      const r = await dialog.showOpenDialog(ventana, {
        properties: ['openFile'],
        filters: filtros,
      });
      return r.canceled ? null : r.filePaths[0];
    },
  );

  manejar('sistema:leerArchivo', async (_e, ruta: string) => {
    const buf = await fs.readFile(ruta);
    return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
  });

  manejar('sistema:abrirCarpeta', async (_e, ruta: string) => {
    await shell.openPath(ruta);
  });

  manejar('sistema:abrirArchivo', async (_e, ruta: string) => {
    await shell.openPath(ruta);
  });

  // Las claves de IA se cifran con la protección del sistema operativo. Hay
  // dos —Claude y Gemini— con los mismos tres canales cada una.
  const canalesDeClave = (sufijo: string, campo: 'apiKeyCifrada' | 'geminiClaveCifrada') => {
    manejar(`sistema:guardarClave${sufijo}`, async (_e, clave: string) => {
      if (!safeStorage.isEncryptionAvailable()) {
        return {
          ok: false as const,
          error:
            'Windows no ofrece cifrado seguro en este equipo, así que el programa ' +
            'no guardará la clave. Puede seguir usando el modo sin conexión.',
        };
      }
      const cifrada = safeStorage.encryptString(clave.trim()).toString('base64');
      await almacen.actualizar((b) => ({ ...b, ajustes: { ...b.ajustes, [campo]: cifrada } }));
      return { ok: true as const };
    });

    manejar(`sistema:hayClave${sufijo}`, async () => Boolean((await almacen.leer()).ajustes[campo]));

    manejar(`sistema:borrarClave${sufijo}`, async () => {
      await almacen.actualizar((b) => ({ ...b, ajustes: { ...b.ajustes, [campo]: undefined } }));
      return { ok: true as const };
    });
  };
  canalesDeClave('', 'apiKeyCifrada');
  canalesDeClave('Gemini', 'geminiClaveCifrada');

  // El audio llega ya a 16 kHz y en mono, que es lo que espera Whisper.
  manejar('voz:transcribir', (e, audio: Float32Array) =>
    transcribir(audio, (p) => e.sender.send('voz:progreso', p)),
  );

  manejar('sistema:tema', (_e, tema: 'claro' | 'oscuro') => {
    nativeTheme.themeSource = tema === 'oscuro' ? 'dark' : 'light';
    ventana?.setBackgroundColor(tema === 'oscuro' ? '#15181C' : '#F1ECE2');
    return { ok: true as const };
  });
}

function descifrar(cifrada: string | undefined): string | null {
  if (!cifrada || !safeStorage.isEncryptionAvailable()) return null;
  try {
    return safeStorage.decryptString(Buffer.from(cifrada, 'base64'));
  } catch {
    return null;
  }
}

/** Descifra la clave de Claude para uso interno. Nunca se envía al renderer. */
export async function claveApi(): Promise<string | null> {
  return descifrar((await almacen.leer()).ajustes.apiKeyCifrada);
}

/**
 * Con qué IA redactar obligaciones y actividades, y con qué clave.
 *
 * Manda la elegida en Ajustes si tiene clave; si no, la que la tenga. Así
 * quien sólo configuró Gemini no tiene que elegir nada más.
 */
export async function redactorIA(): Promise<RedactorIA | null> {
  const a = (await almacen.leer()).ajustes;
  const claves: Record<ProveedorIA, string | null> = {
    claude: descifrar(a.apiKeyCifrada),
    gemini: descifrar(a.geminiClaveCifrada),
  };
  const orden: ProveedorIA[] = a.proveedorIA === 'gemini' ? ['gemini', 'claude'] : ['claude', 'gemini'];
  for (const proveedor of orden) {
    const clave = claves[proveedor];
    if (clave) return { proveedor, clave };
  }
  return null;
}

// ── Arranque ────────────────────────────────────────────────────────────────

app.whenReady().then(() => {
  // Sin esto Windows no relaciona la ventana con la aplicación instalada y en
  // la barra de tareas puede salir el icono genérico de Electron en vez del
  // nuestro. Tiene que coincidir con el appId de electron-builder.
  app.setAppUserModelId('co.gov.olayaherrera.kaori');

  registrarCanalesDatos();
  registrarCanalesSistema();
  registrarCanalesPlantillas(() => ventana);
  registrarCanalesGeneracion();
  registrarCanalesExtraccion(claveApi, redactorIA);
  registrarCanalesRemoto(RENDERER_DIST);
  crearVentana();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) crearVentana();
  });
});

app.on('window-all-closed', () => {
  app.quit();
  ventana = null;
});
