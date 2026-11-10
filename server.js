// Traemos Express y la conexión a la base de datos.
const express = require("express");
const { pool, iniciarBaseDeDatos } = require("./database");
const { PREGUNTAS } = require("./preguntas-banco");

// bcryptjs: la herramienta que convierte una contraseña en un texto cifrado
const bcrypt = require("bcryptjs");

// express-session: crea y lee las sesiones y sus cookies
const session = require("express-session");
// connect-pg-simple: guarda las sesiones en PostgreSQL (tu base de Neon)
const PgSession = require("connect-pg-simple")(session);

// express-rate-limit: limita cuántas veces se puede intentar algo (anti fuerza bruta)
const rateLimit = require("express-rate-limit");

const app = express();
const PUERTO = process.env.PORT || 3000;

// ---------- SEGURIDAD: CLAVE DE SESIÓN OBLIGATORIA ----------
// En producción (Render) NO dejamos arrancar el servidor sin SESSION_SECRET.
// Si usáramos la clave de prueba, cualquiera podría falsificar cookies.
const ES_PRODUCCION = process.env.NODE_ENV === "production";
if (ES_PRODUCCION && !process.env.SESSION_SECRET) {
  console.error("Falta la variable SESSION_SECRET. Configúrala en Render.");
  process.exit(1);
}

// Lee el cuerpo JSON de las peticiones (máximo 100 KB, lo normal).
// La ruta de subir fotos se salta este lector: usa uno propio, más grande,
// y solo DESPUÉS de revisar la sesión (así nadie sin cuenta manda archivos pesados).
const leerJson = express.json();
const leerJsonFotos = express.json({ limit: "5mb" });

app.use(function (req, res, next) {
  if (req.method === "POST" && req.path === "/api/fotos") return next();
  leerJson(req, res, next);
});

// Render pone un intermediario delante de tu servidor; esto le dice a Express
// que confíe en él. Sin esto, la cookie segura no funcionaría al publicarla.
app.set("trust proxy", 1);

app.use(session({
  // Dónde se guardan las sesiones: en tu base de datos, no en la memoria.
  // createTableIfMissing crea la tabla "session" sola si no existe.
  store: new PgSession({ pool: pool, createTableIfMissing: true }),

  // Clave secreta con la que se firma la cookie para que nadie pueda falsificarla.
  // En Render pondremos una real; esta solo sirve en tu computador.
  secret: process.env.SESSION_SECRET || "clave-solo-para-desarrollo",

  resave: false,            // no vuelve a guardar la sesión si no cambió
  saveUninitialized: false, // no crea sesión para quien no ha iniciado sesión

  cookie: {
    maxAge: 1000 * 60 * 60 * 24 * 30, // dura 30 días (en milisegundos)
    httpOnly: true,                   // el JavaScript de la página no puede leerla
    sameSite: "lax",                  // protege contra envíos desde otras páginas
    secure: ES_PRODUCCION // solo por HTTPS al publicar
  }
}));

// ---------- FOTOS PRIVADAS ----------
// Estas fotos solo se ven con sesión. Sin esto, cualquiera que adivine
// la dirección (ej. /img/nosotros.png) las vería sin iniciar sesión.
// Va ANTES de express.static para revisar la sesión primero.
const FOTOS_PRIVADAS = [
  "/img/lele.jpg",
  "/img/mayita.jpg",
  "/img/nosotros.png",
  "/img/ella.png",
  "/img/leinertano.png",
];

app.use(function (req, res, next) {
  if (FOTOS_PRIVADAS.includes(req.path) && !req.session.usuarioId) {
    return res.status(401).end();
  }
  next();
});

app.use(express.static("public"));

// ---------- LÍMITE DE INTENTOS ----------
// Máximo 10 intentos cada 15 minutos por dirección IP en login y registro.
// Así nadie puede probar miles de contraseñas seguidas.
const limiteIntentos = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutos en milisegundos
  limit: 10,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  message: { error: "Demasiados intentos. Espera 15 minutos y vuelve a intentar." },
});

// ---------- PORTERO: EXIGE SESIÓN ----------
// Un middleware recibe req, res y next.
// next() significa "todo bien, sigue con la ruta".
function requiereSesion(req, res, next) {
  // Si la sesión no tiene usuarioId, esta persona no ha iniciado sesión
  if (!req.session.usuarioId) {
    return res.status(401).json({ error: "No has iniciado sesión" });
  }
  // Sí tiene sesión: dejamos pasar
  next();
}



