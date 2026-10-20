// Traemos Express (el servidor) y nuestra base de datos (database.js).
const express = require("express");
const db = require("./database");

const app = express();
const PUERTO = process.env.PORT || 3000;

// MIDDLEWARE: código que se ejecuta ANTES de las rutas.
// express.json() convierte el JSON que manda el frontend en un objeto (req.body).
app.use(express.json());

// Sirve los archivos de la carpeta "public" (HTML, CSS, JS) tal cual.
app.use(express.static("public"));

// Ruta de prueba del paso 2 (la dejamos por ahora).
app.get("/", function (req, res) {
  res.send("Mi primer servidor con Node.js y Express funciona");
});


// ---------- LEER TODAS LAS NOTAS ----------
// GET /api/notas
app.get("/api/notas", function (req, res) {
  // prepare() prepara la instrucción SQL; all() la ejecuta y devuelve todas las filas.
  // ORDER BY id DESC = ordenar de la más nueva a la más antigua.
  const notas = db.prepare("SELECT * FROM notas ORDER BY id DESC").all();

  // res.json envía la respuesta en formato JSON.
  res.json(notas);
});


// ---------- CREAR UNA NOTA ----------
// POST /api/notas
app.post("/api/notas", function (req, res) {
  // req.body es lo que envió el frontend. Si no vino texto, usamos "".
  // trim() quita espacios al inicio y al final.
  const texto = (req.body.texto || "").trim();

  // Validamos SIEMPRE en el servidor: el frontend se puede saltar.
  // 400 = "petición incorrecta". return detiene la función aquí.
  if (texto === "") {
    return res.status(400).json({ error: "El texto no puede estar vacío" });
  }

  const fecha = new Date().toLocaleString("es-CO");

  // Los signos ? son espacios reservados: la librería pone los valores de forma segura.
  // NUNCA pegues texto del usuario directo en el SQL (riesgo de SQL injection).
  // run() ejecuta instrucciones que no devuelven filas, como INSERT o DELETE.
  const resultado = db
    .prepare("INSERT INTO notas (texto, fecha) VALUES (?, ?)")
    .run(texto, fecha);

  // 201 = "creado correctamente".
  // lastInsertRowid es el id que la base de datos asignó a la nota nueva.
  res.status(201).json({ id: resultado.lastInsertRowid, texto: texto, fecha: fecha });
});


// ---------- ELIMINAR UNA NOTA ----------
// DELETE /api/notas/5  → req.params.id vale "5"
app.delete("/api/notas/:id", function (req, res) {
  db.prepare("DELETE FROM notas WHERE id = ?").run(req.params.id);
  res.json({ ok: true });
});


// Encendemos el servidor.
app.listen(PUERTO, function () {
  console.log("Servidor listo en http://localhost:" + PUERTO);
});
