/**
 * Registro de los canales del proceso principal.
 *
 * Cada función que la interfaz puede pedir —leer los datos, generar un lote,
 * registrar una plantilla…— se registra aquí una sola vez y queda disponible
 * por dos vías: la ventana del PC, por IPC, y el teléfono, por la red. Así el
 * teléfono hace exactamente lo mismo que el PC sin duplicar nada.
 *
 * También reparte los avisos de «los datos cambiaron». La interfaz guarda la
 * base entera en cada cambio; si el teléfono guarda y el PC no se entera, el
 * siguiente guardado del PC borraría lo que hizo el teléfono. Por eso, cuando
 * alguien cambia algo, los demás recargan.
 */

import { ipcMain } from 'electron';

/** Quien pidió algo y adónde mandarle los avisos que genere su petición. */
export type Remitente = {
  send(canal: string, ...datos: unknown[]): void;
  isDestroyed(): boolean;
};

export type EventoCanal = { sender: Remitente };

// Los manejadores declaran sus propios argumentos; aquí sólo se reparten.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Manejador = (evento: EventoCanal, ...args: any[]) => unknown;

const manejadores = new Map<string, Manejador>();

/**
 * Canales tras los cuales los demás deben recargar. Son los que escriben en la
 * base o en las plantillas.
 */
const CANALES_QUE_CAMBIAN = new Set([
  'datos:escribir',
  'plantillas:registrar',
  'plantillas:guardarMapa',
  'plantillas:cambiarTipo',
  'plantillas:eliminar',
  'plantillas:restaurar',
  'plantillas:borrarDefinitivo',
  'plantillas:vaciarPapelera',
]);

/** Todos los que están mirando: la ventana del PC y cada teléfono conectado. */
const destinos = new Set<Remitente>();

export function registrarDestino(d: Remitente): () => void {
  destinos.add(d);
  return () => destinos.delete(d);
}

/** Avisa a todos menos a quien provocó el cambio, que ya lo tiene. */
export function avisarATodos(canal: string, datos?: unknown, excepto?: Remitente): void {
  for (const d of destinos) {
    if (d === excepto) continue;
    if (d.isDestroyed()) {
      destinos.delete(d);
      continue;
    }
    d.send(canal, datos);
  }
}

export function manejar(canal: string, fn: Manejador): void {
  const envuelto: Manejador = async (evento, ...args) => {
    const r = await fn(evento, ...args);
    if (CANALES_QUE_CAMBIAN.has(canal)) {
      avisarATodos('datos:cambiados', { canal }, evento.sender);
    }
    return r;
  };
  manejadores.set(canal, envuelto);
  // El evento real de IPC tiene más cosas, pero los manejadores sólo usan
  // `sender`, que cumple la forma de Remitente.
  ipcMain.handle(canal, (e, ...args) => envuelto(e as unknown as EventoCanal, ...args));
}

/** Para el acceso por red: ejecuta un canal como si llegara por IPC. */
export async function invocar(
  canal: string,
  evento: EventoCanal,
  args: unknown[],
): Promise<unknown> {
  const fn = manejadores.get(canal);
  if (!fn) throw new Error(`Canal desconocido: ${canal}`);
  return fn(evento, ...args);
}
