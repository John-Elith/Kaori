/**
 * Historial de informes generados.
 *
 * Responde a una pregunta que hasta ahora sólo podía contestarse abriendo la
 * carpeta de salida y leyendo nombres de archivo: ¿ya le generé el informe de
 * marzo a esta persona, y por cuánto salió?
 *
 * Se alimenta de `base.informes`, que ya se venía guardando, filtrando los
 * registros que sólo tienen la planilla leída: sin `generadoEn` no hubo
 * documento, y un historial que enumerase cosas que nunca se produjeron
 * engañaría más de lo que ayuda.
 */

import { useMemo, useState } from 'react';
import {
  History,
  FileText,
  FolderOpen,
  Search,
  X,
  ArrowDownUp,
  Inbox,
  Trash2,
  AlertTriangle,
} from 'lucide-react';

import { useEstado } from '../estado';
import { Boton, Insignia, fechaHora, moneda } from './Ui';
import { NOMBRES_MES } from '../../core/espanol/calendario';
import { MAXIMO_EN_HISTORIAL, limpiarHistorial } from '../../core/modelo/historial';

type Entrada = {
  claveFila: string;
  contratoId: string;
  numero: string;
  contratistaId: string;
  contratista: string;
  anio: number;
  mes: number;
  generadoEn: string;
  /** Milisegundos, para ordenar y comparar con el rango de fechas */
  momento: number;
  nombre: string;
  ruta?: string;
  pagoDelMes?: number;
  planilla?: string;
};

type Orden = 'reciente' | 'antiguo' | 'valorMayor' | 'valorMenor' | 'contrato' | 'contratista';

const ORDENES: { id: Orden; etiqueta: string }[] = [
  { id: 'reciente', etiqueta: 'Generado (más reciente)' },
  { id: 'antiguo', etiqueta: 'Generado (más antiguo)' },
  { id: 'contrato', etiqueta: 'Contrato (A-Z)' },
  { id: 'contratista', etiqueta: 'Contratista (A-Z)' },
  { id: 'valorMayor', etiqueta: 'Valor (de mayor a menor)' },
  { id: 'valorMenor', etiqueta: 'Valor (de menor a mayor)' },
];

const conMayuscula = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

