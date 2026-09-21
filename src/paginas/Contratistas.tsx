import { Fragment, useMemo, useState, type ReactNode } from 'react';
import {
  UserPlus,
  Users,
  Search,
  Trash2,
  Pencil,
  X,
  ChevronDown,
  ExternalLink,
  FileSignature,
} from 'lucide-react';
import { useEstado } from '../estado';
import {
  Aviso,
  Boton,
  Campo,
  Cargando,
  Insignia,
  Pagina,
  Vacio,
  moneda,
} from '../componentes/Ui';
import { useIrA } from '../navegacion';
import { desdeISO, formatoCorto } from '../../core/espanol/calendario';
import { valorVigente } from '../../core/pagos/cronograma';
import type { Contratista } from '../../core/modelo/tipos';

const VACIO: Omit<Contratista, 'id'> = { nombre: '', cedula: '', expedidaEn: '' };

export function PaginaContratistas() {
  const { base, guardar, plantillas } = useEstado();
  const irA = useIrA();
  const [busqueda, setBusqueda] = useState('');
  const [editando, setEditando] = useState<Contratista | null>(null);
  const [borrador, setBorrador] = useState(VACIO);
  const [error, setError] = useState<string | null>(null);
  /**
   * Contratista que ya existía cuando se intentó registrar su cédula otra vez.
   *
   * Repetir una cédula suele significar que se quiere **otro contrato** para la
   * misma persona, no una segunda ficha. Decir sólo «ya está registrada» dejaba
   * a la vista un callejón sin salida.
   */
  const [yaRegistrado, setYaRegistrado] = useState<Contratista | null>(null);
  /** Contratista cuyo desplegable de contratos está abierto */
  const [desplegado, setDesplegado] = useState<string | null>(null);
  /** Contrato cuya ficha resumida se está mostrando */
  const [contratoAbierto, setContratoAbierto] = useState<string | null>(null);

  const lista = useMemo(() => {
    if (!base) return [];
    const q = busqueda.trim().toLowerCase();
    const orden = [...base.contratistas].sort((a, b) => a.nombre.localeCompare(b.nombre));
    if (!q) return orden;
    return orden.filter(
      (k) => k.nombre.toLowerCase().includes(q) || k.cedula.includes(q),
    );
  }, [base, busqueda]);

  if (!base) return <Cargando />;

  function abrirNuevo() {
    setEditando(null);
    setBorrador(VACIO);
    setError(null);
  }

  function abrirEdicion(k: Contratista) {
    setEditando(k);
    setBorrador({ nombre: k.nombre, cedula: k.cedula, expedidaEn: k.expedidaEn });
    setError(null);
  }

  async function guardarBorrador() {
    const nombre = borrador.nombre.trim();
    const cedula = borrador.cedula.trim();

    if (nombre.length < 3) {
      setError('Escriba el nombre completo del contratista.');
      return;
    }
    if (cedula.length < 5) {
      setError('Escriba el número de cédula.');
      return;
    }

    // Una cédula repetida casi siempre es un registro duplicado por error.
    const repetida = base!.contratistas.find(
      (k) => k.cedula.replace(/\D/g, '') === cedula.replace(/\D/g, '') &&
        k.id !== editando?.id,
    );
    if (repetida) {
      setError(null);
      setYaRegistrado(repetida);
      return;
    }
    setYaRegistrado(null);

    const datos = { nombre, cedula, expedidaEn: borrador.expedidaEn.trim() };

    if (editando) {
      await guardar((b) => ({
        ...b,
        contratistas: b.contratistas.map((k) =>
          k.id === editando.id ? { ...k, ...datos } : k,
        ),
      }));
    } else {
      const id = await window.api.datos.nuevoId('kt');
      await guardar((b) => ({ ...b, contratistas: [...b.contratistas, { id, ...datos }] }));
    }

    setBorrador(VACIO);
    setEditando(null);
    setError(null);
  }

  async function eliminar(k: Contratista) {
    const contratos = base!.contratos.filter((c) => c.contratistaId === k.id);
    if (contratos.length > 0) {
      setError(
        `No se puede eliminar a ${k.nombre}: tiene ${contratos.length} contrato(s) registrado(s). ` +
          'Elimine primero sus contratos.',
      );
      return;
    }
    await guardar((b) => ({
      ...b,
      contratistas: b.contratistas.filter((x) => x.id !== k.id),
    }));
  }

  return (
    <Pagina
      titulo="Contratistas"
      descripcion="Las personas contratadas. Se registran una sola vez y se reutilizan en cada contrato."
    >
      <div className="flex flex-col gap-5 pb-8">
        {error && <Aviso tipo="error">{error}</Aviso>}

        {yaRegistrado && (
          <Aviso tipo="info" titulo={`${yaRegistrado.nombre} ya está registrado`}>
            <p>
              Cada persona se registra una sola vez y se reutiliza en todos sus
              contratos. Si lo que quiere es darle otro contrato —de julio a
              diciembre, por ejemplo— créelo desde aquí: se abrirá ya a su nombre.
            </p>
            <div className="mt-2 flex flex-wrap gap-2">
              <Boton
                variante="primario"
                icono={<FileSignature size={15} />}
                onClick={() =>
                  irA('contratos', { nuevoContratoPara: yaRegistrado.id })
                }
              >
                Crear otro contrato para {yaRegistrado.nombre}
              </Boton>
              <Boton variante="fantasma" onClick={() => setYaRegistrado(null)}>
                Cerrar
              </Boton>
            </div>
          </Aviso>
        )}

        {/* Alta / edición */}
        <section className="tarjeta p-5">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="font-semibold">
              {editando ? `Editando: ${editando.nombre}` : 'Agregar contratista'}
            </h2>
            {editando && (
              <Boton variante="fantasma" icono={<X size={16} />} onClick={abrirNuevo}>
                Cancelar
              </Boton>
            )}
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            <div className="sm:col-span-3">
              <Campo etiqueta="Nombre completo" ayuda="En MAYÚSCULAS, como debe salir en el informe">
                <input
                  className="campo"
                  value={borrador.nombre}
                  onChange={(e) =>
                    setBorrador({ ...borrador, nombre: e.target.value.toUpperCase() })
                  }
                  placeholder="Ejemplo: NOMBRES Y APELLIDOS COMPLETOS"
                />
              </Campo>
            </div>
            <Campo etiqueta="Cédula" ayuda="Con puntos, así: 10.234.567">
              <input
                className="campo"
                value={borrador.cedula}
                onChange={(e) => setBorrador({ ...borrador, cedula: e.target.value })}
                placeholder="Ejemplo: 123XXXXXXX"
              />
            </Campo>
            <div className="sm:col-span-2">
              <Campo etiqueta="Expedida en">
                <input
                  className="campo"
                  value={borrador.expedidaEn}
                  onChange={(e) =>
                    setBorrador({ ...borrador, expedidaEn: e.target.value.toUpperCase() })
                  }
                  placeholder="Ejemplo: NOMBRE DEL MUNICIPIO"
                />
              </Campo>
            </div>
          </div>

          <div className="mt-4">
            <Boton variante="primario" icono={<UserPlus size={16} />} onClick={guardarBorrador}>
              {editando ? 'Guardar cambios' : 'Agregar'}
            </Boton>
          </div>
        </section>

        {/* Listado */}
        {base.contratistas.length === 0 ? (
          <Vacio
            icono={<Users size={24} />}
            titulo="Todavía no hay contratistas"
            descripcion="Agregue el primero con el formulario de arriba, o cárguelo automáticamente al subir un contrato en PDF desde la pantalla de Contratos."
          />
        ) : (
          <section className="tarjeta overflow-hidden">
            <div className="flex items-center gap-2 border-b border-borde px-4 py-3">
              <Search size={16} className="text-tinta-suave" />
              <input
                className="w-full bg-transparent text-sm outline-none placeholder:text-tinta-suave"
                placeholder="Buscar por nombre o cédula…"
                value={busqueda}
                onChange={(e) => setBusqueda(e.target.value)}
              />
              <span className="shrink-0 text-xs text-tinta-tenue">
                {lista.length} de {base.contratistas.length}
              </span>
            </div>

            <div className="tabla-desplazable">
              <table className="w-full text-sm">
                <thead className="bg-superficie text-left text-xs uppercase tracking-wide text-tinta-tenue">
                  <tr>
                    <th className="px-4 py-2.5 font-medium">Nombre</th>
                    <th className="px-4 py-2.5 font-medium">Cédula</th>
                    <th className="px-4 py-2.5 font-medium">Contratos</th>
                    <th className="px-4 py-2.5" />
                  </tr>
                </thead>
                <tbody>
                  {lista.map((k) => {
                    const suyos = base.contratos.filter((c) => c.contratistaId === k.id);
                    const abierto = desplegado === k.id;

                    return (
                      <Fragment key={k.id}>
                        <tr className="border-t border-borde hover:bg-superficie">
                          <td className="px-4 py-2.5 font-medium">{k.nombre}</td>
                          <td className="px-4 py-2.5 text-tinta-tenue">
                            {k.cedula}
                            {k.expedidaEn && (
                              <span className="text-tinta-suave"> de {k.expedidaEn}</span>
                            )}
                          </td>
                          <td className="px-4 py-2.5">
                            {suyos.length === 0 ? (
                              <span className="text-tinta-suave">ninguno</span>
                            ) : (
                              <button
                                onClick={() => {
                                  setDesplegado(abierto ? null : k.id);
                                  setContratoAbierto(null);
                                }}
                                className="inline-flex items-center gap-1.5 rounded-md px-1.5 py-0.5
                                           text-sm font-medium text-naranja-700
                                           hover:bg-naranja-50"
                                title="Ver sus contratos"
                              >
                                {suyos.length} contrato{suyos.length === 1 ? '' : 's'}
                                <ChevronDown
                                  size={14}
                                  className={`transition-transform ${abierto ? 'rotate-180' : ''}`}
                                />
                              </button>
                            )}
                          </td>
                          <td className="px-4 py-2.5">
                            <div className="flex justify-end gap-1">
                              {/* Una persona encadena contratos, así que el
                                  atajo va donde se la está mirando. */}
                              <Boton
                                variante="fantasma"
                                icono={<FileSignature size={15} />}
                                title={`Crear otro contrato para ${k.nombre}`}
                                onClick={() =>
                                  irA('contratos', { nuevoContratoPara: k.id })
                                }
                              >
                                Nuevo contrato
                              </Boton>
                              <Boton
                                variante="fantasma"
                                icono={<Pencil size={15} />}
                                onClick={() => abrirEdicion(k)}
                              >
                                Editar
                              </Boton>
                              <Boton
                                variante="fantasma"
                                icono={<Trash2 size={15} />}
                                onClick={() => void eliminar(k)}
                              >
                                Eliminar
                              </Boton>
                            </div>
                          </td>
                        </tr>

                        {/* Desplegable con los contratos de esta persona */}
                        {abierto && (
                          <tr className="border-t border-borde bg-naranja-50/30">
                            <td colSpan={4} className="px-4 py-3">
                              <p className="mb-2 text-xs font-medium uppercase tracking-wide text-tinta-tenue">
                                Contratos de {k.nombre}
                              </p>
                              <div className="flex flex-wrap gap-1.5">
                                {suyos.map((c) => (
                                  <button
                                    key={c.id}
                                    onClick={() =>
                                      setContratoAbierto(
                                        contratoAbierto === c.id ? null : c.id,
                                      )
                                    }
                                    className={`rounded-lg border px-2.5 py-1 text-sm font-medium
                                                transition-colors
                                                ${
                                                  contratoAbierto === c.id
                                                    ? 'border-naranja-400 bg-lienzo text-naranja-700'
                                                    : 'border-borde bg-lienzo text-tinta hover:border-naranja-300'
                                                }`}
                                  >
                                    {c.numero || '(sin número)'}
                                  </button>
                                ))}
                              </div>

                              {contratoAbierto &&
                                (() => {
                                  const c = suyos.find((x) => x.id === contratoAbierto);
                                  if (!c) return null;
                                  const p = plantillas.find((x) => x.id === c.plantillaId);
                                  const informes = base.informes.filter(
                                    (i) => i.contratoId === c.id,
                                  );

                                  return (
                                    <div className="mt-3 rounded-lg border border-borde bg-lienzo p-4">
                                      <div className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
                                        <Dato etiqueta="Número">
                                          {c.numero || '(sin número)'}
                                        </Dato>
                                        <Dato etiqueta="Estado">
                                          {c.activo ? (
                                            <Insignia tono="verde">activo</Insignia>
                                          ) : (
                                            <Insignia>inactivo</Insignia>
                                          )}
                                        </Dato>
                                        <Dato etiqueta="Vigencia">
                                          {formatoCorto(desdeISO(c.fechaInicio))} –{' '}
                                          {formatoCorto(desdeISO(c.fechaTerminacion))}
                                        </Dato>
                                        <Dato etiqueta="Valor">
                                          {moneda(valorVigente(c))}
                                        </Dato>
                                        <Dato etiqueta="Cuotas">
                                          {c.cuotas.length === 0
                                            ? 'sin cronograma'
                                            : `${c.cuotas.length} mensualidad(es)`}
                                        </Dato>
                                        <Dato etiqueta="Plantilla">
                                          {p ? (
                                            <Insignia tono="verde">{p.nombre}</Insignia>
                                          ) : (
                                            <Insignia tono="ambar">sin asignar</Insignia>
                                          )}
                                        </Dato>
                                        <Dato etiqueta="Informes generados">
                                          {informes.filter((i) => i.generadoEn).length}
                                        </Dato>
                                        <Dato etiqueta="Novedades">
                                          {c.adiciones.length + c.suspensiones.length === 0
                                            ? 'ninguna'
                                            : `${c.adiciones.length} adición(es), ${c.suspensiones.length} suspensión(es)`}
                                        </Dato>
                                        {c.objeto && (
                                          <div className="sm:col-span-2">
                                            <Dato etiqueta="Objeto">
                                              <span className="font-normal text-tinta-tenue">
                                                {c.objeto.length > 220
                                                  ? `${c.objeto.slice(0, 220)}…`
                                                  : c.objeto}
                                              </span>
                                            </Dato>
                                          </div>
                                        )}
                                      </div>

                                      <div className="mt-3">
                                        <Boton
                                          icono={<ExternalLink size={15} />}
                                          onClick={() =>
                                            irA('contratos', { contratoId: c.id })
                                          }
                                        >
                                          Abrir el contrato completo
                                        </Boton>
                                      </div>
                                    </div>
                                  );
                                })()}
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    );
                  })}
                  {lista.length === 0 && (
                    <tr>
                      <td colSpan={4} className="px-4 py-8 text-center text-tinta-tenue">
                        Ningún contratista coincide con «{busqueda}».
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

/** Pareja etiqueta → valor de la ficha resumida de un contrato. */
function Dato({ etiqueta, children }: { etiqueta: string; children: ReactNode }) {
  return (
    <p className="flex flex-wrap items-baseline gap-1.5">
      <span className="text-xs uppercase tracking-wide text-tinta-suave">
        {etiqueta}
      </span>
      <span className="font-medium">{children}</span>
    </p>
  );
}
