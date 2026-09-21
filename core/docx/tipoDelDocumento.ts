/**
 * Reconocer qué documento es un .docx por lo que dice.
 *
 * Al subir una plantilla hay que decir de cuál de los tres documentos se trata,
 * porque de ello depende qué rótulos busca el programa dentro. Pedirlo en un
 * desplegable y confiar en que nadie se equivoque no funciona: el desplegable
 * empieza en «Informe», está arriba del todo y se pasa por alto, y entonces el
 * certificado se registra como informe y no detecta ninguno de sus campos.
 *
 * Los tres documentos son inconfundibles por su texto, así que se olfatea y se
 * usa lo que diga el documento. Es la misma idea que el resto del programa: el
 * texto real manda sobre lo que se supone.
 */

import type { TipoDocumento } from './campos';

/** Marcas que identifican cada documento, con su peso. */
const SEÑALES: { tipo: TipoDocumento; patron: RegExp; peso: number }[] = [
  // Cuenta de cobro
  { tipo: 'cuentaDeCobro', patron: /CUENTA\s+DE\s+COBRO/i, peso: 3 },
  { tipo: 'cuentaDeCobro', patron: /^\s*DEBE\s+A:?\s*$/im, peso: 3 },
  { tipo: 'cuentaDeCobro', patron: /POR\s+CONCEPTO\s+DE:/i, peso: 3 },
  { tipo: 'cuentaDeCobro', patron: /VALOR\s+EN\s+LETRAS:/i, peso: 2 },
  { tipo: 'cuentaDeCobro', patron: /CIUDAD\s+Y\s+FECHA:/i, peso: 2 },
  { tipo: 'cuentaDeCobro', patron: /N[úu]mero\s+de\s+cuenta:/i, peso: 2 },

  // Certificado de cumplimiento
  { tipo: 'certificado', patron: /CERTIFICADO\s+DE\s+CUMPLIMIENTO/i, peso: 3 },
  { tipo: 'certificado', patron: /HACE\s+CONSTAR/i, peso: 3 },
  { tipo: 'certificado', patron: /Cumpli[óo]\s+satisfactoriamente/i, peso: 3 },
  { tipo: 'certificado', patron: /siguientes\s+actividades/i, peso: 2 },
  { tipo: 'certificado', patron: /Se\s+expide\s+en\s/i, peso: 1 },

  // Informe de actividad y supervisión
  { tipo: 'informe', patron: /INFORME\s+DE\s+SUPERVISI[ÓO]N/i, peso: 3 },
  { tipo: 'informe', patron: /INFORME\s+DE\s+ACTIVIDAD/i, peso: 3 },
  { tipo: 'informe', patron: /ELEMENTOS\s+DE\s+ORDEN\s+ADMINISTRATIVO/i, peso: 3 },
  { tipo: 'informe', patron: /OBLIGACIONES\s+ESPEC[ÍI]FICAS/i, peso: 2 },
  { tipo: 'informe', patron: /PERIODO\s+DEL\s+INFORME/i, peso: 2 },
  { tipo: 'informe', patron: /N[ÚU]MERO\s+DE\s+PLANILLA/i, peso: 2 },
];

export type Olfateo = {
  tipo: TipoDocumento;
  /** Con qué seguridad. Sin ninguna señal, «ninguna». */
  confianza: 'alta' | 'media' | 'ninguna';
  /** Qué se encontró en el documento, para poder explicárselo a la persona. */
  motivos: string[];
};

/**
 * Deduce de qué documento es una plantilla a partir de su texto.
 *
 * Se suman pesos en vez de quedarse con la primera coincidencia porque los tres
 * documentos comparten frases: el certificado nombra el contrato, y el informe
 * lleva una tabla con la palabra VALOR igual que la cuenta de cobro. Gana el
 * que más señales propias reúna.
 *
 * Sin ninguna señal se devuelve `informe`, que es lo que había antes de que
 * existieran los otros dos y sigue siendo el caso corriente, pero con la
 * confianza en «ninguna» para que la interfaz no presuma.
 */
export function olfatearTipo(texto: string): Olfateo {
  const puntos: Record<TipoDocumento, number> = {
    informe: 0,
    cuentaDeCobro: 0,
    certificado: 0,
  };
  const motivos: Record<TipoDocumento, string[]> = {
    informe: [],
    cuentaDeCobro: [],
    certificado: [],
  };

  for (const s of SEÑALES) {
    const m = s.patron.exec(texto);
    if (!m) continue;
    puntos[s.tipo] += s.peso;
    motivos[s.tipo].push(m[0].trim().replace(/\s+/g, ' '));
  }

  const orden = (Object.keys(puntos) as TipoDocumento[]).sort(
    (a, b) => puntos[b] - puntos[a],
  );
  const ganador = orden[0];
  const segundo = orden[1];

  if (puntos[ganador] === 0) {
    return { tipo: 'informe', confianza: 'ninguna', motivos: [] };
  }

  // Doblar al siguiente es la diferencia entre «lo dice el documento» y «se
  // parece un poco más a esto que a lo otro».
  const contundente = puntos[ganador] >= 5 && puntos[ganador] >= puntos[segundo] * 2;

  return {
    tipo: ganador,
    confianza: contundente ? 'alta' : 'media',
    motivos: motivos[ganador].slice(0, 3),
  };
}
