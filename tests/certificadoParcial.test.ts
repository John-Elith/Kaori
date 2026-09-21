/**
 * Certificados con cierre anterior al fin del contrato.
 *
 * Se puede acreditar lo cumplido hasta un mes concreto mientras el contrato
 * sigue en curso. Lo importante es que el periodo y la frase de expedición se
 * muevan **juntos**: certificar hasta marzo con fecha de junio no querría decir
 * nada.
 */

import { describe, it, expect } from 'vitest';
import {
  calcularValoresCertificado,
  cierresDelCertificado,
  nombreArchivoCertificado,
} from '../core/generar/valoresCertificado';
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
    objeto: 'PRESTACIÓN DE SERVICIOS',
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
    departamento: 'Nariño',
    supervisor: { nombre: 'SUPERVISOR', cargo: 'CARGO' },
    cdp: { numero: '2025000022', fecha: '2025-01-02', valor: 10_494_000 },
    rp: { numero: '2025000024', fecha: '2025-01-02', valor: 10_144_200 },
    obligaciones: [{ n: 1, texto: 'Una obligación.' }],
    obligacionesSupervision: [],
    plantillaId: 'pl1',
    activo: true,
    ...parcial,
  };
}

describe('los cierres que se ofrecen', () => {
  it('uno por mes del contrato', () => {
    const c = cierresDelCertificado(contrato());
    expect(c.map((x) => x.mes)).toEqual([1, 2, 3, 4, 5, 6]);
  });

  it('cada mes cierra su último día, salvo el de terminación', () => {
    const c = cierresDelCertificado(contrato());
    expect(c[0].hasta).toBe('2025-01-31');
    expect(c[1].hasta).toBe('2025-02-28');
    // Junio cierra el 30 porque ahí termina el contrato, no el 30 por ser junio.
    expect(c.at(-1)!.hasta).toBe('2025-06-30');
  });

  it('un contrato que acaba a mitad de mes cierra ese día', () => {
    const c = cierresDelCertificado(contrato({ fechaTerminacion: '2025-06-15' }));
    expect(c.at(-1)!.hasta).toBe('2025-06-15');
  });

  it('una prórroga añade los meses nuevos', () => {
    const c = cierresDelCertificado(
      contrato({
        adiciones: [
          {
            id: 'a1',
            fecha: '2025-06-01',
            valor: 0,
            nuevaFechaTerminacion: '2025-08-31',
            cuotasAgregadas: [],
          },
        ],
      }),
    );
    expect(c.at(-1)!.mes).toBe(8);
  });
});

describe('el certificado completo', () => {
  const r = () => calcularValoresCertificado({ contrato: contrato(), contratista });

  it('cubre hasta el final del contrato', () => {
    expect(r().valores.certificadoPeriodo).toContain(
      'hasta el día treinta (30) de junio del año dos mil veinticinco (2025)',
    );
    expect(r().valores.certificadoExpedicion).toContain('del mes de junio');
  });

  it('su archivo no lleva mes', () => {
    expect(nombreArchivoCertificado(contrato(), contratista)).toBe(
      'CERTIFICADO DE CUMPLIMIENTO PEDRO RAMIREZ LOPEZ 079-2025.docx',
    );
  });
});

describe('el certificado parcial', () => {
  const r = () =>
    calcularValoresCertificado({
      contrato: contrato(),
      contratista,
      hasta: '2025-03-31',
    });

  it('el periodo llega sólo hasta ese mes', () => {
    expect(r().valores.certificadoPeriodo).toBe(
      'Entre el periodo comprendido desde el día siete (07) de enero hasta el día treinta y un (31) de marzo del año dos mil veinticinco (2025).',
    );
  });

  it('y se expide con esa misma fecha, no con la del contrato', () => {
    // Es lo que hace que el documento diga algo coherente: certificar hasta
    // marzo firmando en junio no querría decir nada.
    expect(r().valores.certificadoExpedicion).toBe(
      'Se expide en Olaya Herrera (Nariño), a los treinta y un (31) días del mes de marzo del año dos mil veinticinco (2025).',
    );
  });

  it('la fecha de expedición que devuelve es la del cierre', () => {
    expect(r().fechaExpedicion).toEqual({ anio: 2025, mes: 3, dia: 31 });
  });

  it('su archivo lleva el mes, para no pisar al del contrato entero', () => {
    expect(nombreArchivoCertificado(contrato(), contratista, 3)).toBe(
      'CERTIFICADO DE CUMPLIMIENTO PEDRO RAMIREZ LOPEZ 079-2025 MARZO.docx',
    );
  });
});