// Lista blanca: solo estas dos personas existen en la app
const AUTORES_VALIDOS = ["lele", "mayita"];

// Busca qué persona (lele o mayita) es la cuenta de la sesión.
// Devuelve null si todavía no la ha elegido.
async function autorDeLaSesion(req) {
  const resultado = await pool.query(
    "SELECT autor FROM usuarios WHERE id = $1",
    [req.session.usuarioId]
  );
  return resultado.rows[0] ? resultado.rows[0].autor : null;
}


// ---------- LEER TODAS LAS NOTAS ----------
// GET /api/notas
app.get("/api/notas", requiereSesion, async function (req, res) {
  try {
    // 1. Las notas, igual que antes
    const resultado = await pool.query("SELECT * FROM notas ORDER BY id DESC");
    const notas = resultado.rows;

    // 2. Cuántas reacciones de cada tipo tiene cada nota.
    // GROUP BY agrupa las filas iguales y COUNT(*) las cuenta.
    const conteos = await pool.query(
      "SELECT nota_id, tipo, COUNT(*) AS total FROM reacciones GROUP BY nota_id, tipo"
    );

    // 3. Solo las reacciones que puse YO (el usuario de la sesión)
    const mias = await pool.query(
      "SELECT nota_id, tipo FROM reacciones WHERE usuario_id = $1",
      [req.session.usuarioId]
    );

    // 4. Armamos un "índice": un objeto donde la clave es el id de la nota
    // y el valor es la nota. Así la encontramos al instante en vez de
    // recorrer toda la lista cada vez.
    const notaPorId = {};
    notas.forEach(function (nota) {
      nota.reacciones = {}; // contadores, ej. { encanta: 2 }
      nota.mias = [];       // mis reacciones, ej. ["encanta"]
      notaPorId[nota.id] = nota;
    });

    // 5. Repartimos los contadores en su nota.
    // COUNT(*) llega como texto, por eso Number(...).
    conteos.rows.forEach(function (fila) {
      const nota = notaPorId[fila.nota_id];
      if (nota) nota.reacciones[fila.tipo] = Number(fila.total);
    });

    // 6. Repartimos mis reacciones en su nota
    mias.rows.forEach(function (fila) {
      const nota = notaPorId[fila.nota_id];
      if (nota) nota.mias.push(fila.tipo);
    });

    res.json(notas);
  } catch (error) {
    console.error("Error al leer las notas:", error);
    res.status(500).json({ error: "No se pudieron leer las notas" });
  }
});


// ---------- CREAR UNA NOTA ----------
// POST /api/notas
app.post("/api/notas", requiereSesion, async function (req, res) {
  const texto = (req.body.texto || "").trim();
  const titulo = (req.body.titulo || "").trim();

  if (texto === "" || titulo === "") {
    return res.status(400).json({ error: "El título y el texto no pueden estar vacíos" });
  }
  if (titulo.length > 80) {
    return res.status(400).json({ error: "El título es demasiado largo" });
  }
  // La fecha con la hora de Colombia. Sin timeZone saldría la hora
  // del servidor de Render, que usa UTC (5 horas más).
  const fecha = new Date().toLocaleString("es-CO", { timeZone: "America/Bogota" });

  try {
    // El autor sale de la CUENTA, no de lo que mande el navegador.
    // Así nadie puede publicar haciéndose pasar por la otra persona.
    const autor = await autorDeLaSesion(req);
    if (!autor) {
      return res.status(400).json({ error: "Primero elige quién eres" });
    }

    // En PostgreSQL los espacios reservados son $1, $2, $3...
    // (en SQLite eran ?). Los valores van en un array, en el mismo orden.
    // RETURNING * pide que la base de datos devuelva la fila recién creada,
    // con el id que ella misma asignó.
    const resultado = await pool.query(
      "INSERT INTO notas (titulo, texto, autor, fecha) VALUES ($1, $2, $3, $4) RETURNING *",
      [titulo, texto, autor, fecha]
    );

    // rows[0] es la primera (y única) fila devuelta.
    res.status(201).json(resultado.rows[0]);
  } catch (error) {
    console.error("Error al guardar la nota:", error);
    res.status(500).json({ error: "No se pudo guardar la nota" });
  }
});


// ---------- ELIMINAR UNA NOTA ----------
// DELETE /api/notas/5  → req.params.id vale "5"
app.delete("/api/notas/:id", requiereSesion, async function (req, res) {
  try {
    await pool.query("DELETE FROM notas WHERE id = $1", [req.params.id]);
    res.json({ ok: true });
  } catch (error) {
    console.error("Error al eliminar la nota:", error);
    res.status(500).json({ error: "No se pudo eliminar la nota" });
  }
});


