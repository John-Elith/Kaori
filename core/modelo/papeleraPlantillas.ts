/**
 * Papelera de plantillas.
 *
 * Las plantillas no viven en datos.json sino en su propia carpeta, junto a los
 * .docx normalizados, así que necesitan su propia papelera. El plazo y las
 * reglas son los mismos que para los contratos —ver `papelera.ts`— porque
 * quien elimina algo por error no debería tener que recordar dos plazos
 * distintos según lo que haya eliminado.
 *
 * Que una plantilla vuelva con el mismo id es lo que hace que, al recuperarla,
 * los contratos que la tenían asignada la reconozcan sin reasignar nada.
 */

import { DIAS_EN_PAPELERA } from './tipos';
import type { MapaPlantilla } from '../docx/mapaPlantilla';

const MS_POR_DIA = 24 * 60 * 60 * 1000;

export type PlantillaEnPapelera = {
  mapa: MapaPlantilla;
  /** ISO — momento de la eliminación */
  eliminadaEn: string;
};

/** Días que le quedan a una entrada antes de borrarse para siempre. */
export function diasRestantes(
  entrada: PlantillaEnPapelera,
  ahora = new Date(),
): number {
  const eliminada = new Date(entrada.eliminadaEn).getTime();
  if (Number.isNaN(eliminada)) return DIAS_EN_PAPELERA;
  const transcurridos = (ahora.getTime() - eliminada) / MS_POR_DIA;
  return Math.max(0, Math.ceil(DIAS_EN_PAPELERA - transcurridos));
}

export function haCaducado(
  entrada: PlantillaEnPapelera,
  ahora = new Date(),
): boolean {
  const eliminada = new Date(entrada.eliminadaEn).getTime();
  if (Number.isNaN(eliminada)) return false; // fecha ilegible: no se borra
  return ahora.getTime() - eliminada >= DIAS_EN_PAPELERA * MS_POR_DIA;
}

/** Entradas de la más reciente a la más antigua. */
export function ordenadas(entradas: PlantillaEnPapelera[]): PlantillaEnPapelera[] {
  return [...entradas].sort(
    (a, b) => new Date(b.eliminadaEn).getTime() - new Date(a.eliminadaEn).getTime(),
  );
}
