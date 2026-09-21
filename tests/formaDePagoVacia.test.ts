/**
 * Qué pasa cuando el contrato no trae escrito el párrafo de FORMA DE PAGO.
 *
 * Un contrato recién creado lo trae vacío. Escribir esa cadena vacía sobre la
 * plantilla dejaba el párrafo en blanco y la tabla de pagos colgando sola
 * debajo, que es como salió el informe del 079-2025.
 */

import { describe, it, expect } from 'vitest';
import { calcularValores } from '../core/generar/valores';
import type { Contrato, Contratista, Cuota } from '../core/modelo/tipos';

const contratista: Contratista = {
  id: 'k1',
  nombre: 'PEDRO RAMIREZ LOPEZ',
  cedula: '12.345.678',
  expedidaEn: 'OLAYA HERRERA',
};

const CUOTAS: Cuota[] = [
  { n: 1, fecha: '2025-01-31', valor: 1_339_200 },
  { n: 2, fecha: '2025-02-28', valor: 1_761_000 },
  { n: 3, fecha: '2025-03-31', valor: 1_761_000 },
  { n: 4, fecha: '2025-04-30', valor: 1_761_000 },
  { n: 5, fecha: '2025-05-31', valor: 1_761_000 },
  { n: 6, fecha: '2025-06-30', valor: 1_761_000 },
];

function contrato(formaDePago: string, cuotas: Cuota[] = CUOTAS): Contrato {
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
    cuotas,
    adiciones: [],
    suspensiones: [],
    formaDePago,
    textoPlazo: '',
    contratante: 'MUNICIPIO OLAYA HERRERA',
    nitContratante: '800099113-1',
    municipio: 'Olaya Herrera',
    supervisor: { nombre: 'SUPERVISOR', cargo: 'CARGO' },
    cdp: { numero: '2025000022', fecha: '2025-01-02', valor: 10_494_000 },
    rp: { numero: '2025000024', fecha: '2025-01-02', valor: 10_144_200 },
    obligaciones: [],
    obligacionesSupervision: [],
    plantillaId: 'pl1',
    activo: true,
  };
}

const valoresDe = (c: Contrato) =>
  calcularValores({ contrato: c, contratista, anio: 2025, mes: 2 }).valores;

describe('FORMA DE PAGO sin escribir', () => {
  it('se redacta desde el cronograma en vez de quedar en blanco', () => {
    const texto = valoresDe(contrato('')).formaDePago ?? '';

    expect(texto).not.toBe('');
    expect(texto).toContain('DIEZ MILLONES CIENTO CUARENTA Y CUATRO MIL DOSCIENTOS PESOS');
    expect(texto).toContain('por medio seis (06) mensualidades vencidas');
    expect(texto).toContain('UN MILLÓN TRESCIENTOS TREINTA Y NUEVE MIL DOSCIENTOS PESOS');
    expect(texto).toContain('UN MILLÓN SETECIENTOS SESENTA Y UN MIL PESOS');
  });

  it('lo mismo si sólo trae espacios', () => {
    expect(valoresDe(contrato('   \n  ')).formaDePago).toContain('El Municipio cancelará');
  });

  it('lo escrito a mano manda sobre el cronograma', () => {
    const propio = 'El Municipio pagará como se pactó en el otrosí número dos.';
    expect(valoresDe(contrato(propio)).formaDePago).toBe(propio);
  });

  it('sin cronograma se deja sin dato, para conservar el texto de la plantilla', () => {
    // Un párrafo ajeno se ve y se corrige; uno en blanco pasa desapercibido
    // hasta que el documento está firmado.
    expect(valoresDe(contrato('', [])).formaDePago).toBeUndefined();
  });
});

describe('las dos erratas del balance siguen en blanco', () => {
  it('VALOR EJECUTADO y VALOR POR EJECUTAR de la columna izquierda', () => {
    // Estas sí se escriben vacías a propósito, así que el arreglo de arriba no
    // podía ser «saltarse todos los valores vacíos».
    const v = valoresDe(contrato(''));
    expect(v.valorEjecutadoTotal).toBe('');
    expect(v.valorPorEjecutarTotal).toBe('');
  });
});
