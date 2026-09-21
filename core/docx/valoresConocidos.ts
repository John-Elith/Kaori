/**
 * Qué datos ya registrados aparecen literalmente en una plantilla.
 *
 * Una plantilla es un documento de alguien: el informe de enero de un
 * contratista concreto, con su teléfono, su cédula y su número de cuenta
 * escritos dentro. Si esos datos ya están en el programa, no hace falta que
 * nadie los señale en el asistente — basta con buscarlos.
 *
 * Es la vía más fiable de las tres que usa la detección, porque no adivina por
 * la forma del texto ni por el rótulo de al lado: compara con el dato exacto.
 * El teléfono es el caso claro: diez dígitos que no se distinguen de una
 * planilla PILA por su aspecto, pero que coinciden carácter por carácter con
 * el que está guardado en el contrato.
 */

import type { CampoId } from './campos';
import type { BaseDeDatos } from '../modelo/tipos';

/**
 * Longitud mínima para fiarse de una coincidencia.
 *
 * Un valor corto aparece por casualidad en cualquier documento —un «01» está
 * en todas las fechas— y marcaría medio informe con el campo equivocado.
 */
const MINIMO = 6;

/**
 * Los datos del registro que están escritos en el texto de la plantilla.
 *
 * Se recorren todos los contratos porque no se sabe de cuál salió la
 * plantilla; gana el primero cuyo dato aparezca. Que dos contratistas
 * compartan teléfono da igual: lo que se busca es **qué campo es** ese número,
 * no de quién.
 */
export function valoresDelRegistro(
  texto: string,
  base: Pick<BaseDeDatos, 'contratos' | 'contratistas'>,
): Partial<Record<CampoId, string>> {
  const encontrados: Partial<Record<CampoId, string>> = {};

  const anotar = (campo: CampoId, valor: string | undefined) => {
    if (encontrados[campo]) return; // ya se resolvió con otro contrato
    const v = valor?.trim();
    if (!v || v.length < MINIMO) return;
    if (!texto.includes(v)) return;
    encontrados[campo] = v;
  };

  for (const c of base.contratos) {
    const k = base.contratistas.find((x) => x.id === c.contratistaId);

    anotar('telefono', c.telefono);
    anotar('numeroDeCuenta', c.numeroDeCuenta);
    anotar('cdpNumero', c.cdp?.numero);
    anotar('rpNumero', c.rp?.numero);
    anotar('numeroContrato', c.numero);
    anotar('objeto', c.objeto);
    anotar('nombreContratista', k?.nombre);
    anotar('cedula', k?.cedula);
  }

  return encontrados;
}
