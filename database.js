// Traemos la librería que permite usar SQLite desde Node.js.
const Database = require("better-sqlite3");

// Abrimos la base de datos. "notas.db" es un archivo normal:
// si no existe, se crea solo en la carpeta desde donde ejecutas node.
const db = new Database("notas.db");

// db.exec ejecuta una instrucción SQL directamente.
// Usamos comillas invertidas (``) para poder escribir el SQL en varias líneas.
db.exec(`
  CREATE TABLE IF NOT EXISTS notas (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    texto TEXT NOT NULL,
    fecha TEXT NOT NULL
  )
`);

// Mensaje solo para comprobar que todo funcionó.
// Lo quitaremos cuando conectemos este archivo con el servidor.
console.log("Base de datos lista");

// module.exports deja disponible "db" para otros archivos.
// Más adelante, server.js hará: const db = require("./database");
module.exports = db;