// ---------- PONER O QUITAR UNA REACCIÓN ----------
// POST /api/notas/5/reacciones   con el cuerpo { "tipo": "encanta" }

// Lista blanca: solo estas reacciones son válidas. Igual que con los autores,
// así nadie puede inventar una reacción saltándose el frontend.
const REACCIONES_VALIDAS = ["encanta", "gusta", "asombra", "divierte", "amen", "ramon"];

app.post("/api/notas/:id/reacciones", requiereSesion, async function (req, res) {
  // req.params.id llega como texto; Number() lo vuelve número
  const notaId = Number(req.params.id);
  const tipo = req.body.tipo;

  // Number.isInteger revisa que sea un número entero (no "abc" ni 2.5)
  if (!Number.isInteger(notaId)) {
    return res.status(400).json({ error: "La nota no es válida" });
  }
  if (!REACCIONES_VALIDAS.includes(tipo)) {
    return res.status(400).json({ error: "Esa reacción no existe" });
  }

  // Quién reacciona: lo sacamos de la SESIÓN, no de lo que mande el navegador.
  // Así nadie puede reaccionar en nombre de otra persona.
  const usuarioId = req.session.usuarioId;

  try {
    // 1. Intentamos BORRAR esa reacción. rowCount dice cuántas filas se borraron:
    // 1 si existía (la persona ya la había puesto), 0 si no existía.
    const borrada = await pool.query(
      "DELETE FROM reacciones WHERE nota_id = $1 AND usuario_id = $2 AND tipo = $3",
      [notaId, usuarioId, tipo]
    );

    // 2. Si se borró algo, era un "quitar": ya terminamos.
    if (borrada.rowCount > 0) {
      return res.json({ activa: false });
    }

    // 3. Si no había nada que borrar, era un "poner": insertamos la reacción.
    await pool.query(
      "INSERT INTO reacciones (nota_id, usuario_id, tipo) VALUES ($1, $2, $3)",
      [notaId, usuarioId, tipo]
    );
    res.status(201).json({ activa: true });
  } catch (error) {
    // 23503 es el código de PostgreSQL cuando se rompe una llave foránea:
    // aquí significa que esa nota no existe.
    if (error.code === "23503") {
      return res.status(404).json({ error: "Esa nota no existe" });
    }
    console.error("Error al reaccionar:", error);
    res.status(500).json({ error: "No se pudo guardar la reacción" });
  }
});


// ---------- REGISTRAR UN USUARIO ----------
// POST /api/registro

// Cuántas personas pueden registrarse en total (Lele y Mayita)
const MAX_USUARIOS = 2;

// Largo mínimo de la contraseña
const MIN_PASSWORD = 8;

app.post("/api/registro", limiteIntentos, async function (req, res) {
  const email = (req.body.email || "").trim().toLowerCase();
  const password = req.body.password || "";

  if (email === "" || password === "") {
    return res.status(400).json({ error: "El correo y la contraseña son obligatorios" });
  }
  if (password.length < MIN_PASSWORD) {
    return res.status(400).json({ error: "La contraseña debe tener mínimo " + MIN_PASSWORD + " caracteres" });
  }

  try {
    const conteo = await pool.query("SELECT COUNT(*) FROM usuarios");
    const total = Number(conteo.rows[0].count);

    if (total >= MAX_USUARIOS) {
      return res.status(403).json({ error: "El registro está cerrado" });
    }

    // NUEVO: ciframos la contraseña. bcrypt.hash devuelve una promesa,
    // por eso lleva await. El 10 es el "costo": qué tan pesado es el cifrado.
    const hash = await bcrypt.hash(password, 10);

    // NUEVO: guardamos el correo y el HASH (nunca la contraseña original).
    // RETURNING id, email devuelve solo esos dos campos, sin el hash.
    const resultado = await pool.query(
      "INSERT INTO usuarios (email, password_hash) VALUES ($1, $2) RETURNING id, email",
      [email, hash]
    );

    // NUEVO: 201 significa "creado". rows[0] es la fila recién guardada.
    res.status(201).json(resultado.rows[0]);
  } catch (error) {
    // NUEVO: 23505 es el código que manda PostgreSQL cuando se rompe
    // la regla UNIQUE, o sea, cuando ese correo ya existe.
    if (error.code === "23505") {
      return res.status(409).json({ error: "Ese correo ya está registrado" });
    }
    console.error("Error al registrar:", error);
    res.status(500).json({ error: "No se pudo registrar el usuario" });
  }
});


