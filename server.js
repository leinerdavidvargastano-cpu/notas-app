// Traemos Express y la conexión a la base de datos.
const express = require("express");
const { pool, iniciarBaseDeDatos } = require("./database");

// bcryptjs: la herramienta que convierte una contraseña en un texto cifrado
const bcrypt = require("bcryptjs");

// express-session: crea y lee las sesiones y sus cookies
const session = require("express-session");
// connect-pg-simple: guarda las sesiones en PostgreSQL (tu base de Neon)
const PgSession = require("connect-pg-simple")(session);

const app = express();
const PUERTO = process.env.PORT || 3000;

app.use(express.json());

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
    secure: process.env.NODE_ENV === "production" // solo por HTTPS al publicar
  }
}));

app.use(express.static("public"));

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



// ---------- LEER TODAS LAS NOTAS ----------
// GET /api/notas
app.get("/api/notas", requiereSesion, async function (req, res) {
  // try/catch: si la base de datos falla, respondemos con error 500
  // ("error del servidor") en vez de dejar la petición colgada.
  try {
    // pool.query ejecuta SQL y devuelve un objeto de resultado.
    // Las filas están en resultado.rows (un array de objetos).
    const resultado = await pool.query("SELECT * FROM notas ORDER BY id DESC");
    res.json(resultado.rows);
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
  const autor = req.body.autor;

  // Lista blanca: solo aceptamos estos dos autores. Así nadie puede
  // enviar un nombre inventado saltándose el frontend.
  const AUTORES_VALIDOS = ["lele", "mayita"];

  if (texto === "" || titulo === "") {
    return res.status(400).json({ error: "El título y el texto no pueden estar vacíos" });
  }
  if (titulo.length > 80) {
    return res.status(400).json({ error: "El título es demasiado largo" });
  }
  if (!AUTORES_VALIDOS.includes(autor)) {
    return res.status(400).json({ error: "El autor debe ser lele o mayita" });
  }

  const fecha = new Date().toLocaleString("es-CO");

  try {
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

app.post("/api/registro", async function (req, res) {
  const email = (req.body.email || "").trim().toLowerCase();
  const password = req.body.password || "";

  if (email === "" || password === "") {
    return res.status(400).json({ error: "El correo y la contraseña son obligatorios" });
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
app.post("/api/login", async function (req, res) {
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
    req.session.usuarioId = usuario.id;

    res.json({ ok: true, email: usuario.email });
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
      "SELECT id, email FROM usuarios WHERE id = $1",
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
