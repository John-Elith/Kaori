/**
 * Generación de los tres documentos.
 *
 * Los tres comparten el mismo esqueleto —verificar el mapa, calcular los
 * valores, sustituir el texto— y se diferencian sólo en lo que viene después:
 * el informe rellena tablas y corta la página, el certificado reconstruye su
 * lista de actividades, y la cuenta de cobro no necesita nada más.
 *
 * `generarInforme` se deja intacto y se le delega desde aquí. Es el camino más
 * cubierto por pruebas del programa entero y no gana nada moviéndose.
 */

import { abrirDocx, guardarDocx } from '../docx/leerDocx';
import { sinHojasEnBlanco } from '../docx/paginacion';
import { aplicarReemplazos, construirMapa } from '../docx/mapaTexto';
import {
  construirReemplazos,
  verificarMapa,
  type MapaPlantilla,
  type ProblemaMapa,
} from '../docx/mapaPlantilla';
import type { TipoDocumento } from '../docx/campos';
import type { Contrato, Contratista } from '../modelo/tipos';
import { generarInforme, type ResultadoGeneracion } from './generarInforme';
import { calcularValoresCuenta, nombreArchivoCuenta } from './valoresCuenta';
import {
  calcularValoresCertificado,
  cierresDelCertificado,
  nombreArchivoCertificado,
} from './valoresCertificado';
import { aISO } from '../espanol/calendario';
import { llenarListaActividades } from './listas';
import type { DatosDelInforme } from './valores';

export type ResultadoDocumento = {
  contenido: Buffer;
  nombre: string;
  avisos: string[];
};

/** El tipo que declara una plantilla. Sin declarar, es la del informe. */
export function tipoDePlantilla(mapa: MapaPlantilla): TipoDocumento {
  return mapa.tipo ?? 'informe';
}

function describirProblemas(problemas: ProblemaMapa[]): string {
  const recortar = (s: string, largo = 40) =>
    s.length > largo ? `${s.slice(0, largo)}…` : s;
  return problemas
    .slice(0, 5)
    .map(
      (p) =>
        `  • ${p.campo}: se esperaba "${recortar(p.esperado)}" y hay "${recortar(p.encontrado)}"`,
    )
    .join('\n')
    .concat(problemas.length > 5 ? `\n  … y ${problemas.length - 5} más` : '');
}

/**
 * Las dos primeras fases, comunes a la cuenta y al certificado.
 *
 * El mapa debe seguir apuntando al mismo texto que cuando se creó: es
 * preferible fallar a producir un documento con los datos escritos en el sitio
 * equivocado.
 */
function sustituirCampos(
  plantillaDocx: Buffer,
  mapa: MapaPlantilla,
  valores: Parameters<typeof construirReemplazos>[1],
) {
  const doc = abrirDocx(plantillaDocx);

  const problemas = verificarMapa(mapa, doc.partes);
  if (problemas.length > 0) {
    throw new Error(
      `La plantilla "${mapa.nombre}" cambió desde que se mapeó y el mapa ya no coincide.\n` +
        `${describirProblemas(problemas)}\n\nVuelva a mapearla antes de generar.`,
    );
  }

  const mapaTexto = construirMapa(doc.partes);
  const partes = aplicarReemplazos(
    doc.partes,
    mapaTexto,
    construirReemplazos(mapa, valores),
  );

  // Los campos mapeados que se quedaron sin dato conservan el texto de la
  // plantilla; conviene decirlo, porque ese texto es de otro contrato.
  const sinDato = mapa.campos
    .map((c) => c.campo)
    .filter((id) => valores[id] === undefined && !id.startsWith('lista'));

  return { doc, partes, sinDato };
}

/** Cuenta de cobro de un contrato en un mes. */
export function generarCuentaDeCobro(opciones: {
  plantillaDocx: Buffer;
  mapa: MapaPlantilla;
  contrato: Contrato;
  contratista: Contratista;
  anio: number;
  mes: number;
}): ResultadoDocumento {
  const { plantillaDocx, mapa, contrato, contratista, anio, mes } = opciones;

  const { valores, avisos } = calcularValoresCuenta({ contrato, contratista, anio, mes });
  const { doc, partes, sinDato } = sustituirCampos(plantillaDocx, mapa, valores);

  if (sinDato.length > 0) {
    avisos.push(
      `Estos campos están mapeados pero no tienen dato y quedaron con el texto ` +
        `de la plantilla: ${sinDato.join(', ')}.`,
    );
  }

  return {
    contenido: guardarDocx(doc, sinHojasEnBlanco(partes)),
    nombre: nombreArchivoCuenta(contrato, contratista, anio, mes),
    avisos,
  };
}

/** Certificado de cumplimiento de un contrato. Uno solo, al terminar. */
export function generarCertificado(opciones: {
  plantillaDocx: Buffer;
  mapa: MapaPlantilla;
  contrato: Contrato;
  contratista: Contratista;
  departamentoPorDefecto?: string;
  /** Hasta cuándo certifica, en ISO. Sin esto, hasta el final del contrato. */
  hasta?: string;
}): ResultadoDocumento {
  const { plantillaDocx, mapa, contrato, contratista } = opciones;

  const { valores, actividades, fechaExpedicion, avisos } = calcularValoresCertificado({
    contrato,
    contratista,
    departamentoPorDefecto: opciones.departamentoPorDefecto,
    hasta: opciones.hasta,
  });

  // Sólo los certificados parciales llevan el mes en el nombre.
  const cierres = cierresDelCertificado(contrato);
  const esElUltimo =
    cierres.length === 0 || cierres[cierres.length - 1].hasta === aISO(fechaExpedicion);
  const { doc, partes, sinDato } = sustituirCampos(plantillaDocx, mapa, valores);

  if (sinDato.length > 0) {
    avisos.push(
      `Estos campos están mapeados pero no tienen dato y quedaron con el texto ` +
        `de la plantilla: ${sinDato.join(', ')}.`,
    );
  }

  // La lista va después de los campos, igual que las tablas del informe: al
  // cambiar el número de párrafos corre todo lo que viene detrás, así que los
  // offsets del mapa dejarían de valer.
  const conLista = llenarListaActividades(partes, actividades);
  if (conLista.avisos.length > 0) avisos.push(...conLista.avisos);

  return {
    contenido: guardarDocx(doc, sinHojasEnBlanco(conLista.partes)),
    nombre: nombreArchivoCertificado(
      contrato,
      contratista,
      esElUltimo ? undefined : fechaExpedicion.mes,
    ),
    avisos,
  };
}

/**
 * Genera el documento que corresponda al tipo de la plantilla.
 *
 * `datos` trae el mes porque lo necesitan el informe y la cuenta; el
 * certificado sencillamente lo ignora.
 */
export function generarDocumento(opciones: {
  plantillaDocx: Buffer;
  mapa: MapaPlantilla;
  datos: DatosDelInforme;
  departamentoPorDefecto?: string;
}): ResultadoDocumento | ResultadoGeneracion {
  const { plantillaDocx, mapa, datos } = opciones;

  switch (tipoDePlantilla(mapa)) {
    case 'cuentaDeCobro':
      return generarCuentaDeCobro({
        plantillaDocx,
        mapa,
        contrato: datos.contrato,
        contratista: datos.contratista,
        anio: datos.anio,
        mes: datos.mes,
      });

    case 'certificado':
      return generarCertificado({
        plantillaDocx,
        mapa,
        contrato: datos.contrato,
        contratista: datos.contratista,
        departamentoPorDefecto: opciones.departamentoPorDefecto,
      });

    default:
      return generarInforme({ plantillaDocx, mapa, datos });
  }
}
