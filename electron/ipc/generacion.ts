import { manejar } from '../canales';
import { promises as fs } from 'node:fs';
import { join } from 'node:path';

import { leer } from '../almacen';
import { plantillaPorId } from './plantillas';
import { generarInforme } from '../../core/generar/generarInforme';
import {
  generarCertificado,
  generarCuentaDeCobro,
} from '../../core/generar/generarDocumento';
import { balanceDelMes, fechaTerminacionVigente } from '../../core/pagos/cronograma';
import { aISO, desdeISO, nombreMes } from '../../core/espanol/calendario';
import type { TipoDocumento } from '../../core/docx/campos';
import type { Planilla } from '../../core/modelo/tipos';
import { nombreLibre } from '../../core/generar/nombreArchivo';

type Producido = { nombre: string; ruta: string; avisos: string[] };

type Peticion = {
  plantillaId: string;
  contratoId: string;
  anio: number;
  mes: number;
  carpetaSalida: string;
  /**
   * Subcarpeta dentro de la carpeta de salida, si se quiere agrupar.
   *
   * Los documentos mensuales van cada uno en la carpeta de su mes —ENERO,
   * FEBRERO…— para que el informe y su cuenta de cobro queden juntos y la
   * carpeta de salida no se convierta en una lista de cientos de archivos.
   */
  subcarpeta?: string;
  /** Qué documento se produce. Sin declarar, el informe. */
  tipo?: TipoDocumento;
  /** Certificado: hasta cuándo certifica, en ISO. Sin esto, el fin del contrato. */
  hasta?: string;
  planilla?: Planilla;
  /** Se llama justo antes de escribir el archivo en disco. */
  alGuardar?: () => void;
  /** Nombres ya usados en este lote, para no sobrescribir. */
  nombresUsados?: Set<string>;
};

/**
 * Produce un documento y lo deja en disco.
 *
 * Los tres tipos comparten todo lo de alrededor —buscar el contrato, leer la
 * plantilla, escribir sin pisar otro archivo— y se separan sólo en la llamada
 * al generador que les toca.
 */
async function generarYEscribir(p: Peticion): Promise<Producido> {
  const base = await leer();
  const tipo = p.tipo ?? 'informe';

  const contrato = base.contratos.find((c) => c.id === p.contratoId);
  if (!contrato) throw new Error(`No existe el contrato ${p.contratoId}`);

  const contratista = base.contratistas.find((k) => k.id === contrato.contratistaId);
  if (!contratista) {
    throw new Error(`El contrato ${contrato.numero} no tiene contratista asociado`);
  }

  const mapa = await plantillaPorId(p.plantillaId);
  if (!mapa) throw new Error('La plantilla seleccionada ya no existe');

  let plantillaDocx: Buffer;
  try {
    plantillaDocx = await fs.readFile(mapa.archivo);
  } catch {
    throw new Error(
      `No se pudo leer el archivo de la plantilla "${mapa.nombre}". ` +
        'Vuelva a registrarla desde la pantalla de Plantillas.',
    );
  }

  let resultado: { contenido: Buffer; nombre: string; avisos: string[] };

  if (tipo === 'cuentaDeCobro') {
    resultado = generarCuentaDeCobro({
      plantillaDocx,
      mapa,
      contrato,
      contratista,
      anio: p.anio,
      mes: p.mes,
    });
  } else if (tipo === 'certificado') {
    resultado = generarCertificado({
      plantillaDocx,
      mapa,
      contrato,
      contratista,
      departamentoPorDefecto: base.ajustes.departamentoPorDefecto,
      hasta: p.hasta,
    });
    // El certificado va con los documentos del mes en que se expide, no suelto
    // en la raíz: los papeles de un mismo mes se archivan juntos.
    const cierre = p.hasta ? desdeISO(p.hasta) : fechaTerminacionVigente(contrato);
    p.subcarpeta = nombreMes(cierre.mes).toUpperCase();
  } else {
    // La planilla del mes puede venir en la petición o estar ya guardada.
    const informeGuardado = base.informes.find(
      (i) => i.contratoId === p.contratoId && i.anio === p.anio && i.mes === p.mes,
    );
    resultado = generarInforme({
      plantillaDocx,
      mapa,
      datos: {
        contrato,
        contratista,
        anio: p.anio,
        mes: p.mes,
        planilla: p.planilla ?? informeGuardado?.planilla,
      },
    });
  }

  p.alGuardar?.();

  const destino = p.subcarpeta
    ? join(p.carpetaSalida, p.subcarpeta)
    : p.carpetaSalida;
  await fs.mkdir(destino, { recursive: true });

  // Dos contratos del mismo contratista con el mismo número producen el mismo
  // nombre de archivo, y el segundo sobrescribía al primero en silencio. Si el
  // nombre ya se usó en este lote, se numera.
  const nombre = nombreLibre(resultado.nombre, p.nombresUsados);
  const ruta = join(destino, nombre);
  await fs.writeFile(ruta, resultado.contenido);

  return { nombre, ruta, avisos: resultado.avisos };
}

/** Documento producido dentro de un lote, con el tipo que lo identifica. */
type Generado = Producido & { contratoId: string; tipo: TipoDocumento };
type Fallido = { contratoId: string; tipo: TipoDocumento; error: string };

