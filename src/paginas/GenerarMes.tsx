import {
  Fragment,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type Dispatch,
  type SetStateAction,
} from 'react';
import {
  CalendarDays,
  FolderOpen,
  Play,
  ScanLine,
  FileCheck2,
  AlertTriangle,
  CircleCheck,
  CircleDashed,
  ArrowRight,
  ChevronLeft,
  ChevronRight,
  Pencil,
  Save,
  X,
} from 'lucide-react';

import { useEstado } from '../estado';
import { useConjuntoRecordado, useRecordado } from '../recordado';
import { useIrA, type Seccion } from '../navegacion';
import { Aviso, Boton, Cargando, Insignia, Pagina, Vacio, fechaHora, moneda } from '../componentes/Ui';
import { HistorialInformes } from '../componentes/HistorialInformes';
import { SeccionCertificados } from '../componentes/Certificados';
import { NOMBRES_MES } from '../../core/espanol/calendario';
import { podarHistorial } from '../../core/modelo/historial';
import {
  aniosDelContrato,
  mesesDelContratoEn,
  porActividad,
  ultimaActividad,
} from '../../core/modelo/actividad';
import type { Contrato } from '../../core/modelo/tipos';
import { TIPOS_DOCUMENTO, type TipoDocumento } from '../../core/docx/campos';
import type { InformeMes, Planilla } from '../../core/modelo/tipos';
import type { ProgresoGeneracion } from '../../electron/preload';

/** Una casilla de la tabla: un contrato en un mes concreto. */
type Fila = {
  mes: number;
  contratoId: string;
  numero: string;
  contratista: string;
  /** Plantilla asignada a cada documento, con cuántos campos tiene mapeados. */
  plantillas: Partial<Record<TipoDocumento, { id: string; nombre: string; campos: number }>>;
  aplica: boolean;
  motivo?: string;
  pagoDelMes?: number;
  totalPagado?: number;
  valorPorEjecutar?: number;
  desde?: string;
  hasta?: string;
  planilla?: Planilla;
  /** Última vez que se hizo algo con el contrato: ordena cada mes. */
  actividad?: string;
  fechaInicio: string;
};

/**
 * Clave de una casilla.
 *
 * La selección ya no es «qué contratistas», sino «qué contratista en qué mes»:
 * con varios meses marcados se puede querer generar a alguien enero y marzo
 * pero no febrero, porque el de febrero ya se entregó.
 */
const clave = (mes: number, contratoId: string) => `${mes}|${contratoId}`;

/** Nombre corto de cada documento, para los avisos. */
const NOMBRE_TIPO: Record<TipoDocumento, string> = {
  informe: 'informe',
  cuentaDeCobro: 'cuenta de cobro',
  certificado: 'certificado de cumplimiento',
};

/**
 * Por qué una casilla concreta no se puede generar.
 *
 * Depende de qué documentos se hayan pedido: un contrato con plantilla de
 * informe pero sin plantilla de cuenta de cobro se puede generar mientras sólo
 * se pida el informe, y deja de poderse en cuanto se marca también la cuenta.
 */
function bloqueoDeFila(f: Fila, tipos: TipoDocumento[]): string | null {
  if (!f.aplica) return f.motivo ?? 'El contrato no está vigente este mes.';
  if (tipos.length === 0) return 'Marque arriba qué documentos quiere generar.';

  for (const tipo of tipos) {
    const p = f.plantillas[tipo];
    if (!p) {
      return `Falta asignarle la plantilla de ${NOMBRE_TIPO[tipo]} a este contrato.`;
    }
    if (p.campos === 0) {
      return `La plantilla «${p.nombre}» todavía no tiene campos mapeados.`;
    }
  }
  return null;
}

/**
 * De los documentos pedidos, cuáles puede producir de verdad esta casilla.
 *
 * Existe porque exigirlos todos era demasiado severo: a un contrato con la
 * plantilla del informe puesta y la de la cuenta de cobro sin poner se le
 * bloqueaba la fila entera, así que ni siquiera se podía marcar para generarle
 * el informe —que sí estaba listo— y el botón de «sólo informes» contaba cero.
 * Con esto, cada documento se mide por su cuenta y se genera lo que se pueda.
 */
function tiposGenerables(f: Fila, tipos: TipoDocumento[]): TipoDocumento[] {
  if (!f.aplica) return [];
  return tipos.filter((t) => bloqueoDeFila(f, [t]) === null);
}

/** Lo que le falta a una casilla para poder generarlo todo, si es que falta. */
function faltaDeFila(f: Fila, tipos: TipoDocumento[]): string | null {
  if (!f.aplica) return f.motivo ?? 'El contrato no está vigente este mes.';
  if (tipos.length === 0) return 'Marque arriba qué documentos quiere generar.';

  const pendientes = tipos.filter((t) => bloqueoDeFila(f, [t]) !== null);
  if (pendientes.length === 0) return null;

  const detalle = pendientes.map((t) => bloqueoDeFila(f, [t])).join(' ');
  const listos = tipos.length - pendientes.length;

  // Si algo se puede generar, el aviso lo dice: es un apunte, no un bloqueo.
  return listos > 0
    ? `${detalle} Se generará sólo ${tiposGenerables(f, tipos)
        .map((t) => NOMBRE_TIPO[t])
        .join(' y ')}.`
    : detalle;
}

const conMayuscula = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/**
 * Fecha de pago que se propone para una planilla que no la trae.
 *
 * La planilla de un mes se paga al principio del siguiente: la de enero de
 * 2025 del informe real lleva fecha del 4 de febrero. Se propone el día uno
 * del mes siguiente, que es lo más cercano a lo habitual sin inventarse un día.
 */
export function fechaDePagoPorDefecto(anio: number, mes: number): string {
  const siguiente = mes === 12 ? { anio: anio + 1, mes: 1 } : { anio, mes: mes + 1 };
  return `${siguiente.anio}-${String(siguiente.mes).padStart(2, '0')}-01`;
}

/** "enero, marzo y abril" — para los textos que enumeran lo elegido. */
function listaDeMeses(meses: number[]): string {
  const nombres = meses.map((m) => NOMBRES_MES[m - 1]);
  if (nombres.length === 0) return 'ningún mes';
  if (nombres.length === 1) return nombres[0];
  return `${nombres.slice(0, -1).join(', ')} y ${nombres[nombres.length - 1]}`;
}

