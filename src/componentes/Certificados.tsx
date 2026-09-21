/**
 * Certificados de cumplimiento.
 *
 * Va aparte del lote mensual porque no es mensual: hay **uno por contrato**,
 * con la fecha del último día de su vigencia. Meterlo entre los meses invitaría
 * a generar uno por mes, que es justo lo que no debe pasar.
 *
 * Se genera al terminar el contrato, así que la lista avisa de los que todavía
 * están en curso en vez de esconderlos: a veces hay que anticiparlo.
 */

import { useMemo, useState } from 'react';
import { BadgeCheck, FolderOpen, Play, AlertTriangle } from 'lucide-react';

import { useEstado } from '../estado';
import { Aviso, Boton, Insignia, fechaHora } from './Ui';
import { NOMBRES_MES, aISO, desdeISO, formatoCorto } from '../../core/espanol/calendario';
import { cierresDelCertificado } from '../../core/generar/valoresCertificado';
import { fechaTerminacionVigente } from '../../core/pagos/cronograma';
import type { CertificadoGenerado, Contrato } from '../../core/modelo/tipos';

const conMayuscula = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

type Fila = {
  contrato: Contrato;
  contratista: string;
  /** Cierres posibles: un mes del contrato cada uno. */
  cierres: { anio: number; mes: number; hasta: string }[];
  /** Cierre elegido, en ISO. Por defecto, el final del contrato. */
  hasta: string;
  /** Ese cierre, ya en formato corto. */
  expedicion: string;
  /** Ya terminó, así que el certificado corresponde de verdad. */
  terminado: boolean;
  obligaciones: number;
  plantilla?: string;
  yaGenerado?: CertificadoGenerado;
  bloqueo: string | null;
};

