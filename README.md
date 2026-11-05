# ⚽ StatsFútbol

Web app (pensada sobre todo para el celular, y que también anda en la compu) para anotar tus estadísticas de jugador: partidos, torneos, carrera y notas. Se puede instalar como app (PWA) y funciona sin internet.

## Qué tiene

### Partidos
- Estado: **Por jugarse**, **Finalizado** o **Suspendido** (con **razón** opcional y nueva fecha si se reprogramó).
- **Oficial / No oficial** y **Yo juego / Partido de otros**.
- Equipos local y visitante, cada uno con **foto/escudo de tu galería** (opcional). Elegís **con qué equipo jugaste**.
- Resultado final: **exacto**, **aproximado** (si estás medio seguro, se marca con “~”), **solo sé quién ganó / empate**, o **no sé cómo terminó**.
- Tus stats: **minutos** (con casilla *exactos* / aproximados), **goles**, **asistencias**, **MVP: Sí / No / No lo sé** (y quién fue la figura), titular/suplente, posición y calificación de 1 a 10.
- **Eventos**: tarjeta amarilla, roja, lesión, gol en contra, penales (convertido/errado/atajado), gol de tiro libre, de cabeza, golazo, palo, valla invicta, capitán, cambios y “otro”, con minuto y detalle.
- **Predicción** para partidos por jugarse (resultado o ganador) y después te dice si acertaste.
- Filtros, búsqueda, duplicar partido (revancha), compartir resultado y aviso de partidos con fecha pasada sin cargar.

### Torneos personalizados
- Cargás los equipos, marcás el tuyo y se **genera el fixture** (todos contra todos, ida o ida y vuelta).
- **Tabla de posiciones** automática (puntos configurables, zonas de clasificación y descenso, forma).
- **Predecir**: elegís L/E/V o el resultado de cada partido pendiente y ves la **tabla proyectada**.
- **Simular**: simula el resto del torneo 5.000 veces y te da la probabilidad de salir campeón, clasificar o descender.
- Tus stats dentro del torneo.

### Carrera
- Perfil (foto, posición, dorsal, pie hábil, edad, altura, bio).
- Totales automáticos de todos tus partidos (goles, asistencias, minutos, MVP, tarjetas, goles en contra, lesiones, victorias/empates/derrotas, promedios, minutos por gol…), filtrables por oficiales/no oficiales y por año.
- Gráfico de los últimos 12 meses, tablas por temporada y por equipo.
- **Trayectoria**: clubes por los que pasaste con escudo y años (o “actualidad”).
- **Lesiones** (manuales + las que marcaste en los partidos), **objetivos** con barra de progreso y **logros** desbloqueables.

### Notas
Notas libres con colores, etiquetas, fijadas y buscador.

### Cuenta y datos
- **Sin cuenta**: todo se guarda en el dispositivo.
- **Con Google**: se guarda en la nube (Firebase) y se sincroniza entre celular y compu. Si antes usabas la app sin cuenta, al entrar se suman tus datos.
- Exportar / importar backup (JSON), datos de ejemplo, modo claro/oscuro.

## Probarla en tu compu

No necesita instalar nada. Desde la carpeta `app/`:

```bash
cd app
python3 -m http.server 8080
```

y abrí http://localhost:8080

## Publicación (Netlify)

La app está publicada en **https://statsfutbol.netlify.app**. Netlify publica la carpeta `app/` (configurado en `netlify.toml`); no hay que compilar nada.

## Activar el inicio con Google

1. Entrá a https://console.firebase.google.com y creá un proyecto (gratis).
2. **Agregar app → Web**, copiá el objeto `firebaseConfig` y pegalo en `app/js/config.js`.
3. **Authentication → Sign-in method →** activá **Google**.
4. **Authentication → Settings → Authorized domains →** agregá tu dominio (`statsfutbol.netlify.app`). `localhost` ya viene autorizado.
5. **Firestore Database → Crear base de datos**, y en **Reglas** pegá el contenido de `firestore.rules` (cada usuario solo puede ver sus propios datos).

Listo: aparece “Continuar con Google” funcionando. Si `app/js/config.js` queda vacío, la app anda igual en modo sin cuenta.

## Estructura

```
netlify.toml              configuración de Netlify (publica app/)
firestore.rules           reglas de seguridad para Firebase
app/                      ← la web completa
  index.html              app shell
  manifest.webmanifest    datos para instalarla como app
  sw.js                   modo offline
  css/styles.css          estilos (mobile-first, claro/oscuro)
  icons/                  íconos de la app
  js/app.js               router, sincronización, bienvenida
  js/config.js            ← acá va la config de Firebase
  js/store.js             datos locales + merge con la nube
  js/cloud.js             Firebase (Auth + Firestore)
  js/stats.js             cálculos: totales, tabla, simulación, logros
  js/forms.js             formularios (partido, equipo, torneo, perfil…)
  js/views/               pantallas (inicio, partidos, torneos, carrera, notas, ajustes)
```
