/**
 * Contrato nuevo de la misma persona con los datos del anterior.
 *
 * El caso de todos los semestres: el 084-2025 fue de enero a junio; el
 * siguiente, de julio a diciembre, lleva el mismo objeto, las mismas
 * obligaciones y el mismo sueldo, pero otro número, otras fechas y otro CDP.
 */

import { describe, it, expect } from 'vitest';
import {
  cuotasProrrateadas,
  heredarDeContrato,
  mensualidadHabitual,
} from '../core/modelo/heredarContrato';
import type { Contrato } from '../core/modelo/tipos';

const anterior: Contrato = {
  id: 'c084',
  contratistaId: 'k1',
  numero: '084-2025',
  anio: 2025,
  objeto: 'PRESTACIÓN DE SERVICIOS DE APOYO EN EL CUIDO DEL ACUEDUCTO.',
  fechaInicio: '2025-01-07',
  fechaTerminacion: '2025-06-30',
  fechaFirma: '2025-01-07',
  valorInicial: 9_413_400,
  cuotas: [
    { n: 1, fecha: '2025-01-31', valor: 1_298_400 },
    { n: 2, fecha: '2025-02-28', valor: 1_623_000 },
    { n: 3, fecha: '2025-03-31', valor: 1_623_000 },
    { n: 4, fecha: '2025-04-30', valor: 1_623_000 },
    { n: 5, fecha: '2025-05-31', valor: 1_623_000 },
    { n: 6, fecha: '2025-06-30', valor: 1_623_000 },
  ],
  adiciones: [{ id: 'a1', fecha: '2025-06-01', valor: 500_000, cuotasAgregadas: [] }],
  suspensiones: [{ id: 's1', desde: '2025-03-01', hasta: '2025-03-10', motivo: 'Lluvias' }],
  formaDePago: 'El Municipio cancelará al contratista la suma de NUEVE MILLONES… enero…',
  textoPlazo: 'DESDE EL DÍA SIETE (07) DE ENERO DEL AÑO DOS MIL VEINTICINCO (2025), HASTA EL DÍA TREINTA (30) DE JUNIO DEL MISMO AÑO.',
  contratante: 'MUNICIPIO OLAYA HERRERA',
  nitContratante: '800099113-1',
  municipio: 'Olaya Herrera',
  departamento: 'Nariño',
  telefono: '3001234567',
  numeroDeCuenta: '123456789012',
  supervisor: { nombre: 'MANUEL ENRIQUE SALAZAR PEREZ', cargo: 'Secretario de Planeación' },
  cdp: { numero: '2025000027', fecha: '2025-01-02', valor: 9_413_400 },
  rp: { numero: '2025000029', fecha: '2025-01-07', valor: 9_413_400 },
  obligaciones: [
    { n: 1, texto: 'Limpiar las redes del acueducto.', actividad: 'Se limpiaron las redes.' },
    { n: 2, texto: 'Reportar daños.', actividad: 'Se reportaron los daños.' },
  ],
  obligacionesSupervision: [{ n: 1, texto: 'Vigilar la ejecución.' }],
  plantillaId: 'pl-informe',
  plantillaCuentaId: 'pl-cuenta',
  plantillaCertificadoId: 'pl-cert',
  activo: true,
};

/** El contrato nuevo tal como queda al escribirle número, fechas y CDP. */
function nuevo(parcial: Partial<Contrato> = {}): Contrato {
  return {
    ...anterior,
    id: 'c200',
    numero: '200-2025',
    fechaInicio: '2025-07-01',
    fechaTerminacion: '2025-12-31',
    fechaFirma: '2025-07-01',
    valorInicial: 0,
    cuotas: [],
    adiciones: [],
    suspensiones: [],
    objeto: '',
    formaDePago: '',
    textoPlazo: '',
    obligaciones: [],
    obligacionesSupervision: [],
    telefono: undefined,
    numeroDeCuenta: undefined,
    plantillaId: '',
    plantillaCuentaId: undefined,
    plantillaCertificadoId: undefined,
    cdp: { numero: '2025000080', fecha: '2025-07-01', valor: 9_738_000 },
    rp: { numero: '2025000073', fecha: '2025-07-01', valor: 9_738_000 },
    ...parcial,
  };
}