export function SeccionCertificados() {
  const { base, plantillas, guardar } = useEstado();
  const [marcados, setMarcados] = useState<Set<string>>(new Set());
  /**
   * Hasta cuándo certifica cada contrato, si se cambió el mes por defecto.
   *
   * Un certificado parcial acredita lo cumplido hasta ese mes mientras el
   * contrato sigue en curso; el periodo, la frase de expedición y la carpeta
   * se ajustan los tres juntos.
   */
  const [cierrePorContrato, setCierrePorContrato] = useState<Record<string, string>>({});
  const [generando, setGenerando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resultado, setResultado] = useState<{
    generados: { nombre: string; ruta: string }[];
    fallidos: { contratoId: string; error: string }[];
  } | null>(null);

  const hoy = new Date().toISOString().slice(0, 10);

  const filas = useMemo<Fila[]>(() => {
    if (!base) return [];

    return base.contratos
      .filter((c) => c.activo)
      .map((c) => {
        const k = base.contratistas.find((x) => x.id === c.contratistaId);
        const p = plantillas.find((x) => x.id === c.plantillaCertificadoId);
        const campos = p?.campos.filter((x) => x.ocurrencias.length > 0).length ?? 0;
        const cierres = cierresDelCertificado(c);
        const porDefecto = cierres.at(-1)?.hasta ?? aISO(fechaTerminacionVigente(c));
        const hasta = cierrePorContrato[c.id] ?? porDefecto;

        let bloqueo: string | null = null;
        if (!p) bloqueo = 'Falta asignarle la plantilla del certificado a este contrato.';
        else if (campos === 0) {
          bloqueo = `La plantilla «${p.nombre}» todavía no tiene campos mapeados.`;
        }

        return {
          contrato: c,
          contratista: k?.nombre ?? '—',
          cierres,
          hasta,
          expedicion: formatoCorto(desdeISO(hasta)),
          terminado: c.fechaTerminacion <= hoy,
          obligaciones: c.obligaciones.length,
          plantilla: p?.nombre,
          yaGenerado: (base.certificados ?? []).find((x) => x.contratoId === c.id),
          bloqueo,
        };
      })
      .sort((a, b) => a.contrato.numero.localeCompare(b.contrato.numero, 'es', { numeric: true }));
  }, [base, plantillas, hoy, cierrePorContrato]);

  if (!base) return null;

  const elegibles = filas.filter((f) => f.bloqueo === null);
  const seleccionados = [...marcados].filter((id) =>
    elegibles.some((f) => f.contrato.id === id),
  );

  async function generar() {
    if (seleccionados.length === 0) return;
    setError(null);
    setResultado(null);
    setGenerando(true);

    try {
      const plantillaPorContrato: Record<string, string> = {};
      for (const f of filas) {
        if (f.contrato.plantillaCertificadoId) {
          plantillaPorContrato[f.contrato.id] = f.contrato.plantillaCertificadoId;
        }
      }

      const hastaPorContrato: Record<string, string> = {};
      for (const f of filas) hastaPorContrato[f.contrato.id] = f.hasta;

      const r = await window.api.generacion.certificados(
        plantillaPorContrato,
        seleccionados,
        base!.ajustes.carpetaSalida,
        hastaPorContrato,
      );

      setResultado({
        generados: r.generados.map((g) => ({ nombre: g.nombre, ruta: g.ruta })),
        fallidos: r.fallidos.map((f) => ({ contratoId: f.contratoId, error: f.error })),
      });

      const ahora = new Date().toISOString();
      await guardar((b) => {
        // Hay como mucho uno por contrato: el nuevo reemplaza al anterior.
        const otros = (b.certificados ?? []).filter(
          (c) => !r.generados.some((g) => g.contratoId === c.contratoId),
        );
        return {
          ...b,
          certificados: [
            ...otros,
            ...r.generados.map((g) => ({
              contratoId: g.contratoId,
              generadoEn: ahora,
              rutaArchivo: g.ruta,
              nombreArchivo: g.nombre,
            })),
          ],
        };
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setGenerando(false);
    }
  }

  return (
    <section className="tarjeta overflow-hidden">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-borde px-4 py-3">
        <div className="min-w-0">
          <h2 className="flex items-center gap-2 text-sm font-semibold">
            <BadgeCheck size={16} className="text-tinta-tenue" />
            Certificados de cumplimiento
          </h2>
          <p className="mt-0.5 text-xs text-tinta-tenue">
            Uno por contrato, no por mes. Lleva las obligaciones del contrato como
            actividades. Se expide con la fecha del último día de su vigencia; si
            elige un mes anterior, certifica sólo hasta ahí y se guarda en la
            carpeta de ese mes.
          </p>
        </div>
        <Boton
          variante="primario"
          icono={<Play size={15} />}
          onClick={generar}
          cargando={generando}
          disabled={seleccionados.length === 0 || generando}
        >
          Generar{seleccionados.length > 0 ? ` (${seleccionados.length})` : ''}
        </Boton>
      </div>

      {error && (
        <div className="px-4 py-3">
          <Aviso tipo="error" titulo="No se pudieron generar">
            {error}
          </Aviso>
        </div>
      )}

      {resultado && (
        <div className="flex flex-col gap-3 px-4 py-3">
          {resultado.generados.length > 0 && (
            <Aviso
              tipo="exito"
              titulo={`${resultado.generados.length} certificado(s) generado(s)`}
            >
              <div className="mt-1 flex flex-col gap-1">
                {resultado.generados.map((g) => (
                  <button
                    key={g.ruta}
                    onClick={() => void window.api.sistema.abrirArchivo(g.ruta)}
                    className="text-left underline underline-offset-2 hover:no-underline"
                  >
                    {g.nombre}
                  </button>
                ))}
              </div>
              <div className="mt-2">
                <Boton
                  className="solo-pc"
                  icono={<FolderOpen size={15} />}
                  onClick={() =>
                    void window.api.sistema.abrirCarpeta(base.ajustes.carpetaSalida)
                  }
                >
                  Abrir la carpeta
                </Boton>
              </div>
            </Aviso>
          )}

          {resultado.fallidos.length > 0 && (
            <Aviso tipo="error" titulo={`${resultado.fallidos.length} no se pudo generar`}>
              {resultado.fallidos
                .map((f) => {
                  const fila = filas.find((x) => x.contrato.id === f.contratoId);
                  return `${fila?.contrato.numero ?? f.contratoId}: ${f.error}`;
                })
                .join('\n\n')}
            </Aviso>
          )}
        </div>
      )}

      {filas.length === 0 ? (
        <p className="px-4 py-10 text-center text-sm text-tinta-tenue">
          No hay contratos activos.
        </p>
      ) : (
        <div className="tabla-desplazable">
          <table className="w-full text-sm">
            <thead className="bg-superficie text-left text-xs uppercase tracking-wide text-tinta-tenue">
              <tr className="whitespace-nowrap">
                <th className="w-10 px-4 py-2.5">
                  <input
                    type="checkbox"
                    className="accent-naranja-500"
                    title="Marcar o desmarcar todos"
                    disabled={elegibles.length === 0 || generando}
                    checked={
                      elegibles.length > 0 && seleccionados.length === elegibles.length
                    }
                    onChange={(e) =>
                      setMarcados(
                        e.target.checked
                          ? new Set(elegibles.map((f) => f.contrato.id))
                          : new Set(),
                      )
                    }
                  />
                </th>
                <th className="px-4 py-2.5 font-medium">Contrato</th>
                <th className="px-4 py-2.5 font-medium">Se expide</th>
                <th className="px-4 py-2.5 font-medium">Actividades que llevará</th>
                <th className="px-4 py-2.5 font-medium">Ya generado</th>
              </tr>
            </thead>
            <tbody>
              {filas.map((f) => (
                <tr
                  key={f.contrato.id}
                  className={`border-t border-borde ${f.bloqueo ? 'bg-superficie/60' : ''}`}
                >
                  <td className="px-4 py-2.5">
                    <input
                      type="checkbox"
                      className="accent-naranja-500"
                      disabled={f.bloqueo !== null || generando}
                      checked={marcados.has(f.contrato.id)}
                      onChange={(e) =>
                        setMarcados((s) => {
                          const n = new Set(s);
                          if (e.target.checked) n.add(f.contrato.id);
                          else n.delete(f.contrato.id);
                          return n;
                        })
                      }
                    />
                  </td>
                  <td className="whitespace-nowrap px-4 py-2.5">
                    <p className="font-medium">{f.contrato.numero || '(sin número)'}</p>
                    <p className="text-xs text-tinta-tenue">{f.contratista}</p>
                    {f.bloqueo && (
                      <p className="mt-1 flex items-start gap-1 text-xs text-alerta-fuerte">
                        <AlertTriangle size={12} className="mt-0.5 shrink-0" />
                        {f.bloqueo}
                      </p>
                    )}
                    {!f.bloqueo && f.plantilla && (
                      <span className="mt-1 inline-block">
                        <Insignia tono="verde">{f.plantilla}</Insignia>
                      </span>
                    )}
                  </td>
                  <td className="whitespace-nowrap px-4 py-2.5 text-tinta-tenue">
                    {/* El mes de cierre se elige: por defecto el último del
                        contrato —el certificado completo— y cualquier mes
                        anterior para acreditar lo cumplido hasta la fecha. */}
                    <select
                      className="campo py-1 text-xs"
                      value={f.hasta}
                      disabled={generando}
                      onChange={(e) =>
                        setCierrePorContrato((previo) => ({
                          ...previo,
                          [f.contrato.id]: e.target.value,
                        }))
                      }
                    >
                      {f.cierres.map((c) => (
                        <option key={c.hasta} value={c.hasta}>
                          {conMayuscula(NOMBRES_MES[c.mes - 1])} de {c.anio}
                        </option>
                      ))}
                    </select>
                    <span className="mt-1 block text-xs">
                      {f.expedicion}
                      {f.hasta !== f.cierres.at(-1)?.hasta && (
                        <span className="ml-2">
                          <Insignia tono="ambar">parcial</Insignia>
                        </span>
                      )}
                      {f.hasta === f.cierres.at(-1)?.hasta && !f.terminado && (
                        <span className="ml-2">
                          <Insignia tono="ambar">aún en curso</Insignia>
                        </span>
                      )}
                    </span>
                  </td>
                  {/* Decir «sin obligaciones registradas» no aclaraba qué iba a
                      pasar. Lo que importa es de dónde saldrán las actividades
                      del certificado: de este contrato, o de la plantilla —que
                      son las de otro contratista—. */}
                  <td className="px-4 py-2.5 text-xs">
                    {f.obligaciones === 0 ? (
                      <span className="flex items-start gap-1 text-alerta-fuerte">
                        <AlertTriangle size={12} className="mt-0.5 shrink-0" />
                        Saldrán las de la plantilla, que son de otro contrato.
                        Regístrelas en Contratos → Obligaciones.
                      </span>
                    ) : (
                      <span className="flex items-center gap-1 text-exito-fuerte">
                        <BadgeCheck size={13} className="shrink-0" />
                        {f.obligaciones} obligación{f.obligaciones === 1 ? '' : 'es'} del
                        contrato
                      </span>
                    )}
                  </td>
                  <td className="whitespace-nowrap px-4 py-2.5 text-xs text-tinta-tenue">
                    {f.yaGenerado ? (
                      <button
                        onClick={() =>
                          f.yaGenerado?.rutaArchivo &&
                          void window.api.sistema.abrirArchivo(f.yaGenerado.rutaArchivo)
                        }
                        className="underline underline-offset-2 hover:no-underline"
                        title={f.yaGenerado.nombreArchivo}
                      >
                        {fechaHora(f.yaGenerado.generadoEn)}
                      </button>
                    ) : (
                      '—'
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
