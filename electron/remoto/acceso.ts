/**
 * Quién puede entrar desde el teléfono.
 *
 * El acceso tiene dos llaves:
 *
 * 1. **Estar en la misma red** que el PC. El QR sólo lleva a la dirección; no
 *    sirve de nada fuera de la Wi-Fi de la oficina.
 * 2. **Ver la pantalla del PC.** Para entrar hay que escribir el código de 6
 *    cifras que aparece en ella. Quien sólo tenga la dirección —porque alguien
 *    se la pasó, o porque la adivinó— no puede entrar.
 *
 * El código caduca a los 10 minutos y se anula tras 5 intentos fallidos, así
 * que no se puede probar a ciegas: con un millón de combinaciones y 5 intentos,
 * la probabilidad de acertar es de 1 entre 200 000. Además, un mismo equipo no
 * puede intentarlo más de 10 veces por minuto.
 *
 * Ya dentro, el teléfono recibe una sesión que dura mientras se use: caduca
 * tras 12 horas sin actividad, y el PC puede cerrarla en cualquier momento.
 */

import { randomBytes, randomInt, timingSafeEqual } from 'node:crypto';

export const VIGENCIA_CODIGO_MS = 10 * 60 * 1000;
export const INTENTOS_POR_CODIGO = 5;
export const INACTIVIDAD_MAXIMA_MS = 12 * 60 * 60 * 1000;
const INTENTOS_POR_MINUTO_Y_EQUIPO = 10;

export type Sesion = {
  id: string;
  /** Lo que el teléfono dice de sí mismo, para reconocerlo en la lista. */
  dispositivo: string;
  direccion: string;
  creada: number;
  ultimaActividad: number;
};

export type ResultadoEntrada =
  | { ok: true; token: string; sesion: Sesion }
  | { ok: false; motivo: string };

type Codigo = { valor: string; caduca: number; fallos: number };

export class ControlDeAcceso {
  private codigo: Codigo | null = null;
  /** Por token. El token no se muestra nunca; la interfaz ve el id. */
  private sesiones = new Map<string, Sesion>();
  private intentosPorEquipo = new Map<string, number[]>();

  constructor(private readonly ahora: () => number = Date.now) {}

  /** Un código nuevo; el anterior deja de valer. */
  nuevoCodigo(): { codigo: string; caduca: number } {
    const valor = randomInt(0, 1_000_000).toString().padStart(6, '0');
    this.codigo = { valor, caduca: this.ahora() + VIGENCIA_CODIGO_MS, fallos: 0 };
    return { codigo: valor, caduca: this.codigo.caduca };
  }

  /** El código vigente, si lo hay, para mostrarlo en el PC. */
  codigoVigente(): { codigo: string; caduca: number } | null {
    if (!this.codigo || this.codigo.caduca <= this.ahora()) return null;
    return { codigo: this.codigo.valor, caduca: this.codigo.caduca };
  }

  entrar(codigo: string, dispositivo: string, direccion: string): ResultadoEntrada {
    const t = this.ahora();

    // Límite de fallos por equipo, antes de mirar el código: frena a quien
    // pruebe a ciegas aunque vaya generando códigos nuevos en el PC. Sólo
    // cuentan los fallos: entrar bien varias veces no bloquea a nadie.
    const fallosRecientes = (this.intentosPorEquipo.get(direccion) ?? []).filter(
      (x) => t - x < 60_000,
    );
    this.intentosPorEquipo.set(direccion, fallosRecientes);
    if (fallosRecientes.length >= INTENTOS_POR_MINUTO_Y_EQUIPO) {
      return { ok: false, motivo: 'Demasiados intentos. Espere un minuto.' };
    }
    const fallo = (motivo: string): ResultadoEntrada => {
      fallosRecientes.push(t);
      return { ok: false, motivo };
    };

    const c = this.codigo;
    if (!c || c.caduca <= t) {
      fallosRecientes.push(t);
      return {
        ok: false,
        motivo: 'El código caducó. Pida uno nuevo en el PC: Ajustes → Usar desde el teléfono.',
      };
    }

    const escrito = codigo.replace(/\D/g, '');
    if (!iguales(escrito, c.valor)) {
      c.fallos += 1;
      if (c.fallos >= INTENTOS_POR_CODIGO) {
        this.codigo = null;
        return fallo('Código incorrecto demasiadas veces. Pida uno nuevo en el PC.');
      }
      const quedan = INTENTOS_POR_CODIGO - c.fallos;
      return fallo(`Código incorrecto. Le quedan ${quedan} intento${quedan === 1 ? '' : 's'}.`);
    }

    // Un código sirve para una sola entrada: si alguien lo vio por encima del
    // hombro, ya no le vale.
    this.codigo = null;

    const token = randomBytes(32).toString('base64url');
    const sesion: Sesion = {
      id: randomBytes(6).toString('hex'),
      dispositivo: describirDispositivo(dispositivo),
      direccion,
      creada: t,
      ultimaActividad: t,
    };
    this.sesiones.set(token, sesion);
    return { ok: true, token, sesion };
  }

  /** La sesión de un token, si sigue viva. Cuenta como actividad. */
  validar(token: string | undefined): Sesion | null {
    if (!token) return null;
    const s = this.sesiones.get(token);
    if (!s) return null;
    const t = this.ahora();
    if (t - s.ultimaActividad > INACTIVIDAD_MAXIMA_MS) {
      this.sesiones.delete(token);
      return null;
    }
    s.ultimaActividad = t;
    return s;
  }

  /** Si la sesión sigue abierta, sin contarlo como actividad. */
  existe(token: string): boolean {
    const s = this.sesiones.get(token);
    return !!s && this.ahora() - s.ultimaActividad <= INACTIVIDAD_MAXIMA_MS;
  }

  cerrarPorToken(token: string): void {
    this.sesiones.delete(token);
  }

  /** Desde el PC, que sólo conoce el id. */
  cerrarPorId(id: string): boolean {
    for (const [token, s] of this.sesiones) {
      if (s.id === id) {
        this.sesiones.delete(token);
        return true;
      }
    }
    return false;
  }

  cerrarTodas(): void {
    this.sesiones.clear();
    this.codigo = null;
  }

  listar(): Sesion[] {
    const t = this.ahora();
    for (const [token, s] of this.sesiones) {
      if (t - s.ultimaActividad > INACTIVIDAD_MAXIMA_MS) this.sesiones.delete(token);
    }
    return [...this.sesiones.values()].map((s) => ({ ...s }));
  }
}

/** Comparación en tiempo constante: no deja deducir cifras por lo que tarda. */
function iguales(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  return timingSafeEqual(Buffer.from(a), Buffer.from(b));
}

/** «Android · Chrome», «iPhone · Safari»… a partir del user-agent. */
export function describirDispositivo(ua: string): string {
  const so = /iPhone/.test(ua)
    ? 'iPhone'
    : /iPad/.test(ua)
      ? 'iPad'
      : /Android/.test(ua)
        ? 'Android'
        : /Windows/.test(ua)
          ? 'Windows'
          : /Mac OS/.test(ua)
            ? 'Mac'
            : 'Dispositivo';
  const nav = /EdgA?\//.test(ua)
    ? 'Edge'
    : /SamsungBrowser/.test(ua)
      ? 'Samsung Internet'
      : /CriOS|Chrome\//.test(ua)
        ? 'Chrome'
        : /FxiOS|Firefox\//.test(ua)
          ? 'Firefox'
          : /Safari\//.test(ua)
            ? 'Safari'
            : 'navegador';
  return `${so} · ${nav}`;
}