// ---------- INICIAR SESIÓN ----------
// POST /api/login
app.post("/api/login", limiteIntentos, async function (req, res) {
  const email = (req.body.email || "").trim().toLowerCase();
  const password = req.body.password || "";

  if (email === "" || password === "") {
    return res.status(400).json({ error: "El correo y la contraseña son obligatorios" });
  }

  try {
    // 1. Buscamos al usuario por su correo. Esta vez sí pedimos el hash,
    // porque lo necesitamos para comparar (solo se usa aquí dentro,
    // nunca se manda al navegador).
    const resultado = await pool.query(
      "SELECT id, email, password_hash FROM usuarios WHERE email = $1",
      [email]
    );

    // Si no hay ninguna fila, el correo no existe y usuario queda undefined.
    const usuario = resultado.rows[0];

    // 2. Comparamos la contraseña escrita con el hash guardado.
    // bcrypt.compare cifra lo que escribió la persona y verifica si coincide.
    // Si el usuario no existe, directamente decimos que no coincide.
    const coincide = usuario
      ? await bcrypt.compare(password, usuario.password_hash)
      : false;

    // 3. Si no coincide, respondemos 401 ("no autorizado").
    // Usamos el MISMO mensaje para correo malo y contraseña mala, así
    // nadie puede descubrir qué correos están registrados.
    if (!coincide) {
      return res.status(401).json({ error: "Correo o contraseña incorrectos" });
    }

    // 4. Todo bien: guardamos el id del usuario dentro de la sesión.
    // express-session crea la fila en la tabla "session" y le manda
    // la cookie al navegador automáticamente.
    // regenerate crea una sesión NUEVA (con id nuevo) antes de guardar el usuario.
    // Evita que alguien te "preste" una cookie vieja y luego la use contigo dentro
    // (ataque llamado "fijación de sesión").
    req.session.regenerate(function (error) {
      if (error) {
        console.error("Error al crear la sesión:", error);
        return res.status(500).json({ error: "No se pudo iniciar sesión" });
      }
      req.session.usuarioId = usuario.id;
      res.json({ ok: true, email: usuario.email });
    });
  } catch (error) {
    console.error("Error al iniciar sesión:", error);
    res.status(500).json({ error: "No se pudo iniciar sesión" });
  }
});


// ---------- QUIÉN SOY ----------
// GET /api/yo
app.get("/api/yo", async function (req, res) {
  // Si la sesión no tiene usuarioId, esta persona no ha iniciado sesión.
  // 401 significa "no autorizado".
  if (!req.session.usuarioId) {
    return res.status(401).json({ error: "No has iniciado sesión" });
  }

  try {
    // Buscamos al usuario por el id que guardamos en la sesión al hacer login.
    // No pedimos el hash: solo el id y el correo.
    const resultado = await pool.query(
      "SELECT id, email, autor FROM usuarios WHERE id = $1",
      [req.session.usuarioId]
    );

    // Si el usuario ya no existe (por ejemplo, lo borraste en Neon),
    // la sesión quedó huérfana y la tratamos como no iniciada.
    if (resultado.rows.length === 0) {
      return res.status(401).json({ error: "No has iniciado sesión" });
    }

    res.json(resultado.rows[0]);
  } catch (error) {
    console.error("Error al consultar la sesión:", error);
    res.status(500).json({ error: "No se pudo consultar la sesión" });
  }
});


// ---------- ELEGIR QUIÉN ERES (UNA SOLA VEZ) ----------
// POST /api/yo/autor   con el cuerpo { "autor": "lele" }
app.post("/api/yo/autor", requiereSesion, async function (req, res) {
  const autor = req.body.autor;

  if (!AUTORES_VALIDOS.includes(autor)) {
    return res.status(400).json({ error: "El autor debe ser lele o mayita" });
  }

  try {
    // "AND autor IS NULL": solo se puede elegir si todavía no tenía.
    // Después ya no se puede cambiar desde la página.
    const resultado = await pool.query(
      "UPDATE usuarios SET autor = $1 WHERE id = $2 AND autor IS NULL",
      [autor, req.session.usuarioId]
    );

    if (resultado.rowCount === 0) {
      return res.status(409).json({ error: "Ya elegiste quién eres" });
    }
    res.json({ ok: true, autor: autor });
  } catch (error) {
    // 23505 = se rompió la regla UNIQUE: la otra cuenta ya es esa persona
    if (error.code === "23505") {
      return res.status(409).json({ error: "Esa persona ya la eligió la otra cuenta" });
    }
    console.error("Error al elegir autor:", error);
    res.status(500).json({ error: "No se pudo guardar quién eres" });
  }
});


