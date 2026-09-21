/**
 * Lo que se le pide a la IA para redactar obligaciones y actividades.
 *
 * Es lo mismo para Claude que para Gemini: el estilo del municipio, las reglas
 * de no inventar cifras ni fechas y los ejemplos reales son del documento, no
 * del proveedor. Tenerlo en un solo sitio evita que las dos IA acaben
 * redactando distinto porque se arregló una y se olvidó la otra.
 */

import type { Esquema } from './gemini';

export type Instrucciones = { sistema: string; usuario: string; esquema: Esquema };

export const ESQUEMA_ACTIVIDADES = {
  type: 'object',
  properties: {
    actividades: {
      type: 'array',
      items: { type: 'string' },
      description: 'Una actividad por obligación, en el mismo orden',
    },
  },
  required: ['actividades'],
  additionalProperties: false,
} as const;

export const ESQUEMA_OBLIGACIONES = {
  type: 'object',
  properties: {
    obligaciones: {
      type: 'array',
      items: { type: 'string' },
      description: 'Una obligación específica por elemento, sin numerar',
    },
  },
  required: ['obligaciones'],
  additionalProperties: false,
} as const;

/**
 * ACTIVIDADES EJECUTADAS. Se dan ejemplos reales de los informes del
 * municipio para que imite el registro, en vez de describirlo.
 */
export function instruccionesActividades(obligaciones: string[], impersonal: boolean): Instrucciones {
  const ejemplos = impersonal
    ? [
        'Obligación: "Prestar su colaboración en el desarrollo de las actividades que sean necesarias a fin de cumplir con los objetivos y metas propuestas en el plan de acción."\n' +
          'Actividad: "Se colaboró activamente en la ejecución y desarrollo de las actividades operativas y administrativas programadas en el Plan de Acción, contribuyendo al cumplimiento satisfactorio de las metas e indicadores establecidos para el periodo."',
        'Obligación: "Brindar apoyo en el seguimiento y control de las actividades del plan de acción."\n' +
          'Actividad: "Se brindó apoyo técnico y operativo en el seguimiento, monitoreo y control continuo del avance de las actividades del Plan de Acción, verificando el cumplimiento de cronogramas e identificando aspectos de mejora."',
      ]
    : [
        'Obligación: "Realizar labores de limpieza de cunetas y alcantarillas de las áreas asignadas."\n' +
          'Actividad: "Desarrolló jornadas de remoción de sedimentos, vegetación y material de arrastre en las cunetas y alcantarillas de los sectores asignados, garantizando la libre circulación de aguas pluviales."',
        'Obligación: "Informar de forma inmediata al supervisor del contrato de las afectaciones encontradas para su reparación."\n' +
          'Actividad: "Reportó de manera oportuna y mediante los canales institucionales al supervisor del contrato los hallazgos y afectaciones identificadas, facilitando la gestión inmediata de su reparación."',
      ];

  return {
    esquema: ESQUEMA_ACTIVIDADES,
    sistema:
      'Redactas la columna ACTIVIDADES EJECUTADAS de informes de contrato de una alcaldía ' +
      'colombiana. Cada actividad describe en pasado el cumplimiento de la obligación ' +
      'correspondiente, en registro administrativo formal, de una a tres líneas. ' +
      `Usa ${impersonal ? 'la forma impersonal ("Se prestó…", "Se ejecutaron…")' : 'la tercera persona ("Prestó…", "Ejecutó…")'}. ` +
      'No inventes cifras, fechas, lugares ni nombres que la obligación no mencione: ' +
      'describe el cumplimiento de lo pactado, nada más.\n\nEjemplos del estilo esperado:\n' +
      ejemplos.join('\n\n'),
    usuario:
      'Redacta una actividad ejecutada para cada una de estas obligaciones, ' +
      'en el mismo orden:\n\n' +
      obligaciones.map((o, i) => `${i + 1}. ${o}`).join('\n'),
  };
}

/**
 * OBLIGACIONES ESPECÍFICAS a partir de una indicación: una o dos de ejemplo,
 * y la IA completa el resto en el mismo registro y sobre el mismo oficio.
 */
export function instruccionesObligaciones(
  indicacion: string,
  cuantas: number,
  objeto?: string,
): Instrucciones {
  return {
    esquema: ESQUEMA_OBLIGACIONES,
    sistema:
      'Redactas las OBLIGACIONES ESPECÍFICAS de contratos de prestación de servicios de ' +
      'una alcaldía colombiana. Cada obligación empieza por un verbo en infinitivo ' +
      '("Realizar…", "Apoyar…", "Informar…"), va en registro administrativo formal y ' +
      'ocupa de una a tres líneas.\n\n' +
      'Reglas que no se rompen:\n' +
      '- No inventes cifras, fechas, lugares, nombres ni normas que la indicación no ' +
      'mencione. Describe deberes, no resultados concretos.\n' +
      '- No repitas dos obligaciones con el mismo contenido dicho de otra forma.\n' +
      '- Conserva literalmente las obligaciones que la persona ya haya escrito, en su ' +
      'mismo orden y al principio de la lista.\n' +
      '- Las últimas suelen ser las de rigor: acreditar la afiliación y pago al Sistema ' +
      'de Seguridad Social, y colaborar armónicamente con la administración.',
    usuario:
      (objeto ? `Objeto del contrato: ${objeto}\n\n` : '') +
      `Indicación de la persona:\n${indicacion}\n\n` +
      `Devuelve exactamente ${cuantas} obligaciones específicas para este contrato, ` +
      'empezando por las que ya están escritas arriba, tal cual, y completando el resto.',
  };
}
