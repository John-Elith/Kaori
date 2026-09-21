/**
 * Los nombres de los archivos generados.
 *
 * Se leen de un vistazo en el explorador de Windows, así que van en mayúsculas
 * y separados por espacios, con el nombre completo del contratista:
 *
 *   PEDRO RAMIREZ LOPEZ 079-2025 JUNIO.docx
 *   CUENTA DE COBRO PEDRO RAMIREZ LOPEZ 079-2025 JUNIO.docx
 *   CERTIFICADO DE CUMPLIMIENTO PEDRO RAMIREZ LOPEZ 079-2025.docx
 */

import { describe, it, expect } from 'vitest';
import {
  nombreDeCertificado,
  nombreDeDocumento,
  nombreLibre,
} from '../core/generar/nombreArchivo';
import type { Contrato, Contratista } from '../core/modelo/tipos';

const contratista: Contratista = {
  id: 'k1',
  nombre: 'PEDRO RAMIREZ LOPEZ',
  cedula: '10.456.789',
  expedidaEn: 'OLAYA HERRERA',
};

const contrato = { numero: '079-2025' } as Contrato;

describe('documentos mensuales', () => {
  it('el informe va sin prefijo: es el documento principal', () => {
    expect(nombreDeDocumento(contrato, contratista, 6)).toBe(
      'PEDRO RAMIREZ LOPEZ 079-2025 JUNIO.docx',
    );
  });

  it('la cuenta de cobro lleva el suyo delante', () => {
    expect(nombreDeDocumento(contrato, contratista, 6, 'CUENTA DE COBRO')).toBe(
      'CUENTA DE COBRO PEDRO RAMIREZ LOPEZ 079-2025 JUNIO.docx',
    );
  });

  it('todo en mayúsculas, venga como venga el nombre', () => {
    const enMinusculas = { ...contratista, nombre: 'pedro ramirez lopez' };
    expect(nombreDeDocumento(contrato, enMinusculas, 1)).toBe(
      'PEDRO RAMIREZ LOPEZ 079-2025 ENERO.docx',
    );
  });

  it('respeta las tildes y la eñe', () => {
    const conEñe = { ...contratista, nombre: 'MARÍA NÚÑEZ' };
    expect(nombreDeDocumento(contrato, conEñe, 3)).toBe('MARÍA NÚÑEZ 079-2025 MARZO.docx');
  });
});

describe('el certificado', () => {
  it('no lleva mes, porque hay uno por contrato', () => {
    expect(nombreDeCertificado(contrato, contratista)).toBe(
      'CERTIFICADO DE CUMPLIMIENTO PEDRO RAMIREZ LOPEZ 079-2025.docx',
    );
  });
});

describe('lo que Windows no admite', () => {
  it('quita las barras y los signos prohibidos', () => {
    const raro = { ...contrato, numero: '079/2025' } as Contrato;
    expect(nombreDeDocumento(raro, contratista, 6)).toBe(
      'PEDRO RAMIREZ LOPEZ 079 2025 JUNIO.docx',
    );
  });

  it('no deja espacios dobles ni sobrantes', () => {
    const sucio = { ...contratista, nombre: '  PEDRO   RAMIREZ  ' };
    expect(nombreDeDocumento(contrato, sucio, 6)).toBe('PEDRO RAMIREZ 079-2025 JUNIO.docx');
  });

  it('un contrato sin número no deja un hueco en el nombre', () => {
    const sinNumero = { ...contrato, numero: '' } as Contrato;
    expect(nombreDeDocumento(sinNumero, contratista, 6)).toBe(
      'PEDRO RAMIREZ LOPEZ JUNIO.docx',
    );
  });
});

describe('nombres repetidos', () => {
  it('numera el segundo en vez de sobrescribir el primero', () => {
    const usados = new Set<string>();
    const uno = nombreDeDocumento(contrato, contratista, 6);
    expect(nombreLibre(uno, usados)).toBe('PEDRO RAMIREZ LOPEZ 079-2025 JUNIO.docx');
    expect(nombreLibre(uno, usados)).toBe('PEDRO RAMIREZ LOPEZ 079-2025 JUNIO (2).docx');
  });
});
