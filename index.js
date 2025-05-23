require("dotenv").config();
const express = require("express");
const AWS = require("aws-sdk");
const Database = require("better-sqlite3");
const app = express();
const PORT = 3000;

const db = new Database("concesionaria.db");
const sqs = new AWS.SQS({ region: process.env.AWS_REGION });


app.use(express.json());

db.prepare(`
  CREATE TABLE IF NOT EXISTS autos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    modelo TEXT NOT NULL,
    precio INTEGER NOT NULL
  )
`).run();

db.prepare(`
  CREATE TABLE IF NOT EXISTS ventas (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    modelo TEXT,
    precio INTEGER,
    comprador TEXT,
    fecha TEXT
  )
`).run();

const contarAutos = db.prepare("SELECT COUNT(*) as count FROM autos").get().count;
if (contarAutos === 0) {
  db.prepare("INSERT INTO autos (modelo, precio) VALUES (?, ?)").run("Mazda 3", 300000);
  db.prepare("INSERT INTO autos (modelo, precio) VALUES (?, ?)").run("Chevrolet Aveo", 220000);
}

app.get("/", (req, res) => {
  res.status(200).json({ mensaje: "Bienvenido a la API de la concesionaria" });
});

app.get("/concesionaria/autos", (req, res) => {
  const autos = db.prepare("SELECT * FROM autos").all();
  res.json(autos);
});

// Crear nuevo auto
app.post("/concesionaria/autos", (req, res) => {
  const { modelo, precio } = req.body;
  if (!modelo || !precio) {
    return res.status(400).json({ mensaje: "Modelo y precio son obligatorios" });
  }

  const result = db.prepare("INSERT INTO autos (modelo, precio) VALUES (?, ?)").run(modelo, precio);
  res.status(201).json({ mensaje: "Auto agregado", id: result.lastInsertRowid });
});

// Actualizar auto por ID
app.put("/concesionaria/autos/:id", (req, res) => {
  const { id } = req.params;
  const { modelo, precio } = req.body;

  const auto = db.prepare("SELECT * FROM autos WHERE id = ?").get(id);
  if (!auto) {
    return res.status(404).json({ mensaje: "Auto no encontrado" });
  }

  db.prepare("UPDATE autos SET modelo = ?, precio = ? WHERE id = ?")
    .run(modelo || auto.modelo, precio || auto.precio, id);

  res.json({ mensaje: "Auto actualizado correctamente" });
});

// Eliminar auto por ID
app.delete("/concesionaria/autos/:id", (req, res) => {
  const { id } = req.params;

  const auto = db.prepare("SELECT * FROM autos WHERE id = ?").get(id);
  if (!auto) {
    return res.status(404).json({ mensaje: "Auto no encontrado" });
  }

  db.prepare("DELETE FROM autos WHERE id = ?").run(id);
  res.json({ mensaje: "Auto eliminado correctamente" });
});

// Consultar todas las ventas
app.get("/concesionaria/ventas", (req, res) => {
  const ventas = db.prepare("SELECT * FROM ventas").all();
  res.json(ventas);
});

app.post("/concesionaria/venta", async (req, res) => {
    const { autoId, comprador } = req.body;
    const auto = db.prepare("SELECT * FROM autos WHERE id = ?").get(autoId);
  
    if (!auto) return res.status(404).json({ mensaje: "Auto no encontrado" });
  
    const venta = {
      modelo: auto.modelo,
      precio: auto.precio,
      comprador,
      fecha: new Date().toISOString(),
    };
  
    // Guardar localmente
    db.prepare(`
      INSERT INTO ventas (modelo, precio, comprador, fecha)
      VALUES (?, ?, ?, ?)
    `).run(venta.modelo, venta.precio, venta.comprador, venta.fecha);
  
    // Enviar a SQS
    const params = {
      QueueUrl: process.env.SQS_QUEUE_URL,
      MessageBody: JSON.stringify(venta),
    };
  
    try {
      await sqs.sendMessage(params).promise();
      res.json({ mensaje: "Venta registrada y enviada a SQS", venta });
    } catch (err) {
      console.error("Error al enviar a SQS:", err.message);
      res.status(500).json({ mensaje: "Error al enviar a SQS" });
    }
  });

app.listen(PORT, () => {
  console.log(`API Concesionaria corriendo en http://localhost:${PORT}`);
});