// ---------- GALERÍA DE FOTOS ----------

// Límites de tamaño (en bytes). La página achica las fotos antes de subirlas,
// así que normalmente pesan mucho menos que esto.
const MAX_IMAGEN = 3 * 1024 * 1024;   // 3 MB
const MAX_MINIATURA = 400 * 1024;     // 400 KB

// Convierte "data:image/jpeg;base64,/9j/4AA..." en bytes (un Buffer).
// Devuelve null si no es una imagen JPEG válida.
function leerJpeg(dataUrl) {
  const prefijo = "data:image/jpeg;base64,";
  if (typeof dataUrl !== "string" || !dataUrl.startsWith(prefijo)) return null;

  const bytes = Buffer.from(dataUrl.slice(prefijo.length), "base64");
  // Todo archivo JPEG empieza con los bytes FF D8 FF ("número mágico").
  // Así revisamos que de verdad sea una foto y no otra cosa disfrazada.
  if (bytes.length < 3 || bytes[0] !== 0xff || bytes[1] !== 0xd8 || bytes[2] !== 0xff) return null;
  return bytes;
}

// Revisa que la fecha tenga la forma AAAA-MM-DD y que exista de verdad.
function fechaValida(texto) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(texto)) return false;
  const fecha = new Date(texto + "T00:00:00Z");
  return !isNaN(fecha) && fecha.toISOString().slice(0, 10) === texto;
}

// LISTA DE FOTOS: GET /api/fotos
// Solo manda los datos (texto), NO las imágenes: esas se piden aparte.
app.get("/api/fotos", requiereSesion, async function (req, res) {
  try {
    // to_char convierte la fecha en texto "2026-11-10". Si la mandáramos como
    // fecha, JavaScript le aplicaría la zona horaria y podría salir el día anterior.
    // NULLS LAST: las fotos sin fecha van al final.
    const resultado = await pool.query(
      `SELECT id, autor, descripcion, lugar,
              to_char(fecha, 'YYYY-MM-DD') AS fecha,
              usuario_id = $1 AS mia
         FROM fotos
        ORDER BY fecha DESC NULLS LAST, id DESC`,
      [req.session.usuarioId]
    );
    res.json(resultado.rows);
  } catch (error) {
    console.error("Error al leer las fotos:", error);
    res.status(500).json({ error: "No se pudieron leer las fotos" });
  }
});

// UNA IMAGEN: GET /api/fotos/5/miniatura   o   GET /api/fotos/5/imagen
app.get("/api/fotos/:id/:version", requiereSesion, async function (req, res) {
  const id = Number(req.params.id);
  // Lista blanca: el nombre de la columna NO puede venir directo del navegador
  // (sería una inyección SQL). Solo aceptamos estas dos.
  const columnas = { miniatura: "miniatura", imagen: "imagen" };
  const columna = columnas[req.params.version];

  if (!Number.isInteger(id) || !columna) {
    return res.status(404).end();
  }

  try {
    const resultado = await pool.query(`SELECT ${columna} AS bytes FROM fotos WHERE id = $1`, [id]);
    if (resultado.rows.length === 0) return res.status(404).end();

    res.set("Content-Type", "image/jpeg");
    // Una foto nunca cambia: el navegador puede guardarla 1 año.
    // "private": solo el navegador de la persona, nunca un servidor intermedio.
    res.set("Cache-Control", "private, max-age=31536000, immutable");
    res.send(resultado.rows[0].bytes);
  } catch (error) {
    console.error("Error al leer la imagen:", error);
    res.status(500).end();
  }
});

