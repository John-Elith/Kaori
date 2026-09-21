/**
 * Arreglo de plantillas ya guardadas con dos campos cruzados.
 *
 * Hasta la corrección de `sugerirDesdeValores`, si la plantilla salió de un
 * contrato cuyo CDP y RP llevaban el mismo número, las dos apariciones de ese
 * número quedaban asignadas al CDP y el RP se quedaba sin ninguna. Cada
 * documento generado con esa plantilla ponía entonces el número del CDP en la
 * casilla del RP, aunque el contrato tuviera otro.
 *
 * Corregir la detección no arregla lo ya guardado, así que esto repasa cada
 * plantilla: si las anclas —que saben por la fila de la tabla qué casilla es
 * cuál— dicen que una posición es de un campo que no tiene ninguna, y esa
 * posición está asignada a otro campo que la tiene repetida, se devuelve a su
 * dueño.
 *
 * Es deliberadamente estrecho: sólo mueve una aparición cuando las tres
 * señales coinciden (el campo destino está vacío, el origen tiene otras
 * apariciones, y la posición coincide exacta con la que dicen las anclas). Una
 * plantilla mapeada a mano con criterio propio no se toca.
 */

import { detectarPorAnclas } from './anclas';
import type { CampoId } from './campos';
import type { MapaPlantilla } from './mapaPlantilla';
import type { MapaTexto } from './mapaTexto';

export type Reparacion = { campo: CampoId; tomadoDe: CampoId; texto: string };

export function repararCamposCruzados(
  mapa: MapaPlantilla,
  texto: MapaTexto,
): { mapa: MapaPlantilla; reparaciones: Reparacion[] } {
  const reparaciones: Reparacion[] = [];
  const campos = mapa.campos.map((c) => ({ ...c, ocurrencias: [...c.ocurrencias] }));
  const vacio = (campo: CampoId) =>
    (campos.find((c) => c.campo === campo)?.ocurrencias.length ?? 0) === 0;

  for (const ancla of detectarPorAnclas(texto, mapa.tipo ?? 'informe')) {
    const destino = ancla.sugerencias[0];
    if (!destino || !vacio(destino)) continue;

    const origen = campos.find(
      (c) =>
        c.campo !== destino &&
        c.ocurrencias.length > 1 &&
        c.ocurrencias.some((o) => o.inicio === ancla.inicio && o.fin === ancla.fin),
    );
    if (!origen) continue;

    const i = origen.ocurrencias.findIndex((o) => o.inicio === ancla.inicio && o.fin === ancla.fin);
    const [movida] = origen.ocurrencias.splice(i, 1);

    let entrada = campos.find((c) => c.campo === destino);
    if (!entrada) {
      entrada = { campo: destino, ocurrencias: [] };
      campos.push(entrada);
    }
    entrada.ocurrencias.push(movida);
    reparaciones.push({ campo: destino, tomadoDe: origen.campo, texto: movida.textoOriginal });
  }

  return { mapa: reparaciones.length > 0 ? { ...mapa, campos } : mapa, reparaciones };
}
