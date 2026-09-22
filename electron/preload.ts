/**
 * Puente entre la interfaz y el proceso principal.
 *
 * La interfaz no tiene acceso directo a Node ni al sistema de archivos: sólo
 * puede llamar a las funciones expuestas aquí. Es la separación estándar de
 * Electron y evita que un texto malicioso dentro de un PDF pueda ejecutar algo.
 */

import { contextBridge, ipcRenderer } from 'electron';
import type { BaseDeDatos } from '../core/modelo/tipos';
import type { CampoId, TipoDocumento } from '../core/docx/campos';
import type { MapaPlantilla } from '../core/docx/mapaPlantilla';
import type { Candidato } from '../core/docx/detectarCampos';
import type { PlantillaEnPapelera } from '../core/modelo/papeleraPlantillas';
import type { ProgresoVoz } from './voz';
import type { EstadoRemoto } from './remoto';

export type { ProgresoVoz, EstadoRemoto };

export type PlantillaRegistrada = {
  mapa: MapaPlantilla;
  texto: string;
  candidatos: Candidato[];
  /**
   * Presente cuando el documento resultó ser de otro tipo del elegido.
   *
   * Manda lo que diga el documento; esto es para poder explicar por qué.
   */
  olfateo?: {
    tipo: TipoDocumento;
    confianza: 'alta' | 'media' | 'ninguna';
    motivos: string[];
  };
};

export type PeticionGeneracion = {
  plantillaId: string;
  contratoId: string;
  anio: number;
  mes: number;
  carpetaSalida: string;
};

export type DocumentoGenerado = {
  contratoId: string;
  tipo: TipoDocumento;
  nombre: string;
  ruta: string;
  avisos: string[];
};

export type ResultadoLote = {
  generados: DocumentoGenerado[];
  fallidos: { contratoId: string; tipo: TipoDocumento; error: string }[];
};

export type ProgresoGeneracion = {
  /** Índice del contrato dentro del lote, empezando en 0 */
  indice: number;
  total: number;
  contratoId: string;
  fase: 'generando' | 'guardando' | 'listo' | 'error';
  /** Nombre del archivo, cuando la fase es 'listo' */
  nombre?: string;
};

