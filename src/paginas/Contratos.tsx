import { useEffect, useMemo, useState } from 'react';
import {
  FileSignature,
  Plus,
  Upload,
  ArrowLeft,
  Trash2,
  Wand2,
  CalendarClock,
  PauseCircle,
  Search,
  ArrowDownUp,
  X,
  Copy,
  ScanLine,
  Undo2,
} from 'lucide-react';

import { useEstado } from '../estado';
import { useRecordado } from '../recordado';
import {
  Aviso,
  Boton,
  BotonesDeCaja,
  Campo,
  CampoMoneda,
  Cargando,
  Insignia,
  Pagina,
  Vacio,
  moneda,
} from '../componentes/Ui';
import { Dictable } from '../componentes/Dictado';
import type { Contrato, Obligacion } from '../../core/modelo/tipos';
import type { TipoDocumento } from '../../core/docx/campos';
import type { MapaPlantilla } from '../../core/docx/mapaPlantilla';
import { generarCronograma, valorVigente } from '../../core/pagos/cronograma';
import { desdeISO, formatoCorto, NOMBRES_MES } from '../../core/espanol/calendario';
import { frasePlazo } from '../../core/espanol/fechaEnLetras';
import { montoALetras } from '../../core/espanol/numeroALetras';
import { redactarFormaDePago } from '../../core/generar/formaDePago';
import { enviarAPapelera } from '../../core/modelo/papelera';
import { completarActividades } from '../../core/extraccion/redactarActividades';
import {
  fechasCoherentes,
  heredarDeContrato,
  mensualidadHabitual,
} from '../../core/modelo/heredarContrato';
import {
  partirEnObligaciones,
  renumerar,
} from '../../core/extraccion/listaDeObligaciones';

/**
 * Si la fecha de inicio va después de la de terminación, el aviso que lo
 * explica; si no, null. Pasa sobre todo por un año mal escrito: 01/07/2026
 * en vez de 01/07/2025.
 */
function fechasInvertidas(c: Pick<Contrato, 'fechaInicio' | 'fechaTerminacion'>): string | null {
  if (!c.fechaInicio || !c.fechaTerminacion || c.fechaInicio <= c.fechaTerminacion) return null;
  return (
    `La fecha de inicio (${formatoCorto(desdeISO(c.fechaInicio))}) es posterior a la de ` +
    `terminación (${formatoCorto(desdeISO(c.fechaTerminacion))}): puede que el año esté mal ` +
    'escrito.'
  );
}

function contratoNuevo(
  id: string,
  contratistaId: string,
  ajustes: {
    contratantePorDefecto: string;
    nitPorDefecto: string;
    municipioPorDefecto: string;
    departamentoPorDefecto: string;
    supervisorPorDefecto: { nombre: string; cargo: string };
  },
  /** Contrato anterior de esta persona, del que heredar los datos de pago. */
  anterior?: Contrato,
): Contrato {
  const anio = new Date().getFullYear();
  return {
    id,
    contratistaId,
    numero: '',
    anio,
    objeto: '',
    fechaInicio: `${anio}-01-01`,
    fechaTerminacion: `${anio}-06-30`,
    fechaFirma: `${anio}-01-01`,
    valorInicial: 0,
    cuotas: [],
    adiciones: [],
    suspensiones: [],
    formaDePago: '',
    textoPlazo: '',
    contratante: ajustes.contratantePorDefecto,
    nitContratante: ajustes.nitPorDefecto,
    municipio: ajustes.municipioPorDefecto,
    departamento: ajustes.departamentoPorDefecto,
    // El teléfono y la cuenta casi nunca cambian entre contratos de la misma
    // persona, así que se traen del anterior en vez de pedirlos otra vez.
    telefono: anterior?.telefono,
    numeroDeCuenta: anterior?.numeroDeCuenta,
    supervisor: { ...ajustes.supervisorPorDefecto },
    cdp: { numero: '', fecha: `${anio}-01-01`, valor: 0 },
    rp: { numero: '', fecha: `${anio}-01-01`, valor: 0 },
    obligaciones: [],
    obligacionesSupervision: [],
    plantillaId: '',
    activo: true,
  };
}

/** Criterios de ordenación de la lista. */
type Orden =
  | 'numero'
  | 'contratista'
  | 'fechaReciente'
  | 'fechaAntigua'
  | 'valorMayor'
  | 'valorMenor';

const ORDENES: { id: Orden; etiqueta: string }[] = [
  { id: 'numero', etiqueta: 'Número de contrato (A-Z)' },
  { id: 'contratista', etiqueta: 'Contratista (A-Z)' },
  { id: 'fechaReciente', etiqueta: 'Fecha de inicio (más reciente)' },
  { id: 'fechaAntigua', etiqueta: 'Fecha de inicio (más antigua)' },
  { id: 'valorMayor', etiqueta: 'Valor (de mayor a menor)' },
  { id: 'valorMenor', etiqueta: 'Valor (de menor a mayor)' },
];

