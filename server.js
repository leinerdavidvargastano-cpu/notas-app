// Traemos Express y la conexión a la base de datos.
const express = require("express");
const { pool, iniciarBaseDeDatos } = require("./database");

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