const api = {
  datos: {
    leer: (): Promise<BaseDeDatos> => ipcRenderer.invoke('datos:leer'),
    escribir: (d: BaseDeDatos): Promise<{ ok: true }> =>
      ipcRenderer.invoke('datos:escribir', d),
    nuevoId: (prefijo: string): Promise<string> =>
      ipcRenderer.invoke('datos:nuevoId', prefijo),
    /** La base con su número de versión (ver core/modelo/sincronizacion.ts). */
    leerConRevision: (): Promise<{ base: BaseDeDatos; revision: number }> =>
      ipcRenderer.invoke('datos:leerConRevision'),
    /** Guarda sólo si se hizo sobre esa versión; si no, devuelve la actual. */
    escribirSi: (
      d: BaseDeDatos,
      revision: number,
    ): Promise<
      { ok: true; revision: number } | { ok: false; revision: number; base: BaseDeDatos }
    > => ipcRenderer.invoke('datos:escribirSi', d, revision),
    rutaArchivo: (): Promise<string> => ipcRenderer.invoke('datos:rutaArchivo'),
  },

  sistema: {
    elegirCarpeta: (): Promise<string | null> =>
      ipcRenderer.invoke('sistema:elegirCarpeta'),
    elegirArchivo: (
      filtros: { name: string; extensions: string[] }[],
    ): Promise<string | null> => ipcRenderer.invoke('sistema:elegirArchivo', filtros),
    leerArchivo: (ruta: string): Promise<ArrayBuffer> =>
      ipcRenderer.invoke('sistema:leerArchivo', ruta),
    abrirCarpeta: (ruta: string): Promise<void> =>
      ipcRenderer.invoke('sistema:abrirCarpeta', ruta),
    abrirArchivo: (ruta: string): Promise<void> =>
      ipcRenderer.invoke('sistema:abrirArchivo', ruta),
    guardarClave: (clave: string): Promise<{ ok: boolean; error?: string }> =>
      ipcRenderer.invoke('sistema:guardarClave', clave),
    hayClave: (): Promise<boolean> => ipcRenderer.invoke('sistema:hayClave'),
    borrarClave: (): Promise<{ ok: true }> => ipcRenderer.invoke('sistema:borrarClave'),

    /** La clave de Google Gemini, que se guarda igual de cifrada. */
    guardarClaveGemini: (clave: string): Promise<{ ok: boolean; error?: string }> =>
      ipcRenderer.invoke('sistema:guardarClaveGemini', clave),
    hayClaveGemini: (): Promise<boolean> => ipcRenderer.invoke('sistema:hayClaveGemini'),
    borrarClaveGemini: (): Promise<{ ok: true }> =>
      ipcRenderer.invoke('sistema:borrarClaveGemini'),

    /**
     * Avisa al proceso principal del tema en uso.
     *
     * La interfaz es HTML y se pinta sola, pero el marco de la ventana, los
     * menús contextuales y el color con que Windows rellena la ventana al
     * redimensionarla los dibuja el sistema. Sin esto, en modo oscuro
     * aparecería un destello blanco al arrastrar el borde de la ventana.
     */
    temaDelSistema: (tema: 'claro' | 'oscuro'): Promise<{ ok: true }> =>
      ipcRenderer.invoke('sistema:tema', tema),
  },

  plantillas: {
    /** Abre un .docx, lo normaliza, lo guarda y devuelve los candidatos detectados. */
    registrar: (
      ruta: string,
      nombre: string,
      tipo?: TipoDocumento,
      valoresConocidos?: Partial<Record<CampoId, string>>,
    ): Promise<PlantillaRegistrada> =>
      ipcRenderer.invoke('plantillas:registrar', ruta, nombre, tipo, valoresConocidos),

    /** Vuelve a leer el texto y los candidatos de una plantilla ya guardada. */
    inspeccionar: (
      mapa: MapaPlantilla,
      valoresConocidos?: Partial<Record<CampoId, string>>,
    ): Promise<PlantillaRegistrada> =>
      ipcRenderer.invoke('plantillas:inspeccionar', mapa, valoresConocidos),

    listar: (): Promise<MapaPlantilla[]> => ipcRenderer.invoke('plantillas:listar'),

    /**
     * Corrige de qué documento es una plantilla ya registrada.
     *
     * Descarta el mapeo anterior: los campos de un informe no existen en un
     * certificado, y conservarlos escribiría datos en sitios sin sentido.
     */
    cambiarTipo: (
      id: string,
      tipo: TipoDocumento,
    ): Promise<{
      ok: boolean;
      error?: string;
      mapa?: MapaPlantilla;
      texto?: string;
      candidatos?: Candidato[];
    }> => ipcRenderer.invoke('plantillas:cambiarTipo', id, tipo),

    guardarMapa: (mapa: MapaPlantilla): Promise<{ ok: true }> =>
      ipcRenderer.invoke('plantillas:guardarMapa', mapa),

    /** No borra: envía a la papelera, recuperable durante 30 días. */
    eliminar: (id: string): Promise<{ ok: true }> =>
      ipcRenderer.invoke('plantillas:eliminar', id),

    papelera: (): Promise<PlantillaEnPapelera[]> =>
      ipcRenderer.invoke('plantillas:papelera'),

    restaurar: (id: string): Promise<{ ok: boolean; error?: string }> =>
      ipcRenderer.invoke('plantillas:restaurar', id),

    borrarDefinitivo: (id: string): Promise<{ ok: true }> =>
      ipcRenderer.invoke('plantillas:borrarDefinitivo', id),

    vaciarPapelera: (): Promise<{ ok: true }> =>
      ipcRenderer.invoke('plantillas:vaciarPapelera'),
  },

  generacion: {
    /** Genera un informe y lo escribe en disco. */
    uno: (p: PeticionGeneracion): Promise<{ nombre: string; ruta: string; avisos: string[] }> =>
      ipcRenderer.invoke('generacion:uno', p),

    /**
     * Genera el lote de un mes: por cada contrato, los documentos pedidos.
     *
     * Cada contrato lleva una plantilla por tipo de documento, porque el
     * informe y la cuenta de cobro salen de plantillas distintas.
     */
    lote: (
      plantillasPorContrato: Record<string, Partial<Record<TipoDocumento, string>>>,
      contratoIds: string[],
      anio: number,
      mes: number,
      carpetaSalida: string,
      tipos: TipoDocumento[],
    ): Promise<ResultadoLote> =>
      ipcRenderer.invoke(
        'generacion:lote',
        plantillasPorContrato,
        contratoIds,
        anio,
        mes,
        carpetaSalida,
        tipos,
      ),

    /**
     * Lote de certificados: uno por contrato.
     *
     * `hastaPorContrato` dice hasta cuándo certifica cada uno, en ISO. Sin
     * indicarlo, hasta el final de su contrato. Un cierre anterior produce un
     * certificado parcial —lo cumplido hasta ese mes— y se guarda en la
     * carpeta de ese mes.
     */
    certificados: (
      plantillaPorContrato: Record<string, string>,
      contratoIds: string[],
      carpetaSalida: string,
      hastaPorContrato?: Record<string, string>,
    ): Promise<ResultadoLote> =>
      ipcRenderer.invoke(
        'generacion:certificados',
        plantillaPorContrato,
        contratoIds,
        carpetaSalida,
        hastaPorContrato,
      ),

    /**
     * Avisa del avance del lote. Devuelve la función para dejar de escuchar,
     * que hay que llamar al desmontar el componente para no acumular oyentes.
     */
    alProgreso: (cb: (p: ProgresoGeneracion) => void): (() => void) => {
      const oyente = (_e: unknown, p: ProgresoGeneracion) => cb(p);
      ipcRenderer.on('generacion:progreso', oyente);
      return () => {
        ipcRenderer.off('generacion:progreso', oyente);
      };
    },

    /** Previsualiza el balance de un contrato en un mes, sin generar nada. */
    previsualizar: (
      contratoId: string,
      anio: number,
      mes: number,
    ): Promise<{
      ok: boolean;
      motivo?: string;
      pagoDelMes?: number;
      totalPagado?: number;
      valorPorEjecutar?: number;
      desde?: string;
      hasta?: string;
    }> => ipcRenderer.invoke('generacion:previsualizar', contratoId, anio, mes),
  },

  voz: {
    /**
     * Pasa a texto lo grabado con el micrófono: audio mono a 16 kHz.
     *
     * La primera vez descarga el modelo de reconocimiento; `alProgreso` avisa
     * de cómo va.
     */
    transcribir: (audio: Float32Array): Promise<{ ok: boolean; texto?: string; error?: string }> =>
      ipcRenderer.invoke('voz:transcribir', audio),

    alProgreso: (cb: (p: ProgresoVoz) => void): (() => void) => {
      const oyente = (_e: unknown, p: ProgresoVoz) => cb(p);
      ipcRenderer.on('voz:progreso', oyente);
      return () => {
        ipcRenderer.off('voz:progreso', oyente);
      };
    },
  },

  /**
   * Avisos de que otro equipo —el teléfono, o el PC visto desde el teléfono—
   * cambió los datos. Hay que recargar: si no, el próximo guardado de aquí
   * borraría lo que hizo el otro.
   */
  eventos: {
    alCambiarDatos: (cb: () => void): (() => void) => {
      const oyente = () => cb();
      ipcRenderer.on('datos:cambiados', oyente);
      return () => {
        ipcRenderer.off('datos:cambiados', oyente);
      };
    },
  },

  /** Usar Kaori desde el teléfono. Sólo existe en el PC. */
  remoto: {
    estado: (): Promise<EstadoRemoto> => ipcRenderer.invoke('remoto:estado'),
    activar: (): Promise<EstadoRemoto> => ipcRenderer.invoke('remoto:activar'),
    desactivar: (): Promise<EstadoRemoto> => ipcRenderer.invoke('remoto:desactivar'),
    nuevoCodigo: (): Promise<EstadoRemoto> => ipcRenderer.invoke('remoto:nuevoCodigo'),
    usarDireccion: (ip: string): Promise<EstadoRemoto> =>
      ipcRenderer.invoke('remoto:usarDireccion', ip),
    cerrarSesion: (id: string): Promise<EstadoRemoto> =>
      ipcRenderer.invoke('remoto:cerrarSesion', id),
    alCambiar: (cb: () => void): (() => void) => {
      const oyente = () => cb();
      ipcRenderer.on('remoto:cambio', oyente);
      return () => {
        ipcRenderer.off('remoto:cambio', oyente);
      };
    },
  },

  extraccion: {
    /** Extrae texto de un PDF o imagen. `motor` indica qué se usó realmente. */
    texto: (
      ruta: string,
    ): Promise<{ texto: string; motor: 'pdf' | 'ocr' | 'ia'; aviso?: string }> =>
      ipcRenderer.invoke('extraccion:texto', ruta),

    /** Interpreta el texto de un contrato y propone los campos. */
    contrato: (
      ruta: string,
    ): Promise<{ campos: Record<string, unknown>; motor: string; avisos: string[] }> =>
      ipcRenderer.invoke('extraccion:contrato', ruta),

    /** Interpreta una planilla PILA. */
    planilla: (
      ruta: string,
    ): Promise<{
      numero?: string;
      fecha?: string;
      mesAcreditado?: string;
      motor: string;
      avisos: string[];
    }> => ipcRenderer.invoke('extraccion:planilla', ruta),

    /**
     * Propone las OBLIGACIONES ESPECÍFICAS a partir de una indicación.
     *
     * Necesita la clave de IA: redactar obligaciones nuevas es escribir de
     * cero, no transformar un texto que ya está. Si no la hay, lo dice.
     */
    proponerObligaciones: (
      indicacion: string,
      cuantas: number,
      objeto?: string,
    ): Promise<{ ok: boolean; obligaciones?: string[]; error?: string }> =>
      ipcRenderer.invoke('extraccion:proponerObligaciones', indicacion, cuantas, objeto),

    /** Redacta las ACTIVIDADES EJECUTADAS que falten. */
    /**
     * Lee las obligaciones específicas de la foto o el PDF de un contrato: la
     * lista numerada hasta el «Parágrafo». `motor` dice si las leyó la IA o
     * el reconocimiento de texto sin conexión.
     */
    obligaciones: (
      ruta: string,
    ): Promise<
      | { ok: true; obligaciones: string[]; motor: 'ia' | 'ocr'; proveedor?: string; aviso?: string }
      | { ok: false; error: string }
    > => ipcRenderer.invoke('extraccion:obligaciones', ruta),

    /**
     * `motor: 'fallo'` significa que la IA configurada no respondió: las
     * actividades vuelven sin tocar y `error` dice por qué.
     */
    redactarActividades: (
      obligaciones: { n: number; texto: string; actividad?: string }[],
      enTercerapersona: boolean,
    ): Promise<{
      actividades: string[];
      motor: 'ia' | 'reglas' | 'fallo';
      proveedor?: string;
      error?: string;
    }> =>
      ipcRenderer.invoke('extraccion:redactar', obligaciones, enTercerapersona),
  },
} as const;

contextBridge.exposeInMainWorld('api', api);

export type Api = typeof api;