export function PaginaContratos({
  abrirContratoId,
  alAbrir,
  nuevoContratoPara,
  alCrear,
}: {
  /** Contrato que debe abrirse al entrar, si se llegó desde un enlace */
  abrirContratoId?: string;
  alAbrir?: () => void;
  /** Contratista al que crearle un contrato nada más entrar */
  nuevoContratoPara?: string;
  alCrear?: () => void;
} = {}) {
  const { base, guardar, plantillas } = useEstado();
  // El contrato abierto se recuerda: ir a Plantillas a mirar algo y volver
  // debe devolver al mismo contrato, no a la lista. Si ya no existe, la
  // búsqueda de abajo no lo encuentra y se ve la lista.
  const [editandoId, setEditandoId] = useRecordado<string | null>(
    'contratos.abierto',
    null,
    (v): v is string | null => v === null || typeof v === 'string',
  );
  const [error, setError] = useState<string | null>(null);
  const [importando, setImportando] = useState(false);
  const [avisos, setAvisos] = useState<string[]>([]);
  const [busqueda, setBusqueda] = useState('');
  const [orden, setOrden] = useState<Orden>('numero');
  /** Contratos marcados para eliminar de una vez. */
  const [marcados, setMarcados] = useState<Set<string>>(new Set());
  /** Los que están esperando confirmación; vacío significa que no se preguntó. */
  const [porEliminar, setPorEliminar] = useState<Contrato[]>([]);

  // Si se llegó con un contrato indicado, abrirlo una sola vez.
  useEffect(() => {
    if (abrirContratoId) {
      setEditandoId(abrirContratoId);
      alAbrir?.();
    }
  }, [abrirContratoId, alAbrir]);

  /**
   * Si se llegó desde la ficha de un contratista, crearle el contrato y abrirlo.
   *
   * El aviso de abajo se dispara una sola vez gracias a `alCrear`, que borra
   * la petición: sin eso, cada repintado —y hay uno por cada guardado— crearía
   * otro contrato vacío.
   */
  useEffect(() => {
    if (!nuevoContratoPara || !base) return;
    if (!base.contratistas.some((k) => k.id === nuevoContratoPara)) {
      alCrear?.();
      return;
    }

    let vigente = true;
    void (async () => {
      const id = await window.api.datos.nuevoId('ct');
      if (!vigente) return;

      const anterior = base.contratos
        .filter((c) => c.contratistaId === nuevoContratoPara)
        .sort((a, b) => b.fechaInicio.localeCompare(a.fechaInicio))[0];

      const nuevo = contratoNuevo(id, nuevoContratoPara, base.ajustes, anterior);
      await guardar((b) => ({ ...b, contratos: [...b.contratos, { ...nuevo, actualizadoEn: new Date().toISOString() }] }));
      setEditandoId(id);
      setError(null);
      setAvisos([
        'Contrato nuevo para esta persona. Escriba su número, sus fechas, el CDP y el RP; ' +
          'el resto puede cargarlo de su contrato anterior con el recuadro de abajo.',
      ]);
      alCrear?.();
    })();

    return () => {
      vigente = false;
    };
    // Sólo cuando cambia la petición; `base` y `guardar` cambian en cada guardado.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nuevoContratoPara]);

  const contrato = useMemo(
    () => base?.contratos.find((c) => c.id === editandoId) ?? null,
    [base, editandoId],
  );

  /**
   * Lista filtrada y ordenada.
   *
   * La búsqueda mira número, nombre y cédula a la vez: quien busca no tiene por
   * qué acordarse de en qué campo estaba el dato.
   */
  const lista = useMemo(() => {
    if (!base) return [];
    const nombreDe = (c: Contrato) =>
      base.contratistas.find((k) => k.id === c.contratistaId)?.nombre ?? '';
    const cedulaDe = (c: Contrato) =>
      base.contratistas.find((k) => k.id === c.contratistaId)?.cedula ?? '';

    const q = busqueda.trim().toLowerCase();
    const soloDigitos = q.replace(/\D/g, '');

    const filtrados = base.contratos.filter((c) => {
      if (!q) return true;
      return (
        c.numero.toLowerCase().includes(q) ||
        nombreDe(c).toLowerCase().includes(q) ||
        cedulaDe(c).toLowerCase().includes(q) ||
        // Permite buscar la cédula sin escribir los puntos.
        (soloDigitos.length >= 3 &&
          cedulaDe(c).replace(/\D/g, '').includes(soloDigitos))
      );
    });

    const comparar: Record<Orden, (a: Contrato, b: Contrato) => number> = {
      numero: (a, b) => a.numero.localeCompare(b.numero, 'es', { numeric: true }),
      contratista: (a, b) => nombreDe(a).localeCompare(nombreDe(b), 'es'),
      fechaReciente: (a, b) => b.fechaInicio.localeCompare(a.fechaInicio),
      fechaAntigua: (a, b) => a.fechaInicio.localeCompare(b.fechaInicio),
      valorMayor: (a, b) => valorVigente(b) - valorVigente(a),
      valorMenor: (a, b) => valorVigente(a) - valorVigente(b),
    };

    return filtrados.slice().sort(comparar[orden]);
  }, [base, busqueda, orden]);

  if (!base) return <Cargando />;

  /** Marcados que siguen existiendo y visibles en el filtro actual. */
  const marcadosVisibles = lista.filter((c) => marcados.has(c.id));

  /** El contrato más reciente de una persona, del que heredar sus datos de pago. */
  function ultimoDe(contratistaId: string): Contrato | undefined {
    return base!.contratos
      .filter((c) => c.contratistaId === contratistaId)
      .sort((a, b) => b.fechaInicio.localeCompare(a.fechaInicio))[0];
  }

  /**
   * Envía a la papelera todos los contratos confirmados de una vez.
   *
   * Se hace en un solo guardado y no uno por contrato: `guardar` escribe la
   * base entera, así que borrar cinco por separado serían cinco escrituras
   * seguidas, y si una fallase a mitad quedarían unos eliminados y otros no.
   */
  async function eliminarContratos(cs: Contrato[]) {
    const ids = cs.map((c) => c.id);
    await guardar((b) => ids.reduce((acc, id) => enviarAPapelera(acc, id), b));
    setPorEliminar([]);
    setMarcados((s) => {
      const n = new Set(s);
      for (const id of ids) n.delete(id);
      return n;
    });
  }

  async function crear() {
    if (base!.contratistas.length === 0) {
      setError('Primero registre al menos un contratista.');
      return;
    }
    const id = await window.api.datos.nuevoId('ct');
    const contratistaId = base!.contratistas[0].id;
    const nuevo = contratoNuevo(id, contratistaId, base!.ajustes, ultimoDe(contratistaId));
    await guardar((b) => ({ ...b, contratos: [...b.contratos, { ...nuevo, actualizadoEn: new Date().toISOString() }] }));
    setEditandoId(id);
    setError(null);
    setAvisos([]);
  }

  /** Sube un PDF del contrato y propone los campos para revisión. */
  async function importarPdf() {
    setError(null);
    setAvisos([]);
    const ruta = await window.api.sistema.elegirArchivo([
      { name: 'Contrato', extensions: ['pdf', 'png', 'jpg', 'jpeg'] },
    ]);
    if (!ruta) return;

    setImportando(true);
    try {
      const r = await window.api.extraccion.contrato(ruta);
      const c = r.campos as Record<string, unknown>;

      // El contratista se crea si no existe todavía.
      let contratistaId = base!.contratistas[0]?.id;
      const nombre = typeof c.nombreContratista === 'string' ? c.nombreContratista : '';
      const cedula = typeof c.cedula === 'string' ? c.cedula : '';

      if (nombre && cedula) {
        const existente = base!.contratistas.find(
          (k) => k.cedula.replace(/\D/g, '') === cedula.replace(/\D/g, ''),
        );
        if (existente) {
          contratistaId = existente.id;
        } else {
          const kid = await window.api.datos.nuevoId('kt');
          await guardar((b) => ({
            ...b,
            contratistas: [
              ...b.contratistas,
              {
                id: kid,
                nombre,
                cedula,
                expedidaEn:
                  typeof c.cedulaExpedidaEn === 'string' ? c.cedulaExpedidaEn : '',
              },
            ],
          }));
          contratistaId = kid;
        }
      }

      if (!contratistaId) {
        setError(
          'No se pudo identificar al contratista en el documento. Regístrelo a mano primero.',
        );
        return;
      }

      const id = await window.api.datos.nuevoId('ct');
      const nuevo = contratoNuevo(id, contratistaId, base!.ajustes, ultimoDe(contratistaId));
      const texto = (k: string, def = '') =>
        typeof c[k] === 'string' ? (c[k] as string) : def;
      const num = (k: string, def = 0) =>
        typeof c[k] === 'number' ? (c[k] as number) : def;

      const conDatos: Contrato = {
        ...nuevo,
        numero: texto('numero'),
        anio: num('anio', nuevo.anio),
        objeto: texto('objeto'),
        valorInicial: num('valorInicial'),
        fechaInicio: texto('fechaInicio', nuevo.fechaInicio),
        fechaTerminacion: texto('fechaTerminacion', nuevo.fechaTerminacion),
        fechaFirma: texto('fechaFirma', texto('fechaInicio', nuevo.fechaFirma)),
        contratante: texto('contratante', nuevo.contratante),
        nitContratante: texto('nitContratante', nuevo.nitContratante),
        formaDePago: texto('formaDePago'),
        textoPlazo: texto('textoPlazo'),
        supervisor: {
          nombre: texto('supervisorNombre', nuevo.supervisor.nombre),
          cargo: texto('supervisorCargo', nuevo.supervisor.cargo),
        },
        cdp: {
          numero: texto('cdpNumero'),
          fecha: texto('cdpFecha', nuevo.cdp.fecha),
          valor: num('cdpValor'),
        },
        rp: {
          numero: texto('rpNumero'),
          fecha: texto('rpFecha', nuevo.rp.fecha),
          valor: num('rpValor'),
        },
        obligaciones: Array.isArray(c.obligaciones)
          ? (c.obligaciones as string[]).map((t, i) => ({ n: i + 1, texto: t }))
          : [],
      };

      // Cronograma sugerido con los valores que se hayan detectado.
      if (num('valorMensual') > 0) {
        conDatos.cuotas = generarCronograma({
          fechaInicio: conDatos.fechaInicio,
          fechaTerminacion: conDatos.fechaTerminacion,
          valorMensual: num('valorMensual'),
          primeraCuota: num('valorPrimeraCuota') || undefined,
        });
      }

      await guardar((b) => ({ ...b, contratos: [...b.contratos, { ...conDatos, actualizadoEn: new Date().toISOString() }] }));
      setEditandoId(id);
      setAvisos([
        r.motor === 'ia'
          ? 'Los datos se leyeron con IA. Revíselos antes de guardar.'
          : 'Los datos se dedujeron por patrones de texto. Revíselos con cuidado.',
        ...r.avisos,
      ]);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setImportando(false);
    }
  }

  if (contrato) {
    return (
      <EditorContrato
        contrato={contrato}
        avisos={avisos}
        alVolver={() => {
          setEditandoId(null);
          setAvisos([]);
        }}
      />
    );
  }

  return (
    <Pagina
      titulo="Contratos"
      descripcion="Cada contrato se registra una vez. Después, generar el informe de cualquier mes es un clic."
      acciones={
        <>
          <Boton icono={<Upload size={16} />} onClick={importarPdf} cargando={importando}>
            Importar de un PDF
          </Boton>
          <Boton variante="primario" icono={<Plus size={16} />} onClick={crear}>
            Nuevo contrato
          </Boton>
        </>
      }
    >
      <div className="flex flex-col gap-5 pb-8">
        {error && <Aviso tipo="error">{error}</Aviso>}

        {/* Confirmación de borrado: se avisa de los informes que se llevará. */}
        {porEliminar.length > 0 && (
          <section className="tarjeta border-error-borde bg-error-fondo/60 p-5">
            <div className="flex items-start gap-2.5">
              <Trash2 size={18} className="mt-0.5 shrink-0 text-error-fuerte" />
              <div className="min-w-0 flex-1">
                <h2 className="font-semibold text-error-texto">
                  {porEliminar.length === 1
                    ? `¿Eliminar el contrato ${porEliminar[0].numero || '(sin número)'}?`
                    : `¿Eliminar ${porEliminar.length} contratos?`}
                </h2>

                {porEliminar.length > 1 && (
                  <ul className="mt-2 flex flex-col gap-0.5 text-sm text-error-texto">
                    {porEliminar.map((c) => {
                      const k = base.contratistas.find((x) => x.id === c.contratistaId);
                      return (
                        <li key={c.id}>
                          • {c.numero || '(sin número)'} — {k?.nombre ?? 'sin contratista'}
                        </li>
                      );
                    })}
                  </ul>
                )}

                <p className="mt-2 text-sm text-error-texto">
                  {(() => {
                    const ids = new Set(porEliminar.map((c) => c.id));
                    const n = base.informes.filter((i) => ids.has(i.contratoId)).length;
                    return n > 0
                      ? `Se llevará también el historial de ${n} informe(s) generado(s).`
                      : porEliminar.length === 1
                        ? 'Todavía no tiene informes generados.'
                        : 'Todavía no tienen informes generados.';
                  })()}{' '}
                  {porEliminar.length === 1 ? 'Pasará' : 'Pasarán'} a la papelera y podrá
                  {porEliminar.length === 1 ? ' recuperarlo' : ' recuperarlos'} durante 30
                  días desde Ajustes.
                </p>

                <div className="mt-3 flex gap-2">
                  <Boton
                    variante="peligro"
                    icono={<Trash2 size={15} />}
                    onClick={() => void eliminarContratos(porEliminar)}
                  >
                    Sí, enviar a la papelera
                  </Boton>
                  <Boton variante="secundario" onClick={() => setPorEliminar([])}>
                    Cancelar
                  </Boton>
                </div>
              </div>
            </div>
          </section>
        )}

        {base.contratos.length === 0 ? (
          <Vacio
            icono={<FileSignature size={24} />}
            titulo="Todavía no hay contratos"
            descripcion="Suba el PDF del contrato para que el programa lea los datos, o créelo a mano si prefiere escribirlos usted."
            accion={
              <div className="flex gap-2">
                <Boton icono={<Upload size={16} />} onClick={importarPdf} cargando={importando}>
                  Importar de un PDF
                </Boton>
                <Boton variante="primario" icono={<Plus size={16} />} onClick={crear}>
                  Crear a mano
                </Boton>
              </div>
            }
          />
        ) : (
          <section className="tarjeta overflow-hidden">
            {/* Búsqueda y ordenación */}
            <div className="flex flex-wrap items-center gap-3 border-b border-borde px-4 py-3">
              <div className="flex min-w-[220px] flex-1 items-center gap-2">
                <Search size={16} className="shrink-0 text-tinta-suave" />
                <input
                  className="w-full bg-transparent text-sm outline-none placeholder:text-tinta-suave"
                  placeholder="Buscar por número de contrato, nombre o cédula…"
                  value={busqueda}
                  onChange={(e) => setBusqueda(e.target.value)}
                />
                {busqueda && (
                  <button
                    onClick={() => setBusqueda('')}
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

              <span className="shrink-0 text-xs text-tinta-tenue">
                {lista.length} de {base.contratos.length}
              </span>
            </div>

            {/* Barra de acción sobre lo marcado. Aparece sólo cuando hay algo
                marcado, para no ocupar sitio el resto del tiempo. */}
            {marcadosVisibles.length > 0 && (
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-borde bg-naranja-50 px-4 py-2.5">
                <span className="text-sm font-medium text-naranja-700">
                  {marcadosVisibles.length} contrato(s) marcado(s)
                </span>
                <div className="flex gap-2">
                  <Boton variante="fantasma" onClick={() => setMarcados(new Set())}>
                    Desmarcar
                  </Boton>
                  <Boton
                    variante="peligro"
                    icono={<Trash2 size={15} />}
                    onClick={() => setPorEliminar(marcadosVisibles)}
                  >
                    Eliminar {marcadosVisibles.length}
                  </Boton>
                </div>
              </div>
            )}

            <div className="tabla-desplazable">
              <table className="w-full text-sm">
                <thead className="bg-superficie text-left text-xs uppercase tracking-wide text-tinta-tenue">
                  <tr>
                    <th className="w-10 px-4 py-2.5">
                      <input
                        type="checkbox"
                        className="accent-naranja-500"
                        title="Marcar o desmarcar todos los de la lista"
                        disabled={lista.length === 0}
                        checked={
                          lista.length > 0 && marcadosVisibles.length === lista.length
                        }
                        onChange={(e) =>
                          setMarcados(
                            e.target.checked ? new Set(lista.map((c) => c.id)) : new Set(),
                          )
                        }
                      />
                    </th>
                    <th className="px-4 py-2.5 font-medium">Contrato</th>
                    <th className="px-4 py-2.5 font-medium">Contratista</th>
                    <th className="px-4 py-2.5 font-medium">Vigencia</th>
                    <th className="px-4 py-2.5 text-right font-medium">Valor</th>
                    <th className="px-4 py-2.5 font-medium">Plantilla</th>
                    <th className="px-4 py-2.5" />
                  </tr>
                </thead>
                <tbody>
                  {lista.map((c) => {
                    const k = base.contratistas.find((x) => x.id === c.contratistaId);
                    const p = plantillas.find((x) => x.id === c.plantillaId);
                    const marcado = marcados.has(c.id);
                    return (
                      <tr
                        key={c.id}
                        className={`border-t border-borde hover:bg-superficie ${
                          marcado ? 'bg-naranja-50' : ''
                        }`}
                      >
                        <td className="px-4 py-2.5">
                          <input
                            type="checkbox"
                            className="accent-naranja-500"
                            checked={marcado}
                            onChange={(e) =>
                              setMarcados((s) => {
                                const n = new Set(s);
                                if (e.target.checked) n.add(c.id);
                                else n.delete(c.id);
                                return n;
                              })
                            }
                          />
                        </td>
                        <td className="px-4 py-2.5">
                          <span className="font-medium">{c.numero || '(sin número)'}</span>
                          {!c.activo && (
                            <span className="ml-2">
                              <Insignia>inactivo</Insignia>
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-2.5 text-tinta-tenue">
                          {k?.nombre ?? '—'}
                          {k && (
                            <span className="block text-xs text-tinta-suave">
                              {k.cedula}
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-2.5 text-tinta-tenue">
                          {formatoCorto(desdeISO(c.fechaInicio))} –{' '}
                          {formatoCorto(desdeISO(c.fechaTerminacion))}
                        </td>
                        <td className="px-4 py-2.5 text-right tabular-nums">
                          {moneda(valorVigente(c))}
                        </td>
                        <td className="px-4 py-2.5">
                          {p ? (
                            <Insignia tono="verde">{p.nombre}</Insignia>
                          ) : (
                            <Insignia tono="ambar">sin asignar</Insignia>
                          )}
                        </td>
                        <td className="px-4 py-2.5">
                          <div className="flex justify-end gap-1">
                            <Boton variante="fantasma" onClick={() => setEditandoId(c.id)}>
                              Abrir
                            </Boton>
                            <Boton
                              variante="fantasma"
                              icono={<Trash2 size={15} />}
                              onClick={() => setPorEliminar([c])}
                            >
                              Eliminar
                            </Boton>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                  {lista.length === 0 && (
                    <tr>
                      <td colSpan={7} className="px-4 py-8 text-center text-tinta-tenue">
                        Ningún contrato coincide con «{busqueda}».
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </section>
        )}
      </div>
    </Pagina>
  );
}

// ── Editor ──────────────────────────────────────────────────────────────────

function EditorContrato({
  contrato,
  avisos,
  alVolver,
}: {
  contrato: Contrato;
  avisos: string[];
  alVolver: () => void;
}) {
  const { base, guardar, plantillas } = useEstado();
  // También la pestaña: se vuelve a «Obligaciones» si se estaba ahí.
  const [pestana, setPestana] = useRecordado<'datos' | 'pagos' | 'obligaciones' | 'novedades'>(
    'contratos.pestana',
    'datos',
    (v): v is 'datos' | 'pagos' | 'obligaciones' | 'novedades' =>
      v === 'datos' || v === 'pagos' || v === 'obligaciones' || v === 'novedades',
  );
  const [redactando, setRedactando] = useState(false);
  /** Cómo fue la última redacción de actividades: con qué, o por qué falló. */
  const [avisoRedaccion, setAvisoRedaccion] = useState<{
    tipo: 'exito' | 'error';
    texto: string;
  } | null>(null);

  /**
   * Teléfonos y cuentas que esta persona ya ha usado.
   *
   * No hay una lista aparte que mantener: los «registrados» son sencillamente
   * los que constan en sus otros contratos. Así nada se queda desactualizado y
   * no hay una pantalla más que rellenar.
   */
  const { telefonosConocidos, cuentasConocidas } = useMemo(() => {
    const suyos = (base?.contratos ?? []).filter(
      (c) => c.contratistaId === contrato.contratistaId && c.id !== contrato.id,
    );
    const distintos = (valores: (string | undefined)[]) => [
      ...new Set(valores.map((v) => v?.trim()).filter((v): v is string => !!v)),
    ];
    return {
      telefonosConocidos: distintos(suyos.map((c) => c.telefono)),
      cuentasConocidas: distintos(suyos.map((c) => c.numeroDeCuenta)),
    };
  }, [base, contrato.contratistaId, contrato.id]);

  if (!base) return <Cargando />;

  const set = (parcial: Partial<Contrato>) =>
    void guardar((b) => ({
      ...b,
      contratos: b.contratos.map((c) =>
        // La hora del cambio: «Generar mes» pone primero el último tocado.
        c.id === contrato.id ? { ...c, ...parcial, actualizadoEn: new Date().toISOString() } : c,
      ),
    }));

  async function eliminar() {
    // Pasa por la papelera, igual que desde la lista: nada se pierde de golpe.
    await guardar((b) => enviarAPapelera(b, contrato.id));
    alVolver();
  }

  /** `todas`: también las ya escritas, para rehacerlas (p. ej. con la IA). */
  async function redactarActividades(todas = false) {
    setRedactando(true);
    setAvisoRedaccion(null);
    try {
      const lista = todas
        ? contrato.obligaciones.map((o) => ({ ...o, actividad: undefined }))
        : contrato.obligaciones;
      const r = await window.api.extraccion.redactarActividades(lista, true);
      if (r.motor === 'fallo') {
        // La IA configurada no respondió: no se escribe nada a escondidas.
        setAvisoRedaccion({ tipo: 'error', texto: r.error ?? 'La IA no respondió.' });
        return;
      }
      set({
        obligaciones: contrato.obligaciones.map((o, i) => ({
          ...o,
          actividad: r.actividades[i] ?? o.actividad,
        })),
      });
      setAvisoRedaccion({
        tipo: 'exito',
        texto:
          r.motor === 'ia'
            ? `Redactadas con ${r.proveedor ?? 'IA'}. Revíselas antes de generar.`
            : 'Redactadas por reglas gramaticales, porque no hay ninguna clave de IA en Ajustes.',
      });
    } catch (e) {
      setAvisoRedaccion({ tipo: 'error', texto: e instanceof Error ? e.message : String(e) });
    } finally {
      setRedactando(false);
    }
  }

  /** La salida de siempre, sin IA: cuando la IA falla y no se quiere esperar. */
  function redactarPorReglas() {
    const actividades = completarActividades(contrato.obligaciones, true);
    set({
      obligaciones: contrato.obligaciones.map((o, i) => ({ ...o, actividad: actividades[i] })),
    });
    setAvisoRedaccion({ tipo: 'exito', texto: 'Redactadas por reglas gramaticales.' });
  }

  const PESTANAS = [
    { id: 'datos', etiqueta: 'Datos' },
    { id: 'pagos', etiqueta: 'Pagos' },
    { id: 'obligaciones', etiqueta: `Obligaciones (${contrato.obligaciones.length})` },
    {
      id: 'novedades',
      etiqueta: `Novedades (${contrato.adiciones.length + contrato.suspensiones.length})`,
    },
  ] as const;

  return (
    <Pagina
      titulo={contrato.numero || 'Contrato sin número'}
      descripcion={base.contratistas.find((k) => k.id === contrato.contratistaId)?.nombre}
      acciones={
        <>
          <Boton icono={<ArrowLeft size={16} />} onClick={alVolver}>
            Volver
          </Boton>
          <Boton variante="peligro" icono={<Trash2 size={16} />} onClick={eliminar}>
            Eliminar
          </Boton>
        </>
      }
    >
      <div className="flex flex-col gap-5 pb-8">
        {avisos.map((a, i) => (
          <Aviso key={i} tipo="alerta">
            {a}
          </Aviso>
        ))}

        <CargarDeOtroContrato
          key={`${contrato.id}-${contrato.contratistaId}`}
          contrato={contrato}
          otros={base.contratos.filter(
            (c) => c.contratistaId === contrato.contratistaId && c.id !== contrato.id,
          )}
          alCargar={(anterior) =>
            void guardar((b) => ({
              ...b,
              contratos: b.contratos.map((c) =>
                c.id === contrato.id
                  ? { ...heredarDeContrato(c, anterior), actualizadoEn: new Date().toISOString() }
                  : c,
              ),
            }))
          }
        />

        <div className="flex gap-1 border-b border-borde">
          {PESTANAS.map((p) => (
            <button
              key={p.id}
              onClick={() => setPestana(p.id)}
              className={`-mb-px border-b-2 px-3 py-2 text-sm font-medium transition-colors
                          ${
                            pestana === p.id
                              ? 'border-naranja-500 text-naranja-700'
                              : 'border-transparent text-tinta-tenue hover:text-tinta'
                          }`}
            >
              {p.etiqueta}
            </button>
          ))}
        </div>

        {pestana === 'datos' && (
          <div className="grid gap-4 sm:grid-cols-2">
            <Campo etiqueta="Número de contrato" ayuda="Formato NNN-AAAA">
              <input
                className="campo"
                value={contrato.numero}
                onChange={(e) => set({ numero: e.target.value })}
                placeholder="Ejemplo: 001-2025"
              />
            </Campo>
            <Campo etiqueta="Contratista">
              <select
                className="campo"
                value={contrato.contratistaId}
                onChange={(e) => set({ contratistaId: e.target.value })}
              >
                {base.contratistas.map((k) => (
                  <option key={k.id} value={k.id}>
                    {k.nombre}
                  </option>
                ))}
              </select>
            </Campo>

            <div className="sm:col-span-2">
              <Campo etiqueta="Objeto">
                <Dictable>
                  <textarea
                    className="campo min-h-[88px]"
                    value={contrato.objeto}
                    onChange={(e) => set({ objeto: e.target.value })}
                  />
                </Dictable>
              </Campo>
              <BotonesDeCaja
                texto={contrato.objeto}
                alCambiar={(objeto) => set({ objeto })}
              />
            </div>

            <Campo etiqueta="Fecha de inicio">
              <input
                type="date"
                className="campo"
                value={contrato.fechaInicio}
                onChange={(e) => set({ fechaInicio: e.target.value })}
              />
            </Campo>
            <Campo etiqueta="Fecha de terminación">
              <input
                type="date"
                className="campo"
                value={contrato.fechaTerminacion}
                onChange={(e) => set({ fechaTerminacion: e.target.value })}
              />
            </Campo>
            <Campo etiqueta="Fecha de firma">
              <input
                type="date"
                className="campo"
                value={contrato.fechaFirma}
                onChange={(e) => set({ fechaFirma: e.target.value })}
              />
            </Campo>
            {fechasInvertidas(contrato) && (
              <div className="sm:col-span-2">
                <Aviso tipo="error" titulo="Las fechas están al revés">
                  {fechasInvertidas(contrato)} Mientras tanto no se puede generar el
                  cronograma de pagos ni ningún documento.
                </Aviso>
              </div>
            )}
            {/* Una plantilla por documento: los tres salen del mismo contrato
                pero de moldes de Word distintos. */}
            <Campo etiqueta="Plantilla del informe">
              <SelectorDePlantilla
                plantillas={plantillas}
                tipo="informe"
                valor={contrato.plantillaId}
                alCambiar={(v) => set({ plantillaId: v })}
              />
            </Campo>
            <Campo etiqueta="Plantilla de la cuenta de cobro">
              <SelectorDePlantilla
                plantillas={plantillas}
                tipo="cuentaDeCobro"
                valor={contrato.plantillaCuentaId ?? ''}
                alCambiar={(v) => set({ plantillaCuentaId: v || undefined })}
              />
            </Campo>
            <Campo etiqueta="Plantilla del certificado de cumplimiento">
              <SelectorDePlantilla
                plantillas={plantillas}
                tipo="certificado"
                valor={contrato.plantillaCertificadoId ?? ''}
                alCambiar={(v) => set({ plantillaCertificadoId: v || undefined })}
              />
            </Campo>

            <div className="sm:col-span-2">
              <Campo
                etiqueta="Texto del PLAZO"
                ayuda="Va tal cual en el informe. El botón lo redacta a partir de las fechas."
              >
                <Dictable>
                  <textarea
                    className="campo min-h-[72px]"
                    value={contrato.textoPlazo}
                    onChange={(e) => set({ textoPlazo: e.target.value })}
                  />
                </Dictable>
              </Campo>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <Boton
                  icono={<Wand2 size={15} />}
                  onClick={() =>
                    set({
                      textoPlazo: frasePlazo(
                        desdeISO(contrato.fechaInicio),
                        desdeISO(contrato.fechaTerminacion),
                      ),
                    })
                  }
                >
                  Redactar desde las fechas
                </Boton>
                <span className="-mt-2">
                  <BotonesDeCaja
                    texto={contrato.textoPlazo}
                    alCambiar={(textoPlazo) => set({ textoPlazo })}
                  />
                </span>
              </div>
            </div>

            <Campo etiqueta="Contratante">
              <Dictable>
                <input
                  className="campo"
                  value={contrato.contratante}
                  onChange={(e) => set({ contratante: e.target.value })}
                />
              </Dictable>
            </Campo>
            <Campo etiqueta="NIT del contratante">
              <input
                className="campo"
                value={contrato.nitContratante}
                onChange={(e) => set({ nitContratante: e.target.value })}
              />
            </Campo>
            <Campo etiqueta="Municipio">
              <Dictable>
                <input
                  className="campo"
                  value={contrato.municipio}
                  onChange={(e) => set({ municipio: e.target.value })}
                />
              </Dictable>
            </Campo>
            <Campo
              etiqueta="Departamento"
              ayuda="Sale entre paréntesis en la frase de expedición del certificado."
            >
              <Dictable>
                <input
                  className="campo"
                  value={contrato.departamento ?? ''}
                  placeholder="Ejemplo: Nariño"
                  onChange={(e) => set({ departamento: e.target.value })}
                />
              </Dictable>
            </Campo>

            {/* Datos de pago: sólo se usan en la cuenta de cobro, pero se piden
                aquí porque cambian con el contrato, no con el mes. */}
            <Campo
              etiqueta="Teléfono"
              ayuda="Para la cuenta de cobro. La lista ofrece los que ya usó esta persona."
            >
              <input
                className="campo"
                list={`telefonos-${contrato.id}`}
                value={contrato.telefono ?? ''}
                placeholder="Ejemplo: 300XXXXXXX"
                onChange={(e) => set({ telefono: e.target.value })}
              />
              <datalist id={`telefonos-${contrato.id}`}>
                {telefonosConocidos.map((t) => (
                  <option key={t} value={t} />
                ))}
              </datalist>
            </Campo>
            <Campo
              etiqueta="Número de cuenta"
              ayuda="A dónde se le consigna. También se ofrecen las ya usadas."
            >
              <input
                className="campo"
                list={`cuentas-${contrato.id}`}
                value={contrato.numeroDeCuenta ?? ''}
                placeholder="Ejemplo: 123XXXXXXXXX"
                onChange={(e) => set({ numeroDeCuenta: e.target.value })}
              />
              <datalist id={`cuentas-${contrato.id}`}>
                {cuentasConocidas.map((c) => (
                  <option key={c} value={c} />
                ))}
              </datalist>
            </Campo>
            <Campo etiqueta="Supervisor">
              <Dictable>
                <input
                  className="campo"
                  value={contrato.supervisor.nombre}
                  onChange={(e) =>
                    set({ supervisor: { ...contrato.supervisor, nombre: e.target.value } })
                  }
                />
              </Dictable>
            </Campo>
            <div className="sm:col-span-2">
              <Campo etiqueta="Cargo del supervisor">
                <Dictable>
                  <textarea
                    className="campo min-h-[64px]"
                    value={contrato.supervisor.cargo}
                    onChange={(e) =>
                      set({ supervisor: { ...contrato.supervisor, cargo: e.target.value } })
                    }
                  />
                </Dictable>
              </Campo>
            </div>

            <div className="sm:col-span-2">
              <Campo
                etiqueta="FORMA DE PAGO"
                ayuda="Es el párrafo que va encima de la tabla PAGO / FECHA / VALOR. El botón lo redacta con las cifras del cronograma."
              >
                <Dictable>
                  <textarea
                    className="campo min-h-[150px]"
                    value={contrato.formaDePago}
                    onChange={(e) => set({ formaDePago: e.target.value })}
                    placeholder="El Municipio cancelará al contratista la suma de…"
                  />
                </Dictable>
              </Campo>
              <div className="mt-2 flex flex-wrap gap-2">
                <Boton
                  icono={<Wand2 size={15} />}
                  disabled={contrato.cuotas.length === 0}
                  title={
                    contrato.cuotas.length === 0
                      ? 'Genere primero el cronograma en la pestaña Pagos'
                      : undefined
                  }
                  onClick={() =>
                    set({
                      formaDePago: redactarFormaDePago({
                        valorTotal: contrato.valorInicial,
                        cuotas: contrato.cuotas,
                        fechaInicio: contrato.fechaInicio,
                      }),
                    })
                  }
                >
                  Redactar desde el cronograma
                </Boton>
                <Boton
                  variante="fantasma"
                  disabled={contrato.cuotas.length === 0}
                  onClick={() =>
                    set({
                      formaDePago: redactarFormaDePago({
                        valorTotal: contrato.valorInicial,
                        cuotas: contrato.cuotas,
                        fechaInicio: contrato.fechaInicio,
                        incluirRequisitos: true,
                      }),
                    })
                  }
                >
                  … con la coletilla de requisitos
                </Boton>
              </div>
              {contrato.cuotas.length === 0 && (
                <p className="mt-2 text-xs text-alerta-fuerte">
                  Para redactarlo automáticamente hace falta el cronograma: créelo en la
                  pestaña «Pagos».
                </p>
              )}
            </div>

            {/* ELEMENTOS DE ORDEN FINANCIERO Y CONTABLE del informe. La fecha
                se descompone en día, mes y año dentro del documento, pero aquí
                se pide entera: es un dato solo, no tres. El beneficiario no se
                pregunta porque siempre es el contratista. */}
            <div className="sm:col-span-2">
              <h3 className="mb-1 text-sm font-semibold">Imputación presupuestal</h3>
              <p className="mb-3 text-xs text-tinta-tenue">
                Van en la tabla de ELEMENTOS DE ORDEN FINANCIERO Y CONTABLE. El
                beneficiario lo pone el programa: es el propio contratista.
              </p>
            </div>

            <Campo etiqueta="CDP — número">
              <input
                className="campo"
                value={contrato.cdp.numero}
                placeholder="Ejemplo: 202XXXXXXX"
                onChange={(e) => set({ cdp: { ...contrato.cdp, numero: e.target.value } })}
              />
            </Campo>
            <Campo etiqueta="CDP — fecha">
              <input
                type="date"
                className="campo"
                value={contrato.cdp.fecha}
                onChange={(e) => set({ cdp: { ...contrato.cdp, fecha: e.target.value } })}
              />
            </Campo>
            <div className="sm:col-span-2">
              <Campo etiqueta="CDP — valor">
                <CampoMoneda
                  className="campo"
                  valor={contrato.cdp.valor}
                  alCambiar={(v) => set({ cdp: { ...contrato.cdp, valor: v } })}
                />
              </Campo>
            </div>

            <Campo etiqueta="RP — número">
              <input
                className="campo"
                value={contrato.rp.numero}
                placeholder="Ejemplo: 202XXXXXXX"
                onChange={(e) => set({ rp: { ...contrato.rp, numero: e.target.value } })}
              />
            </Campo>
            <Campo etiqueta="RP — fecha">
              <input
                type="date"
                className="campo"
                value={contrato.rp.fecha}
                onChange={(e) => set({ rp: { ...contrato.rp, fecha: e.target.value } })}
              />
            </Campo>
            <div className="sm:col-span-2">
              <Campo etiqueta="RP — valor">
                <CampoMoneda
                  className="campo"
                  valor={contrato.rp.valor}
                  alCambiar={(v) => set({ rp: { ...contrato.rp, valor: v } })}
                />
              </Campo>
            </div>
          </div>
        )}

        {pestana === 'pagos' && <PestanaPagos contrato={contrato} set={set} />}

        {pestana === 'obligaciones' && (
          <PestanaObligaciones
            contrato={contrato}
            set={set}
            redactando={redactando}
            alRedactar={redactarActividades}
            avisoRedaccion={avisoRedaccion}
            alRedactarPorReglas={redactarPorReglas}
          />
        )}

        {pestana === 'novedades' && <PestanaNovedades contrato={contrato} set={set} />}
      </div>
    </Pagina>
  );
}

// ── Pestaña de pagos ────────────────────────────────────────────────────────

function PestanaPagos({
  contrato,
  set,
}: {
  contrato: Contrato;
  set: (p: Partial<Contrato>) => void;
}) {
  const [mensual, setMensual] = useState(0);
  const [excepciones, setExcepciones] = useState<{ clave: string; valor: number }[]>([]);

  const suma = contrato.cuotas.reduce((s, c) => s + c.valor, 0);
  const cuadra = suma === contrato.valorInicial;
  const diferencia = contrato.valorInicial - suma;

  /** Meses que abarca el contrato, para el desplegable de excepciones. */
  const mesesDelContrato = useMemo(() => {
    const ini = desdeISO(contrato.fechaInicio);
    const fin = desdeISO(contrato.fechaTerminacion);
    const lista: { clave: string; etiqueta: string }[] = [];
    let a = ini.anio;
    let m = ini.mes;
    while (a < fin.anio || (a === fin.anio && m <= fin.mes)) {
      const clave = `${a}-${String(m).padStart(2, '0')}`;
      lista.push({
        clave,
        etiqueta: `${NOMBRES_MES[m - 1]} de ${a}`,
      });
      m += 1;
      if (m > 12) {
        m = 1;
        a += 1;
      }
      if (lista.length > 240) break;
    }
    return lista;
  }, [contrato.fechaInicio, contrato.fechaTerminacion]);

  /**
   * Lo que impide generar el cronograma, dicho para poder arreglarlo.
   *
   * Antes el botón fallaba en silencio: con la fecha de inicio después de la
   * de terminación —un año mal puesto— no pasaba nada y no se sabía por qué.
   */
  const [errorCronograma, setErrorCronograma] = useState<string | null>(null);
  const invertidas = fechasInvertidas(contrato);
  const fechasAlReves = invertidas && `${invertidas} Corríjalas en la pestaña Datos.`;

  function generar() {
    setErrorCronograma(null);
    if (fechasAlReves) {
      setErrorCronograma(fechasAlReves);
      return;
    }
    const porMes: Record<string, number> = {};
    for (const e of excepciones) {
      if (e.clave && e.valor > 0) porMes[e.clave] = e.valor;
    }
    try {
      set({
        cuotas: generarCronograma({
          fechaInicio: contrato.fechaInicio,
          fechaTerminacion: contrato.fechaTerminacion,
          valorMensual: mensual,
          porMes,
        }),
      });
    } catch (e) {
      setErrorCronograma(
        `No se pudo generar el cronograma: ${e instanceof Error ? e.message : String(e)}`,
      );
    }
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="grid gap-4 sm:grid-cols-2">
        <Campo
          etiqueta="Valor inicial del contrato"
          ayuda="Escriba la cifra en números; abajo se muestra cómo quedará escrita en letras en el informe."
        >
          <CampoMoneda
            className="campo"
            valor={contrato.valorInicial}
            alCambiar={(v) => set({ valorInicial: v })}
            placeholder="Ejemplo: $12.000.000"
          />
        </Campo>
        <div className="flex items-end pb-1">
          <p className="text-sm leading-snug text-tinta-tenue">
            En el informe saldrá:
            <br />
            <strong className="text-tinta">
              {contrato.valorInicial > 0
                ? montoALetras(contrato.valorInicial)
                : '— escriba primero el valor —'}
            </strong>
          </p>
        </div>
      </div>

      <section className="tarjeta p-5">
        <h3 className="font-semibold">Generar el cronograma</h3>
        <p className="mb-4 mt-1 text-sm text-tinta-tenue">
          Mensualidades vencidas pagaderas el último día de cada mes. Ponga el importe
          normal y añada una excepción para cada mes que se pague distinto — por ejemplo,
          el primero, si el contrato arrancó a mitad de mes y no se paga completo.
        </p>

        <div className="flex flex-wrap items-end gap-3">
          <Campo etiqueta="Importe de los meses completos">
            <CampoMoneda
              className="campo"
              valor={mensual}
              alCambiar={setMensual}
              placeholder="Ejemplo: $2.000.000"
            />
          </Campo>
          <Boton
            icono={<Plus size={15} />}
            onClick={() =>
              setExcepciones([
                ...excepciones,
                { clave: mesesDelContrato[0]?.clave ?? '', valor: 0 },
              ])
            }
          >
            Añadir mes con otro importe
          </Boton>
        </div>

        {excepciones.length > 0 && (
          <div className="mt-4 flex flex-col gap-2">
            {excepciones.map((e, i) => (
              <div key={i} className="flex flex-wrap items-end gap-2">
                <label className="block">
                  <span className="etiqueta">Mes</span>
                  <select
                    className="campo"
                    value={e.clave}
                    onChange={(ev) =>
                      setExcepciones(
                        excepciones.map((x, j) =>
                          j === i ? { ...x, clave: ev.target.value } : x,
                        ),
                      )
                    }
                  >
                    {mesesDelContrato.map((m) => (
                      <option key={m.clave} value={m.clave}>
                        {m.etiqueta}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="block">
                  <span className="etiqueta">Importe de ese mes</span>
                  <CampoMoneda
                    className="campo"
                    valor={e.valor}
                    alCambiar={(v) =>
                      setExcepciones(
                        excepciones.map((x, j) => (j === i ? { ...x, valor: v } : x)),
                      )
                    }
                    placeholder="Ejemplo: $1.500.000"
                  />
                </label>
                <Boton
                  variante="fantasma"
                  icono={<Trash2 size={14} />}
                  onClick={() => setExcepciones(excepciones.filter((_, j) => j !== i))}
                >
                  Quitar
                </Boton>
              </div>
            ))}
          </div>
        )}

        <div className="mt-4 flex flex-wrap items-center gap-3">
          <Boton
            variante="primario"
            icono={<CalendarClock size={16} />}
            disabled={mensual <= 0}
            title={mensual <= 0 ? 'Escriba primero el importe de los meses completos' : undefined}
            onClick={generar}
          >
            Generar cronograma
          </Boton>
          {mensual <= 0 && (
            <span className="text-xs text-tinta-tenue">
              Escriba primero el importe de los meses completos.
            </span>
          )}
        </div>

        {(errorCronograma ?? fechasAlReves) && (
          <div className="mt-4">
            <Aviso tipo="error" titulo="Revise las fechas del contrato">
              {errorCronograma ?? fechasAlReves}
            </Aviso>
          </div>
        )}
      </section>

      {contrato.cuotas.length > 0 && (
        <section className="tarjeta overflow-hidden">
          <div className="border-b border-borde px-4 py-3">
            <h3 className="text-sm font-semibold">Cuotas</h3>
            <p className="mt-0.5 text-xs text-tinta-tenue">
              Puede ajustar cualquier fecha o importe a mano; lo que escriba aquí manda
              sobre lo que generó el botón de arriba.
            </p>
          </div>
          <div className="tabla-desplazable">
            <table className="w-full text-sm">
              <thead className="bg-superficie text-left text-xs uppercase tracking-wide text-tinta-tenue">
                <tr>
                  <th className="px-4 py-2.5 font-medium">Pago</th>
                  <th className="px-4 py-2.5 font-medium">Mes</th>
                  <th className="px-4 py-2.5 font-medium">Fecha</th>
                  <th className="px-4 py-2.5 text-right font-medium">Valor</th>
                  <th className="px-4 py-2.5" />
                </tr>
              </thead>
              <tbody>
                {contrato.cuotas.map((c, i) => {
                  const f = desdeISO(c.fecha);
                  return (
                    <tr key={i} className="border-t border-borde">
                      <td className="px-4 py-2">{c.n}</td>
                      <td className="px-4 py-2 text-tinta-tenue">
                        {NOMBRES_MES[f.mes - 1]} {f.anio}
                      </td>
                      <td className="px-4 py-2">
                        <input
                          type="date"
                          className="campo py-1"
                          value={c.fecha}
                          onChange={(e) =>
                            set({
                              cuotas: contrato.cuotas.map((x, j) =>
                                j === i ? { ...x, fecha: e.target.value } : x,
                              ),
                            })
                          }
                        />
                      </td>
                      <td className="px-4 py-2 text-right">
                        <CampoMoneda
                          className="campo w-40 py-1 text-right"
                          valor={c.valor}
                          alCambiar={(v) =>
                            set({
                              cuotas: contrato.cuotas.map((x, j) =>
                                j === i ? { ...x, valor: v } : x,
                              ),
                            })
                          }
                        />
                      </td>
                      <td className="px-4 py-2">
                        <Boton
                          variante="fantasma"
                          icono={<Trash2 size={14} />}
                          onClick={() =>
                            set({
                              cuotas: contrato.cuotas
                                .filter((_, j) => j !== i)
                                .map((x, j) => ({ ...x, n: j + 1 })),
                            })
                          }
                        >
                          Quitar
                        </Boton>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-borde bg-superficie font-medium">
                  <td className="px-4 py-2.5" colSpan={3}>
                    Suma de las cuotas
                  </td>
                  <td className="px-4 py-2.5 text-right tabular-nums">{moneda(suma)}</td>
                  <td />
                </tr>
              </tfoot>
            </table>
          </div>
        </section>
      )}

      {contrato.cuotas.length > 0 && !cuadra && (
        <Aviso tipo="alerta" titulo="Las cuotas no suman el valor del contrato">
          Las cuotas suman {moneda(suma)} y el contrato vale{' '}
          {moneda(contrato.valorInicial)}:{' '}
          {diferencia > 0
            ? `faltan ${moneda(diferencia)}`
            : `sobran ${moneda(-diferencia)}`}
          . Si no se corrige, el saldo por ejecutar de los informes no llegará a cero al
          final del contrato.
        </Aviso>
      )}
      {contrato.cuotas.length > 0 && cuadra && (
        <Aviso tipo="exito">Las cuotas suman exactamente el valor del contrato.</Aviso>
      )}
    </div>
  );
}

// ── Pestaña de obligaciones ─────────────────────────────────────────────────

function PestanaObligaciones({
  contrato,
  set,
  redactando,
  alRedactar,
  avisoRedaccion,
  alRedactarPorReglas,
}: {
  contrato: Contrato;
  set: (p: Partial<Contrato>) => void;
  redactando: boolean;
  alRedactar: (todas?: boolean) => Promise<void>;
  avisoRedaccion: { tipo: 'exito' | 'error'; texto: string } | null;
  alRedactarPorReglas: () => void;
}) {
  /** Si el último intento fue de todas, el reintento también lo es. */
  const [ultimoTodas, setUltimoTodas] = useState(false);

  // ── Leer las obligaciones de una foto o PDF del contrato ──
  const [leyendo, setLeyendo] = useState(false);
  /** Lo leído, esperando a que se elija reemplazar o agregar. */
  const [leidas, setLeidas] = useState<{ obligaciones: string[]; origen: string } | null>(null);
  const [avisoLectura, setAvisoLectura] = useState<{
    tipo: 'exito' | 'error' | 'alerta';
    texto: string;
  } | null>(null);
  /** Las obligaciones de antes de leer, para poder deshacer. */
  const [antesDeLeer, setAntesDeLeer] = useState<Obligacion[] | null>(null);
  const hayEscritas = contrato.obligaciones.some((o) => o.texto.trim().length > 0);

  async function leerDeArchivo() {
    const ruta = await window.api.sistema.elegirArchivo([
      { name: 'Contrato (foto o PDF)', extensions: ['jpg', 'jpeg', 'png', 'webp', 'pdf'] },
    ]);
    if (!ruta) return;
    setLeyendo(true);
    setAvisoLectura(null);
    setLeidas(null);
    try {
      const r = await window.api.extraccion.obligaciones(ruta);
      if (!r.ok) {
        setAvisoLectura({ tipo: 'error', texto: r.error });
        return;
      }
      const origen = r.motor === 'ia' ? `con ${r.proveedor ?? 'IA'}` : 'sin IA';
      if (hayEscritas) {
        // Ya había obligaciones: que decida la persona.
        setLeidas({ obligaciones: r.obligaciones, origen });
        if (r.aviso) setAvisoLectura({ tipo: 'alerta', texto: r.aviso });
      } else {
        aplicarLeidas(r.obligaciones, 'reemplazar', origen, r.aviso);
      }
    } catch (e) {
      setAvisoLectura({ tipo: 'error', texto: e instanceof Error ? e.message : String(e) });
    } finally {
      setLeyendo(false);
    }
  }

  function aplicarLeidas(
    textos: string[],
    modo: 'reemplazar' | 'agregar',
    origen: string,
    aviso?: string,
  ) {
    setAntesDeLeer(contrato.obligaciones);
    const base = modo === 'agregar' ? contrato.obligaciones.filter((o) => o.texto.trim()) : [];
    set({ obligaciones: renumerar([...base, ...textos.map((texto) => ({ n: 0, texto }))]) });
    setLeidas(null);
    setAvisoLectura({
      tipo: aviso ? 'alerta' : 'exito',
      texto:
        `Se ${modo === 'agregar' ? 'agregaron al final' : 'pusieron'} ${textos.length} obligaciones ` +
        `leídas ${origen}. Revíselas antes de generar.` +
        (aviso ? ` ${aviso}` : ''),
    });
  }
  const redactar = (todas = false) => {
    setUltimoTodas(todas);
    return alRedactar(todas);
  };
  function actualizar(i: number, parcial: Partial<Obligacion>) {
    set({
      obligaciones: contrato.obligaciones.map((o, j) =>
        j === i ? { ...o, ...parcial } : o,
      ),
    });
  }

  function agregar() {
    set({
      obligaciones: [
        ...contrato.obligaciones,
        { n: contrato.obligaciones.length + 1, texto: '' },
      ],
    });
  }

  function quitar(i: number) {
    set({
      obligaciones: contrato.obligaciones
        .filter((_, j) => j !== i)
        .map((o, j) => ({ ...o, n: j + 1 })),
    });
  }

  const sinActividad = contrato.obligaciones.filter(
    (o) => !o.actividad || o.actividad.trim().length === 0,
  ).length;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-tinta-tenue">
          {contrato.obligaciones.length} obligaciones ·{' '}
          {sinActividad > 0 ? (
            <span className="text-alerta-fuerte">{sinActividad} sin actividad redactada</span>
          ) : (
            <span className="text-exito-fuerte">todas con actividad</span>
          )}
        </p>
        <div className="flex flex-wrap gap-2">
          {sinActividad > 0 && (
            <Boton icono={<Wand2 size={15} />} onClick={() => void redactar()} cargando={redactando}>
              Redactar las {sinActividad} actividad(es) que faltan
            </Boton>
          )}
          {sinActividad < contrato.obligaciones.length && (
            <Boton
              variante="fantasma"
              icono={<Wand2 size={15} />}
              disabled={redactando}
              title="Reescribe todas las actividades, también las ya escritas"
              onClick={() => {
                if (
                  window.confirm(
                    'Se volverán a redactar TODAS las actividades y se reemplazarán las que ya están escritas. ¿Continuar?',
                  )
                ) {
                  void redactar(true);
                }
              }}
            >
              Volver a redactar todas
            </Boton>
          )}
          <Boton
            icono={<ScanLine size={15} />}
            onClick={() => void leerDeArchivo()}
            cargando={leyendo}
            title="Lee las obligaciones específicas numeradas de una foto o un PDF del contrato"
          >
            {leyendo ? 'Leyendo el contrato…' : 'Leer de una foto o PDF'}
          </Boton>
          <Boton icono={<Plus size={15} />} onClick={agregar}>
            Agregar una
          </Boton>
        </div>
      </div>

      {leidas && (
        <Aviso tipo="info" titulo={`Se leyeron ${leidas.obligaciones.length} obligaciones ${leidas.origen}`}>
          El contrato ya tiene {contrato.obligaciones.length} obligación(es). ¿Qué hago con las leídas?
          <div className="mt-2 flex flex-wrap gap-2">
            <Boton
              variante="primario"
              onClick={() => aplicarLeidas(leidas.obligaciones, 'reemplazar', leidas.origen)}
            >
              Reemplazar las actuales
            </Boton>
            <Boton onClick={() => aplicarLeidas(leidas.obligaciones, 'agregar', leidas.origen)}>
              Agregarlas al final
            </Boton>
            <Boton variante="fantasma" onClick={() => setLeidas(null)}>
              Descartar
            </Boton>
          </div>
        </Aviso>
      )}
      {avisoLectura && !leidas && (
        <Aviso tipo={avisoLectura.tipo}>
          {avisoLectura.texto}
          {antesDeLeer && avisoLectura.tipo !== 'error' && (
            <div className="mt-2">
              <Boton
                variante="fantasma"
                icono={<Undo2 size={14} />}
                onClick={() => {
                  set({ obligaciones: antesDeLeer });
                  setAntesDeLeer(null);
                  setAvisoLectura({ tipo: 'exito', texto: 'Se dejaron las obligaciones como estaban.' });
                }}
              >
                Deshacer
              </Boton>
            </div>
          )}
        </Aviso>
      )}

      {avisoRedaccion?.tipo === 'error' && (
        <Aviso tipo="error" titulo="No se redactó nada">
          {avisoRedaccion.texto}
          <div className="mt-2 flex flex-wrap gap-2">
            <Boton
              variante="secundario"
              icono={<Wand2 size={15} />}
              cargando={redactando}
              onClick={() => void redactar(ultimoTodas)}
            >
              Reintentar
            </Boton>
            <Boton variante="fantasma" disabled={redactando} onClick={alRedactarPorReglas}>
              Redactar por reglas, sin IA
            </Boton>
          </div>
        </Aviso>
      )}
      {avisoRedaccion?.tipo === 'exito' && <Aviso tipo="exito">{avisoRedaccion.texto}</Aviso>}

      {contrato.obligaciones.length === 0 && (
        <Aviso tipo="info">
          Sin obligaciones registradas, el informe conservará las filas que traiga la
          plantilla —las de otro contrato— y el certificado, sus actividades. Escríbalas
          aquí abajo para que se generen las suyas.
        </Aviso>
      )}

      <RedactorDeObligaciones
        key={contrato.id}
        contratoId={contrato.id}
        objeto={contrato.objeto}
        cuantasHay={contrato.obligaciones.length}
        alAgregar={(textos) =>
          set({
            obligaciones: renumerar([
              ...contrato.obligaciones,
              ...textos.map((texto) => ({ n: 0, texto })),
            ]),
          })
        }
        alReemplazar={(textos) =>
          set({ obligaciones: renumerar(textos.map((texto) => ({ n: 0, texto }))) })
        }
      />

      {contrato.obligaciones.map((o, i) => (
        <div key={i} className="tarjeta p-4">
          <div className="mb-3 flex items-center justify-between">
            <span className="text-sm font-semibold text-naranja-700">{o.n}.</span>
            <Boton variante="fantasma" icono={<Trash2 size={14} />} onClick={() => quitar(i)}>
              Quitar
            </Boton>
          </div>
          <div className="grid gap-3 lg:grid-cols-2">
            <Campo etiqueta="Obligación específica">
              <Dictable>
                <textarea
                  className="campo min-h-[96px]"
                  value={o.texto}
                  onChange={(e) => actualizar(i, { texto: e.target.value })}
                />
              </Dictable>
            </Campo>
            <Campo etiqueta="Actividad ejecutada">
              <Dictable>
                <textarea
                  className="campo min-h-[96px]"
                  value={o.actividad ?? ''}
                  onChange={(e) => actualizar(i, { actividad: e.target.value })}
                  placeholder="Se redactará automáticamente si la deja vacía."
                />
              </Dictable>
            </Campo>
          </div>
        </div>
      ))}
    </div>
  );
}

// ── Pestaña de novedades ────────────────────────────────────────────────────

function PestanaNovedades({
  contrato,
  set,
}: {
  contrato: Contrato;
  set: (p: Partial<Contrato>) => void;
}) {
  return (
    <div className="flex flex-col gap-6">
      <Aviso tipo="info">
        Las adiciones aumentan el valor o prorrogan el plazo. Las suspensiones congelan el
        contrato: los días suspendidos se excluyen del informe y corren la fecha de
        terminación. Ambas cosas son excepcionales — lo normal es dejar esto vacío.
      </Aviso>

      {/* Adiciones */}
      <section>
        <div className="mb-3 flex items-center justify-between">
          <h3 className="font-semibold">Adiciones y prórrogas</h3>
          <Boton
            icono={<Plus size={15} />}
            onClick={() =>
              set({
                adiciones: [
                  ...contrato.adiciones,
                  {
                    id: `ad_${Date.now()}`,
                    fecha: contrato.fechaTerminacion,
                    valor: 0,
                    cuotasAgregadas: [],
                  },
                ],
              })
            }
          >
            Agregar adición
          </Boton>
        </div>

        {contrato.adiciones.length === 0 ? (
          <p className="text-sm text-tinta-tenue">Sin adiciones.</p>
        ) : (
          contrato.adiciones.map((a, i) => (
            <div key={a.id} className="tarjeta mb-3 p-4">
              <div className="grid gap-3 sm:grid-cols-3">
                <Campo etiqueta="Fecha del otrosí">
                  <input
                    type="date"
                    className="campo"
                    value={a.fecha}
                    onChange={(e) =>
                      set({
                        adiciones: contrato.adiciones.map((x, j) =>
                          j === i ? { ...x, fecha: e.target.value } : x,
                        ),
                      })
                    }
                  />
                </Campo>
                <Campo etiqueta="Valor adicionado">
                  <CampoMoneda
                    className="campo"
                    valor={a.valor}
                    alCambiar={(v) =>
                      set({
                        adiciones: contrato.adiciones.map((x, j) =>
                          j === i ? { ...x, valor: v } : x,
                        ),
                      })
                    }
                  />
                </Campo>
                <Campo etiqueta="Nueva terminación (si prorroga)">
                  <input
                    type="date"
                    className="campo"
                    value={a.nuevaFechaTerminacion ?? ''}
                    onChange={(e) =>
                      set({
                        adiciones: contrato.adiciones.map((x, j) =>
                          j === i
                            ? { ...x, nuevaFechaTerminacion: e.target.value || undefined }
                            : x,
                        ),
                      })
                    }
                  />
                </Campo>
              </div>
              <div className="mt-3 flex justify-end">
                <Boton
                  variante="fantasma"
                  icono={<Trash2 size={14} />}
                  onClick={() =>
                    set({ adiciones: contrato.adiciones.filter((_, j) => j !== i) })
                  }
                >
                  Quitar
                </Boton>
              </div>
            </div>
          ))
        )}
      </section>

      {/* Suspensiones */}
      <section>
        <div className="mb-3 flex items-center justify-between">
          <h3 className="flex items-center gap-2 font-semibold">
            <PauseCircle size={17} className="text-tinta-tenue" />
            Suspensiones
          </h3>
          <Boton
            icono={<Plus size={15} />}
            onClick={() =>
              set({
                suspensiones: [
                  ...contrato.suspensiones,
                  { id: `sp_${Date.now()}`, desde: contrato.fechaInicio, hasta: null },
                ],
              })
            }
          >
            Agregar suspensión
          </Boton>
        </div>

        {contrato.suspensiones.length === 0 ? (
          <p className="text-sm text-tinta-tenue">Sin suspensiones.</p>
        ) : (
          contrato.suspensiones.map((s, i) => (
            <div key={s.id} className="tarjeta mb-3 p-4">
              <div className="grid gap-3 sm:grid-cols-3">
                <Campo etiqueta="Desde">
                  <input
                    type="date"
                    className="campo"
                    value={s.desde}
                    onChange={(e) =>
                      set({
                        suspensiones: contrato.suspensiones.map((x, j) =>
                          j === i ? { ...x, desde: e.target.value } : x,
                        ),
                      })
                    }
                  />
                </Campo>
                <Campo etiqueta="Hasta" ayuda="Vacío si sigue suspendido">
                  <input
                    type="date"
                    className="campo"
                    value={s.hasta ?? ''}
                    onChange={(e) =>
                      set({
                        suspensiones: contrato.suspensiones.map((x, j) =>
                          j === i ? { ...x, hasta: e.target.value || null } : x,
                        ),
                      })
                    }
                  />
                </Campo>
                <Campo etiqueta="Motivo">
                  <Dictable>
                    <input
                      className="campo"
                      value={s.motivo ?? ''}
                      onChange={(e) =>
                        set({
                          suspensiones: contrato.suspensiones.map((x, j) =>
                            j === i ? { ...x, motivo: e.target.value } : x,
                          ),
                        })
                      }
                    />
                  </Dictable>
                </Campo>
              </div>
              <div className="mt-3 flex justify-end">
                <Boton
                  variante="fantasma"
                  icono={<Trash2 size={14} />}
                  onClick={() =>
                    set({ suspensiones: contrato.suspensiones.filter((_, j) => j !== i) })
                  }
                >
                  Quitar
                </Boton>
              </div>
            </div>
          ))
        )}
      </section>

      <Aviso tipo="alerta" titulo="Pendiente de confirmar">
        Al reanudar tras una suspensión, el programa corre la fecha de terminación tantos
        días como duró la suspensión. Es el criterio habitual, pero conviene contrastarlo
        con un caso real antes de darlo por definitivo.
      </Aviso>
    </div>
  );
}

// ── Selector de plantilla por tipo de documento ─────────────────────────────

/**
 * Ofrece sólo las plantillas del tipo que corresponde.
 *
 * Asignarle a un contrato la plantilla de la cuenta de cobro en la casilla del
 * informe produciría un documento sin sentido, y el error no se vería hasta
 * abrir el .docx generado. Filtrar aquí lo hace imposible.
 *
 * Las plantillas registradas antes de que existieran los tipos no declaran el
 * suyo; se entienden como del informe, que es lo único que había entonces.
 */
function SelectorDePlantilla({
  plantillas,
  tipo,
  valor,
  alCambiar,
}: {
  plantillas: MapaPlantilla[];
  tipo: TipoDocumento;
  valor: string;
  alCambiar: (id: string) => void;
}) {
  const suyas = plantillas.filter((p) => (p.tipo ?? 'informe') === tipo);

  return (
    <>
      <select
        className="campo"
        value={valor}
        onChange={(e) => alCambiar(e.target.value)}
        disabled={suyas.length === 0}
      >
        <option value="">— sin asignar —</option>
        {suyas.map((p) => (
          <option key={p.id} value={p.id}>
            {p.nombre}
          </option>
        ))}
      </select>
      {suyas.length === 0 && (
        <span className="mt-1 block text-xs text-alerta-fuerte">
          No hay ninguna plantilla de este tipo registrada todavía.
        </span>
      )}
    </>
  );
}

// ── Cargar los datos de otro contrato de la misma persona ──────────────────

/**
 * Ofrece copiar los datos de otro contrato del mismo contratista.
 *
 * En un contrato recién creado —sin objeto ni obligaciones— se muestra
 * abierto, porque es justo cuando sirve. En uno ya rellenado queda como un
 * botón discreto, y cargar pide confirmación: reemplazaría lo escrito.
 */
function CargarDeOtroContrato({
  contrato,
  otros,
  alCargar,
}: {
  contrato: Contrato;
  otros: Contrato[];
  alCargar: (anterior: Contrato) => void;
}) {
  const ordenados = [...otros].sort((a, b) => b.fechaInicio.localeCompare(a.fechaInicio));
  const vacio = contrato.objeto.trim() === '' && contrato.obligaciones.length === 0;
  const [abierto, setAbierto] = useState(vacio);
  const [elegido, setElegido] = useState(ordenados[0]?.id ?? '');
  /** Lo cargado: de qué contrato, con qué sueldo tenía y si el plazo se pudo redactar. */
  const [hecho, setHecho] = useState<{ numero: string; redactado: boolean; mensual: number } | null>(
    null,
  );

  if (ordenados.length === 0) return null;

  const anterior = ordenados.find((c) => c.id === elegido) ?? ordenados[0];
  const describir = (c: Contrato) =>
    `${c.numero || '(sin número)'} · ${formatoCorto(desdeISO(c.fechaInicio))} – ${formatoCorto(desdeISO(c.fechaTerminacion))}`;

  if (hecho) {
    return (
      hecho.redactado ? (
        <Aviso tipo="exito" titulo={`Datos cargados del contrato ${hecho.numero}`}>
          Se copiaron el objeto, las obligaciones con sus actividades, el supervisor, el
          contratante, el teléfono, la cuenta y las plantillas, y el plazo se redactó de
          nuevo con las fechas de este contrato. El dinero no se copia: escriba en Pagos el
          valor del contrato y genere su cronograma
          {hecho.mensual > 0 ? `; el otro contrato iba a ${moneda(hecho.mensual)} al mes` : ''}.
          El número, las fechas, el CDP y el RP siguen siendo los de este contrato.
        </Aviso>
      ) : (
        <Aviso tipo="alerta" titulo={`Datos cargados del contrato ${hecho.numero}, salvo el plazo`}>
          Se copiaron el objeto, las obligaciones con sus actividades, el supervisor, el
          contratante, el teléfono, la cuenta y las plantillas. El plazo no se pudo redactar
          porque las fechas de este contrato están al revés (el inicio va después de la
          terminación): corríjalas en Datos. El dinero no se copia: escriba en Pagos el
          valor del contrato y genere su cronograma
          {hecho.mensual > 0 ? `; el otro contrato iba a ${moneda(hecho.mensual)} al mes` : ''}.
        </Aviso>
      )
    );
  }

  if (!abierto) {
    return (
      <div>
        <Boton variante="fantasma" icono={<Copy size={15} />} onClick={() => setAbierto(true)}>
          Cargar datos de otro contrato de esta persona
        </Boton>
      </div>
    );
  }

  return (
    <section className="rounded-xl border border-info-borde bg-info-fondo p-4 text-sm text-info-texto">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <h3 className="flex items-center gap-2 font-semibold">
          <Copy size={16} />
          {vacio
            ? `Esta persona ya tiene ${ordenados.length === 1 ? 'otro contrato' : `${ordenados.length} contratos`}. ¿Usar sus datos?`
            : 'Cargar los datos de otro contrato de esta persona'}
        </h3>
        <Boton variante="fantasma" icono={<X size={15} />} onClick={() => setAbierto(false)}>
          {vacio ? 'No, gracias' : 'Cerrar'}
        </Boton>
      </div>

      <p className="mt-1">
        <b>Se copian</b>: objeto, obligaciones y actividades, plazo, supervisor, contratante,
        teléfono, cuenta y plantillas.{' '}
        <b>No se copian</b>: número, fechas de inicio, terminación y firma, CDP y RP, ni el
        valor del contrato, sus cuotas y la forma de pago, que se escriben en Pagos.
      </p>
      <p className="mt-1 text-xs opacity-90">
        Ponga antes las fechas de este contrato: el plazo se redacta de nuevo con ellas para
        que no diga las del otro contrato.
      </p>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        {ordenados.length > 1 && (
          <select
            className="campo w-auto max-w-full py-1.5"
            value={anterior.id}
            onChange={(e) => setElegido(e.target.value)}
          >
            {ordenados.map((c) => (
              <option key={c.id} value={c.id}>
                {describir(c)}
              </option>
            ))}
          </select>
        )}
        <Boton
          variante="primario"
          icono={<Copy size={15} />}
          onClick={() => {
            if (
              !vacio &&
              !window.confirm(
                `Se reemplazarán el objeto, las obligaciones y los demás datos de este contrato por los del ${anterior.numero || 'contrato elegido'}. El valor y las cuotas no se tocan. ¿Continuar?`,
              )
            ) {
              return;
            }
            alCargar(anterior);
            setHecho({
              numero: anterior.numero || describir(anterior),
              redactado: fechasCoherentes(contrato),
              mensual: mensualidadHabitual(anterior.cuotas),
            });
          }}
        >
          {ordenados.length > 1 ? 'Cargar sus datos' : `Cargar los datos del ${describir(anterior)}`}
        </Boton>
      </div>
    </section>
  );
}

// ── Redactor de obligaciones ────────────────────────────────────────────────

/**
 * Escribir las obligaciones sin teclearlas una a una.
 *
 * Dos vías, porque son dos situaciones distintas:
 *
 * - **Pegarlas.** Lo normal: las obligaciones están en el contrato, se copian
 *   del Word o del PDF y se pegan enteras. El programa las parte y les quita la
 *   numeración, venga como venga.
 * - **Proponerlas.** Se escriben una o dos de ejemplo y la IA completa el resto
 *   en el mismo registro. Esto sí necesita clave, porque es redactar de cero.
 *
 * Lo que no hace ninguna de las dos es copiar las de la plantilla: son las de
 * otro contratista, y ese era justamente el problema.
 */
function RedactorDeObligaciones({
  contratoId,
  objeto,
  cuantasHay,
  alAgregar,
  alReemplazar,
}: {
  /** El borrador es de cada contrato: lo de uno no aparece en otro. */
  contratoId: string;
  objeto: string;
  cuantasHay: number;
  alAgregar: (textos: string[]) => void;
  alReemplazar: (textos: string[]) => void;
}) {
  // Lo que se está redactando aquí no es del contrato hasta pulsar «Agregar»,
  // así que no se guarda con él. Pero tampoco debe perderse al ir a otra
  // sección y volver, que es lo que pasaba: se recuerda como borrador.
  const borrador = `contratos.borrador.${contratoId}`;
  const [abierto, setAbierto] = useRecordado(
    `${borrador}.abierto`,
    cuantasHay === 0,
    (v): v is boolean => typeof v === 'boolean',
  );
  const [texto, setTexto] = useRecordado(`${borrador}.texto`, '', (v): v is string => typeof v === 'string');
  const [cuantas, setCuantas] = useRecordado(`${borrador}.cuantas`, 9, (v): v is number => typeof v === 'number');
  const [pensando, setPensando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [propuestas, setPropuestas] = useRecordado<string[] | null>(
    `${borrador}.propuestas`,
    null,
    (v): v is string[] | null => v === null || (Array.isArray(v) && v.every((x) => typeof x === 'string')),
  );

  const partidas = useMemo(() => partirEnObligaciones(texto), [texto]);

  async function proponer() {
    setError(null);
    setPropuestas(null);
    setPensando(true);
    try {
      const r = await window.api.extraccion.proponerObligaciones(texto, cuantas, objeto);
      if (!r.ok || !r.obligaciones) {
        setError(r.error ?? 'No se pudieron proponer las obligaciones.');
        return;
      }
      setPropuestas(r.obligaciones);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setPensando(false);
    }
  }

  if (!abierto) {
    return (
      <div>
        <Boton icono={<Wand2 size={15} />} onClick={() => setAbierto(true)}>
          Pegar o proponer varias obligaciones
        </Boton>
      </div>
    );
  }

  return (
    <section className="tarjeta p-5">
      <div className="mb-1 flex flex-wrap items-start justify-between gap-3">
        <h3 className="font-semibold">Escribir varias obligaciones de una vez</h3>
        <Boton variante="fantasma" icono={<X size={15} />} onClick={() => setAbierto(false)}>
          Cerrar
        </Boton>
      </div>
      <p className="mb-3 text-sm text-tinta-tenue">
        Pegue aquí las obligaciones del contrato —numeradas o no, da igual— o escriba
        una o dos de ejemplo y deje que el programa complete el resto.
      </p>

      <Dictable>
        <textarea
          className="campo min-h-[140px]"
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          placeholder={
            '1. Realizar actividades de limpieza de las redes y estructura del sistema de acueducto.\n' +
            '2. Realizar labores de limpieza de cunetas y alcantarillas de las áreas asignadas.'
          }
        />
      </Dictable>

      <div className="mt-3 flex flex-wrap items-end gap-3">
        <Boton
          variante="primario"
          icono={<Plus size={15} />}
          disabled={partidas.length === 0}
          onClick={() => {
            alAgregar(partidas);
            setTexto('');
            setPropuestas(null);
          }}
        >
          Agregar {partidas.length > 0 ? `estas ${partidas.length}` : 'las escritas'}
        </Boton>

        <label className="flex items-center gap-2 text-xs text-tinta-tenue">
          Completar hasta
          <input
            type="number"
            min={1}
            max={30}
            className="campo w-20 py-1.5 text-center text-xs"
            value={cuantas}
            onChange={(e) => setCuantas(Number(e.target.value) || 1)}
          />
          obligaciones
        </label>

        <Boton
          icono={<Wand2 size={15} />}
          onClick={proponer}
          cargando={pensando}
          disabled={texto.trim().length === 0 || pensando}
          title="Usa la clave de IA de Ajustes para redactar el resto en el mismo estilo"
        >
          Proponer el resto
        </Boton>
      </div>

      {partidas.length > 0 && propuestas === null && (
        <p className="mt-2 text-xs text-tinta-tenue">
          Se reconocen {partidas.length} obligación(es) en lo escrito.
        </p>
      )}

      {error && (
        <div className="mt-3">
          <Aviso tipo="alerta" titulo="No se pudieron proponer">
            {error}
          </Aviso>
        </div>
      )}

      {propuestas && (
        <div className="mt-4">
          <Aviso tipo="info" titulo={`${propuestas.length} obligaciones propuestas`}>
            Revíselas antes de aceptarlas: el programa propone y usted confirma. Las que
            no sirvan se corrigen después una a una.
          </Aviso>

          <ol className="mt-3 flex list-decimal flex-col gap-2 pl-5 text-sm">
            {propuestas.map((o, i) => (
              <li key={i} className="text-tinta">
                {o}
              </li>
            ))}
          </ol>

          <div className="mt-3 flex flex-wrap gap-2">
            <Boton
              variante="primario"
              onClick={() => {
                alReemplazar(propuestas);
                setPropuestas(null);
                setTexto('');
              }}
            >
              Usar estas {propuestas.length}
            </Boton>
            <Boton variante="fantasma" onClick={() => setPropuestas(null)}>
              Descartar
            </Boton>
          </div>
        </div>
      )}
    </section>
  );
}