describe('lo que se copia y lo que no', () => {
  const r = heredarDeContrato(nuevo(), anterior);

  it('conserva lo propio del contrato nuevo', () => {
    expect(r.id).toBe('c200');
    expect(r.numero).toBe('200-2025');
    expect(r.fechaInicio).toBe('2025-07-01');
    expect(r.fechaTerminacion).toBe('2025-12-31');
    expect(r.fechaFirma).toBe('2025-07-01');
    expect(r.cdp).toEqual({ numero: '2025000080', fecha: '2025-07-01', valor: 9_738_000 });
    expect(r.rp).toEqual({ numero: '2025000073', fecha: '2025-07-01', valor: 9_738_000 });
  });

  it('no arrastra las novedades del anterior', () => {
    expect(r.adiciones).toEqual([]);
    expect(r.suspensiones).toEqual([]);
  });

  it('copia el objeto, las obligaciones con sus actividades y el resto', () => {
    expect(r.objeto).toBe(anterior.objeto);
    expect(r.obligaciones).toEqual(anterior.obligaciones);
    expect(r.obligacionesSupervision).toEqual(anterior.obligacionesSupervision);
    expect(r.supervisor).toEqual(anterior.supervisor);
    expect(r.telefono).toBe('3001234567');
    expect(r.numeroDeCuenta).toBe('123456789012');
    expect([r.plantillaId, r.plantillaCuentaId, r.plantillaCertificadoId]).toEqual([
      'pl-informe',
      'pl-cuenta',
      'pl-cert',
    ]);
  });

  it('las obligaciones son copias: cambiar las del nuevo no toca el anterior', () => {
    r.obligaciones[0].texto = 'Cambiada';
    expect(anterior.obligaciones[0].texto).toBe('Limpiar las redes del acueducto.');
  });
});

describe('el sueldo, repartido con las fechas nuevas', () => {
  it('la mensualidad es la cuota que más se repite, no la primera', () => {
    expect(mensualidadHabitual(anterior.cuotas)).toBe(1_623_000);
  });

  it('de julio a diciembre, seis meses completos', () => {
    const r = heredarDeContrato(nuevo(), anterior);
    expect(r.cuotas.map((c) => c.valor)).toEqual(Array(6).fill(1_623_000));
    expect(r.valorInicial).toBe(9_738_000);
  });

  it('empezando a mitad de mes, el primero en proporción sobre 30 días', () => {
    // Igual que el 084-2025: del 7 de enero, 24 días → 1.298.400.
    const c = cuotasProrrateadas('2025-01-07', '2025-06-30', 1_623_000);
    expect(c[0].valor).toBe(1_298_400);
    expect(c.slice(1).every((x) => x.valor === 1_623_000)).toBe(true);
    expect(c.reduce((s, x) => s + x.valor, 0)).toBe(9_413_400);
  });

  it('terminando a mitad de mes, el último también en proporción', () => {
    const c = cuotasProrrateadas('2025-07-01', '2025-12-15', 1_623_000);
    expect(c.at(-1)).toEqual({ n: 6, fecha: '2025-12-15', valor: 811_500 });
  });

  it('un contrato de días sueltos dentro de un mes', () => {
    const c = cuotasProrrateadas('2025-08-11', '2025-08-25', 1_623_000);
    expect(c).toEqual([{ n: 1, fecha: '2025-08-25', valor: 811_500 }]);
  });

  it('si el anterior no tenía cronograma, no se inventa ninguno', () => {
    const r = heredarDeContrato(nuevo({ valorInicial: 5_000_000 }), { ...anterior, cuotas: [] });
    expect(r.cuotas).toEqual([]);
    expect(r.valorInicial).toBe(5_000_000);
  });
});

describe('el plazo y la forma de pago, con las fechas nuevas', () => {
  const r = heredarDeContrato(nuevo(), anterior);

  it('el plazo dice las fechas del contrato nuevo, no las del anterior', () => {
    expect(r.textoPlazo).toBe(
      'DESDE EL DÍA PRIMERO (01) DE JULIO DEL AÑO DOS MIL VEINTICINCO (2025), HASTA EL DÍA TREINTA Y UN (31) DE DICIEMBRE DEL MISMO AÑO.',
    );
    expect(r.textoPlazo).not.toContain('ENERO');
  });

  it('respeta si se escribía en frase normal', () => {
    const r2 = heredarDeContrato(nuevo(), { ...anterior, textoPlazo: 'Desde el día siete de enero…' });
    expect(r2.textoPlazo.startsWith('Desde el día primero (01) de julio')).toBe(true);
  });

  it('la forma de pago cuenta el valor y las cuotas nuevas', () => {
    expect(r.formaDePago).toContain('NUEVE MILLONES SETECIENTOS TREINTA Y OCHO MIL');
    expect(r.formaDePago).not.toContain('enero');
  });

  it('si el anterior no tenía plazo ni forma de pago escritos, quedan vacíos', () => {
    const r2 = heredarDeContrato(nuevo(), { ...anterior, textoPlazo: '', formaDePago: '' });
    expect(r2.textoPlazo).toBe('');
    expect(r2.formaDePago).toBe('');
  });
});