// SUBIR UNA FOTO: POST /api/fotos
// Cuerpo: { imagen, miniatura, descripcion, lugar, fecha }
// imagen y miniatura llegan como texto "data:image/jpeg;base64,..."
app.post("/api/fotos", requiereSesion, leerJsonFotos, async function (req, res) {
  const imagen = leerJpeg(req.body.imagen);
  const miniatura = leerJpeg(req.body.miniatura);
  const descripcion = (req.body.descripcion || "").trim();
  const lugar = (req.body.lugar || "").trim();
  const fecha = (req.body.fecha || "").trim();

  if (!imagen || !miniatura) {
    return res.status(400).json({ error: "La foto no es válida" });
  }
  if (imagen.length > MAX_IMAGEN || miniatura.length > MAX_MINIATURA) {
    return res.status(400).json({ error: "La foto es demasiado pesada" });
  }
  if (descripcion.length > 500) {
    return res.status(400).json({ error: "La descripción es demasiado larga" });
  }
  if (lugar.length > 100) {
    return res.status(400).json({ error: "El lugar es demasiado largo" });
  }
  if (fecha !== "" && !fechaValida(fecha)) {
    return res.status(400).json({ error: "La fecha no es válida" });
  }

  try {
    // El autor sale de la cuenta, igual que en los recuerdos
    const autor = await autorDeLaSesion(req);
    if (!autor) {
      return res.status(400).json({ error: "Primero elige quién eres en Inicio" });
    }

    // "|| null": si el campo quedó vacío, se guarda como NULL (sin dato)
    const resultado = await pool.query(
      `INSERT INTO fotos (usuario_id, autor, imagen, miniatura, descripcion, lugar, fecha)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING id`,
      [req.session.usuarioId, autor, imagen, miniatura, descripcion || null, lugar || null, fecha || null]
    );
    res.status(201).json({ id: resultado.rows[0].id });
  } catch (error) {
    console.error("Error al guardar la foto:", error);
    res.status(500).json({ error: "No se pudo guardar la foto" });
  }
});

// BORRAR UNA FOTO: DELETE /api/fotos/5
// "AND usuario_id = $2": solo se borra si la subiste tú.
app.delete("/api/fotos/:id", requiereSesion, async function (req, res) {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) {
    return res.status(400).json({ error: "La foto no es válida" });
  }

  try {
    const resultado = await pool.query(
      "DELETE FROM fotos WHERE id = $1 AND usuario_id = $2",
      [id, req.session.usuarioId]
    );
    // 0 filas borradas: la foto no existe o es de la otra persona
    if (resultado.rowCount === 0) {
      return res.status(403).json({ error: "Solo quien subió la foto puede borrarla" });
    }
    res.json({ ok: true });
  } catch (error) {
    console.error("Error al borrar la foto:", error);
    res.status(500).json({ error: "No se pudo borrar la foto" });
  }
});


// ---------- CALENDARIO ----------

// LISTA DE EVENTOS: GET /api/eventos
// Manda todos; la página calcula en qué días del mes aparece cada uno
// (los que se repiten cada año salen en varios años).
app.get("/api/eventos", requiereSesion, async function (req, res) {
  try {
    // to_char: fecha y hora como texto ("2026-11-10" y "18:30"), sin zonas horarias
    const resultado = await pool.query(
      `SELECT id, autor, titulo, descripcion, cada_anio,
              to_char(fecha, 'YYYY-MM-DD') AS fecha,
              to_char(hora, 'HH24:MI') AS hora,
              usuario_id = $1 AS mio
         FROM eventos
        ORDER BY fecha, hora NULLS FIRST, id`,
      [req.session.usuarioId]
    );
    res.json(resultado.rows);
  } catch (error) {
    console.error("Error al leer los eventos:", error);
    res.status(500).json({ error: "No se pudieron leer los eventos" });
  }
});

// CREAR UN EVENTO: POST /api/eventos
// Cuerpo: { titulo, descripcion, fecha, hora, cada_anio }
app.post("/api/eventos", requiereSesion, async function (req, res) {
  const titulo = (req.body.titulo || "").trim();
  const descripcion = (req.body.descripcion || "").trim();
  const fecha = (req.body.fecha || "").trim();
  const hora = (req.body.hora || "").trim();
  // === true: solo vale si llega exactamente true (no "sí", ni 1)
  const cadaAnio = req.body.cada_anio === true;

  if (titulo === "") {
    return res.status(400).json({ error: "El evento necesita un título" });
  }
  if (titulo.length > 80) {
    return res.status(400).json({ error: "El título es demasiado largo" });
  }
  if (descripcion.length > 500) {
    return res.status(400).json({ error: "La descripción es demasiado larga" });
  }
  if (!fechaValida(fecha)) {
    return res.status(400).json({ error: "La fecha no es válida" });
  }
  // Hora opcional, con forma HH:MM entre 00:00 y 23:59
  if (hora !== "" && !/^([01]\d|2[0-3]):[0-5]\d$/.test(hora)) {
    return res.status(400).json({ error: "La hora no es válida" });
  }

  try {
    const autor = await autorDeLaSesion(req);
    if (!autor) {
      return res.status(400).json({ error: "Primero elige quién eres en Inicio" });
    }

    const resultado = await pool.query(
      `INSERT INTO eventos (usuario_id, autor, titulo, descripcion, fecha, hora, cada_anio)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING id`,
      [req.session.usuarioId, autor, titulo, descripcion || null, fecha, hora || null, cadaAnio]
    );
    res.status(201).json({ id: resultado.rows[0].id });
  } catch (error) {
    console.error("Error al guardar el evento:", error);
    res.status(500).json({ error: "No se pudo guardar el evento" });
  }
});

