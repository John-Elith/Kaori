/**
 * Orquestación de la generación: plantilla + datos → archivo .docx.
 */

import { abrirDocx, guardarDocx } from '../docx/leerDocx';
import { construirMapa } from '../docx/mapaTexto';
import { aplicarReemplazos } from '../docx/mapaTexto';
import {
  construirReemplazos,
  verificarMapa,
  type MapaPlantilla,
  type ProblemaMapa,
} from '../docx/mapaPlantilla';
import { calcularValores, nombreArchivo, type DatosDelInforme } from './valores';
import {
  llenarTablaBalance,
  llenarTablaObligaciones,
  llenarTablaPagos,
  llenarTablaPagosEfectuados,
  llenarTablaPlanilla,
} from './tablas';
import { resaltarImportes } from './resaltado';
import type { Fragmento } from '../docx/mapaTexto';
import type { CampoId } from '../docx/campos';
import type { BalanceDelMes } from '../pagos/cronograma';

export type ResultadoGeneracion = {
  /** Contenido del .docx listo para escribir a disco */
  contenido: Buffer;
  /** Nombre sugerido del archivo */
  nombre: string;
  balance: BalanceDelMes;
  /** Avisos no fatales para mostrar al usuario */
  avisos: string[];
};

export type OpcionesGeneracion = {
  /** Bytes del .docx de la plantilla, ya normalizado */
  plantillaDocx: Buffer;
  mapa: MapaPlantilla;
  datos: DatosDelInforme;
  /**
   * Si es `true`, un desajuste entre el mapa y la plantilla aborta la
   * generación. Por defecto sí: es preferible fallar a producir un informe con
   * los datos escritos en el lugar equivocado.
   */
  estricto?: boolean;
};

export function generarInforme(opciones: OpcionesGeneracion): ResultadoGeneracion {
  const { plantillaDocx, mapa, datos } = opciones;
  const estricto = opciones.estricto ?? true;
  const avisos: string[] = [];

  const doc = abrirDocx(plantillaDocx);

  // 1. El mapa debe seguir apuntando al mismo texto que cuando se creó.
  const problemas = verificarMapa(mapa, doc.partes);
  if (problemas.length > 0) {
    const detalle = describirProblemas(problemas);
    if (estricto) {
      throw new Error(
        `La plantilla "${mapa.nombre}" cambió desde que se mapeó y el mapa ya no coincide.\n` +
          `${detalle}\n\nVuelva a mapear la plantilla antes de generar informes.`,
      );
    }
    avisos.push(`El mapa no coincide del todo con la plantilla:\n${detalle}`);
  }

  // 2. Calcular el texto de cada campo.
  const { valores, balance } = calcularValores({
    ...datos,
    variantePeriodo: datos.variantePeriodo ?? mapa.variantePeriodo,
  });

  // 3. Avisar de campos mapeados que se quedaron sin dato.
  const mapeados = mapa.campos.map((c) => c.campo);
  const sinDato = mapeados.filter(
    (id) => valores[id] === undefined && !id.startsWith('tabla'),
  );
  if (sinDato.length > 0) {
    avisos.push(
      `Estos campos están mapeados pero no tienen dato y quedaron con el texto de la plantilla: ${sinDato.join(', ')}.`,
    );
  }

  // 4. Reemplazos de campo, PRIMERO.
  //
  //    El orden importa y no es intercambiable. Los offsets del mapa se
  //    calcularon sobre la plantilla original, así que sólo son válidos mientras
  //    el documento siga intacto. Rellenar antes las tablas de obligaciones
  //    cambiaría el número de filas —el contrato 078 tiene doce y el 084 nueve—
  //    y correría todo el texto posterior: los campos se escribirían en el sitio
  //    equivocado, o directamente fuera del documento.
  //    FORMA DE PAGO es el único campo que necesita formato propio: es un
  //    párrafo que Kaori redacta entero, así que no hay nada de qué heredarlo,
  //    y en los informes reales los importes van en negrita.
  const conFormato: Partial<Record<CampoId, Fragmento[]>> = {};
  if (valores.formaDePago) conFormato.formaDePago = resaltarImportes(valores.formaDePago);

  const mapaTexto = construirMapa(doc.partes);
  const reemplazos = construirReemplazos(mapa, valores, conFormato);
  const conCampos = aplicarReemplazos(doc.partes, mapaTexto, reemplazos);

  // 5. Y las tablas después. Este paso no usa offsets guardados: localiza las
  //    tablas recorriendo el XML en el momento, así que le da igual que el
  //    documento ya se haya modificado.
  const conObligaciones = llenarTablaObligaciones(conCampos, datos.contrato);
  if (conObligaciones.avisos.length > 0) avisos.push(...conObligaciones.avisos);

  const conTablas = llenarTablaPagos(conObligaciones.partes, datos.contrato.cuotas);
  if (conTablas.avisos.length > 0) avisos.push(...conTablas.avisos);

  // La relación de pagos efectuados: un renglón por mes transcurrido, no sólo
  // el del mes. Es el histórico que justifica el TOTAL PAGADO de debajo.
  const conPagos = llenarTablaPagosEfectuados(
    conTablas.partes,
    datos.contrato,
    datos.anio,
    datos.mes,
  );
  if (conPagos.avisos.length > 0) avisos.push(...conPagos.avisos);

  // Y el balance de recursos. Va por posición de celda y no por el mapeo
  // porque esas casillas pueden venir vacías en la plantilla: sin texto que
  // reemplazar, el mapeo no tenía dónde escribir y el balance salía en blanco.
  const conBalance = llenarTablaBalance(conPagos.partes, balance);
  if (conBalance.avisos.length > 0) avisos.push(...conBalance.avisos);

  // Y la planilla del mes. Sin planilla la fila queda vacía, que es lo correcto:
  // dejar la de la plantilla sería publicar el número de seguridad social de
  // otro contratista en un documento que se firma.
  const conPlanilla = llenarTablaPlanilla(conBalance.partes, datos.planilla);
  if (conPlanilla.avisos.length > 0) avisos.push(...conPlanilla.avisos);

  // No se toca la paginación.
  //
  // Hubo aquí un paso que metía un salto de página antes del INFORME DE
  // SUPERVISIÓN, para que cada informe empezara en su hoja. Estaba de más y
  // hacía daño: la plantilla del municipio no lleva ni un solo salto —la
  // separación sale sola porque el primer informe llena la página— así que el
  // salto añadido caía sobre una página que ya terminaba y dejaba una hoja en
  // blanco de por medio.
  //
  // Dónde parte Word una página no se puede saber leyendo el XML: depende de
  // la altura real del texto ya compuesto. Lo único que se puede hacer bien es
  // respetar la plantilla, que ya está paginada como debe.
  return {
    contenido: guardarDocx(doc, conPlanilla.partes),
    nombre: nombreArchivo(datos.contrato, datos.contratista, datos.anio, datos.mes),
    balance,
    avisos,
  };
}

function describirProblemas(problemas: ProblemaMapa[]): string {
  return problemas
    .slice(0, 5)
    .map(
      (p) =>
        `  • ${p.campo}: se esperaba "${recortar(p.esperado)}" y hay "${recortar(p.encontrado)}"`,
    )
    .join('\n')
    .concat(problemas.length > 5 ? `\n  … y ${problemas.length - 5} más` : '');
}

function recortar(s: string, largo = 40): string {
  return s.length > largo ? `${s.slice(0, largo)}…` : s;
}