export function registrarCanalesGeneracion(): void {
  manejar('generacion:uno', async (_e, p: Peticion) => generarYEscribir(p));

  /**
   * Lote mensual: por cada contrato marcado, los documentos pedidos.
   *
   * Un fallo en un documento no interrumpe a los demás: se reportan aparte
   * para que la persona vea de un vistazo qué salió y qué no. Que falle la
   * cuenta de cobro de alguien no debe impedir que se produzca su informe.
   */
  manejar(
    'generacion:lote',
    async (
      evento,
      plantillasPorContrato: Record<string, Partial<Record<TipoDocumento, string>>>,
      contratoIds: string[],
      anio: number,
      mes: number,
      carpetaSalida: string,
      tipos: TipoDocumento[] = ['informe'],
    ) => {
      const nombresUsados = new Set<string>();
      const generados: Generado[] = [];
      const fallidos: Fallido[] = [];

      // Cada contrato aporta tantos documentos como tipos se hayan pedido.
      const tareas = contratoIds.flatMap((contratoId) =>
        tipos.map((tipo) => ({ contratoId, tipo })),
      );

      const avisar = (p: {
        indice: number;
        contratoId: string;
        fase: 'generando' | 'guardando' | 'listo' | 'error';
        nombre?: string;
      }) => {
        // El renderer puede haberse cerrado a mitad del lote.
        if (!evento.sender.isDestroyed()) {
          evento.sender.send('generacion:progreso', { ...p, total: tareas.length });
        }
      };

      for (let i = 0; i < tareas.length; i++) {
        const { contratoId, tipo } = tareas[i];
        const plantillaId = plantillasPorContrato[contratoId]?.[tipo];

        if (!plantillaId) {
          avisar({ indice: i, contratoId, fase: 'error' });
          fallidos.push({
            contratoId,
            tipo,
            error: 'El contrato no tiene plantilla asignada para este documento.',
          });
          continue;
        }

        try {
          avisar({ indice: i, contratoId, fase: 'generando' });
          const r = await generarYEscribir({
            plantillaId,
            contratoId,
            anio,
            mes,
            carpetaSalida,
            // El informe y la cuenta del mismo mes caen en la misma carpeta.
            subcarpeta: nombreMes(mes).toUpperCase(),
            tipo,
            nombresUsados,
            alGuardar: () => avisar({ indice: i, contratoId, fase: 'guardando' }),
          });
          generados.push({ contratoId, tipo, ...r });
          avisar({ indice: i, contratoId, fase: 'listo', nombre: r.nombre });
        } catch (e) {
          avisar({ indice: i, contratoId, fase: 'error' });
          fallidos.push({
            contratoId,
            tipo,
            error: e instanceof Error ? e.message : String(e),
          });
        }
      }

      return { generados, fallidos };
    },
  );

  /**
   * Lote de certificados de cumplimiento.
   *
   * Va por su propio canal porque no lleva mes: hay uno por contrato, con la
   * fecha del último día de su vigencia. Meterlo en el lote mensual habría
   * obligado a inventarle un mes que no significa nada.
   */
  manejar(
    'generacion:certificados',
    async (
      evento,
      plantillaPorContrato: Record<string, string>,
      contratoIds: string[],
      carpetaSalida: string,
      /** Hasta cuándo certifica cada contrato, en ISO. Sin esto, su fin. */
      hastaPorContrato: Record<string, string> = {},
    ) => {
      const nombresUsados = new Set<string>();
      const generados: Generado[] = [];
      const fallidos: Fallido[] = [];

      const avisar = (p: {
        indice: number;
        contratoId: string;
        fase: 'generando' | 'guardando' | 'listo' | 'error';
        nombre?: string;
      }) => {
        if (!evento.sender.isDestroyed()) {
          evento.sender.send('generacion:progreso', { ...p, total: contratoIds.length });
        }
      };

      for (let i = 0; i < contratoIds.length; i++) {
        const contratoId = contratoIds[i];
        const plantillaId = plantillaPorContrato[contratoId];

        if (!plantillaId) {
          avisar({ indice: i, contratoId, fase: 'error' });
          fallidos.push({
            contratoId,
            tipo: 'certificado',
            error: 'El contrato no tiene plantilla de certificado asignada.',
          });
          continue;
        }

        try {
          avisar({ indice: i, contratoId, fase: 'generando' });
          const r = await generarYEscribir({
            plantillaId,
            contratoId,
            // El certificado ignora el mes; se manda uno válido por firma.
            anio: 0,
            mes: 1,
            carpetaSalida,
            tipo: 'certificado',
            hasta: hastaPorContrato[contratoId],
            nombresUsados,
            alGuardar: () => avisar({ indice: i, contratoId, fase: 'guardando' }),
          });
          generados.push({ contratoId, tipo: 'certificado', ...r });
          avisar({ indice: i, contratoId, fase: 'listo', nombre: r.nombre });
        } catch (e) {
          avisar({ indice: i, contratoId, fase: 'error' });
          fallidos.push({
            contratoId,
            tipo: 'certificado',
            error: e instanceof Error ? e.message : String(e),
          });
        }
      }

      return { generados, fallidos };
    },
  );

  /** Cifras del mes sin generar el documento; alimenta la tabla del lote. */
  manejar(
    'generacion:previsualizar',
    async (_e, contratoId: string, anio: number, mes: number) => {
      const base = await leer();
      const contrato = base.contratos.find((c) => c.id === contratoId);
      if (!contrato) return { ok: false, motivo: 'El contrato no existe' };

      const b = balanceDelMes(contrato, anio, mes);
      if (!b) {
        return {
          ok: false,
          motivo:
            'Fuera de la vigencia del contrato, o suspendido durante todo el mes.',
        };
      }

      return {
        ok: true,
        pagoDelMes: b.pagoDelMes,
        totalPagado: b.totalPagado,
        valorPorEjecutar: b.valorPorEjecutar,
        desde: aISO(b.desde),
        hasta: aISO(b.hasta),
      };
    },
  );
}
