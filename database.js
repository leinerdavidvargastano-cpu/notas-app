// dotenv lee el archivo .env y mete sus valores en process.env.
// Así la contraseña de la base de datos NO queda escrita en el código.
// En Render no existe .env: allí las variables se configuran en el panel.
require("dotenv").config();

// Pool = grupo de conexiones a PostgreSQL que se reutilizan.
// Es más eficiente que abrir una conexión nueva en cada petición.
const { Pool } = require("pg");

const pool = new Pool({
  // La dirección completa de tu base de datos (usuario, clave, servidor...).
  connectionString: process.env.DATABASE_URL,
});

// Crea la tabla si todavía no existe.
// Es "async" porque hablar con una base de datos externa tarda:
// hay que esperar la respuesta con "await".
async function iniciarBaseDeDatos() {
  // SERIAL PRIMARY KEY es el equivalente en PostgreSQL de
  // INTEGER PRIMARY KEY AUTOINCREMENT de SQLite: número que se asigna solo.
  await pool.query(`
    CREATE TABLE IF NOT EXISTS notas (
      id SERIAL PRIMARY KEY,
      texto TEXT NOT NULL,
      fecha TEXT NOT NULL
    )
  `);
  // ALTER TABLE modifica una tabla que ya existe (aquí, agrega columnas).
  // IF NOT EXISTS evita el error si las columnas ya fueron creadas, así que
  // este código se puede ejecutar cada vez que arranca el servidor.
  // Las columnas nuevas quedan vacías (NULL) en las notas que ya existían.
  await pool.query(`
    ALTER TABLE notas
      ADD COLUMN IF NOT EXISTS titulo TEXT,
      ADD COLUMN IF NOT EXISTS autor TEXT
  `);

  console.log("Base de datos PostgreSQL lista");
}

// Exportamos las dos cosas que necesita server.js.
module.exports = { pool, iniciarBaseDeDatos };
