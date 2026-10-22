# Nuestros recuerdos

App web privada para dos personas, donde se escriben recuerdos (con título, texto y autor), se reacciona a ellos y se protege todo con inicio de sesión.

Publicada en **Render**, con la base de datos en **Neon** (PostgreSQL).

## Qué hace

- **Registro e inicio de sesión** con correo y contraseña. El registro se cierra solo cuando se llenan los 2 cupos (`MAX_USUARIOS` en `server.js`).
- **Sesiones en cookies**, guardadas en la base de datos (duran 30 días y sobreviven a los reinicios del servidor).
- **Recuerdos**: crear, leer y eliminar, con una ventana de confirmación antes de borrar.
- **Reacciones** por recuerdo, varias por persona: me encanta, me gusta, me asombra, me divierte, amén y Ramón. Cada persona puede poner o quitar las suyas, y se muestra un contador y el texto de lo que reaccionó.
- **Rutas protegidas**: sin sesión, el servidor responde 401 y la página manda a `login.html`.

## Tecnologías

| Parte | Tecnología |
|---|---|
| Servidor | Node.js + Express |
| Base de datos | PostgreSQL (Neon), con la librería `pg` |
| Contraseñas | `bcryptjs` (se guarda solo el hash) |
| Sesiones | `express-session` + `connect-pg-simple` |
| Frontend | HTML, CSS y JavaScript sin frameworks |
| Publicación | Render |

## Estructura

```
├── server.js          Rutas de la API, sesiones y servidor
├── database.js        Conexión a PostgreSQL y creación de la tabla de notas
├── package.json
├── .env               Variables locales (NO se sube a GitHub)
└── public/            Lo que ve el navegador
    ├── index.html     Página principal (recuerdos y reacciones)
    ├── script.js      Lógica de la página principal
    ├── style.css      Estilos generales
    ├── login.html     Pantalla de iniciar sesión y crear cuenta
    ├── login.js       Lógica de login y registro
    ├── login.css      Estilos del login
    └── img/           Fotos de las personas
```

## Cómo correrlo en local

1. Instalar dependencias:

```bash
npm install
```

2. Crear un archivo `.env` en la raíz con estas variables (poner los valores reales, sin comillas):

```
DATABASE_URL=postgresql://usuario:contraseña@host/basedatos
SESSION_SECRET=una-clave-larga-y-aleatoria
```

3. Encender el servidor:

```bash
node server.js
```

4. Abrir `http://localhost:3000`.

Para generar una clave secreta:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

## Variables de entorno

| Variable | Para qué sirve | Dónde se configura |
|---|---|---|
| `DATABASE_URL` | Cadena de conexión a Neon | `.env` y Render |
| `SESSION_SECRET` | Firma las cookies de sesión | `.env` y Render |
| `NODE_ENV` | `production` en Render: la cookie solo viaja por HTTPS | Render |
| `PORT` | Puerto del servidor (Render lo asigna solo; en local es 3000) | Render |

## Base de datos

La tabla `notas` se crea sola al iniciar el servidor (`database.js`). Las demás se crearon a mano en el SQL Editor de Neon; para recrearlas en otra base:

```sql
CREATE TABLE usuarios (
  id SERIAL PRIMARY KEY,
  email VARCHAR(255) UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  creado_en TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS "session" (
  "sid" VARCHAR NOT NULL PRIMARY KEY,
  "sess" JSON NOT NULL,
  "expire" TIMESTAMP(6) NOT NULL
);
CREATE INDEX IF NOT EXISTS "IDX_session_expire" ON "session" ("expire");

CREATE TABLE reacciones (
  nota_id INTEGER NOT NULL REFERENCES notas(id) ON DELETE CASCADE,
  usuario_id INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  tipo VARCHAR(20) NOT NULL,
  creado_en TIMESTAMP DEFAULT NOW(),
  PRIMARY KEY (nota_id, usuario_id, tipo)
);
```

`reacciones` necesita que `notas` y `usuarios` existan antes.

## API

| Método | Ruta | Sesión | Qué hace |
|---|---|---|---|
| POST | `/api/registro` | No | Crea una cuenta (si quedan cupos) |
| POST | `/api/login` | No | Inicia sesión y entrega la cookie |
| POST | `/api/logout` | No | Cierra la sesión |
| GET | `/api/yo` | No | Dice quién tiene la sesión (401 si nadie) |
| GET | `/api/notas` | Sí | Lista los recuerdos, con contadores de reacciones (`reacciones`) y las propias (`mias`) |
| POST | `/api/notas` | Sí | Crea un recuerdo |
| DELETE | `/api/notas/:id` | Sí | Elimina un recuerdo |
| POST | `/api/notas/:id/reacciones` | Sí | Pone o quita una reacción (`{ "tipo": "encanta" }`) |

Tipos de reacción válidos: `encanta`, `gusta`, `asombra`, `divierte`, `amen`, `ramon`.

## Despliegue

Render publica solo cada vez que se hace `git push` a `main`. Las variables `DATABASE_URL`, `SESSION_SECRET` y `NODE_ENV` están configuradas en la pestaña Environment del servicio. Local y Render usan la misma base de datos de Neon.

## Flujo de trabajo con Git

Cada cambio nuevo se hace en una rama (`git checkout -b nombre`), se prueba en local, y después se une a `main` (`git merge`) y se publica (`git push`).

## Estado

**Hecho**

- Registro, login, logout y sesiones guardadas en PostgreSQL
- Rutas de recuerdos protegidas con sesión
- Pantalla de login con estilos
- Reacciones con contador, animaciones y texto de lo que se reaccionó
- Confirmación antes de eliminar un recuerdo

**Pendiente (del plan original)**

- Menú de navegación: Inicio, Galería, Calendario y Preguntas
- Galería de fotos en la nube, con descripción, lugar y fecha
- Preguntas del día: cada persona no ve la respuesta de la otra hasta responder la suya
- Calendario con recordatorios por correo (y después WhatsApp) usando n8n
- Código de verificación por correo y cambio de contraseña
