import { useMemo, useState } from 'react';
import {
  FileStack,
  Upload,
  Trash2,
  Wand2,
  CheckCircle2,
  ArrowLeft,
  ArrowRight,
  Save,
  Eraser,
} from 'lucide-react';

import { useEstado } from '../estado';
import { useIrA } from '../navegacion';
import { DIAS_EN_PAPELERA } from '../../core/modelo/tipos';
import { Aviso, Boton, Campo, Insignia, Pagina, Vacio } from '../componentes/Ui';
import {
  TIPOS_DOCUMENTO,
  camposDe,
  porGrupo,
  type CampoId,
  type TipoDocumento,
} from '../../core/docx/campos';
import {
  agregarOcurrencia,
  estaMapeado,
  quitarOcurrencia,
  type MapaPlantilla,
} from '../../core/docx/mapaPlantilla';
import type { Candidato } from '../../core/docx/detectarCampos';

type Inspeccion = { mapa: MapaPlantilla; texto: string; candidatos: Candidato[] };

export function PaginaPlantillas() {
  const { plantillas, recargarPlantillas } = useEstado();
  const irA = useIrA();
  const [inspeccion, setInspeccion] = useState<Inspeccion | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [porEliminar, setPorEliminar] = useState<MapaPlantilla | null>(null);
  const [eliminada, setEliminada] = useState<string | null>(null);
  /**
   * Qué documento se va a subir.
   *
   * Se pregunta antes y no después porque de ello depende qué campos busca el
   * programa dentro del archivo: los rótulos de una cuenta de cobro no se
   * parecen en nada a los de un informe.
   */
  const [tipoASubir, setTipoASubir] = useState<TipoDocumento>('informe');

  async function subir() {
    setError(null);
    const ruta = await window.api.sistema.elegirArchivo([
      { name: 'Documentos de Word', extensions: ['docx'] },
    ]);
    if (!ruta) return;

    const nombre = ruta.split(/[\\/]/).pop()?.replace(/\.docx$/i, '') ?? 'Plantilla';

    setOcupado(true);
    try {
      const r = await window.api.plantillas.registrar(ruta, nombre, tipoASubir);
      await recargarPlantillas();
      setInspeccion(r);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setOcupado(false);
    }
  }

  async function abrirMapeo(mapa: MapaPlantilla) {
    setError(null);
    setOcupado(true);
    try {
      setInspeccion(await window.api.plantillas.inspeccionar(mapa));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setOcupado(false);
    }
  }

  /**
   * Corrige de qué documento es una plantilla ya registrada.
   *
   * Abre el asistente a continuación porque el mapeo anterior se descarta —los
   * campos de un informe no existen en un certificado— y hay que rehacerlo con
   * los candidatos del tipo correcto, que es justo lo que ahora sí aparecen.
   */
  async function cambiarTipo(p: MapaPlantilla, tipo: TipoDocumento) {
    setError(null);
    setOcupado(true);
    try {
      const r = await window.api.plantillas.cambiarTipo(p.id, tipo);
      if (!r.ok || !r.mapa) {
        setError(r.error ?? 'No se pudo cambiar el tipo de la plantilla.');
        return;
      }
      await recargarPlantillas();
      setInspeccion({
        mapa: r.mapa,
        texto: r.texto ?? '',
        candidatos: r.candidatos ?? [],
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setOcupado(false);
    }
  }

  async function eliminar(p: MapaPlantilla) {
    await window.api.plantillas.eliminar(p.id);
    await recargarPlantillas();
    setPorEliminar(null);
    setEliminada(p.nombre);
  }

  if (inspeccion) {
    return (
      <AsistenteMapeo
        inicial={inspeccion}
        alSalir={async () => {
          setInspeccion(null);
          await recargarPlantillas();
        }}
      />
    );
  }

  return (
    <Pagina
      titulo="Plantillas"
      descripcion="Suba un documento de Word ya diligenciado —un informe, una cuenta de cobro o un certificado—. El programa lo usará como molde: conserva logos, tipos de letra, tablas y márgenes exactamente como están."
      acciones={
        <>
          <label className="flex items-center gap-2 text-xs text-tinta-tenue">
            Documento
            <select
              className="rounded-lg border border-borde bg-lienzo px-2 py-2 text-xs text-tinta"
              value={tipoASubir}
              onChange={(e) => setTipoASubir(e.target.value as TipoDocumento)}
            >
              {TIPOS_DOCUMENTO.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.etiqueta}
                </option>
              ))}
            </select>
          </label>
          <Boton
            variante="primario"
            icono={<Upload size={16} />}
            onClick={subir}
            cargando={ocupado}
          >
            Subir un .docx
          </Boton>
        </>
      }
    >
      <div className="flex flex-col gap-5 pb-8">
        {error && <Aviso tipo="error" titulo="No se pudo abrir el documento">{error}</Aviso>}

        {eliminada && (
          <Aviso tipo="exito" titulo={`«${eliminada}» se envió a la papelera`}>
            <span>
              Se conserva {DIAS_EN_PAPELERA} días con su mapeo intacto. Si la recupera,
              los contratos que la tenían asignada volverán a reconocerla sin
              reasignarla.{' '}
            </span>
            <button
              onClick={() => irA('ajustes')}
              className="inline-flex items-center gap-1 font-medium underline underline-offset-2 hover:no-underline"
            >
              Ver la papelera
              <ArrowRight size={12} />
            </button>
          </Aviso>
        )}

        {/* Confirmación: el mapeo cuesta más de rehacer que de volver a subir
            el archivo, así que conviene decir qué se pierde de vista. */}
        {porEliminar && (
          <section className="tarjeta border-error-borde bg-error-fondo/60 p-5">
            <div className="flex items-start gap-2.5">
              <Trash2 size={18} className="mt-0.5 shrink-0 text-error-fuerte" />
              <div className="min-w-0 flex-1">
                <h2 className="font-semibold text-error-texto">
                  ¿Eliminar la plantilla «{porEliminar.nombre}»?
                </h2>
                <p className="mt-1 text-sm text-error-texto">
                  Los contratos que la tengan asignada se quedarán sin plantilla y no
                  podrán generar informes hasta que se les asigne otra. Pasará a la
                  papelera y podrá recuperarla durante {DIAS_EN_PAPELERA} días desde
                  Ajustes.
                </p>
                <div className="mt-3 flex gap-2">
                  <Boton
                    variante="peligro"
                    icono={<Trash2 size={15} />}
                    onClick={() => void eliminar(porEliminar)}
                  >
                    Sí, enviar a la papelera
                  </Boton>
                  <Boton variante="secundario" onClick={() => setPorEliminar(null)}>
                    Cancelar
                  </Boton>
                </div>
              </div>
            </div>
          </section>
        )}

        {plantillas.length === 0 ? (
          <Vacio
            icono={<FileStack size={24} />}
            titulo="Aún no hay plantillas"
            descripcion="Suba uno de sus informes de Word ya diligenciado. A partir de él, el programa generará los de los demás meses y contratistas conservando el diseño."
            accion={
              <Boton variante="primario" icono={<Upload size={16} />} onClick={subir}>
                Subir un .docx
              </Boton>
            }
          />
        ) : (
          <div className="grid gap-4 sm:grid-cols-2">
            {plantillas.map((p) => {
              const mapeados = p.campos.filter((c) => c.ocurrencias.length > 0).length;
              // «Lista» no puede ser un número fijo: el informe tiene sesenta
              // campos y la cuenta de cobro nueve.
              const suyos = camposDe(p.tipo ?? 'informe').filter(
                (d) => d.frecuencia !== 'tabla',
              ).length;
              const listo = suyos > 0 && mapeados >= Math.ceil(suyos * 0.6);
              return (
                <div key={p.id} className="tarjeta flex flex-col gap-3 p-4">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate font-medium">{p.nombre}</p>
                      <p className="mt-1 text-xs text-tinta-tenue">
                        {mapeados} campo{mapeados === 1 ? '' : 's'} mapeado
                        {mapeados === 1 ? '' : 's'}
                      </p>
                      {/* El tipo se puede corregir aquí sin volver a subir el
                          archivo: una plantilla registrada como el documento
                          equivocado no detecta ninguno de sus campos. */}
                      <label className="mt-2 block">
                        <span className="mb-1 block text-xs text-tinta-tenue">
                          Es un documento de tipo
                        </span>
                        <select
                          className="campo py-1.5 text-xs"
                          value={p.tipo ?? 'informe'}
                          onChange={(e) =>
                            void cambiarTipo(p, e.target.value as TipoDocumento)
                          }
                        >
                          {TIPOS_DOCUMENTO.map((t) => (
                            <option key={t.id} value={t.id}>
                              {t.etiqueta}
                            </option>
                          ))}
                        </select>
                      </label>
                    </div>
                    {listo ? (
                      <Insignia tono="verde">Lista</Insignia>
                    ) : (
                      <Insignia tono="ambar">Falta mapear</Insignia>
                    )}
                  </div>

                  <div className="flex gap-2">
                    <Boton icono={<Wand2 size={15} />} onClick={() => void abrirMapeo(p)}>
                      Mapear campos
                    </Boton>
                    <Boton
                      variante="fantasma"
                      icono={<Trash2 size={15} />}
                      onClick={() => {
                        setEliminada(null);
                        setPorEliminar(p);
                      }}
                    >
                      Eliminar
                    </Boton>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        <Aviso tipo="info" titulo="Por qué el diseño se conserva intacto">
          Un archivo de Word es en realidad una carpeta comprimida. El programa la copia
          entera y sólo cambia el texto que usted marque; los logos, las imágenes, los
          estilos y los bordes de tabla no se abren siquiera, así que salen idénticos.
        </Aviso>
      </div>
    </Pagina>
  );
}

// ── Asistente de mapeo ──────────────────────────────────────────────────────

function AsistenteMapeo({
  inicial,
  alSalir,
}: {
  inicial: Inspeccion;
  alSalir: () => Promise<void>;
}) {
  const [mapa, setMapa] = useState<MapaPlantilla>(inicial.mapa);
  const [guardado, setGuardado] = useState(false);
  const { texto, candidatos } = inicial;

  // Qué documento es esta plantilla. De ello depende qué campos se ofrecen: en
  // una cuenta de cobro no pinta nada el cronograma de pagos del informe.
  const tipo = mapa.tipo ?? 'informe';

  /** Qué campo tiene asignado cada candidato, si alguno. */
  const asignados = useMemo(() => {
    const m = new Map<number, CampoId>();
    for (const c of mapa.campos) {
      for (const o of c.ocurrencias) m.set(o.inicio, c.campo);
    }
    return m;
  }, [mapa]);

  const totalMapeados = mapa.campos.filter((c) => c.ocurrencias.length > 0).length;

  function asignar(c: Candidato, campo: CampoId | '') {
    const previo = asignados.get(c.inicio);
    let siguiente = mapa;

    if (previo) siguiente = quitarOcurrencia(siguiente, previo, c.inicio);
    if (campo) {
      siguiente = agregarOcurrencia(siguiente, campo, {
        inicio: c.inicio,
        fin: c.fin,
        textoOriginal: texto.slice(c.inicio, c.fin),
      });
    }

    setMapa(siguiente);
    setGuardado(false);
  }

  /** Asigna de una vez todas las sugerencias de confianza alta. */
  function aceptarSugerencias() {
    let siguiente = mapa;
    for (const c of candidatos) {
      if (c.confianza !== 'alta') continue;
      if (asignados.has(c.inicio)) continue;
      const campo = c.sugerencias[0];
      if (!campo) continue;
      siguiente = agregarOcurrencia(siguiente, campo, {
        inicio: c.inicio,
        fin: c.fin,
        textoOriginal: texto.slice(c.inicio, c.fin),
      });
    }
    setMapa(siguiente);
    setGuardado(false);
  }

  async function guardarMapa() {
    await window.api.plantillas.guardarMapa(mapa);
    setGuardado(true);
  }

  const conAlta = candidatos.filter((c) => c.confianza === 'alta').length;

  return (
    <Pagina
      titulo={`Mapear: ${mapa.nombre}`}
      descripcion="Indique qué representa cada dato resaltado. Se hace una sola vez por plantilla; después se reutiliza siempre."
      acciones={
        <>
          <Boton icono={<ArrowLeft size={16} />} onClick={() => void alSalir()}>
            Volver
          </Boton>
          <Boton variante="primario" icono={<Save size={16} />} onClick={guardarMapa}>
            Guardar mapeo
          </Boton>
        </>
      }
    >
      <div className="flex flex-col gap-5 pb-8">
        {guardado && (
          <Aviso tipo="exito">
            Mapeo guardado. Ya puede usar esta plantilla para generar informes.
          </Aviso>
        )}

        <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-borde bg-superficie px-4 py-3 text-sm">
          <span>
            <strong>{totalMapeados}</strong> campos mapeados ·{' '}
            <strong>{candidatos.length}</strong> datos detectados en el documento
          </span>
          <div className="flex gap-2">
            {totalMapeados > 0 && (
              <Boton
                variante="fantasma"
                icono={<Eraser size={15} />}
                onClick={() => {
                  setMapa({ ...mapa, campos: [] });
                  setGuardado(false);
                }}
              >
                Empezar de cero
              </Boton>
            )}
            {conAlta > 0 && (
              <Boton variante="primario" icono={<Wand2 size={15} />} onClick={aceptarSugerencias}>
                Aceptar las {conAlta} sugerencias seguras
              </Boton>
            )}
          </div>
        </div>

        <Aviso tipo="info" titulo="Cómo reconoce los campos">
          El programa se guía por los rótulos del propio informe: lo que va debajo de
          «CONTRATISTA:» es el nombre, lo que va debajo de «OBJETO» es el objeto, y así con
          el resto. Por eso casi todo llega ya resuelto. Aun así, dele un vistazo antes de
          aceptar: un campo mal asignado escribiría el dato en el lugar equivocado.
        </Aviso>

        <section className="tarjeta overflow-hidden">
          <div className="tabla-desplazable">
            <table className="w-full text-sm">
              <thead className="bg-superficie text-left text-xs uppercase tracking-wide text-tinta-tenue">
                <tr>
                  <th className="w-[38%] px-4 py-2.5 font-medium">Texto en el documento</th>
                  <th className="px-4 py-2.5 font-medium">Motivo</th>
                  <th className="w-[28%] px-4 py-2.5 font-medium">Qué es</th>
                </tr>
              </thead>
              <tbody>
                {candidatos.map((c) => {
                  const asignado = asignados.get(c.inicio);
                  return (
                    <tr
                      key={`${c.inicio}-${c.fin}`}
                      className={`border-t border-borde ${asignado ? 'bg-naranja-50/40' : ''}`}
                    >
                      <td className="px-4 py-2.5">
                        <code className="break-words rounded bg-lienzo px-1.5 py-0.5 text-xs ring-1 ring-borde">
                          {c.texto.length > 120 ? `${c.texto.slice(0, 120)}…` : c.texto}
                        </code>
                      </td>
                      <td className="px-4 py-2.5 text-xs text-tinta-tenue">
                        {c.motivo}
                        {c.confianza === 'baja' && (
                          <span className="ml-1.5">
                            <Insignia tono="ambar">poco seguro</Insignia>
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-2.5">
                        <select
                          className="campo py-1.5 text-xs"
                          value={asignado ?? ''}
                          onChange={(e) => asignar(c, e.target.value as CampoId | '')}
                        >
                          <option value="">— sin asignar —</option>
                          {porGrupo(tipo).map((g) => (
                            <optgroup key={g.grupo} label={g.grupo}>
                              {g.campos.map((d) => (
                                <option key={d.id} value={d.id}>
                                  {d.etiqueta}
                                </option>
                              ))}
                            </optgroup>
                          ))}
                        </select>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>

        {/* Variante de redacción del periodo */}
        <section className="tarjeta p-5">
          <Campo
            etiqueta="Redacción del periodo de supervisión"
            ayuda="Sus informes usan dos formas distintas. Elija la que trae esta plantilla."
          >
            <select
              className="campo"
              value={mapa.variantePeriodo}
              onChange={(e) => {
                setMapa({ ...mapa, variantePeriodo: e.target.value as 'dias' | 'al' });
                setGuardado(false);
              }}
            >
              <option value="dias">
                …a los treinta y un (31) días de enero de dos mil veinticinco (2025).
              </option>
              <option value="al">
                …al treinta y uno (31) de enero de dos mil veinticinco (2025).
              </option>
            </select>
          </Campo>
        </section>

        {/* Resumen de cobertura */}
        <section className="tarjeta p-5">
          <h3 className="mb-3 font-semibold">Campos del informe</h3>
          <div className="flex flex-wrap gap-1.5">
            {camposDe(tipo)
              .filter((d) => d.frecuencia !== 'tabla')
              .map((d) => (
              <span
                key={d.id}
                title={d.ayuda ?? d.ejemplo}
                className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs
                            ${
                              estaMapeado(mapa, d.id)
                                ? 'bg-exito-fondo text-exito-fuerte'
                                : 'bg-apagado-fondo text-apagado-tenue'
                            }`}
              >
                {estaMapeado(mapa, d.id) && <CheckCircle2 size={11} />}
                {d.etiqueta}
              </span>
            ))}
          </div>
          <p className="mt-3 text-xs text-tinta-tenue">
            Los campos sin mapear simplemente conservan el texto que traiga la plantilla.
            Las tablas de obligaciones se detectan solas por sus encabezados y no necesitan
            mapeo.
          </p>
        </section>
      </div>
    </Pagina>
  );
}
