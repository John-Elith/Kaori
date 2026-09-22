/**
 * Guardar la base desde varias pantallas a la vez sin perder nada.
 *
 * Cada pantalla —la ventana del PC, cada teléfono— guarda la base entera en
 * cada cambio. Con una sola pantalla basta; con dos, pasaba esto:
 *
 * - **Guardados desordenados.** Desde el teléfono cada letra viaja como una
 *   petición aparte por la Wi-Fi, y pueden llegar en otro orden. Si la de
 *   «1» llegaba después de la de «123», ganaba la vieja; si la primera, con el
 *   campo aún vacío, llegaba la última, el número se perdía.
 * - **Pisarse.** Si el PC guardaba con su copia un poco atrasada, borraba lo
 *   que acababa de escribir el teléfono.
 *
 * Aquí cada pantalla guarda **de uno en uno**, diciendo sobre qué versión
 * hizo su cambio. Si el PC ya tiene otra —porque la otra pantalla guardó en
 * medio—, no se acepta a ciegas: se toma la versión actual y se vuelve a
 * aplicar encima el cambio («el número pasa a ser 123-2025»). Los cambios son
 * funciones, no fotos de la base, y por eso se pueden reaplicar.
 */

import type { BaseDeDatos } from './tipos';

export type Cambio = (b: BaseDeDatos) => BaseDeDatos;

export type RespuestaEscritura =
  | { ok: true; revision: number }
  | { ok: false; revision: number; base: BaseDeDatos };

export type Escritor = (base: BaseDeDatos, revision: number) => Promise<RespuestaEscritura>;

/** Cuántas veces seguidas se rehace un guardado que choca antes de rendirse. */
const REINTENTOS = 8;

export class Sincronizador {
  private confirmada: BaseDeDatos;
  private revision: number;
  private pendientes: Cambio[] = [];
  private enCurso: Promise<void> | null = null;

  constructor(
    base: BaseDeDatos,
    revision: number,
    private readonly escribir: Escritor,
    /** Lo que debe verse: la base confirmada con los cambios aún por guardar. */
    private readonly alCambiarVista: (vista: BaseDeDatos) => void,
    private readonly alError: (e: unknown) => void = () => {},
  ) {
    this.confirmada = base;
    this.revision = revision;
  }

  /** La base con los cambios pendientes aplicados: lo que ve la persona. */
  vista(): BaseDeDatos {
    return this.pendientes.reduce((b, c) => c(structuredClone(b)), this.confirmada);
  }

  get versionConfirmada(): number {
    return this.revision;
  }

  get hayPendientes(): boolean {
    return this.pendientes.length > 0;
  }

  /** Un cambio de esta pantalla: se ve al momento y se guarda en cola. */
  cambiar(cambio: Cambio): Promise<void> {
    this.pendientes.push(cambio);
    this.alCambiarVista(this.vista());
    return this.vaciar();
  }

  /**
   * Llegó una versión de otra pantalla. Si es más antigua que la que ya se
   * tiene —una recarga que tardó—, se ignora: aplicarla devolvería la pantalla
   * a un estado viejo y el siguiente cambio se haría sobre él.
   */
  recibir(base: BaseDeDatos, revision: number): void {
    if (revision <= this.revision) return;
    this.confirmada = base;
    this.revision = revision;
    this.alCambiarVista(this.vista());
  }

  /** Espera a que se haya guardado todo lo pendiente. */
  esperar(): Promise<void> {
    return this.enCurso ?? Promise.resolve();
  }

  private vaciar(): Promise<void> {
    if (!this.enCurso) {
      this.enCurso = this.guardarPendientes().finally(() => {
        this.enCurso = null;
      });
    }
    return this.enCurso;
  }

  private async guardarPendientes(): Promise<void> {
    let choques = 0;
    while (this.pendientes.length > 0) {
      // Se manda todo lo acumulado de una vez: mientras un guardado va por la
      // red se pueden haber escrito diez letras más.
      const lote = this.pendientes.length;
      const candidata = this.pendientes.reduce((b, c) => c(structuredClone(b)), this.confirmada);
      let r: RespuestaEscritura;
      try {
        r = await this.escribir(candidata, this.revision);
      } catch (e) {
        // Sin conexión, por ejemplo. Los cambios siguen pendientes y se
        // mandarán con el próximo; mientras, se siguen viendo.
        this.alError(e);
        return;
      }
      if (r.ok) {
        this.confirmada = candidata;
        this.revision = r.revision;
        this.pendientes.splice(0, lote);
        choques = 0;
      } else {
        // Otra pantalla guardó en medio: se toma su versión y se reaplican
        // encima los cambios de aquí.
        this.confirmada = r.base;
        this.revision = r.revision;
        this.alCambiarVista(this.vista());
        if (++choques > REINTENTOS) {
          this.alError(new Error('Los datos cambiaban sin parar en otro equipo; no se pudo guardar.'));
          return;
        }
      }
    }
  }
}