// BORRAR UN EVENTO: DELETE /api/eventos/5  (solo quien lo creó)
app.delete("/api/eventos/:id", requiereSesion, async function (req, res) {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) {
    return res.status(400).json({ error: "El evento no es válido" });
  }

  try {
    const resultado = await pool.query(
      "DELETE FROM eventos WHERE id = $1 AND usuario_id = $2",
      [id, req.session.usuarioId]
    );
    if (resultado.rowCount === 0) {
      return res.status(403).json({ error: "Solo quien creó el evento puede borrarlo" });
    }
    res.json({ ok: true });
  } catch (error) {
    console.error("Error al borrar el evento:", error);
    res.status(500).json({ error: "No se pudo borrar el evento" });
  }
});


// ---------- PREGUNTAS DEL DÍA ----------

// La fecha de HOY en Colombia, como "2026-11-10".
// "en-CA" es un formato que escribe las fechas como AAAA-MM-DD.
function hoyEnColombia() {
  return new Date().toLocaleDateString("en-CA", { timeZone: "America/Bogota" });
}

// Busca la pregunta de una fecha. Si es hoy y todavía no hay, elige una nueva.
async function preguntaDeLaFecha(fecha, crearSiFalta) {
  const buscar = "SELECT to_char(fecha, 'YYYY-MM-DD') AS fecha, tema, texto FROM preguntas_dia WHERE fecha = $1";
  let resultado = await pool.query(buscar, [fecha]);
  if (resultado.rows.length > 0 || !crearSiFalta) return resultado.rows[0] || null;

  // Elegimos al azar entre las que NO han salido. Un Set busca más rápido que una lista.
  const usadas = await pool.query("SELECT texto FROM preguntas_dia");
  const yaSalieron = new Set(usadas.rows.map(function (fila) { return fila.texto; }));
  let opciones = PREGUNTAS.filter(function (p) { return !yaSalieron.has(p.texto); });
  if (opciones.length === 0) opciones = PREGUNTAS;   // ya salieron todas: volvemos a empezar

  const elegida = opciones[Math.floor(Math.random() * opciones.length)];

  // ON CONFLICT DO NOTHING: si las dos personas entran al mismo tiempo, solo se
  // guarda la primera pregunta y los dos ven la misma.
  await pool.query(
    "INSERT INTO preguntas_dia (fecha, tema, texto) VALUES ($1, $2, $3) ON CONFLICT (fecha) DO NOTHING",
    [fecha, elegida.tema, elegida.texto]
  );
  resultado = await pool.query(buscar, [fecha]);
  return resultado.rows[0];
}

// Arma lo que ve una persona de una pregunta, aplicando LA REGLA:
// la respuesta de la otra persona solo se manda si YA respondiste.
function armarPregunta(pregunta, respuestasDelDia, usuarioId) {
  const mia = respuestasDelDia.find(function (r) { return r.usuario_id === usuarioId; });
  const otra = respuestasDelDia.find(function (r) { return r.usuario_id !== usuarioId; });

  return {
    fecha: pregunta.fecha,
    tema: pregunta.tema,
    texto: pregunta.texto,
    mia: mia ? { autor: mia.autor, respuesta: mia.respuesta } : null,
    // Si la otra persona respondió: siempre decimos QUIÉN, pero el texto solo si ya respondiste
    otra: otra ? { autor: otra.autor, respuesta: mia ? otra.respuesta : null } : null,
  };
}

async function respuestasDe(fechas) {
  // ANY($1): "la fecha está en esta lista"
  const resultado = await pool.query(
    "SELECT to_char(fecha, 'YYYY-MM-DD') AS fecha, usuario_id, autor, respuesta FROM respuestas WHERE fecha = ANY($1::date[])",
    [fechas]
  );
  return resultado.rows;
}

