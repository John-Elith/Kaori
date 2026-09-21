/**
 * Las claves de IA no viajan a la interfaz ni vuelven de ella.
 *
 * La interfaz guarda la base entera en cada cambio. Las claves se guardan
 * aparte, desde el proceso principal, así que la copia de la interfaz no se
 * enteraba: al guardar una clave y editar después cualquier contrato, la
 * interfaz escribía su copia sin la clave y la borraba sin avisar.
 *
 * Por eso las claves no salen del proceso principal —tampoco hacia el
 * teléfono— y cada guardado de la interfaz conserva las que hay en disco.
 */

import { AJUSTES_SECRETOS, type BaseDeDatos } from './tipos';

/** La base tal como la ve la interfaz: sin claves. */
export function sinSecretos(base: BaseDeDatos): BaseDeDatos {
  const ajustes = { ...base.ajustes };
  for (const k of AJUSTES_SECRETOS) delete ajustes[k];
  return { ...base, ajustes };
}

/** Lo que manda la interfaz, con las claves que ya había guardadas. */
export function conSecretosDe(nueva: BaseDeDatos, actual: BaseDeDatos): BaseDeDatos {
  const ajustes = { ...nueva.ajustes };
  for (const k of AJUSTES_SECRETOS) {
    if (actual.ajustes[k]) ajustes[k] = actual.ajustes[k];
    else delete ajustes[k];
  }
  return { ...nueva, ajustes };
}
