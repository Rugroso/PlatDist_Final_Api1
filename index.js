require("dotenv").config();
const express = require("express");
const AWS = require("aws-sdk");
const Database = require("better-sqlite3");
const app = express();
const PORT = 3000;

const db = new Database("concesionaria.db");
const VENTAS_API_URL = process.env.VENTAS_API_URL || "http://localhost:4000";
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

app.get("/autos", (req, res) => {
  const autos = db.prepare("SELECT * FROM autos").all();
  res.json(autos);
});

app.post("/venta", async (req, res) => {
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