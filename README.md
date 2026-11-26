# Ellas También · Tienda online

Tienda online para un local de ropa de Casilda, hecha con **HTML, CSS y JavaScript** (sitio y panel), **Node.js + Express** (servidor) y **MySQL** (base de datos, administrable desde MySQL Workbench).

Un solo proyecto incluye los **3 paquetes**. Se activa el que contrató el local con la variable `PACKAGE` del archivo `.env`.

| `PACKAGE` | Paquete | Qué incluye |
|---|---|---|
| `1` | Catálogo | Catálogo con talles, colores y fotos. Pedido armado por WhatsApp. Panel para cargar prendas, fotos y precios. Perfil para Google. |
| `2` | Tienda con stock | Todo lo anterior + stock en tiempo real por talle y color, ventas del local ("Vendí en el local"), pedidos con estado, cobro con tarjeta y Mercado Pago, transferencia y efectivo. |
| `3` | Tienda + clientes | Todo lo anterior + envíos con costo por provincia, base de clientes, avisos por WhatsApp, varios usuarios (dueño y vendedores). |

Cambiar de paquete es cambiar `PACKAGE` y reiniciar. No hay que tocar la base de datos: las tablas son las mismas para los tres.

---

## 1. Instalación en tu computadora

**Necesitás:** Node.js 18 o superior, MySQL 8 y MySQL Workbench.

### Paso 1. Crear la base de datos (MySQL Workbench)

1. Conectate a tu servidor MySQL local.
2. Abrí `database/01_schema.sql` (File > Open SQL Script) y ejecutalo completo con el rayo. Crea la base `ellas_tambien` y todas las tablas.
3. Seleccioná la base: doble clic sobre `ellas_tambien` en el panel izquierdo (queda en negrita), o escribí `USE ellas_tambien;`.
4. Abrí y ejecutá `database/02_seed_base.sql` (categorías y costos de envío de ejemplo).
5. Opcional: ejecutá `database/03_seed_demo_products.sql` para ver la tienda con 3 prendas de ejemplo.

### Paso 2. Configurar

```bash
cp .env.example .env
```

Abrí `.env` y completá como mínimo: `PACKAGE`, `DB_USER`, `DB_PASSWORD`, `JWT_SECRET` (un texto largo y aleatorio) y `ADMIN_EMAIL` / `ADMIN_PASSWORD` (tu usuario del panel, mínimo 8 caracteres).

### Paso 3. Instalar y arrancar

```bash
npm install
npm start
```

- Tienda: http://localhost:3000
- Panel: http://localhost:3000/admin

El primer usuario se crea solo, con el correo y la clave de `ADMIN_EMAIL` y `ADMIN_PASSWORD`, la primera vez que arranca con la tabla `users` vacía. Después de ese primer arranque podés borrar `ADMIN_PASSWORD` del `.env`.

---

## 2. Primeros pasos en el panel

1. **Ajustes:** cargá WhatsApp (con código de país, ej. `5493464123456`), dirección, horarios, Instagram, cuenta bancaria y CUIT. Mientras la dirección o el WhatsApp sigan con el valor de relleno, no se muestran en la tienda ni se envían a Google.
2. **Horarios para Google:** una línea por tramo, con este formato: `Mo-Fr 09:00-13:00`, `Mo-Fr 17:00-20:30`, `Sa 09:00-13:00`.
3. **Categorías:** en Ajustes podés agregar y ordenar categorías.
4. **Productos:** creá cada prenda con nombre, categoría, precio, colores y talles. Después subí las fotos (JPG, PNG o WebP). Se convierten solas a WebP y a una miniatura.
5. **Stock** (paquetes 2 y 3): cargá las cantidades por color y talle.
6. Archivá las prendas de ejemplo cuando cargues las reales (las prendas no se borran, para conservar el historial de ventas).

**Permisos:** el *dueño* hace todo. Un *vendedor* (paquete 3) puede registrar ventas del local, ajustar stock, atender pedidos y ver clientes, pero no cambia prendas, precios, envíos, usuarios ni ajustes.