export function PaginaGenerarMes() {
  const { base, plantillas, guardar } = useEstado();
  const irA = useIrA();

  const hoy = new Date();

  // Lo elegido se recuerda: salir a mirar un contrato y volver no debe deshacer
  // el trabajo de marcar cuatro meses y sus contratistas.
  const [anio, setAnio] = useRecordado(
    'generar.anio',
    hoy.getFullYear(),
    (v): v is number => typeof v === 'number' && v >= 1990 && v <= 2100,
  );
  const [meses, setMeses] = useConjuntoRecordado<number>(
    'generar.meses',
    new Set([hoy.getMonth() + 1]),
  );
  /**
   * Qué documentos produce cada pasada.
   *
   * El informe y la cuenta de cobro comparten meses y contratistas, así que se
   * eligen aquí y salen del mismo recorrido. El certificado no: va aparte,
   * porque hay uno por contrato y no depende del mes.
   */
  const [tiposAGenerar, setTiposAGenerar] = useConjuntoRecordado<TipoDocumento>(
    'generar.tipos',
    new Set<TipoDocumento>(['informe']),
  );
  const [filas, setFilas] = useState<Fila[]>([]);
  const [seleccion, setSeleccion] = useConjuntoRecordado<string>(
    'generar.seleccion',
    new Set(),
  );
  /**
   * Meses desplegados en la tabla, como «año-mes». Empiezan plegados: con
   * varios meses marcados, la lista entera era demasiado larga para
   * encontrar nada. Se recuerda lo que se dejó abierto.
   */
  const [mesesAbiertos, setMesesAbiertos] = useConjuntoRecordado<string>(
    'generar.mesesAbiertos',
    new Set(),
  );
  const claveMes = (m: number) => `${anio}-${m}`;
  const [calculando, setCalculando] = useState(false);
  /** Casilla cuyo formulario de planilla está abierto, si alguno. */
  const [editandoPlanilla, setEditandoPlanilla] = useState<string | null>(null);
  const [errorGeneral, setErrorGeneral] = useState<string | null>(null);
  const [progreso, setProgreso] = useState<ProgresoGeneracion | null>(null);
  /** Qué mes se está generando y cuántos van, para la barra de progreso. */
  const [tanda, setTanda] = useState<{
    mes: number;
    tipo: TipoDocumento;
    indice: number;
    total: number;
  } | null>(
    null,
  );
  const [resultado, setResultado] = useState<{
    generados: { contratoId: string; mes: number; nombre: string; ruta: string; avisos: string[] }[];
    fallidos: { contratoId: string; mes: number; error: string }[];
  } | null>(null);

  const generando = progreso !== null;
  const desmontado = useRef(false);
  /**
   * Si hay una generación de verdad en marcha.
   *
   * El avance del lote llega por un canal distinto que la respuesta, así que
   * el último aviso —el «listo» del último informe— puede aterrizar después de
   * que la respuesta ya haya vuelto. Sin esta bandera, ese aviso rezagado
   * volvía a encender la barra justo después de apagarla, y la pantalla se
   * quedaba en «Generando…» al 100 % para siempre, con el botón bloqueado.
   */
  const enCurso = useRef(false);
  /**
   * Meses cuya selección ya se rellenó sola; no se vuelve a tocar.
   *
   * Se recuerda junto con la selección. Si no, al volver a la pantalla todos
   * los meses parecerían nuevos y se re-marcarían enteros, deshaciendo
   * precisamente lo que se hubiera desmarcado a mano.
   */
  const [iniciados, setIniciados] = useConjuntoRecordado<string>(
    'generar.iniciados',
    new Set(),
  );
  const mesesIniciados = useRef<Set<string>>(iniciados);
  /**
   * Número del recálculo en curso.
   *
   * Marcar doce meses lanza cientos de previsualizaciones; si mientras llegan
   * se desmarca uno, arranca otro recálculo y el primero puede terminar
   * después. Sin este contador, la tabla se quedaría con el resultado viejo.
   */
  const recalculoActual = useRef(0);

  /** Los tipos elegidos, en orden fijo para que los avisos no bailen. */
  const tipos = useMemo(
    () => TIPOS_DOCUMENTO.map((t) => t.id).filter((t) => tiposAGenerar.has(t)),
    [tiposAGenerar],
  );

  const mesesOrdenados = useMemo(() => [...meses].sort((a, b) => a - b), [meses]);
  const contratosActivos = useMemo(
    () => base?.contratos.filter((c) => c.activo) ?? [],
    [base],
  );

  const recalcular = useCallback(async () => {
    if (!base) return;
    const mio = ++recalculoActual.current;
    setCalculando(true);
    try {
      const ordenados = [...meses].sort((a, b) => a - b);

      // Las previsualizaciones son independientes entre sí: pedirlas a la vez
      // evita que marcar doce meses se note como doce esperas seguidas.
      const nuevas = await Promise.all(
        ordenados.flatMap((mes) =>
          contratosActivos.map(async (c): Promise<Fila> => {
            const k = base.contratistas.find((x) => x.id === c.contratistaId);

            // Cada documento tiene la suya; se resuelven las tres de una vez
            // para que la tabla pueda decir cuál falta sin volver a buscar.
            const dePlantilla = (id?: string) => {
              const p = id ? plantillas.find((x) => x.id === id) : undefined;
              if (!p) return undefined;
              return {
                id: p.id,
                nombre: p.nombre,
                campos: p.campos.filter((x) => x.ocurrencias.length > 0).length,
              };
            };
            const prev = await window.api.generacion.previsualizar(c.id, anio, mes);
            const informe = base.informes.find(
              (i) => i.contratoId === c.id && i.anio === anio && i.mes === mes,
            );

            return {
              mes,
              contratoId: c.id,
              numero: c.numero || '(sin número)',
              contratista: k?.nombre ?? '—',
              plantillas: {
                informe: dePlantilla(c.plantillaId),
                cuentaDeCobro: dePlantilla(c.plantillaCuentaId),
                certificado: dePlantilla(c.plantillaCertificadoId),
              },
              aplica: prev.ok,
              motivo: prev.motivo,
              pagoDelMes: prev.pagoDelMes,
              totalPagado: prev.totalPagado,
              valorPorEjecutar: prev.valorPorEjecutar,
              desde: prev.desde,
              hasta: prev.hasta,
              planilla: informe?.planilla,
              actividad: ultimaActividad(c, base),
              fechaInicio: c.fechaInicio,
            };
          }),
        ),
      );
      // Dentro de cada mes, el último contrato trabajado arriba y los demás del
      // más reciente al más antiguo.
      nuevas.sort((a, b) => a.mes - b.mes || porActividad(a, b));

      // Sólo el recálculo más reciente tiene derecho a pintar.
      if (desmontado.current || mio !== recalculoActual.current) return;
      setFilas(nuevas);

      // La selección NO se rehace en cada recálculo.
      //
      // Guardar cualquier cosa (leer una planilla, asignar una plantilla, o el
      // propio registro tras generar) cambia la base y dispara este recálculo.
      // Si aquí se volvía a marcar todo, desmarcar un contratista era inútil:
      // se re-marcaba solo. Un mes se rellena entero la primera vez que se
      // marca, y a partir de ahí manda lo que eligió la persona.
      const elegibles = new Set(
        nuevas.filter((f) => tiposGenerables(f, tipos).length > 0).map((f) => clave(f.mes, f.contratoId)),
      );

      let huboNuevos = false;
      setSeleccion((previa) => {
        const siguiente = new Set([...previa].filter((k) => elegibles.has(k)));
        for (const mes of ordenados) {
          const marca = `${anio}-${mes}`;
          if (mesesIniciados.current.has(marca)) continue;
          mesesIniciados.current.add(marca);
          huboNuevos = true;
          for (const f of nuevas) {
            if (f.mes === mes && tiposGenerables(f, tipos).length > 0) {
              siguiente.add(clave(f.mes, f.contratoId));
            }
          }
        }
        return siguiente;
      });
      // La marca de «este mes ya se rellenó» también se recuerda; si no, al
      // volver a la pantalla se re-marcaría todo.
      if (huboNuevos) setIniciados(new Set(mesesIniciados.current));
    } finally {
      if (!desmontado.current && mio === recalculoActual.current) setCalculando(false);
    }
  }, [base, contratosActivos, plantillas, anio, meses, tipos]);

  useEffect(() => {
    void recalcular();
  }, [recalcular]);

  // Cambiar de año es empezar de cero: los meses de un año no dicen nada de los
  // del siguiente, así que sus selecciones automáticas vuelven a estar por hacer.
  //
  // Se salta la primera pasada. Los efectos también corren al montar, y al
  // volver a la pantalla eso borraría lo recordado y re-marcaría todo, que es
  // justo lo contrario de lo que se quiere.
  const anioAnterior = useRef(anio);
  /**
   * Meses que «Solo un contrato» ya dejó marcados en el año al que salta: no
   * deben rellenarse con todos los contratos al llegar a ese año.
   */
  const iniciadosAlCambiarDeAnio = useRef<string[] | null>(null);
  useEffect(() => {
    if (anioAnterior.current === anio) return;
    anioAnterior.current = anio;
    mesesIniciados.current = new Set(iniciadosAlCambiarDeAnio.current ?? []);
    iniciadosAlCambiarDeAnio.current = null;
    setIniciados(new Set(mesesIniciados.current));
  }, [anio, setIniciados]);

  /** Contratos activos, el último trabajado primero: para «Solo un contrato». */
  const contratosPorActividad = useMemo(() => {
    if (!base) return [];
    return contratosActivos
      .map((c) => ({
        contrato: c,
        contratista: base.contratistas.find((k) => k.id === c.contratistaId)?.nombre ?? '—',
        actividad: ultimaActividad(c, base),
        fechaInicio: c.fechaInicio,
        numero: c.numero,
      }))
      .sort(porActividad);
  }, [base, contratosActivos]);

  const [avisoSoloUno, setAvisoSoloUno] = useState<string | null>(null);

  /**
   * Marca los meses de un contrato y, en cada uno, sólo ese contrato.
   *
   * Es lo corriente al terminar de registrar un contrato: generar todos sus
   * informes de una vez. Antes había que marcar sus meses y luego, mes por mes,
   * desmarcar a todos los demás.
   */
  function soloUnContrato(contratoId: string) {
    const c = contratosActivos.find((x) => x.id === contratoId);
    if (!c) return;

    // El año que se está viendo si el contrato tiene meses en él; si no, el
    // primero del contrato.
    const anios = aniosDelContrato(c);
    const destino = mesesDelContratoEn(c, anio).length > 0 ? anio : anios[0];
    if (destino === undefined) return;
    const suyos = mesesDelContratoEn(c, destino);

    // Esos meses cuentan como ya iniciados: el marcado automático, que marca a
    // todos los contratos la primera vez que se elige un mes, no debe tocarlos.
    const marcas = suyos.map((m) => `${destino}-${m}`);
    if (destino !== anio) {
      iniciadosAlCambiarDeAnio.current = marcas;
      setAnio(destino);
    } else {
      for (const m of marcas) mesesIniciados.current.add(m);
      setIniciados(new Set(mesesIniciados.current));
    }

    setMeses(new Set(suyos));
    setSeleccion(new Set(suyos.map((m) => clave(m, contratoId))));

    const otros = anios.filter((a) => a !== destino);
    setAvisoSoloUno(
      `Marcado sólo el ${c.numero || 'contrato'} en ${listaDeMeses(suyos)} de ${destino}.` +
        (otros.length > 0
          ? ` El contrato sigue en ${otros.join(' y ')}: para esos meses, cambie el año y elíjalo otra vez.`
          : ''),
    );
  }

  // Suscripción al avance del lote.
  useEffect(() => {
    desmontado.current = false;
    const dejarDeEscuchar = window.api.generacion.alProgreso((p) => {
      if (!desmontado.current && enCurso.current) setProgreso(p);
    });
    return () => {
      desmontado.current = true;
      dejarDeEscuchar();
    };
  }, []);

  if (!base) return <Cargando />;

  const carpeta = base.ajustes.carpetaSalida;
  const elegibles = filas.filter((f) => tiposGenerables(f, tipos).length > 0);
  const seleccionados = [...seleccion].filter((k) =>
    elegibles.some((f) => clave(f.mes, f.contratoId) === k),
  );

  // ── Qué falta para poder generar ─────────────────────────────────────────
  //
  // La lista se arma con lo que de verdad está bloqueando, en el orden en que
  // conviene resolverlo. Sólo se muestra un requisito cuando tiene sentido
  // preguntarlo: si ningún contrato está vigente en los meses elegidos, no
  // viene al caso hablar de plantillas todavía.
  const hayPlantillaMapeada = plantillas.some(
    (p) => p.campos.filter((c) => c.ocurrencias.length > 0).length > 0,
  );
  const vigentes = filas.filter((f) => f.aplica);
  const contratosVigentes = new Set(vigentes.map((f) => f.contratoId));

  /** Números de contrato que aparecen más de una vez entre los seleccionados. */
  const duplicados = [
    ...new Set(
      [
        ...new Set(
          filas
            .filter((f) => seleccion.has(clave(f.mes, f.contratoId)))
            .map((f) => f.contratoId),
        ),
      ]
        .map((id) => filas.find((f) => f.contratoId === id)?.numero ?? '')
        .filter((n, _i, todos) => n && todos.filter((x) => x === n).length > 1),
    ),
  ];

  /** Contratos vigentes en algún mes elegido a los que les falta la plantilla. */
  const contratosSinPlantilla = [
    ...new Map(
      vigentes
        .filter((f) => tipos.some((t) => !f.plantillas[t]))
        .map((f) => [f.contratoId, f]),
    ).values(),
  ];

  type Requisito = {
    ok: boolean;
    texto: string;
    accion?: { etiqueta: string; ir: Seccion };
  };

  const requisitos: Requisito[] = [
    {
      ok: carpeta.length > 0,
      texto: 'Elegir la carpeta donde se guardarán los informes',
      accion: { etiqueta: 'Ir a Ajustes', ir: 'ajustes' },
    },
    {
      ok: meses.size > 0,
      texto:
        meses.size > 0
          ? `Meses elegidos: ${listaDeMeses(mesesOrdenados)} de ${anio}`
          : 'Marcar al menos un mes arriba',
    },
    {
      ok: plantillas.length > 0,
      texto: 'Registrar al menos una plantilla de Word',
      accion: { etiqueta: 'Ir a Plantillas', ir: 'plantillas' },
    },
    {
      ok: hayPlantillaMapeada,
      texto: 'Mapear los campos de la plantilla',
      accion: { etiqueta: 'Ir a Plantillas', ir: 'plantillas' },
    },
    {
      ok: vigentes.length > 0,
      texto:
        vigentes.length > 0
          ? `Hay ${contratosVigentes.size} contrato(s) vigente(s) en ${listaDeMeses(mesesOrdenados)} de ${anio}`
          : `Ningún contrato está vigente en ${listaDeMeses(mesesOrdenados)} de ${anio}. ` +
            'Marque otro mes o revise las fechas del contrato.',
      accion: { etiqueta: 'Ir a Contratos', ir: 'contratos' },
    },
  ];

  // Este requisito sólo tiene sentido si ya hay contratos vigentes que mirar.
  if (vigentes.length > 0) {
    requisitos.push({
      ok: contratosSinPlantilla.length === 0,
      texto:
        contratosSinPlantilla.length > 0
          ? `Asignarle una plantilla a ${contratosSinPlantilla.length} contrato(s): ` +
            contratosSinPlantilla.map((f) => f.numero).join(', ')
          : 'Cada contrato vigente tiene su plantilla asignada',
      accion: { etiqueta: 'Ir a Contratos', ir: 'contratos' },
    });

    requisitos.push({
      ok: seleccionados.length > 0,
      texto:
        elegibles.length === 0
          ? 'Ningún informe está listo todavía; abajo se indica qué le falta a cada uno'
          : 'Marcar al menos un informe en la lista de abajo',
    });
  }

  const pendientes = requisitos.filter((r) => !r.ok);
  const puedeGenerar = pendientes.length === 0 && seleccionados.length > 0 && !generando;

  /**
   * Anota la planilla de una casilla, o la borra si viene `undefined`.
   *
   * Es el único sitio que la escribe: da igual que venga de leer un PDF o de
   * teclearla, para que las dos vías no puedan divergir.
   */
  async function fijarPlanilla(mes: number, contratoId: string, planilla?: Planilla) {
    setFilas((fs) =>
      fs.map((f) => (f.mes === mes && f.contratoId === contratoId ? { ...f, planilla } : f)),
    );

    await guardar((b) => {
      const previo = b.informes.find(
        (i) => i.contratoId === contratoId && i.anio === anio && i.mes === mes,
      );
      const otros = b.informes.filter(
        (i) => !(i.contratoId === contratoId && i.anio === anio && i.mes === mes),
      );
      const registro: InformeMes = { ...previo, contratoId, anio, mes, planilla };

      // Anotar una planilla es trabajar en el contrato: pasa a ser el primero
      // de cada mes en la tabla.
      const ahora = new Date().toISOString();
      const contratos = b.contratos.map((c) =>
        c.id === contratoId ? { ...c, actualizadoEn: ahora } : c,
      );

      // Quitar la planilla de un mes que nunca se generó no deja rastro: sin
      // planilla y sin informe, el registro no dice nada.
      if (!planilla && !registro.generadoEn) return { ...b, contratos, informes: otros };
      return { ...b, contratos, informes: [...otros, registro] };
    });
  }

  async function leerPlanilla(mes: number, contratoId: string) {
    const ruta = await window.api.sistema.elegirArchivo([
      { name: 'Planilla PILA', extensions: ['pdf', 'png', 'jpg', 'jpeg'] },
    ]);
    if (!ruta) return;

    const r = await window.api.extraccion.planilla(ruta);

    // Si la lectura no sacó el número, se abre el formulario con lo que haya
    // en vez de no hacer nada: quien acaba de elegir un archivo espera algo.
    if (!r.numero) {
      setEditandoPlanilla(clave(mes, contratoId));
      return;
    }

    await fijarPlanilla(mes, contratoId, {
      numero: r.numero,
      fecha: r.fecha ?? fechaDePagoPorDefecto(anio, mes),
      mesAcreditado: r.mesAcreditado ?? NOMBRES_MES[mes - 1],
    });
  }

  /**
   * Genera un lote por cada mes marcado.
   *
   * Se llama al proceso principal una vez por mes en vez de mandarle la lista
   * entera porque así cada lote conserva su propio control de nombres
   * repetidos, y un mes que falle entero no arrastra a los demás.
   */
  /**
   * Genera lo marcado.
   *
   * `soloTipo` produce un único documento sin tocar las casillas de arriba,
   * que es lo que hacen los botones de cada tipo. Sirve para el caso corriente
   * de tener que repetir sólo las cuentas de cobro de un mes sin volver a
   * generar los informes, que ya estaban entregados.
   */
  async function generar(soloTipo?: TipoDocumento) {
    const tiposUsados = soloTipo ? [soloTipo] : tipos;
    if (tiposUsados.length === 0 || generando) return;
    setResultado(null);
    setErrorGeneral(null);

    const plantillasPorContrato: Record<string, Partial<Record<TipoDocumento, string>>> = {};
    for (const f of filas) {
      plantillasPorContrato[f.contratoId] = {
        informe: f.plantillas.informe?.id,
        cuentaDeCobro: f.plantillas.cuentaDeCobro?.id,
        certificado: f.plantillas.certificado?.id,
      };
    }

    // Una tanda por mes y documento.
    //
    // No se manda un lote con los dos documentos y la lista entera de
    // contratos: a quien le falte la plantilla de la cuenta de cobro saldría
    // como fallo cuando en realidad su informe está perfectamente. Cada
    // documento lleva exactamente los contratos que pueden producirlo.
    const porMes = mesesOrdenados
      .flatMap((mes) =>
        tiposUsados.map((tipo) => ({
          mes,
          tipo,
          ids: filas
            .filter((f) => f.mes === mes && seleccion.has(clave(mes, f.contratoId)))
            .filter((f) => bloqueoDeFila(f, [tipo]) === null)
            .map((f) => f.contratoId),
        })),
      )
      .filter((x) => x.ids.length > 0);

    if (porMes.length === 0) {
      const cuales = tiposUsados.map((t) => NOMBRE_TIPO[t]).join(' ni ');
      setErrorGeneral(
        `Ningún contratista marcado puede generar ${cuales} en ` +
          `${listaDeMeses(mesesOrdenados)} de ${anio}. Revise en la tabla qué le falta a cada uno.`,
      );
      return;
    }

    const generados: NonNullable<typeof resultado>['generados'] = [];
    const fallidos: NonNullable<typeof resultado>['fallidos'] = [];

    enCurso.current = true;
    try {
      for (let i = 0; i < porMes.length; i++) {
        const { mes, tipo, ids } = porMes[i];
        // Marca de tiempo por tanda, no una para todo el lote: es lo que ordena
        // el historial y decide cuál cae primero al llegar al tope.
        const ahora = new Date().toISOString();
        setTanda({ mes, tipo, indice: i, total: porMes.length });
        setProgreso({ indice: 0, total: ids.length, contratoId: ids[0], fase: 'generando' });

        const r = await window.api.generacion.lote(
          plantillasPorContrato,
          ids,
          anio,
          mes,
          carpeta,
          [tipo],
        );
        generados.push(...r.generados.map((g) => ({ ...g, mes })));
        fallidos.push(...r.fallidos.map((f) => ({ ...f, mes })));

        // El registro se guarda mes a mes y no al final: si algo se tuerce en
        // el mes siguiente, lo ya producido queda anotado igual.
        await guardar((b) => {
          const informes = [...b.informes];
          for (const g of r.generados) {
            const fila = filas.find((f) => f.mes === mes && f.contratoId === g.contratoId);
            const j = informes.findIndex(
              (x) => x.contratoId === g.contratoId && x.anio === anio && x.mes === mes,
            );
            // El informe y la cuenta comparten registro —mismo contrato, mismo
            // mes— pero cada uno anota su propio archivo.
            const registro: InformeMes =
              g.tipo === 'cuentaDeCobro'
                ? {
                    contratoId: g.contratoId,
                    anio,
                    mes,
                    planilla: fila?.planilla,
                    cuentaGeneradaEn: ahora,
                    rutaCuenta: g.ruta,
                    nombreCuenta: g.nombre,
                    pagoDelMes: fila?.pagoDelMes,
                  }
                : {
                    contratoId: g.contratoId,
                    anio,
                    mes,
                    planilla: fila?.planilla,
                    generadoEn: ahora,
                    rutaArchivo: g.ruta,
                    nombreArchivo: g.nombre,
                    pagoDelMes: fila?.pagoDelMes,
                  };
            if (j === -1) informes.push(registro);
            else informes[j] = { ...informes[j], ...registro };
          }
          // El historial tiene tope: al entrar los nuevos, los más antiguos
          // salen por abajo. Se poda aquí y no al leer para que el efecto se
          // vea en el momento, sin esperar al siguiente arranque.
          return podarHistorial({ ...b, informes });
        });
      }

      setResultado({ generados, fallidos });
    } catch (e) {
      // Sin este catch, un fallo dejaba la barra parpadeando y desaparecía sin
      // decir nada: la promesa se rechazaba y nadie la escuchaba.
      setErrorGeneral(e instanceof Error ? e.message : String(e));
      if (generados.length > 0 || fallidos.length > 0) setResultado({ generados, fallidos });
    } finally {
      // El orden importa: bajar la bandera ANTES de apagar la barra, para que
      // un aviso de progreso rezagado no la vuelva a encender.
      enCurso.current = false;
      setProgreso(null);
      setTanda(null);
    }
  }

  if (contratosActivos.length === 0) {
    return (
      <Pagina titulo="Generar informes">
        <Vacio
          icono={<CalendarDays size={24} />}
          titulo="No hay contratos activos"
          descripcion="Registre al menos un contrato para poder generar informes mensuales."
          accion={
            <Boton variante="primario" onClick={() => irA('contratos')}>
              Ir a Contratos
            </Boton>
          }
        />
      </Pagina>
    );
  }

  return (
    <Pagina
      titulo="Generar informes"
      descripcion="Marque los meses que necesite —seguidos o sueltos— y los contratistas de cada uno. El programa calcula solo las fechas, los pagos y los saldos."
    >
      <div className="flex flex-col gap-5 pb-8">
        {/* Controles */}
        <section className="tarjeta flex flex-col gap-4 p-5">
          <div className="flex flex-wrap items-end gap-4">
            <SelectorDeAnio anio={anio} deshabilitado={generando} alCambiar={setAnio} />

            {/* Con ancho mínimo, para que en el teléfono baje a su propia línea
                en vez de quedar en un hueco de tres letras. */}
            <div className="min-w-0 flex-1 basis-56">
              <span className="etiqueta">Carpeta de salida</span>
              <div className="flex gap-2">
                <input className="campo" value={carpeta} readOnly placeholder="Sin elegir" />
                <Boton
                  className="solo-pc"
                  icono={<FolderOpen size={16} />}
                  disabled={generando}
                  onClick={async () => {
                    const r = await window.api.sistema.elegirCarpeta();
                    if (r)
                      void guardar((b) => ({
                        ...b,
                        ajustes: { ...b.ajustes, carpetaSalida: r },
                      }));
                  }}
                >
                  Elegir
                </Boton>
              </div>
            </div>

            <Boton
              variante="primario"
              icono={<Play size={16} />}
              onClick={() => void generar()}
              cargando={generando}
              disabled={!puedeGenerar}
              title={
                puedeGenerar
                  ? `Generar ${seleccionados.length * Math.max(1, tipos.length)} documento(s)`
                  : 'Faltan requisitos; vea la lista de abajo'
              }
            >
              {generando
                ? 'Generando…'
                : `Generar${seleccionados.length > 0 ? ` (${seleccionados.length})` : ''}`}
            </Boton>
          </div>

          {/* Qué documentos. El certificado no está aquí: no es mensual, y
              mezclarlo con los meses invitaría a generar uno por mes.

              Cada uno lleva su propio botón además de la casilla: repetir sólo
              las cuentas de cobro de un mes, sin volver a generar los informes
              que ya se entregaron, es un caso corriente. */}
          <div>
            <span className="etiqueta">Qué documentos se van a generar</span>
            <div className="flex flex-wrap gap-2">
              {TIPOS_DOCUMENTO.filter((t) => t.id !== 'certificado').map((t) => {
                const marcado = tiposAGenerar.has(t.id);
                const listos = filas.filter(
                  (f) =>
                    seleccion.has(clave(f.mes, f.contratoId)) &&
                    bloqueoDeFila(f, [t.id]) === null,
                ).length;
                // Cuántos podrían generarse si se marcaran, para poder decirlo
                // cuando la selección está vacía porque otro documento falla.
                const posibles = filas.filter((f) => bloqueoDeFila(f, [t.id]) === null).length;

                return (
                  <div
                    key={t.id}
                    className={`flex items-stretch overflow-hidden rounded-lg border
                                transition-colors
                                ${marcado ? 'border-naranja-500' : 'border-borde'}`}
                  >
                    <button
                      type="button"
                      role="checkbox"
                      aria-checked={marcado}
                      disabled={generando}
                      title={`${t.ayuda}. Márquelo para incluirlo en «Generar».`}
                      onClick={() =>
                        setTiposAGenerar((previa) => {
                          const n = new Set(previa);
                          if (n.has(t.id)) n.delete(t.id);
                          else n.add(t.id);
                          return n;
                        })
                      }
                      className={`flex items-center gap-2 px-3 py-2 text-sm font-medium
                                  transition-colors
                                  disabled:cursor-not-allowed disabled:opacity-50
                                  ${
                                    marcado
                                      ? 'bg-naranja-50 text-naranja-700'
                                      : 'bg-lienzo text-tinta-tenue hover:text-tinta'
                                  }`}
                    >
                      {marcado ? <CircleCheck size={15} /> : <CircleDashed size={15} />}
                      {t.etiqueta}
                    </button>

                    <button
                      type="button"
                      disabled={generando || listos === 0}
                      title={
                        listos > 0
                          ? `Generar sólo ${NOMBRE_TIPO[t.id]}: ${listos} documento(s)`
                          : posibles > 0
                            ? `Hay ${posibles} que podrían generarse; márquelos en la tabla de abajo`
                            : `Ningún contrato puede generar ${NOMBRE_TIPO[t.id]} todavía`
                      }
                      onClick={() => void generar(t.id)}
                      className={`flex items-center gap-1 border-l px-2.5 text-xs font-medium
                                  transition-colors disabled:cursor-not-allowed
                                  disabled:opacity-40
                                  ${
                                    marcado
                                      ? 'border-naranja-500 bg-naranja-50 text-naranja-700 hover:bg-naranja-100'
                                      : 'border-borde bg-lienzo text-tinta-tenue hover:bg-superficie hover:text-tinta'
                                  }`}
                    >
                      <Play size={13} />
                      {listos > 0 ? listos : ''}
                    </button>
                  </div>
                );
              })}
            </div>
            <p className="mt-1.5 text-xs text-tinta-tenue">
              La casilla decide qué entra en «Generar». El botón ▷ de cada uno lo
              produce por su cuenta, sin tocar lo demás.
            </p>
          </div>

          <SelectorDeMeses
            anio={anio}
            meses={meses}
            deshabilitado={generando}
            alCambiar={(m) => {
              // Cambiar los meses a mano deja de ser «solo un contrato».
              setAvisoSoloUno(null);
              setMeses(m);
            }}
          />

          <SoloUnContrato
            contratos={contratosPorActividad}
            deshabilitado={generando}
            aviso={avisoSoloUno}
            alElegir={soloUnContrato}
          />
        </section>

        {errorGeneral && (
          <Aviso tipo="error" titulo="No se pudo completar la generación">
            {errorGeneral}
          </Aviso>
        )}

        {duplicados.length > 0 && (
          <Aviso tipo="alerta" titulo="Hay contratos repetidos">
            {`Estos números de contrato aparecen más de una vez: ${duplicados.join(', ')}. ` +
              'Suele ser un contrato creado por error. Los informes se generarán igual, ' +
              'numerando el archivo del segundo para no sobrescribir el del primero, pero ' +
              'conviene revisarlo.'}
          </Aviso>
        )}

        {/* Barra de progreso */}
        {progreso && <BarraProgreso progreso={progreso} tanda={tanda} filas={filas} />}

        {/* Qué falta */}
        {!generando && pendientes.length > 0 && (
          <section className="tarjeta border-alerta-borde bg-alerta-fondo/60 p-5">
            <div className="mb-3 flex items-start gap-2.5">
              <AlertTriangle size={18} className="mt-0.5 shrink-0 text-alerta-fuerte" />
              <div>
                <h2 className="font-semibold text-alerta-texto">
                  Falta {pendientes.length === 1 ? 'un paso' : `${pendientes.length} pasos`}{' '}
                  para poder generar
                </h2>
                <p className="mt-0.5 text-sm text-alerta-texto">
                  El botón «Generar» se activa cuando todo esté en verde.
                </p>
              </div>
            </div>

            <ul className="flex flex-col gap-2">
              {requisitos.map((r, i) => (
                <li key={i} className="flex flex-wrap items-center gap-2 text-sm">
                  {r.ok ? (
                    <CircleCheck size={16} className="shrink-0 text-exito-fuerte" />
                  ) : (
                    <CircleDashed size={16} className="shrink-0 text-alerta-fuerte" />
                  )}
                  <span className={r.ok ? 'text-tinta-tenue line-through' : 'text-tinta'}>
                    {r.texto}
                  </span>
                  {!r.ok && r.accion && (
                    <button
                      onClick={() => irA(r.accion!.ir)}
                      className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-xs
                                 font-medium text-naranja-700 underline underline-offset-2
                                 hover:bg-naranja-50 hover:no-underline"
                    >
                      {r.accion.etiqueta}
                      <ArrowRight size={12} />
                    </button>
                  )}
                </li>
              ))}
            </ul>

            {/* Aquí había un atajo para asignar una plantilla a todos los
                contratos que faltaran. Se quitó: ofrecía plantillas de
                cualquier tipo pero sólo escribía la del informe, así que elegir
                una cuenta de cobro no hacía nada visible. Cada contrato tiene
                ahora tres plantillas y eso se decide en su ficha, una por una,
                que es donde se ve cuál es cuál. */}
          </section>
        )}

        {/* Resultado */}
        {resultado && (
          <div className="flex flex-col gap-3">
            {resultado.generados.length > 0 && (
              <Aviso
                tipo="exito"
                titulo={`${resultado.generados.length} informe(s) generado(s)`}
              >
                <div className="mt-1 flex flex-col gap-1">
                  {resultado.generados.map((g) => (
                    <button
                      key={`${g.mes}-${g.contratoId}`}
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
                    onClick={() => void window.api.sistema.abrirCarpeta(carpeta)}
                  >
                    Abrir la carpeta
                  </Boton>
                </div>
              </Aviso>
            )}

            {resultado.generados.flatMap((g) => g.avisos).length > 0 && (
              <Aviso tipo="alerta" titulo="Avisos durante la generación">
                {resultado.generados
                  .flatMap((g) => g.avisos.map((a) => `${g.nombre}: ${a}`))
                  .join('\n')}
              </Aviso>
            )}

            {resultado.fallidos.length > 0 && (
              <Aviso
                tipo="error"
                titulo={`${resultado.fallidos.length} no se pudo generar`}
              >
                {resultado.fallidos
                  .map((f) => {
                    const fila = filas.find(
                      (x) => x.mes === f.mes && x.contratoId === f.contratoId,
                    );
                    return `${fila?.numero ?? f.contratoId} (${NOMBRES_MES[f.mes - 1]}): ${f.error}`;
                  })
                  .join('\n\n')}
              </Aviso>
            )}
          </div>
        )}

        {/* Tabla */}
        <section className="tarjeta overflow-hidden">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-borde px-4 py-3">
            <h2 className="text-sm font-semibold">
              {seleccionados.length} de {elegibles.length} informe(s) marcado(s) ·{' '}
              {listaDeMeses(mesesOrdenados)} de {anio}
            </h2>
            <div className="flex items-center gap-3 text-xs">
              {calculando && <span className="text-tinta-tenue">Calculando…</span>}
              {mesesOrdenados.length > 0 && (
                <>
                  <button
                    type="button"
                    className="text-naranja-700 underline underline-offset-2 hover:no-underline"
                    onClick={() =>
                      setMesesAbiertos((s) => new Set([...s, ...mesesOrdenados.map(claveMes)]))
                    }
                  >
                    Desplegar todos
                  </button>
                  <button
                    type="button"
                    className="text-naranja-700 underline underline-offset-2 hover:no-underline"
                    onClick={() =>
                      setMesesAbiertos((s) => {
                        const n = new Set(s);
                        for (const m of mesesOrdenados) n.delete(claveMes(m));
                        return n;
                      })
                    }
                  >
                    Plegar todos
                  </button>
                </>
              )}
            </div>
          </div>

          {meses.size === 0 ? (
            <p className="px-4 py-10 text-center text-sm text-tinta-tenue">
              Marque arriba los meses que quiera generar.
            </p>
          ) : (
            <div className="tabla-desplazable">
              <table className="w-full text-sm">
                <thead className="bg-superficie text-left text-xs uppercase tracking-wide text-tinta-tenue">
                  <tr>
                    <th className="w-10 px-4 py-2.5">
                      <input
                        type="checkbox"
                        className="accent-naranja-500"
                        title="Marcar o desmarcar todo"
                        disabled={elegibles.length === 0 || generando}
                        checked={
                          elegibles.length > 0 && seleccionados.length === elegibles.length
                        }
                        onChange={(e) =>
                          setSeleccion(
                            e.target.checked
                              ? new Set(elegibles.map((f) => clave(f.mes, f.contratoId)))
                              : new Set(),
                          )
                        }
                      />
                    </th>
                    <th className="px-4 py-2.5 font-medium">Contrato</th>
                    <th className="px-4 py-2.5 font-medium">Periodo</th>
                    <th className="px-4 py-2.5 text-right font-medium">Pago del mes</th>
                    <th className="px-4 py-2.5 text-right font-medium">Acumulado</th>
                    <th className="px-4 py-2.5 text-right font-medium">Por ejecutar</th>
                    <th className="px-4 py-2.5 font-medium">Planilla</th>
                  </tr>
                </thead>
                <tbody>
                  {mesesOrdenados.map((mes) => {
                    const delMes = filas.filter((f) => f.mes === mes);
                    const elegiblesDelMes = delMes.filter((f) => tiposGenerables(f, tipos).length > 0);
                    const marcadosDelMes = elegiblesDelMes.filter((f) =>
                      seleccion.has(clave(mes, f.contratoId)),
                    );

                    return (
                      <MesEnLaTabla
                        key={mes}
                        mes={mes}
                        anio={anio}
                        filas={delMes}
                        elegibles={elegiblesDelMes.length}
                        marcados={marcadosDelMes.length}
                        seleccion={seleccion}
                        tipos={tipos}
                        generando={generando}
                        enCurso={tanda?.mes === mes ? progreso?.contratoId : undefined}
                        alMarcarMes={(marcar) =>
                          setSeleccion((s) => {
                            const n = new Set(s);
                            for (const f of elegiblesDelMes) {
                              if (marcar) n.add(clave(mes, f.contratoId));
                              else n.delete(clave(mes, f.contratoId));
                            }
                            return n;
                          })
                        }
                        alMarcarFila={(contratoId, marcar) =>
                          setSeleccion((s) => {
                            const n = new Set(s);
                            if (marcar) n.add(clave(mes, contratoId));
                            else n.delete(clave(mes, contratoId));
                            return n;
                          })
                        }
                        alLeerPlanilla={(contratoId) => void leerPlanilla(mes, contratoId)}
                        editandoPlanilla={editandoPlanilla}
                        alEditarPlanilla={(contratoId) =>
                          setEditandoPlanilla(clave(mes, contratoId))
                        }
                        alGuardarPlanilla={(contratoId, p) => {
                          void fijarPlanilla(mes, contratoId, p);
                          setEditandoPlanilla(null);
                        }}
                        alCerrarPlanilla={() => setEditandoPlanilla(null)}
                        abierto={mesesAbiertos.has(claveMes(mes))}
                        alAlternar={() =>
                          setMesesAbiertos((s) => {
                            const n = new Set(s);
                            if (n.has(claveMes(mes))) n.delete(claveMes(mes));
                            else n.add(claveMes(mes));
                            return n;
                          })
                        }
                      />
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <Aviso tipo="info">
          Las cifras de esta tabla son las mismas que saldrán impresas en el informe: el
          acumulado va sumando mes a mes y el saldo por ejecutar restando, hasta llegar a
          cero en el último mes del contrato.
        </Aviso>

        <SeccionCertificados />

        <HistorialInformes />
      </div>
    </Pagina>
  );
}

// ── Selector de año ─────────────────────────────────────────────────────────

/** Años que se admiten. Amplio a propósito: la elección debe ser libre. */
const ANIO_MINIMO = 1990;
const ANIO_MAXIMO = 2100;

/**
 * Año con flechas para moverse y un campo para escribirlo.
 *
 * El campo guarda su propio texto en vez de escribir directamente sobre el
 * año. Si escribiera cada tecla, teclear «2024» pasaría por 2, 20 y 202, y
 * cada uno de esos años intermedios dispararía un recálculo completo de todos
 * los contratos y todos los meses marcados. Sólo se acepta cuando ya son
 * cuatro cifras dentro del rango; mientras tanto se ve lo tecleado.
 */
function SelectorDeAnio({
  anio,
  deshabilitado,
  alCambiar,
}: {
  anio: number;
  deshabilitado: boolean;
  alCambiar: (a: number) => void;
}) {
  const [texto, setTexto] = useState(String(anio));

  // Las flechas cambian el año por fuera; el campo tiene que seguirlas.
  useEffect(() => {
    setTexto(String(anio));
  }, [anio]);

  const mover = (delta: number) =>
    alCambiar(Math.min(ANIO_MAXIMO, Math.max(ANIO_MINIMO, anio + delta)));

  const flecha =
    'rounded-lg border border-borde bg-lienzo px-2 py-2 text-tinta-tenue transition-colors ' +
    'hover:border-naranja-300 hover:text-tinta disabled:cursor-not-allowed disabled:opacity-40';

  return (
    <div className="block">
      <span className="etiqueta">Año</span>
      <div className="flex items-center gap-1">
        <button
          type="button"
          className={flecha}
          title="Año anterior"
          aria-label="Año anterior"
          disabled={deshabilitado || anio <= ANIO_MINIMO}
          onClick={() => mover(-1)}
        >
          <ChevronLeft size={16} />
        </button>

        <input
          className="campo w-24 text-center tabular-nums"
          inputMode="numeric"
          value={texto}
          disabled={deshabilitado}
          onChange={(e) => {
            const limpio = e.target.value.replace(/\D/g, '').slice(0, 4);
            setTexto(limpio);
            const n = Number(limpio);
            if (limpio.length === 4 && n >= ANIO_MINIMO && n <= ANIO_MAXIMO) alCambiar(n);
          }}
          onBlur={() => setTexto(String(anio))}
        />

        <button
          type="button"
          className={flecha}
          title="Año siguiente"
          aria-label="Año siguiente"
          disabled={deshabilitado || anio >= ANIO_MAXIMO}
          onClick={() => mover(1)}
        >
          <ChevronRight size={16} />
        </button>
      </div>
    </div>
  );
}

// ── Selector de meses ───────────────────────────────────────────────────────

/**
 * Los doce meses como casillas, no como desplegable.
 *
 * Un desplegable sólo deja elegir uno, y elegir varios en uno de selección
 * múltiple obliga a arrastrar o a mantener Ctrl pulsado, que es justo lo que
 * no hay que pedirle a nadie. Con doce casillas siempre visibles, «enero,
 * marzo y abril» son tres clics y se ve de un vistazo qué quedó marcado.
 */
/**
 * «Solo un contrato»: marca los meses de un contrato y, en cada uno, sólo él.
 *
 * El último contrato trabajado sale el primero, porque suele ser el recién
 * registrado, que es con el que se usa esto.
 */
function SoloUnContrato({
  contratos,
  deshabilitado,
  aviso,
  alElegir,
}: {
  contratos: { contrato: Contrato; contratista: string; actividad?: string }[];
  deshabilitado: boolean;
  aviso: string | null;
  alElegir: (contratoId: string) => void;
}) {
  if (contratos.length === 0) return null;
  const mesCorto = (iso: string) => {
    const [a, m] = iso.split('-').map(Number);
    return `${NOMBRES_MES[m - 1]?.slice(0, 3) ?? '?'}. ${a}`;
  };

  return (
    <div>
      <label className="flex flex-wrap items-center gap-2 text-sm">
        <span className="etiqueta mb-0">Solo un contrato</span>
        <select
          className="campo w-auto min-w-0 max-w-full flex-1 py-1.5 sm:flex-none"
          value=""
          disabled={deshabilitado}
          onChange={(e) => e.target.value && alElegir(e.target.value)}
        >
          <option value="">Elegir un contrato para marcar todos sus meses…</option>
          {contratos.map(({ contrato: c, contratista, actividad }, i) => (
            <option key={c.id} value={c.id}>
              {c.numero || '(sin número)'} · {contratista} · {mesCorto(c.fechaInicio)} – {mesCorto(c.fechaTerminacion)}
              {i === 0 && actividad ? ' (último trabajado)' : ''}
            </option>
          ))}
        </select>
      </label>
      <p className="mt-1.5 text-xs text-tinta-tenue">
        {aviso ??
          'Marca los meses de ese contrato y, en cada uno, sólo a él: para generar todos sus informes de una vez.'}
      </p>
    </div>
  );
}

function SelectorDeMeses({
  anio,
  meses,
  deshabilitado,
  alCambiar,
}: {
  anio: number;
  meses: Set<number>;
  deshabilitado: boolean;
  alCambiar: Dispatch<SetStateAction<Set<number>>>;
}) {
  const hoy = new Date();
  const hastaHoy =
    anio < hoy.getFullYear() ? 12 : anio > hoy.getFullYear() ? 0 : hoy.getMonth() + 1;

  // Se parte de la selección anterior y no del `meses` de este render: dos
  // pulsaciones muy seguidas caen en el mismo lote de React y la segunda
  // partiría del estado viejo, deshaciendo la primera.
  const alternar = (mes: number) =>
    alCambiar((previa) => {
      const n = new Set(previa);
      if (n.has(mes)) n.delete(mes);
      else n.add(mes);
      return n;
    });

  const atajos: { etiqueta: string; titulo: string; meses: number[]; apagado?: boolean }[] = [
    {
      etiqueta: 'Todo el año',
      titulo: 'Marcar los doce meses',
      meses: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12],
    },
    {
      etiqueta: 'Hasta hoy',
      titulo:
        hastaHoy === 0
          ? 'El año elegido todavía no ha empezado'
          : `Marcar de enero a ${NOMBRES_MES[hastaHoy - 1]}`,
      meses: Array.from({ length: hastaHoy }, (_, i) => i + 1),
      // En un año futuro no hay «hasta hoy» que valga, y dejarlo activo sólo
      // serviría para desmarcarlo todo sin querer.
      apagado: hastaHoy === 0,
    },
    { etiqueta: 'Ninguno', titulo: 'Desmarcar todos', meses: [] },
  ];

  return (
    <div>
      <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
        <span className="etiqueta mb-0">Meses que se van a generar</span>
        <div className="flex flex-wrap gap-1">
          {atajos.map((a) => (
            <button
              key={a.etiqueta}
              type="button"
              disabled={deshabilitado || a.apagado}
              title={a.titulo}
              onClick={() => alCambiar(new Set(a.meses))}
              className="rounded-md px-2 py-1 text-xs font-medium text-naranja-700
                         underline underline-offset-2 hover:bg-naranja-50 hover:no-underline
                         disabled:cursor-not-allowed disabled:opacity-40 disabled:no-underline"
            >
              {a.etiqueta}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-3 gap-1.5 sm:grid-cols-4 lg:grid-cols-6">
        {NOMBRES_MES.map((nombre, i) => {
          const mes = i + 1;
          const marcado = meses.has(mes);
          return (
            <button
              key={nombre}
              type="button"
              role="checkbox"
              aria-checked={marcado}
              disabled={deshabilitado}
              onClick={() => alternar(mes)}
              className={`rounded-lg border px-2 py-2 text-sm font-medium transition-colors
                          disabled:cursor-not-allowed disabled:opacity-50
                          ${
                            marcado
                              ? 'border-naranja-500 bg-naranja-50 text-naranja-700'
                              : 'border-borde bg-lienzo text-tinta-tenue hover:border-naranja-300 hover:text-tinta'
                          }`}
            >
              {conMayuscula(nombre)}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ── Un mes dentro de la tabla ───────────────────────────────────────────────

function MesEnLaTabla({
  mes,
  anio,
  filas,
  elegibles,
  marcados,
  seleccion,
  tipos,
  generando,
  enCurso,
  editandoPlanilla,
  alMarcarMes,
  alMarcarFila,
  alLeerPlanilla,
  alEditarPlanilla,
  alGuardarPlanilla,
  alCerrarPlanilla,
  abierto,
  alAlternar,
}: {
  mes: number;
  anio: number;
  filas: Fila[];
  elegibles: number;
  marcados: number;
  seleccion: Set<string>;
  /** Documentos pedidos; determinan qué falta en cada fila. */
  tipos: TipoDocumento[];
  generando: boolean;
  /** Contrato que se está generando ahora mismo, si es de este mes */
  enCurso?: string;
  /** Casilla con el formulario de planilla abierto, si es de este mes */
  editandoPlanilla: string | null;
  alMarcarMes: (marcar: boolean) => void;
  alMarcarFila: (contratoId: string, marcar: boolean) => void;
  alLeerPlanilla: (contratoId: string) => void;
  alEditarPlanilla: (contratoId: string) => void;
  alGuardarPlanilla: (contratoId: string, planilla?: Planilla) => void;
  alCerrarPlanilla: () => void;
  /** Si el mes está desplegado. */
  abierto: boolean;
  alAlternar: () => void;
}) {
  // Las filas ya llegan ordenadas: el último contrato trabajado va primero.
  const ultimo = filas[0]?.actividad ? filas[0] : undefined;

  return (
    <>
      <tr className="border-t border-borde bg-superficie/70">
        <td className="px-4 py-2">
          <input
            type="checkbox"
            className="accent-naranja-500"
            title={`Marcar o desmarcar ${NOMBRES_MES[mes - 1]}`}
            disabled={elegibles === 0 || generando}
            checked={elegibles > 0 && marcados === elegibles}
            onChange={(e) => alMarcarMes(e.target.checked)}
          />
        </td>
        <td colSpan={6} className="p-0">
          {/* Toda la franja despliega o pliega el mes. */}
          <button
            type="button"
            onClick={alAlternar}
            aria-expanded={abierto}
            className="flex w-full flex-wrap items-center gap-x-2 gap-y-0.5 px-4 py-2 text-left hover:bg-superficie"
          >
            <ChevronRight
              size={15}
              className={`shrink-0 text-tinta-tenue transition-transform ${abierto ? 'rotate-90' : ''}`}
            />
            <span className="text-xs font-semibold uppercase tracking-wide text-tinta">
              {conMayuscula(NOMBRES_MES[mes - 1])} de {anio}
            </span>
            <span className="text-xs text-tinta-tenue">
              {filas.length} contrato{filas.length === 1 ? '' : 's'} ·{' '}
              {elegibles === 0
                ? 'ninguno listo este mes'
                : `${marcados} de ${elegibles} marcado(s)`}
            </span>
            {!abierto && ultimo && (
              <span className="basis-full pl-6 text-xs text-tinta-tenue sm:basis-auto sm:pl-0">
                · último trabajado: <b className="font-medium text-tinta">{ultimo.numero}</b>{' '}
                {ultimo.contratista}
              </span>
            )}
          </button>
        </td>
      </tr>

      {abierto && filas.map((f, i) => {
        const bloqueo = faltaDeFila(f, tipos);
        const editando = editandoPlanilla === clave(f.mes, f.contratoId);
        return (
          <Fragment key={clave(f.mes, f.contratoId)}>
          <tr
            className={`border-t border-borde ${
              tiposGenerables(f, tipos).length === 0 ? 'bg-superficie/60' : ''
            } ${
              enCurso === f.contratoId ? 'bg-naranja-50' : ''
            }`}
          >
            <td className="px-4 py-2.5">
              <input
                type="checkbox"
                className="accent-naranja-500"
                disabled={tiposGenerables(f, tipos).length === 0 || generando}
                checked={seleccion.has(clave(f.mes, f.contratoId))}
                onChange={(e) => alMarcarFila(f.contratoId, e.target.checked)}
              />
            </td>
            <td className="px-4 py-2.5">
              <p className="font-medium">
                {f.numero}
                {i === 0 && ultimo && (
                  <span className="ml-2 align-middle" title={`Último cambio: ${fechaHora(ultimo.actividad!)}`}>
                    <Insignia tono="naranja">Último trabajado</Insignia>
                  </span>
                )}
              </p>
              <p className="text-xs text-tinta-tenue">{f.contratista}</p>
              {bloqueo && (
                <p className="mt-1 flex items-start gap-1 text-xs text-alerta-fuerte">
                  <AlertTriangle size={12} className="mt-0.5 shrink-0" />
                  {bloqueo}
                </p>
              )}
              {!bloqueo && (
                <span className="mt-1 flex flex-wrap gap-1">
                  {tipos.map((t) => (
                    <Insignia key={t} tono="verde">
                      {f.plantillas[t]?.nombre}
                    </Insignia>
                  ))}
                </span>
              )}
            </td>
            <td className="px-4 py-2.5 text-xs text-tinta-tenue">
              {f.aplica ? `${f.desde} → ${f.hasta}` : '—'}
            </td>
            <td className="px-4 py-2.5 text-right tabular-nums">
              {f.pagoDelMes !== undefined ? moneda(f.pagoDelMes) : '—'}
            </td>
            <td className="px-4 py-2.5 text-right tabular-nums">
              {f.totalPagado !== undefined ? moneda(f.totalPagado) : '—'}
            </td>
            <td className="px-4 py-2.5 text-right tabular-nums">
              {f.valorPorEjecutar !== undefined ? moneda(f.valorPorEjecutar) : '—'}
            </td>
            <td className="px-4 py-2.5">
              {f.planilla ? (
                <button
                  type="button"
                  onClick={() => alEditarPlanilla(f.contratoId)}
                  disabled={generando}
                  title="Cambiar los datos de la planilla"
                  className="flex items-center gap-1.5 rounded-md px-1.5 py-1 text-xs
                             hover:bg-superficie disabled:cursor-not-allowed"
                >
                  <FileCheck2 size={14} className="shrink-0 text-exito-fuerte" />
                  <span className="tabular-nums">{f.planilla.numero}</span>
                  <Pencil size={11} className="shrink-0 text-tinta-suave" />
                </button>
              ) : (
                <div className="flex gap-1">
                  <Boton
                    variante="fantasma"
                    icono={<ScanLine size={14} />}
                    onClick={() => alLeerPlanilla(f.contratoId)}
                    disabled={!f.aplica || generando}
                    title="Leerla de un PDF o una imagen"
                  >
                    Leer
                  </Boton>
                  <Boton
                    variante="fantasma"
                    icono={<Pencil size={13} />}
                    onClick={() => alEditarPlanilla(f.contratoId)}
                    disabled={!f.aplica || generando}
                    title="Escribir los datos a mano"
                  >
                    Escribir
                  </Boton>
                </div>
              )}
            </td>
          </tr>

          {editando && (
            <tr className="border-t border-borde bg-naranja-50/40">
              <td />
              <td colSpan={6} className="px-4 py-3">
                <FormularioPlanilla
                  anio={anio}
                  mes={f.mes}
                  planilla={f.planilla}
                  alGuardar={(p) => alGuardarPlanilla(f.contratoId, p)}
                  alQuitar={() => alGuardarPlanilla(f.contratoId, undefined)}
                  alCerrar={alCerrarPlanilla}
                />
              </td>
            </tr>
          )}
          </Fragment>
        );
      })}
    </>
  );
}

// ── Planilla escrita a mano ─────────────────────────────────────────────────

/**
 * Los datos de la planilla PILA de un mes.
 *
 * Existe porque el número de planilla cambia todos los meses y no siempre hay
 * un PDF que leer: a veces sólo se tiene el papel delante. Los campos son los
 * mismos que la tabla del informe —número, día, mes, año y mes de pago—, en el
 * mismo orden, para poder copiarlos mirando.
 */
function FormularioPlanilla({
  anio,
  mes,
  planilla,
  alGuardar,
  alQuitar,
  alCerrar,
}: {
  anio: number;
  mes: number;
  planilla?: Planilla;
  alGuardar: (p: Planilla) => void;
  alQuitar: () => void;
  alCerrar: () => void;
}) {
  const [numero, setNumero] = useState(planilla?.numero ?? '');
  const [fecha, setFecha] = useState(planilla?.fecha ?? fechaDePagoPorDefecto(anio, mes));
  const [mesAcreditado, setMesAcreditado] = useState(
    planilla?.mesAcreditado ?? NOMBRES_MES[mes - 1],
  );

  // El número es lo único imprescindible: sin él no hay nada que anotar.
  const listo = numero.trim().length > 0 && /^\d{4}-\d{2}-\d{2}$/.test(fecha);

  function guardar() {
    if (!listo) return;
    alGuardar({ numero: numero.trim(), fecha, mesAcreditado });
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-end gap-3">
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-tinta">
            Número de planilla
          </span>
          <input
            className="campo w-52 py-1.5 text-sm tabular-nums"
            value={numero}
            autoFocus
            inputMode="numeric"
            placeholder="Ejemplo: 123XXXXXXX"
            onChange={(e) => setNumero(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') guardar();
              if (e.key === 'Escape') alCerrar();
            }}
          />
        </label>

        <label className="block">
          <span className="mb-1 block text-xs font-medium text-tinta">Fecha de pago</span>
          <input
            type="date"
            className="campo w-44 py-1.5 text-sm"
            value={fecha}
            onChange={(e) => setFecha(e.target.value)}
          />
        </label>

        <label className="block">
          <span className="mb-1 block text-xs font-medium text-tinta">Mes de pago</span>
          <select
            className="campo w-40 py-1.5 text-sm"
            value={mesAcreditado}
            onChange={(e) => setMesAcreditado(e.target.value)}
          >
            {NOMBRES_MES.map((n) => (
              <option key={n} value={n}>
                {conMayuscula(n)}
              </option>
            ))}
          </select>
        </label>

        <div className="flex gap-2">
          <Boton
            variante="primario"
            icono={<Save size={15} />}
            disabled={!listo}
            onClick={guardar}
          >
            Guardar
          </Boton>
          <Boton variante="fantasma" icono={<X size={15} />} onClick={alCerrar}>
            Cancelar
          </Boton>
          {planilla && (
            <Boton variante="peligro" onClick={alQuitar}>
              Quitar la planilla
            </Boton>
          )}
        </div>
      </div>

      <p className="text-xs text-tinta-tenue">
        El mes de pago es el que la planilla acredita —el del informe—, no aquel en que
        se pagó: la de enero suele pagarse a principios de febrero.
      </p>
    </div>
  );
}

// ── Barra de progreso ───────────────────────────────────────────────────────

const TEXTO_FASE: Record<ProgresoGeneracion['fase'], string> = {
  generando: 'Armando el documento',
  guardando: 'Guardando el archivo',
  listo: 'Guardado',
  error: 'No se pudo generar',
};

function BarraProgreso({
  progreso,
  tanda,
  filas,
}: {
  progreso: ProgresoGeneracion;
  tanda: { mes: number; tipo: TipoDocumento; indice: number; total: number } | null;
  filas: Fila[];
}) {
  const fila = filas.find(
    (f) => f.contratoId === progreso.contratoId && (!tanda || f.mes === tanda.mes),
  );

  // Cada informe aporta su parte, y dentro de él las dos fases se reparten
  // el tramo: así la barra avanza también mientras se escribe en disco.
  const avanceDeFase =
    progreso.fase === 'generando' ? 0.35 : progreso.fase === 'guardando' ? 0.75 : 1;
  const dentroDelMes = (progreso.indice + avanceDeFase) / Math.max(1, progreso.total);

  // Con varios meses, cada mes es un tramo de la barra: así no se reinicia de
  // cero al pasar de enero a marzo, que parecería que algo salió mal.
  const porcentaje = Math.min(
    100,
    Math.round(
      tanda
        ? ((tanda.indice + dentroDelMes) / tanda.total) * 100
        : dentroDelMes * 100,
    ),
  );

  return (
    <section className="tarjeta p-5" aria-live="polite">
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <p className="font-semibold">
            {tanda
              ? `${conMayuscula(NOMBRE_TIPO[tanda.tipo])} de ${NOMBRES_MES[tanda.mes - 1]}` +
                (tanda.total > 1 ? ` (tanda ${tanda.indice + 1} de ${tanda.total})` : '') +
                ` · documento ${progreso.indice + 1} de ${progreso.total}`
              : `Generando documento ${progreso.indice + 1} de ${progreso.total}`}
          </p>
          <p className="mt-0.5 text-sm text-tinta-tenue">
            {TEXTO_FASE[progreso.fase]}
            {fila ? ` · ${fila.numero} — ${fila.contratista}` : ''}
          </p>
        </div>
        <span className="text-sm font-semibold tabular-nums text-naranja-700">
          {porcentaje}%
        </span>
      </div>

      <div
        className="h-2.5 w-full overflow-hidden rounded-full bg-apagado-borde"
        role="progressbar"
        aria-valuenow={porcentaje}
        aria-valuemin={0}
        aria-valuemax={100}
      >
        <div
          className="h-full rounded-full bg-naranja-500 transition-all duration-300 ease-out"
          style={{ width: `${porcentaje}%` }}
        />
      </div>

      {progreso.fase === 'listo' && progreso.nombre && (
        <p className="mt-2 truncate text-xs text-exito-fuerte">✓ {progreso.nombre}</p>
      )}
    </section>
  );
}
