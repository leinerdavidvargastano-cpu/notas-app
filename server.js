// Traemos Express y la conexión a la base de datos.
const express = require("express");
const { pool, iniciarBaseDeDatos } = require("./database");

// bcryptjs: la herramienta que convierte una contraseña en un texto cifrado
const bcrypt = require("bcryptjs");

const app = express();
const PUERTO = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static("public"));


// ---------- LEER TODAS LAS NOTAS ----------
// GET /api/notas
app.get("/api/notas", async function (req, res) {
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
app.post("/api/notas", async function (req, res) {
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
app.delete("/api/notas/:id", async function (req, res) {
  try {
    await pool.query("DELETE FROM notas WHERE id = $1", [req.params.id]);
    res.json({ ok: true });
  } catch (error) {
    console.error("Error al eliminar la nota:", error);
    res.status(500).json({ error: "No se pudo eliminar la nota" });
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