---

## 3. Cambiar los colores y el estilo

La identidad visual de toda la tienda está en un solo archivo: `public/css/theme.css`. La paleta actual es **provisoria**: reemplazá los valores por los colores reales del local (`--brand`, `--brand-dark`, `--brand-soft`, `--ink`, etc.). El logo del encabezado es el nombre del local (Ajustes > Nombre del local); para usar una imagen, reemplazá `public/favicon.svg` y `public/img/og-default.png` (1200 × 630, es la imagen que se ve al compartir el link).

---

## 4. Mercado Pago (paquetes 2 y 3)

1. En tu cuenta de Mercado Pago, entrá a *Tus integraciones*, creá una aplicación (Checkout Pro) y copiá el **Access Token**.
2. Pegalo en `MP_ACCESS_TOKEN`. Probá primero con las **credenciales de prueba** y recién después poné las de producción.
3. Mercado Pago necesita una dirección pública con **https** para avisar los pagos: poné la URL real del sitio en `SITE_URL`. El aviso llega a `SITE_URL/api/payments/webhook`.
4. Si `MP_ACCESS_TOKEN` está vacío, la tienda ofrece solo transferencia y efectivo.

Cómo funciona: el cliente paga en la página de Mercado Pago (los datos de la tarjeta nunca pasan por tu servidor). Cuando el pago se aprueba, el pedido pasa solo a "pagado". El servidor consulta el pago directo a Mercado Pago, así que un aviso falso no sirve de nada. Si el monto pagado es menor al total, el pedido no se marca como pagado y queda una nota para revisar.

**Stock y pedidos sin pagar:** al confirmar un pedido se descuenta el stock y se reserva por `RESERVE_HOURS` (48 por defecto). Si no se paga en ese plazo, el pedido se cancela solo y el stock vuelve.

---

## 5. Publicar en Railway

1. Subí el proyecto a GitHub (el `.gitignore` ya excluye `.env` y `node_modules`).
2. En Railway: *New Project > Deploy from GitHub repo*. Agregá un servicio **MySQL** al mismo proyecto.
3. Conectate al MySQL de Railway desde MySQL Workbench con los datos de conexión públicos que muestra el servicio, y ejecutá `01_schema.sql` (**sin** las dos primeras líneas: `CREATE DATABASE` y `USE`) y `02_seed_base.sql` sobre esa base.
4. En las variables del servicio web definí:
   - `NODE_ENV=production`
   - `PACKAGE` (1, 2 o 3)
   - `SITE_URL=https://tu-dominio.com.ar`
   - `JWT_SECRET` (24 caracteres o más)
   - `MYSQL_URL` = referencia a la variable del servicio MySQL (el servidor la lee sola)
   - `ADMIN_EMAIL`, `ADMIN_PASSWORD`
   - `MP_ACCESS_TOKEN` (si corresponde)
5. **Fotos:** el disco de Railway se borra en cada deploy. Creá un **Volume**, montalo en `/data` y definí `UPLOAD_DIR=/data/uploads`. Sin esto las fotos se pierden.
6. Conectá el dominio del local en *Settings > Domains*.

El servidor confía en el proxy de Railway (`trust proxy`), así que las URLs y el límite de intentos funcionan detrás de él.

---

## 6. SEO: qué trae y qué tiene que hacer el local

**Ya incluido en el código**
- Todas las páginas se generan en el servidor: Google lee el HTML completo, sin depender de JavaScript.
- Título y descripción únicos por página, con la ciudad (Casilda) y el nombre del local.
- Dirección canónica, Open Graph y Twitter Card (vista previa al compartir en WhatsApp e Instagram).
- Datos estructurados (schema.org): `ClothingStore` (negocio local con dirección y horarios), `Product` con precio y disponibilidad, `BreadcrumbList`.
- `sitemap.xml` automático con las prendas y sus fotos, y `robots.txt`.
- Direcciones limpias (`/producto/vestido-midi-de-lino`) que no cambian si se renombra la prenda.
- Fotos en WebP, con texto alternativo, carga diferida y tamaños definidos.
- Compresión de respuestas y caché de archivos estáticos.
- Carrito, checkout, pedidos y panel con `noindex`.