// PREGUNTA DE HOY: GET /api/preguntas/hoy
app.get("/api/preguntas/hoy", requiereSesion, async function (req, res) {
  try {
    const pregunta = await preguntaDeLaFecha(hoyEnColombia(), true);
    const respuestas = await respuestasDe([pregunta.fecha]);
    res.json(armarPregunta(pregunta, respuestas, req.session.usuarioId));
  } catch (error) {
    console.error("Error al leer la pregunta de hoy:", error);
    res.status(500).json({ error: "No se pudo leer la pregunta de hoy" });
  }
});

// HISTORIAL: GET /api/preguntas/historial   (los últimos 60 días, sin hoy)
app.get("/api/preguntas/historial", requiereSesion, async function (req, res) {
  try {
    const preguntas = await pool.query(
      `SELECT to_char(fecha, 'YYYY-MM-DD') AS fecha, tema, texto
         FROM preguntas_dia
        WHERE fecha < $1
        ORDER BY fecha DESC
        LIMIT 60`,
      [hoyEnColombia()]
    );
    const fechas = preguntas.rows.map(function (p) { return p.fecha; });
    const respuestas = await respuestasDe(fechas);

    res.json(preguntas.rows.map(function (pregunta) {
      const delDia = respuestas.filter(function (r) { return r.fecha === pregunta.fecha; });
      return armarPregunta(pregunta, delDia, req.session.usuarioId);
    }));
  } catch (error) {
    console.error("Error al leer el historial:", error);
    res.status(500).json({ error: "No se pudo leer el historial" });
  }
});

// RESPONDER: POST /api/preguntas/2026-11-10/respuesta   con { "respuesta": "..." }
// Sirve para hoy y para días anteriores que no respondiste.
app.post("/api/preguntas/:fecha/respuesta", requiereSesion, async function (req, res) {
  const fecha = req.params.fecha;
  const respuesta = (req.body.respuesta || "").trim();

  if (!fechaValida(fecha) || fecha > hoyEnColombia()) {
    return res.status(400).json({ error: "La fecha no es válida" });
  }
  if (respuesta === "") {
    return res.status(400).json({ error: "Escribe tu respuesta" });
  }
  if (respuesta.length > 1000) {
    return res.status(400).json({ error: "La respuesta es demasiado larga" });
  }

  try {
    const autor = await autorDeLaSesion(req);
    if (!autor) {
      return res.status(400).json({ error: "Primero elige quién eres en Inicio" });
    }

    // Solo se puede responder una pregunta que de verdad salió ese día
    const pregunta = await preguntaDeLaFecha(fecha, false);
    if (!pregunta) {
      return res.status(404).json({ error: "Ese día no hubo pregunta" });
    }

    await pool.query(
      "INSERT INTO respuestas (fecha, usuario_id, autor, respuesta) VALUES ($1, $2, $3, $4)",
      [fecha, req.session.usuarioId, autor, respuesta]
    );

    // Devolvemos la pregunta completa: ahora ya puede ver la respuesta de la otra persona
    const respuestas = await respuestasDe([fecha]);
    res.status(201).json(armarPregunta(pregunta, respuestas, req.session.usuarioId));
  } catch (error) {
    // 23505: ya existe (fecha, usuario_id) → ya habías respondido
    if (error.code === "23505") {
      return res.status(409).json({ error: "Ya respondiste esta pregunta" });
    }
    console.error("Error al guardar la respuesta:", error);
    res.status(500).json({ error: "No se pudo guardar la respuesta" });
  }
});


// ---------- CERRAR SESIÓN ----------
// POST /api/logout
app.post("/api/logout", function (req, res) {
  // destroy borra la fila de la tabla "session" en Neon.
  req.session.destroy(function (error) {
    if (error) {
      console.error("Error al cerrar sesión:", error);
      return res.status(500).json({ error: "No se pudo cerrar la sesión" });
    }
    // También le decimos al navegador que borre la cookie.
    // "connect.sid" es el nombre que express-session le da por defecto.
    res.clearCookie("connect.sid");
    res.json({ ok: true });
  });
});


// ---------- ENCENDER EL SERVIDOR ----------
// Primero preparamos la base de datos (crear la tabla) y SOLO si sale bien
// encendemos el servidor. Si falla, mostramos el error y cerramos el programa.
iniciarBaseDeDatos()
  .then(function () {
    app.listen(PUERTO, function () {
      console.log("Servidor listo en http://localhost:" + PUERTO);
    });
  })
  .catch(function (error) {
    console.error("No se pudo conectar a la base de datos:", error);
    process.exit(1);
  });
