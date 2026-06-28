# 🎮 Corito Dominó — Guía de control (todo lo que existe y cómo usarlo)

Esta guía es para que TÚ tengas control total. Te explica qué se creó, dónde
está, cómo encender todo para jugar con tus amigos, y cómo subirlo a un host
gratis 24/7. No necesitas ser programador para seguirla.

---

## 0) Transparencia: cuentas, correos y contraseñas

- **NO se usó ni creó ningún correo ni contraseña tuya.** Nunca se entró a tu
  Google ni a Firebase.
- **Playit.gg**: lo configuraste tú con tu propia cuenta. (Ya no es necesario;
  usamos Cloudflare, ver abajo.)
- **Cloudflare Tunnel**: es **anónimo**, no requiere cuenta.
- **Único usuario que existe**: uno de prueba `adan` / `1234` creado **en tu
  propio servidor** para probar. Puedes borrarlo cuando quieras (ver §6).
- **Todo lo creado está en TU PC**, en dos carpetas:
  - `C:\Users\adan_\Documents\domino_rd`  → la **app** (el juego, código Flutter).
  - `C:\Users\adan_\Documents\domino_server` → el **servidor** (esta carpeta).

---

## 1) ¿Qué hace cada parte?

1. **La app (domino_rd)**: el juego de dominó. Se compila para **Android** (APK)
   y para **Web** (una página). La versión web es la que abren tus amigos por un
   link (sirve para iPhone, Android, PC, sin instalar nada).

2. **El servidor (domino_server)**: un programa de Node.js que hace 3 cosas, todo
   en el mismo puerto (8080):
   - **Sirve la página web del juego** (carpeta `public/`).
   - **Multijugador**: conecta a los jugadores en salas (por WebSocket).
   - **Cuentas**: registro/login y guarda tu usuario, monedas y rango (ELO) en
     `data/users.json`. (Rutas `/api/register`, `/api/login`, `/api/profile`,
     `/api/sync`.)

3. **El túnel (Cloudflare)**: tu servidor corre en TU PC (en `localhost`). Para
   que tus amigos lejos lo alcancen, el túnel le da una **dirección pública
   `https://...`** temporal. Mientras el túnel y el servidor estén encendidos en
   tu PC, el link funciona.

---

## 2) Para JUGAR YA (con el túnel, desde tu PC)

1. Abre la carpeta `C:\Users\adan_\Documents\domino_server`.
2. Doble clic en **`INICIAR_CORITO.bat`**.
   - Se abre una ventana negra del **servidor** (déjala abierta).
   - Se abre otra ventana del **túnel** (Cloudflare). Ahí aparece una línea con
     un enlace **`https://algo.trycloudflare.com`**.
3. **Ese enlace es el link del juego.** Cópialo y mándalo a tus amigos.
4. Todos (tú también) abren ese link en el navegador → *Jugar online* →
   *Crear sala* / *Unirse con código*.
5. **No cierres** las dos ventanas mientras juegan.

> ⚠️ El link de Cloudflare **cambia cada vez** que enciendes el `.bat` (es la
> versión gratis). Por eso conviene el host 24/7 del §5 (link fijo).

---

## 3) Mandar la app de Android (APK)

El APK está en:
`C:\Users\adan_\Documents\domino_rd\build\app\outputs\flutter-apk\app-debug.apk`
(también te lo copié al Escritorio como `CoritoDomino.apk`).

- Sirve **solo para Android** (los iPhone usan el link web del §2).
- Mándalo por WhatsApp Web / Telegram. Tu amigo lo instala permitiendo
  "instalar apps de fuentes desconocidas".

---

## 4) ¿Dónde se guardan las cuentas y monedas?

En `C:\Users\adan_\Documents\domino_server\data\users.json`.
Es un archivo de texto con los usuarios (la contraseña va **encriptada**, no en
texto). Si lo borras, se borran todas las cuentas. Haz copia de ese archivo si
quieres respaldar.

---

## 5) Subir el servidor a un HOST GRATIS 24/7 (link fijo, sin tu PC)

Esto hace que el juego esté siempre disponible con una **URL permanente** que no
cambia, sin depender de tu PC ni del túnel. Recomendado: **Render.com** (gratis).

**Pasos (necesitas una cuenta de GitHub y una de Render, ambas gratis):**

1. **Sube el servidor a GitHub** (la carpeta `domino_server`). Si no usas git,
   en la web de GitHub: *New repository* → arrastra los archivos de
   `domino_server` (incluye `server.js`, `auth.js`, `package.json`, y la carpeta
   `public/`). NO subas `node_modules` ni `data/`.
2. Entra a **render.com** → crea cuenta → **New → Web Service** → conecta tu
   repositorio de GitHub.
3. Configura:
   - **Build Command:** `npm install`
   - **Start Command:** `npm start`
   - **Instance Type:** Free
4. Render te dará una URL fija, ej: **`https://corito-domino.onrender.com`**.
5. **Avísame esa URL** y yo la dejo fija en la app (para que Android y la web la
   usen siempre) y recompilo. ¡Listo, link permanente!

> El servidor ya está preparado para hosting (usa el puerto que el host le dé).

---

## 6) Cosas útiles

- **Borrar el usuario de prueba**: abre `data/users.json`, borra la entrada
  `"adan"` (o todo el contenido y deja `{}`), guarda.
- **Reiniciar todo**: cierra las dos ventanas negras y vuelve a abrir el `.bat`.
- **Si cambio código del juego**, hay que recompilar la web:
  en `domino_rd`: `flutter build web --release`, y copiar la carpeta
  `build/web` dentro de `domino_server/public` (reemplazando).

---

## 7) Resumen de archivos importantes

| Dónde | Qué es |
|---|---|
| `domino_server/server.js` | El servidor (web + multijugador + cuentas) |
| `domino_server/auth.js` | Lógica de cuentas (registro/login) |
| `domino_server/data/users.json` | Tus usuarios/monedas/rango (créalo al registrarte) |
| `domino_server/public/` | La web del juego (build de Flutter) |
| `domino_server/INICIAR_CORITO.bat` | Enciende servidor + túnel |
| `domino_rd/` | El código de la app (juego) |
| `domino_rd/TERMINOS.md` | Términos de uso (Coro Coins) |
| Escritorio `CoritoDomino.apk` | App de Android para compartir |

Cualquier duda, me preguntas. Todo esto es tuyo y está en tu PC. 🇩🇴
