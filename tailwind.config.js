/** @type {import('tailwindcss').Config} */

/**
 * Los colores no son valores fijos sino variables de CSS, definidas en
 * index.css para el modo claro y redefinidas bajo `.oscuro`.
 *
 * Se hizo así en vez de sembrar variantes `dark:` por toda la interfaz porque
 * cada clase ya dice lo que significa —`bg-superficie` es la barra lateral,
 * `text-tinta-tenue` es texto secundario— y ese significado no cambia con el
 * tema, sólo su color. Con variantes habría que acordarse de escribir las dos
 * mitades en cada elemento nuevo, y la que se olvide sólo se nota al cambiar
 * de modo.
 */
const conAlfa = (variable) => `rgb(var(${variable}) / <alpha-value>)`;

export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  darkMode: ['class', '.oscuro'],
  theme: {
    extend: {
      colors: {
        // Naranja reservado para acciones y estados; nunca como fondo de
        // áreas grandes, que cansa la vista en jornadas largas.
        //
        // En modo oscuro la rampa se invierte por los extremos: 50 y 100 pasan
        // a ser marrones profundos —siguen siendo «fondo de marca tenue»— y
        // 600 a 900 se aclaran, porque ahí el texto de marca va sobre oscuro.
        // Los tonos medios, que son la marca propiamente dicha, no cambian.
        naranja: {
          50: conAlfa('--naranja-50'),
          100: conAlfa('--naranja-100'),
          200: conAlfa('--naranja-200'),
          300: conAlfa('--naranja-300'),
          400: conAlfa('--naranja-400'),
          500: conAlfa('--naranja-500'),
          600: conAlfa('--naranja-600'),
          700: conAlfa('--naranja-700'),
          800: conAlfa('--naranja-800'),
          900: conAlfa('--naranja-900'),
        },
        tinta: {
          DEFAULT: conAlfa('--tinta'),
          tenue: conAlfa('--tinta-tenue'),
          suave: conAlfa('--tinta-suave'),
        },
        borde: conAlfa('--borde'),
        /** Fondo de la ventana, detrás de las tarjetas. */
        fondo: conAlfa('--fondo'),
        /** Fondo de tarjetas, campos y menús: lo que en claro era blanco. */
        lienzo: conAlfa('--lienzo'),
        /** Realce discreto: barra lateral y encabezados de tabla. */
        superficie: conAlfa('--superficie'),
        /** Barras de desplazamiento. */
        barra: {
          DEFAULT: conAlfa('--barra'),
          viva: conAlfa('--barra-viva'),
        },
        /** Gris sin significado: insignias neutras, pistas de progreso. */
        apagado: {
          fondo: conAlfa('--apagado-fondo'),
          borde: conAlfa('--apagado-borde'),
          texto: conAlfa('--apagado-texto'),
          tenue: conAlfa('--apagado-tenue'),
        },
        // Los cuatro estados de aviso. Cada uno con su fondo, su contorno, su
        // color «fuerte» para iconos y su color de texto.
        info: {
          fondo: conAlfa('--info-fondo'),
          borde: conAlfa('--info-borde'),
          fuerte: conAlfa('--info-fuerte'),
          texto: conAlfa('--info-texto'),
        },
        exito: {
          fondo: conAlfa('--exito-fondo'),
          borde: conAlfa('--exito-borde'),
          fuerte: conAlfa('--exito-fuerte'),
          texto: conAlfa('--exito-texto'),
        },
        alerta: {
          fondo: conAlfa('--alerta-fondo'),
          borde: conAlfa('--alerta-borde'),
          fuerte: conAlfa('--alerta-fuerte'),
          texto: conAlfa('--alerta-texto'),
        },
        error: {
          fondo: conAlfa('--error-fondo'),
          borde: conAlfa('--error-borde'),
          fuerte: conAlfa('--error-fuerte'),
          texto: conAlfa('--error-texto'),
        },
      },
      fontFamily: {
        sans: [
          'Inter',
          'Segoe UI Variable Text',
          'Segoe UI',
          'system-ui',
          '-apple-system',
          'sans-serif',
        ],
      },
      boxShadow: {
        tarjeta: 'var(--sombra-tarjeta)',
        elevada: 'var(--sombra-elevada)',
      },
    },
  },
  plugins: [],
};
