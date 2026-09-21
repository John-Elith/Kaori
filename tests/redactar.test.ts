import { describe, it, expect } from 'vitest';
import {
  aPreterito,
  redactarActividad,
  completarActividades,
} from '../core/extraccion/redactarActividades';

describe('aPreterito', () => {
  it('conjuga verbos regulares en -ar', () => {
    expect(aPreterito('prestar')).toBe('prestó');
    expect(aPreterito('brindar')).toBe('brindó');
    expect(aPreterito('acreditar')).toBe('acreditó');
    expect(aPreterito('colaborar')).toBe('colaboró');
    expect(aPreterito('realizar', true)).toBe('realizaron');
    expect(aPreterito('presentar', true)).toBe('presentaron');
  });

  it('conjuga verbos regulares en -er / -ir', () => {
    expect(aPreterito('comer')).toBe('comió');
    expect(aPreterito('permitir')).toBe('permitió');
    expect(aPreterito('recibir', true)).toBe('recibieron');
  });

  it('conoce los irregulares frecuentes', () => {
    expect(aPreterito('hacer')).toBe('hizo');
    expect(aPreterito('hacer', true)).toBe('hicieron');
    expect(aPreterito('tener')).toBe('tuvo');
    expect(aPreterito('mantener')).toBe('mantuvo');
    expect(aPreterito('contribuir')).toBe('contribuyó');
  });

  it('devuelve null si no parece un infinitivo', () => {
    expect(aPreterito('casa')).toBeNull();
    expect(aPreterito('rápido')).toBeNull();
  });
});

describe('redactarActividad', () => {
  // Obligaciones textuales del contrato 078-2025.
  it('convierte la obligación en actividad, forma impersonal', () => {
    expect(redactarActividad('Prestar su colaboración en el desarrollo de las actividades')).toBe(
      'Se prestó colaboración en el desarrollo de las actividades.',
    );
  });

  it('elimina el posesivo y concuerda el verbo con el objeto', () => {
    // El informe real dice «Se prestaron los servicios contratados…»: en la
    // pasiva refleja el verbo va en plural porque "servicios" lo está.
    const r = redactarActividad('Prestar sus servicios en los términos de este contrato');
    expect(r).toBe('Se prestaron servicios en los términos de este contrato.');
    expect(r).not.toContain('sus');
  });

  it('usa el plural cuando la obligación habla de varias cosas', () => {
    const r = redactarActividad('Realizar actividades de limpieza de las redes');
    expect(r).toBe('Se realizaron actividades de limpieza de las redes.');
  });

  it('produce la forma personal para el informe de supervisión', () => {
    const r = redactarActividad('Realizar labores de limpieza de cunetas', false);
    expect(r).toBe('Realizaron labores de limpieza de cunetas.');
  });

  it('maneja "Y las demás inherentes al objeto contractual"', () => {
    const r = redactarActividad('Y las demás inherentes al objeto contractual pactado.');
    expect(r).toContain('Se atendieron');
    expect(r).toContain('las demás inherentes al objeto contractual pactado.');
  });

  it('no inventa cuando no reconoce el verbo', () => {
    const r = redactarActividad('Disponibilidad permanente durante la vigencia');
    expect(r).toContain('Se dio cumplimiento a lo relativo a:');
    expect(r).toContain('disponibilidad permanente durante la vigencia');
  });

  it('no duplica el punto final', () => {
    expect(redactarActividad('Brindar apoyo en el seguimiento.')).toBe(
      'Se brindó apoyo en el seguimiento.',
    );
  });

  it('devuelve cadena vacía ante una obligación vacía', () => {
    expect(redactarActividad('   ')).toBe('');
  });
});

describe('completarActividades', () => {
  it('respeta las actividades ya redactadas y sólo completa las que faltan', () => {
    const r = completarActividades([
      { n: 1, texto: 'Prestar su colaboración en el plan', actividad: 'Texto ya escrito a mano' },
      { n: 2, texto: 'Brindar apoyo en el seguimiento y control' },
      { n: 3, texto: 'Documentar procedimientos', actividad: '' },
    ]);

    expect(r[0]).toBe('Texto ya escrito a mano');
    expect(r[1]).toBe('Se brindó apoyo en el seguimiento y control.');
    expect(r[2]).toContain('Se documentaron');
  });
});
