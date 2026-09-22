/**
 * Las actividades en DETALLE DE LA EJECUCIÓN, la tabla del supervisor.
 *
 * El contratista escribe su informe en impersonal («Se apoyó…»); el supervisor
 * cuenta lo que hizo el contratista («Apoyó…»). Las dos tablas salen de la
 * misma lista, así que la segunda se convierte al generar.
 */

import { describe, it, expect } from 'vitest';
import { aTerceraPersona } from '../core/extraccion/redactarActividades';
import { llenarTablaObligaciones } from '../core/generar/tablas';
import type { Parte } from '../core/docx/mapaTexto';
import type { Contrato } from '../core/modelo/tipos';

describe('de impersonal a tercera persona', () => {
  it('los dos casos del informe real', () => {
    expect(
      aTerceraPersona(
        'Se apoyó operativamente en las labores de diagnóstico, cuidado, mantenimiento, reparación, distribución y organización de los sistemas de acueducto, contribuyendo a la adecuada prestación del servicio.',
      ),
    ).toBe(
      'Apoyó operativamente en las labores de diagnóstico, cuidado, mantenimiento, reparación, distribución y organización de los sistemas de acueducto, contribuyendo a la adecuada prestación del servicio.',
    );
    expect(
      aTerceraPersona(
        'Se brindó apoyo constante en la vigilancia y seguimiento de la red de distribución del acueducto, acatando las normas técnicas vigentes y las indicaciones impartidas por el supervisor.',
      ),
    ).toBe(
      'Brindó apoyo constante en la vigilancia y seguimiento de la red de distribución del acueducto, acatando las normas técnicas vigentes y las indicaciones impartidas por el supervisor.',
    );
  });

  it('el verbo en plural pasa a singular: ahora el sujeto es el contratista', () => {
    expect(aTerceraPersona('Se realizaron actividades de limpieza.')).toBe(
      'Realizó actividades de limpieza.',
    );
    expect(aTerceraPersona('Se ejecutaron las labores asignadas.')).toBe(
      'Ejecutó las labores asignadas.',
    );
    expect(aTerceraPersona('Se atendieron de forma diligente las demás.')).toBe(
      'Atendió de forma diligente las demás.',
    );
    expect(aTerceraPersona('Se construyeron dos cunetas.')).toBe('Construyó dos cunetas.');
  });

  it('también los irregulares', () => {
    expect(aTerceraPersona('Se hicieron los reportes.')).toBe('Hizo los reportes.');
    expect(aTerceraPersona('Se dio cumplimiento a lo pactado.')).toBe(
      'Dio cumplimiento a lo pactado.',
    );
    expect(aTerceraPersona('Se contribuyó al plan de acción.')).toBe(
      'Contribuyó al plan de acción.',
    );
  });

  it('con «le»: «Se le brindó» → «Le brindó»', () => {
    expect(aTerceraPersona('Se le brindó apoyo al supervisor.')).toBe(
      'Le brindó apoyo al supervisor.',
    );
  });

  it('no toca los verbos que llevan «se» de por sí', () => {
    expect(aTerceraPersona('Se reunió con el supervisor.')).toBe('Se reunió con el supervisor.');
    expect(aTerceraPersona('Se desplazó a las veredas.')).toBe('Se desplazó a las veredas.');
  });

  it('deja igual lo que ya está en tercera persona o no empieza por un verbo', () => {
    expect(aTerceraPersona('Apoyó en las labores.')).toBe('Apoyó en las labores.');
    expect(aTerceraPersona('Seguimiento de la red.')).toBe('Seguimiento de la red.');
    expect(aTerceraPersona('Se requiere revisar.')).toBe('Se requiere revisar.');
    expect(aTerceraPersona('')).toBe('');
  });
});

describe('en el documento', () => {
  /** Dos tablas de obligaciones, como el informe: la del contratista y la del supervisor. */
  function documento(): Parte[] {
    const celda = (t: string) => `<w:tc><w:p><w:r><w:t>${t}</w:t></w:r></w:p></w:tc>`;
    const fila = (cs: string[]) => `<w:tr>${cs.map(celda).join('')}</w:tr>`;
    const tabla =
      '<w:tbl>' +
      fila(['No.', 'OBLIGACIONES ESPECIFICAS', 'ACTIVIDADES EJECUTADAS']) +
      fila(['1.', 'Obligación de la plantilla', 'Actividad de la plantilla']) +
      '</w:tbl>';
    return [{ nombre: 'word/document.xml', xml: `<w:body>${tabla}<w:p/>${tabla}</w:body>` }];
  }

  it('la primera tabla en impersonal y la del supervisor en tercera persona', () => {
    const contrato = {
      obligaciones: [
        { n: 1, texto: 'Apoyar las labores del acueducto.', actividad: 'Se apoyó en las labores del acueducto.' },
        { n: 2, texto: 'Realizar actividades de limpieza.', actividad: 'Se realizaron actividades de limpieza.' },
      ],
      obligacionesSupervision: [],
    } as unknown as Contrato;

    const xml = llenarTablaObligaciones(documento(), contrato).partes[0].xml;
    const tablas = xml.split('</w:tbl>');
    expect(tablas[0]).toContain('Se apoyó en las labores del acueducto.');
    expect(tablas[0]).toContain('Se realizaron actividades de limpieza.');
    expect(tablas[1]).toContain('Apoyó en las labores del acueducto.');
    expect(tablas[1]).not.toContain('Se apoyó');
    expect(tablas[1]).toContain('Realizó actividades de limpieza.');
  });
});
