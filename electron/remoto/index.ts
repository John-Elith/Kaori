/**
 * Acceso desde el teléfono, visto desde el PC: encenderlo, apagarlo, mostrar
 * el QR y el código, y ver quién está conectado.
 *
 * Está apagado al abrir Kaori y sólo se enciende cuando alguien lo pide en
 * Ajustes. Mientras está apagado no hay nada escuchando en la red.
 */

import { app } from 'electron';
import { networkInterfaces } from 'node:os';
import { promises as fs } from 'node:fs';
import { join } from 'node:path';
import QRCode from 'qrcode';

import * as almacen from '../almacen';
import { avisarATodos, invocar, manejar, registrarDestino } from '../canales';
import { ControlDeAcceso } from './acceso';
import { iniciarServidor } from './servidor';

/** Fijo, para que la dirección no cambie de una vez a otra. */
const PUERTO_PREFERIDO = 47800;

export type EstadoRemoto = {
  activo: boolean;
  direccion?: string;
  /** Otras direcciones del PC, por si el teléfono está en otra red. */
  otras?: string[];
  qr?: string;
  codigo?: string;
  caduca?: number;
  sesiones: { id: string; dispositivo: string; direccion: string; creada: number; ultimaActividad: number }[];
  error?: string;
};

const acceso = new ControlDeAcceso();
let servidor: { puerto: number; cerrar: () => Promise<void> } | null = null;
let direcciones: string[] = [];
let elegida = 0;

/**
 * Las direcciones del PC en la red local, la más probable primero.
 *
 * Se descartan las de adaptadores virtuales (VirtualBox, VMware, WSL, Hyper-V):
 * un teléfono nunca está en esas redes, y si saliera una de ellas en el QR no
 * funcionaría.
 */
export function direccionesLocales(): string[] {
  const candidatas: { ip: string; puntos: number }[] = [];
  for (const [nombre, lista] of Object.entries(networkInterfaces())) {
    for (const d of lista ?? []) {
      if (d.family !== 'IPv4' || d.internal) continue;
      if (/virtual|vmware|vbox|hyper-v|vethernet|wsl|loopback|bluetooth/i.test(nombre)) continue;
      if (d.address.startsWith('169.254.')) continue; // sin DHCP: no sirve
      let puntos = 0;
      if (/wi-?fi|wlan|wireless|inal[aá]mbrica/i.test(nombre)) puntos += 3;
      if (/ethernet|eth|local/i.test(nombre)) puntos += 2;
      if (d.address.startsWith('192.168.')) puntos += 2;
      else if (d.address.startsWith('10.') || /^172\.(1[6-9]|2\d|3[01])\./.test(d.address)) puntos += 1;
      candidatas.push({ ip: d.address, puntos });
    }
  }
  return candidatas.sort((a, b) => b.puntos - a.puntos).map((c) => c.ip);
}

function url(): string | undefined {
  if (!servidor || direcciones.length === 0) return undefined;
  return `http://${direcciones[elegida]}:${servidor.puerto}/`;
}

async function estado(): Promise<EstadoRemoto> {
  if (!servidor) return { activo: false, sesiones: [] };
  const u = url();
  const c = acceso.codigoVigente();
  return {
    activo: true,
    direccion: u,
    otras: direcciones.filter((_, i) => i !== elegida),
    // El QR lleva sólo la dirección, no el código: quien lo fotografíe sin
    // estar delante del PC no puede entrar.
    qr: u ? await QRCode.toDataURL(u, { margin: 1, width: 360, errorCorrectionLevel: 'M' }) : undefined,
    codigo: c?.codigo,
    caduca: c?.caduca,
    sesiones: acceso.listar(),
    error: direcciones.length === 0
      ? 'El PC no está conectado a ninguna red. Conéctelo a la Wi-Fi de la oficina.'
      : undefined,
  };
}

function carpetaSubidas(): string {
  return join(app.getPath('userData'), 'subidas-telefono');
}

/** Lo subido desde el teléfono hace más de un día ya no hace falta. */
async function limpiarSubidas(): Promise<void> {
  const dir = carpetaSubidas();
  const nombres = await fs.readdir(dir).catch(() => [] as string[]);
  const limite = Date.now() - 24 * 3600 * 1000;
  for (const n of nombres) {
    const r = join(dir, n);
    const st = await fs.stat(r).catch(() => null);
    if (st && st.mtimeMs < limite) await fs.rm(r, { force: true }).catch(() => undefined);
  }
}

function avisarCambio() {
  // Sólo le interesa a la ventana del PC; los teléfonos ignoran este aviso.
  avisarATodos('remoto:cambio');
}

async function activar(raizEstatica: string): Promise<EstadoRemoto> {
  if (!servidor) {
    direcciones = direccionesLocales();
    elegida = 0;
    await limpiarSubidas();

    const opciones = {
      acceso,
      raizEstatica,
      carpetaSubidas: carpetaSubidas(),
      invocar: (canal: string, remitente: Parameters<typeof invocar>[1]['sender'], args: unknown[]) =>
        invocar(canal, { sender: remitente }, args),
      registrarDestino,
      carpetasDescargables: async () => [(await almacen.leer()).ajustes.carpetaSalida],
      alCambiarSesiones: avisarCambio,
    };

    // Si el puerto está ocupado —otra copia de Kaori, otro programa— se
    // prueba el siguiente.
    let ultimoError: unknown;
    for (let p = PUERTO_PREFERIDO; p < PUERTO_PREFERIDO + 10 && !servidor; p++) {
      try {
        servidor = await iniciarServidor(opciones, p);
      } catch (e) {
        ultimoError = e;
      }
    }
    if (!servidor) {
      return {
        activo: false,
        sesiones: [],
        error: `No se pudo abrir el acceso: ${ultimoError instanceof Error ? ultimoError.message : String(ultimoError)}`,
      };
    }
  }
  acceso.nuevoCodigo();
  return estado();
}

async function desactivar(): Promise<EstadoRemoto> {
  acceso.cerrarTodas();
  const s = servidor;
  servidor = null;
  await s?.cerrar();
  return estado();
}

export function registrarCanalesRemoto(raizEstatica: string): void {
  manejar('remoto:estado', () => estado());
  manejar('remoto:activar', () => activar(raizEstatica));
  manejar('remoto:desactivar', () => desactivar());
  manejar('remoto:nuevoCodigo', () => {
    if (servidor) acceso.nuevoCodigo();
    return estado();
  });
  manejar('remoto:usarDireccion', (_e, ip: string) => {
    const i = direcciones.indexOf(ip);
    if (i >= 0) elegida = i;
    return estado();
  });
  manejar('remoto:cerrarSesion', (_e, id: string) => {
    acceso.cerrarPorId(id);
    return estado();
  });

  app.on('before-quit', () => {
    void servidor?.cerrar();
  });
}
