/**
 * Papelera de contratos eliminados.
 *
 * Eliminar un contrato borra también su historial de informes, así que un clic
 * de más podría costar el trabajo de varios meses. Por eso el borrado no es
 * inmediato: el contrato pasa a la papelera y sigue recuperable durante 30 días.
 */

import {
  DIAS_EN_PAPELERA,
  type BaseDeDatos,
  type EnPapelera,
} from './tipos';

const MS_POR_DIA = 24 * 60 * 60 * 1000;

/** Días que le quedan a una entrada antes de borrarse para siempre. */
export function diasRestantes(entrada: EnPapelera, ahora = new Date()): number {
  const eliminado = new Date(entrada.eliminadoEn).getTime();
  if (Number.isNaN(eliminado)) return DIAS_EN_PAPELERA;
  const transcurridos = (ahora.getTime() - eliminado) / MS_POR_DIA;
  return Math.max(0, Math.ceil(DIAS_EN_PAPELERA - transcurridos));
}

export function haCaducado(entrada: EnPapelera, ahora = new Date()): boolean {
  const eliminado = new Date(entrada.eliminadoEn).getTime();
  if (Number.isNaN(eliminado)) return false; // fecha ilegible: no se borra
  return ahora.getTime() - eliminado >= DIAS_EN_PAPELERA * MS_POR_DIA;
}

/**
 * Mueve un contrato a la papelera, llevándose sus informes.
 *
 * Si el id no existe la base se devuelve intacta, para que una doble pulsación
 * no provoque nada raro.
 */
export function enviarAPapelera(
  base: BaseDeDatos,
  contratoId: string,
  ahora = new Date(),
): BaseDeDatos {
  const contrato = base.contratos.find((c) => c.id === contratoId);
  if (!contrato) return base;

  const informes = base.informes.filter((i) => i.contratoId === contratoId);
  const certificados = (base.certificados ?? []).filter(
    (c) => c.contratoId === contratoId,
  );

  return {
    ...base,
    contratos: base.contratos.filter((c) => c.id !== contratoId),
    informes: base.informes.filter((i) => i.contratoId !== contratoId),
    certificados: (base.certificados ?? []).filter((c) => c.contratoId !== contratoId),
    papelera: [
      { contrato, informes, certificados, eliminadoEn: ahora.toISOString() },
      ...base.papelera,
    ],
  };
}

/**
 * Devuelve un contrato de la papelera a la lista activa, con sus informes.
 *
 * Si su contratista ya no existe, el contrato vuelve igualmente: es preferible
 * un contrato que hay que reasignar a perder el trabajo. La interfaz avisa.
 */
export function restaurarDePapelera(
  base: BaseDeDatos,
  contratoId: string,
): BaseDeDatos {
  const entrada = base.papelera.find((e) => e.contrato.id === contratoId);
  if (!entrada) return base;

  // Evitar duplicar informes si por alguna razón ya existieran.
  const clave = (i: { contratoId: string; anio: number; mes: number }) =>
    `${i.contratoId}|${i.anio}|${i.mes}`;
  const yaEstan = new Set(base.informes.map(clave));
  const informesNuevos = entrada.informes.filter((i) => !yaEstan.has(clave(i)));

  const certificadosNuevos = (entrada.certificados ?? []).filter(
    (c) => !(base.certificados ?? []).some((x) => x.contratoId === c.contratoId),
  );

  return {
    ...base,
    contratos: [...base.contratos, entrada.contrato],
    informes: [...base.informes, ...informesNuevos],
    certificados: [...(base.certificados ?? []), ...certificadosNuevos],
    papelera: base.papelera.filter((e) => e.contrato.id !== contratoId),
  };
}

/** Borra una entrada para siempre. */
export function borrarDefinitivamente(
  base: BaseDeDatos,
  contratoId: string,
): BaseDeDatos {
  return {
    ...base,
    papelera: base.papelera.filter((e) => e.contrato.id !== contratoId),
  };
}

export function vaciarPapelera(base: BaseDeDatos): BaseDeDatos {
  return { ...base, papelera: [] };
}

/**
 * Quita de la papelera lo que ya pasó de los 30 días.
 *
 * Se ejecuta al abrir el programa. No hace falta un proceso en segundo plano:
 * lo que importa es que nada caducado siga apareciendo ni ocupando espacio.
 */
export function depurarPapelera(base: BaseDeDatos, ahora = new Date()): BaseDeDatos {
  const vigentes = base.papelera.filter((e) => !haCaducado(e, ahora));
  if (vigentes.length === base.papelera.length) return base;
  return { ...base, papelera: vigentes };
}

/** Entradas ordenadas de la más reciente a la más antigua. */
export function papeleraOrdenada(base: BaseDeDatos): EnPapelera[] {
  return [...base.papelera].sort(
    (a, b) => new Date(b.eliminadoEn).getTime() - new Date(a.eliminadoEn).getTime(),
  );
}