export function HistorialInformes() {
  const { base, guardar } = useEstado();

  const [porLimpiar, setPorLimpiar] = useState(false);
  const [texto, setTexto] = useState('');
  const [contratoId, setContratoId] = useState('');
  const [contratistaId, setContratistaId] = useState('');
  const [desde, setDesde] = useState('');
  const [hasta, setHasta] = useState('');
  const [valorMin, setValorMin] = useState('');
  const [valorMax, setValorMax] = useState('');
  const [orden, setOrden] = useState<Orden>('reciente');

  const todas = useMemo<Entrada[]>(() => {
    if (!base) return [];
    return base.informes
      .filter((i) => i.generadoEn)
      .map((i) => {
        const c = base.contratos.find((x) => x.id === i.contratoId);
        const k = base.contratistas.find((x) => x.id === c?.contratistaId);
        const momento = new Date(i.generadoEn!).getTime();
        return {
          claveFila: `${i.contratoId}|${i.anio}|${i.mes}`,
          contratoId: i.contratoId,
          numero: c?.numero || '(sin número)',
          contratistaId: c?.contratistaId ?? '',
          contratista: k?.nombre ?? '—',
          anio: i.anio,
          mes: i.mes,
          generadoEn: i.generadoEn!,
          momento: Number.isNaN(momento) ? 0 : momento,
          // Los informes generados antes de que se guardara el nombre sólo
          // tienen la ruta; se saca de ahí en vez de dejar el hueco vacío.
          nombre: i.nombreArchivo ?? i.rutaArchivo?.split(/[\\/]/).pop() ?? '—',
          ruta: i.rutaArchivo,
          pagoDelMes: i.pagoDelMes,
          planilla: i.planilla?.numero,
        };
      });
  }, [base]);

  /** Sólo se ofrecen en los desplegables los que aparecen en el historial. */
  const contratosDelHistorial = useMemo(() => {
    const m = new Map<string, string>();
    for (const e of todas) m.set(e.contratoId, e.numero);
    return [...m].sort((a, b) => a[1].localeCompare(b[1], 'es', { numeric: true }));
  }, [todas]);

  const contratistasDelHistorial = useMemo(() => {
    const m = new Map<string, string>();
    for (const e of todas) if (e.contratistaId) m.set(e.contratistaId, e.contratista);
    return [...m].sort((a, b) => a[1].localeCompare(b[1], 'es'));
  }, [todas]);

  const lista = useMemo(() => {
    const q = texto.trim().toLowerCase();
    // El rango de fechas se compara sobre días completos: «hasta el 17» debe
    // incluir lo generado a las once de la noche del 17.
    const desdeMs = desde ? new Date(`${desde}T00:00:00`).getTime() : null;
    const hastaMs = hasta ? new Date(`${hasta}T23:59:59.999`).getTime() : null;
    const min = valorMin ? Number(valorMin) : null;
    const max = valorMax ? Number(valorMax) : null;

    const filtradas = todas.filter((e) => {
      if (contratoId && e.contratoId !== contratoId) return false;
      if (contratistaId && e.contratistaId !== contratistaId) return false;
      if (desdeMs !== null && e.momento < desdeMs) return false;
      if (hastaMs !== null && e.momento > hastaMs) return false;
      if (min !== null && (e.pagoDelMes ?? -1) < min) return false;
      if (max !== null && (e.pagoDelMes ?? Number.POSITIVE_INFINITY) > max) return false;
      if (q) {
        const paja = `${e.numero} ${e.contratista} ${e.nombre} ${NOMBRES_MES[e.mes - 1]} ${e.anio}`;
        if (!paja.toLowerCase().includes(q)) return false;
      }
      return true;
    });

    const comparar: Record<Orden, (a: Entrada, b: Entrada) => number> = {
      reciente: (a, b) => b.momento - a.momento,
      antiguo: (a, b) => a.momento - b.momento,
      valorMayor: (a, b) => (b.pagoDelMes ?? -1) - (a.pagoDelMes ?? -1),
      valorMenor: (a, b) => (a.pagoDelMes ?? Infinity) - (b.pagoDelMes ?? Infinity),
      contrato: (a, b) =>
        a.numero.localeCompare(b.numero, 'es', { numeric: true }) ||
        a.anio - b.anio ||
        a.mes - b.mes,
      contratista: (a, b) =>
        a.contratista.localeCompare(b.contratista, 'es') || b.momento - a.momento,
    };

    return filtradas.slice().sort(comparar[orden]);
  }, [todas, texto, contratoId, contratistaId, desde, hasta, valorMin, valorMax, orden]);

  const hayFiltro =
    texto !== '' ||
    contratoId !== '' ||
    contratistaId !== '' ||
    desde !== '' ||
    hasta !== '' ||
    valorMin !== '' ||
    valorMax !== '';

  function limpiar() {
    setTexto('');
    setContratoId('');
    setContratistaId('');
    setDesde('');
    setHasta('');
    setValorMin('');
    setValorMax('');
  }

  const sumaVisible = lista.reduce((s, e) => s + (e.pagoDelMes ?? 0), 0);

  if (!base) return null;

  return (
    <section className="tarjeta overflow-hidden">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-borde px-4 py-3">
        <div className="min-w-0">
          <h2 className="flex items-center gap-2 text-sm font-semibold">
            <History size={16} className="text-tinta-tenue" />
            Historial de informes generados
          </h2>
          <p className="mt-0.5 text-xs text-tinta-tenue">
            Se conservan los {MAXIMO_EN_HISTORIAL} últimos, del más reciente al más
            antiguo; al entrar uno nuevo, el más viejo sale de la lista. Los documentos
            no se borran: siguen en la carpeta de salida.
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <span className="text-xs text-tinta-tenue">
            {lista.length} de {todas.length}
          </span>
          {todas.length > 0 && (
            <Boton
              variante="fantasma"
              icono={<Trash2 size={14} />}
              onClick={() => setPorLimpiar(true)}
            >
              Limpiar
            </Boton>
          )}
        </div>
      </div>

      {porLimpiar && (
        <div className="border-b border-borde px-4 py-3">
          <div className="rounded-lg border border-error-borde bg-error-fondo p-4">
            <p className="flex items-start gap-2 text-sm font-medium text-error-texto">
              <AlertTriangle size={16} className="mt-0.5 shrink-0" />
              ¿Vaciar el historial de {todas.length} informe(s)?
            </p>
            <p className="mt-1 text-sm text-error-texto">
              Se borra la anotación, no los documentos: los .docx siguen donde están. Lo
              que se pierde es el registro de cuándo se generó cada uno y por cuánto. Las
              planillas PILA ya leídas se conservan.
            </p>
            <div className="mt-3 flex gap-2">
              <Boton
                variante="peligro"
                icono={<Trash2 size={15} />}
                onClick={async () => {
                  await guardar((b) => limpiarHistorial(b));
                  setPorLimpiar(false);
                }}
              >
                Sí, vaciar el historial
              </Boton>
              <Boton variante="secundario" onClick={() => setPorLimpiar(false)}>
                Cancelar
              </Boton>
            </div>
          </div>
        </div>
      )}

      {todas.length === 0 ? (
        <div className="flex flex-col items-center gap-2 px-4 py-12 text-center">
          <Inbox size={22} className="text-tinta-suave" />
          <p className="text-sm text-tinta-tenue">
            Todavía no se ha generado ningún informe. Los que genere aparecerán aquí.
          </p>
        </div>
      ) : (
        <>
          {/* Filtros */}
          <div className="flex flex-col gap-3 border-b border-borde px-4 py-3">
            <div className="flex flex-wrap items-center gap-3">
              <div className="flex min-w-[220px] flex-1 items-center gap-2">
                <Search size={16} className="shrink-0 text-tinta-suave" />
                <input
                  className="w-full bg-transparent text-sm text-tinta outline-none placeholder:text-tinta-suave"
                  placeholder="Buscar por contrato, contratista, mes o nombre de archivo…"
                  value={texto}
                  onChange={(e) => setTexto(e.target.value)}
                />
                {texto && (
                  <button
                    onClick={() => setTexto('')}
                    title="Limpiar la búsqueda"
                    className="shrink-0 rounded p-0.5 text-tinta-suave hover:bg-superficie hover:text-tinta"
                  >
                    <X size={14} />
                  </button>
                )}
              </div>

              <label className="flex items-center gap-2 text-xs text-tinta-tenue">
                <ArrowDownUp size={14} className="shrink-0" />
                Ordenar por
                <select
                  className="rounded-lg border border-borde bg-lienzo px-2 py-1 text-xs text-tinta"
                  value={orden}
                  onChange={(e) => setOrden(e.target.value as Orden)}
                >
                  {ORDENES.map((o) => (
                    <option key={o.id} value={o.id}>
                      {o.etiqueta}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <div className="flex flex-wrap items-end gap-3">
              <label className="block">
                <span className="mb-1 block text-xs text-tinta-tenue">Contrato</span>
                <select
                  className="campo py-1.5 text-xs"
                  value={contratoId}
                  onChange={(e) => setContratoId(e.target.value)}
                >
                  <option value="">Todos</option>
                  {contratosDelHistorial.map(([id, numero]) => (
                    <option key={id} value={id}>
                      {numero}
                    </option>
                  ))}
                </select>
              </label>

              <label className="block">
                <span className="mb-1 block text-xs text-tinta-tenue">Contratista</span>
                <select
                  className="campo py-1.5 text-xs"
                  value={contratistaId}
                  onChange={(e) => setContratistaId(e.target.value)}
                >
                  <option value="">Todos</option>
                  {contratistasDelHistorial.map(([id, nombre]) => (
                    <option key={id} value={id}>
                      {nombre}
                    </option>
                  ))}
                </select>
              </label>

              <label className="block">
                <span className="mb-1 block text-xs text-tinta-tenue">Generado desde</span>
                <input
                  type="date"
                  className="campo py-1.5 text-xs"
                  value={desde}
                  onChange={(e) => setDesde(e.target.value)}
                />
              </label>

              <label className="block">
                <span className="mb-1 block text-xs text-tinta-tenue">hasta</span>
                <input
                  type="date"
                  className="campo py-1.5 text-xs"
                  value={hasta}
                  onChange={(e) => setHasta(e.target.value)}
                />
              </label>

              <label className="block">
                <span className="mb-1 block text-xs text-tinta-tenue">Valor desde</span>
                <input
                  type="number"
                  className="campo w-32 py-1.5 text-xs tabular-nums"
                  placeholder="0"
                  value={valorMin}
                  onChange={(e) => setValorMin(e.target.value)}
                />
              </label>

              <label className="block">
                <span className="mb-1 block text-xs text-tinta-tenue">hasta</span>
                <input
                  type="number"
                  className="campo w-32 py-1.5 text-xs tabular-nums"
                  placeholder="sin tope"
                  value={valorMax}
                  onChange={(e) => setValorMax(e.target.value)}
                />
              </label>

              {hayFiltro && (
                <Boton variante="fantasma" icono={<X size={14} />} onClick={limpiar}>
                  Quitar filtros
                </Boton>
              )}
            </div>
          </div>

          <div className="tabla-desplazable">
            <table className="w-full text-sm">
              <thead className="bg-superficie text-left text-xs uppercase tracking-wide text-tinta-tenue">
                <tr className="whitespace-nowrap">
                  <th className="px-4 py-2.5 font-medium">Generado</th>
                  <th className="px-4 py-2.5 font-medium">Contrato</th>
                  <th className="px-4 py-2.5 font-medium">Periodo</th>
                  <th className="px-4 py-2.5 text-right font-medium">Valor del mes</th>
                  <th className="px-4 py-2.5 font-medium">Archivo</th>
                  <th className="px-4 py-2.5" />
                </tr>
              </thead>
              <tbody>
                {lista.map((e) => (
                  <tr key={e.claveFila} className="border-t border-borde hover:bg-superficie">
                    <td className="whitespace-nowrap px-4 py-2.5 text-xs text-tinta-tenue">
                      {fechaHora(e.generadoEn)}
                    </td>
                    <td className="whitespace-nowrap px-4 py-2.5">
                      <p className="font-medium">{e.numero}</p>
                      <p className="text-xs text-tinta-tenue">{e.contratista}</p>
                    </td>
                    <td className="whitespace-nowrap px-4 py-2.5 text-tinta-tenue">
                      {conMayuscula(NOMBRES_MES[e.mes - 1])} {e.anio}
                      {e.planilla && (
                        <span className="ml-2">
                          <Insignia tono="verde">PILA {e.planilla}</Insignia>
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-2.5 text-right tabular-nums">
                      {e.pagoDelMes !== undefined ? moneda(e.pagoDelMes) : '—'}
                    </td>
                    <td className="max-w-[280px] px-4 py-2.5">
                      <span className="flex items-center gap-1.5 text-xs text-tinta-tenue">
                        <FileText size={13} className="shrink-0" />
                        <span className="truncate" title={e.ruta ?? e.nombre}>
                          {e.nombre}
                        </span>
                      </span>
                    </td>
                    <td className="px-4 py-2.5">
                      <div className="flex justify-end gap-1">
                        <Boton
                          variante="fantasma"
                          disabled={!e.ruta}
                          title={
                            e.ruta
                              ? 'Abrir el documento'
                              : 'No se guardó la ruta de este informe'
                          }
                          onClick={() => void window.api.sistema.abrirArchivo(e.ruta!)}
                        >
                          Abrir
                        </Boton>
                        <Boton
                          className="solo-pc"
                          variante="fantasma"
                          icono={<FolderOpen size={14} />}
                          disabled={!e.ruta}
                          title="Abrir la carpeta que lo contiene"
                          onClick={() =>
                            void window.api.sistema.abrirCarpeta(
                              e.ruta!.replace(/[\\/][^\\/]+$/, ''),
                            )
                          }
                        >
                          Carpeta
                        </Boton>
                      </div>
                    </td>
                  </tr>
                ))}

                {lista.length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-4 py-8 text-center text-tinta-tenue">
                      Ningún informe coincide con los filtros.
                    </td>
                  </tr>
                )}
              </tbody>

              {lista.length > 0 && (
                <tfoot>
                  <tr className="border-t-2 border-borde bg-superficie text-xs font-medium">
                    <td className="px-4 py-2.5" colSpan={3}>
                      Suma de lo que se ve
                    </td>
                    <td className="px-4 py-2.5 text-right tabular-nums">
                      {moneda(sumaVisible)}
                    </td>
                    <td colSpan={2} />
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        </>
      )}
    </section>
  );
}