**Lo que tiene que hacer el local (es lo que más pesa en Casilda)**
1. Crear y verificar el **perfil de Google Business** con los mismos datos que en Ajustes: mismo nombre, dirección y teléfono, escritos igual en todos lados.
2. Dar de alta el sitio en **Google Search Console** y enviar `https://tu-dominio.com.ar/sitemap.xml`.
3. Poner el link de la tienda en la biografía de Instagram y en cada publicación de producto.
4. Pedir reseñas en Google a las clientas y responderlas.
5. Escribir una descripción propia para cada prenda (no copiar la del proveedor) y subir fotos reales.
6. Completar las categorías y no dejar prendas sin foto ni precio.

---

## 7. Seguridad

- Contraseñas con bcrypt; sesión en una cookie `httpOnly` y `SameSite=Lax`.
- Límite de intentos en el inicio de sesión, los pedidos y los formularios.
- Cabeceras de seguridad con Helmet y una política de contenido estricta (no hay scripts en línea).
- Los precios y el stock se leen siempre de la base; el navegador no puede cambiarlos.
- Todo texto que se muestra en las páginas se escapa para evitar inyección de HTML.
- Los datos bancarios solo se envían al navegador en los paquetes con pedidos.
- Hacé copias de seguridad de la base (Railway las ofrece en los planes pagos; en Workbench: *Server > Data Export*).

---

## 8. Límites actuales y mejoras posibles

- **WhatsApp:** los avisos abren un chat con el mensaje armado (un clic por cliente). El envío automático requiere la API de WhatsApp Business, que es paga y se contrata aparte.
- **Envíos:** el costo sale de una tabla por provincia que edita el dueño (paquete 3). No consulta tarifas en vivo de Correo Argentino o Andreani.
- **Correos:** no se envían mails automáticos. El dueño ve los pedidos nuevos en el panel; se puede sumar aviso por mail con `nodemailer`.
- **Facturación:** no genera facturas electrónicas.
- **Catálogo grande:** las listas muestran todas las prendas en una página. Si el local supera unas 150 prendas conviene agregar paginación.

---

## 9. Estructura

```
database/           01_schema.sql · 02_seed_base.sql · 03_seed_demo_products.sql
server/
  index.js          arranque, seguridad, rutas, cancelación automática de pedidos vencidos
  config.js         paquetes (features), variables de entorno, valores por defecto del local
  db.js             conexión MySQL y transacciones (hora de Argentina, -03:00)
  pages.js          páginas públicas con SEO, sitemap.xml y robots.txt
  lib/              util · settings · auth · orders (stock y pedidos) · payments (Mercado Pago)
  routes/           shop (API pública) · auth · admin (API del panel)
public/
  css/              theme.css (colores) · styles.css
  js/               app.js (carrito y utilidades) · tienda · producto · carrito · checkout · pedido · forms
  admin/            index.html · admin.js · admin.css  (panel)
  img/ · favicon.svg
```

---

## 10. Qué se verificó

Esto se construyó y revisó **sin poder ejecutar el servidor con MySQL real** (el entorno donde se escribió no permite instalar paquetes). Se comprobó que:
- todos los archivos JavaScript compilan;
- cada `require` apunta a algo que existe y cada función llamada está exportada;
- cada consulta SQL usa tablas, columnas y valores que existen en `01_schema.sql`;
- las páginas públicas se generan bien para los paquetes 1 y 3 (un solo título principal, canonical, datos estructurados válidos, sin datos de relleno), probadas con una base simulada.

**No se probó** contra MySQL real, ni Mercado Pago, ni la subida de fotos con `sharp`. Antes de entregar al local, hacé este recorrido completo en tu computadora: crear una prenda con fotos, comprar como cliente (transferencia y Mercado Pago de prueba), registrar una venta del local, cancelar un pedido y comprobar que el stock se mueve bien en cada paso.
