/**
 * Nombres de archivo de los documentos generados.
 *
 * Todos siguen el mismo patrón, en mayúsculas y separados por espacios, porque
 * se leen de un vistazo en el explorador de Windows:
 *
 *   PEDRO RAMIREZ LOPEZ 079-2025 JUNIO.docx
 *   CUENTA DE COBRO PEDRO RAMIREZ LOPEZ 079-2025 JUNIO.docx
 *   CERTIFICADO DE CUMPLIMIENTO PEDRO RAMIREZ LOPEZ 079-2025.docx
 *
 * El certificado no lleva mes: hay uno por contrato.
 */

import { nombreMes } from '../espanol/calendario';
import type { Contrato, Contratista } from '../modelo/tipos';

/**
 * Quita lo que Windows no admite en un nombre de archivo.
 *
 * Se conservan los espacios y las tildes: el nombre está para leerlo, y Windows
 * los acepta sin problema. Lo que no acepta son `\ / : * ? " < > |`, y un
 * número de contrato con barra —que los hay— reventaría el guardado.
 */
function limpio(texto: string): string {
  return texto
    .replace(/[\\/:*?"<>|]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLocaleUpperCase('es');
}

/**
 * El nombre de un documento mensual.
 *
 * `prefijo` distingue la cuenta de cobro; el informe no lleva ninguno, que es
 * como se pidió: el informe es el documento principal y va sin etiqueta.
 */
export function nombreDeDocumento(
  contrato: Contrato,
  contratista: Contratista,
  mes: number,
  prefijo?: string,
): string {
  const partes = [
    prefijo,
    contratista.nombre,
    contrato.numero,
    nombreMes(mes),
  ].filter((p): p is string => Boolean(p && p.trim()));

  return `${limpio(partes.join(' '))}.docx`;
}

/**
 * "CERTIFICADO DE CUMPLIMIENTO PEDRO RAMIREZ LOPEZ 079-2025.docx"
 *
 * Un certificado parcial —el que cierra antes de que acabe el contrato— lleva
 * además el mes. Sin eso, expedir el de marzo y luego el de junio produciría
 * el mismo nombre y el segundo pisaría al primero.
 */
export function nombreDeCertificado(
  contrato: Contrato,
  contratista: Contratista,
  mesParcial?: number,
): string {
  const partes = [
    'CERTIFICADO DE CUMPLIMIENTO',
    contratista.nombre,
    contrato.numero,
    mesParcial ? nombreMes(mesParcial) : undefined,
  ].filter((p): p is string => Boolean(p && p.trim()));

  return `${limpio(partes.join(' '))}.docx`;
}

/**
 * Añade « (2)», « (3)»… antes de la extensión hasta dar con un nombre libre.
 *
 * Hace falta porque dos contratos con el mismo número y el mismo contratista
 * producen el mismo nombre de archivo — algo que ocurre de verdad cuando se
 * duplica un contrato por error. Antes el segundo sobrescribía al primero en
 * silencio y el usuario acababa con un solo documento creyendo tener dos.
 *
 * `usados` se muta: se registra el nombre devuelto.
 */
export function nombreLibre(nombre: string, usados?: Set<string>): string {
  if (!usados || !usados.has(nombre)) {
    usados?.add(nombre);
    return nombre;
  }

  const punto = nombre.lastIndexOf('.');
  const base = punto === -1 ? nombre : nombre.slice(0, punto);
  const extension = punto === -1 ? '' : nombre.slice(punto);

  for (let n = 2; n < 1000; n++) {
    const candidato = `${base} (${n})${extension}`;
    if (!usados.has(candidato)) {
      usados.add(candidato);
      return candidato;
    }
  }

  return nombre;
}
