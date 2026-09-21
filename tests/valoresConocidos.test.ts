/**
 * Aprovechar los datos ya registrados para mapear la plantilla.
 *
 * Una plantilla es el documento de alguien, con su teléfono y su cédula
 * escritos dentro. Si esos datos ya están en el programa, no hace falta que
 * nadie los señale: se buscan y aparecen mapeados solos.
 *
 * Es la vía más fiable de las tres, porque compara con el dato exacto en vez
 * de adivinar por la forma. El teléfono es el caso claro: diez dígitos que por
 * su aspecto no se distinguen de una planilla PILA.
 */

import { describe, it, expect } from 'vitest';
import { valoresDelRegistro } from '../core/docx/valoresConocidos';
import type { Contrato, Contratista } from '../core/modelo/tipos';

const contratista: Contratista = {
  id: 'k1',
  nombre: 'PEDRO RAMIREZ LOPEZ',
  cedula: '10.456.789',
  expedidaEn: 'OLAYA HERRERA',
};

function contrato(parcial: Partial<Contrato> = {}): Contrato {
  return {
    id: 'c079',
    contratistaId: 'k1',
    numero: '079-2025',
    anio: 2025,
    objeto: 'PRESTACIÓN DE SERVICIOS DE APOYO A LA GESTIÓN PARA EL MANTENIMIENTO',
    fechaInicio: '2025-01-07',
    fechaTerminacion: '2025-06-30',
    fechaFirma: '2025-01-07',
    valorInicial: 10_144_200,
    cuotas: [],
    adiciones: [],
    suspensiones: [],
    formaDePago: '',
    textoPlazo: '',
    contratante: 'MUNICIPIO OLAYA HERRERA',
    nitContratante: '800099113-1',
    municipio: 'Olaya Herrera',
    telefono: '3007654321',
    numeroDeCuenta: '123456789013',
    supervisor: { nombre: 'SUPERVISOR', cargo: 'CARGO' },
    cdp: { numero: '2025000022', fecha: '2025-01-02', valor: 10_494_000 },
    rp: { numero: '2025000024', fecha: '2025-01-02', valor: 10_144_200 },
    obligaciones: [],
    obligacionesSupervision: [],
    plantillaId: '',
    activo: true,
    ...parcial,
  };
}

const base = (contratos: Contrato[] = [contrato()]) => ({
  contratos,
  contratistas: [contratista],
});

describe('datos que aparecen en la plantilla', () => {
  it('reconoce el teléfono, que por su forma no se distingue de una planilla', () => {
    const v = valoresDelRegistro('TELEFONO: 3007654321', base());
    expect(v.telefono).toBe('3007654321');
  });

  it('reconoce el número de cuenta', () => {
    const v = valoresDelRegistro('Número de cuenta: 123456789013', base());
    expect(v.numeroDeCuenta).toBe('123456789013');
  });

  it('reconoce varios datos a la vez', () => {
    const texto =
      'PEDRO RAMIREZ LOPEZ · C.C. 10.456.789 · CD 079-2025 · CDP 2025000022 · Tel 3007654321';
    const v = valoresDelRegistro(texto, base());

    expect(v.nombreContratista).toBe('PEDRO RAMIREZ LOPEZ');
    expect(v.cedula).toBe('10.456.789');
    expect(v.numeroContrato).toBe('079-2025');
    expect(v.cdpNumero).toBe('2025000022');
    expect(v.telefono).toBe('3007654321');
  });

  it('no inventa lo que no está en el documento', () => {
    const v = valoresDelRegistro('Un documento sin ninguno de esos datos.', base());
    expect(v).toEqual({});
  });
});

describe('cuidado con los falsos positivos', () => {
  it('ignora los valores demasiado cortos', () => {
    // Un «01» está en todas las fechas y marcaría medio informe.
    const v = valoresDelRegistro('01/01/2025', base([contrato({ telefono: '01' })]));
    expect(v.telefono).toBeUndefined();
  });

  it('un dato vacío no cuenta', () => {
    const v = valoresDelRegistro('cualquier cosa', base([contrato({ telefono: '   ' })]));
    expect(v.telefono).toBeUndefined();
  });
});

describe('con varios contratos', () => {
  it('gana el primero cuyo dato aparezca de verdad', () => {
    const otro = contrato({ id: 'c080', numero: '080-2025', telefono: '3001112233' });
    const v = valoresDelRegistro('TELEFONO: 3001112233', base([contrato(), otro]));

    // El teléfono del primero no está en el texto, así que se toma el del otro.
    expect(v.telefono).toBe('3001112233');
  });

  it('no se sabe de quién es la plantilla, y da igual: importa qué campo es', () => {
    const otro = contrato({ id: 'c080', numero: '080-2025' });
    const v = valoresDelRegistro('Tel 3007654321', base([contrato(), otro]));
    expect(v.telefono).toBe('3007654321');
  });

  it('sin contratos no revienta', () => {
    expect(valoresDelRegistro('texto', { contratos: [], contratistas: [] })).toEqual({});
  });
});
