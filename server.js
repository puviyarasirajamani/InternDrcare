
require("dotenv").config();

const path = require("path");
const http = require("http");
const express = require("express");
const { WebSocketServer } = require("ws");

const {
  initializeDatabase
} = require("./src/database");

const {
  attachWebSocket
} = require("./src/websocket");

const apiRoutes = require("./src/routes");

const app = express();
const server = http.createServer(app);

const wss = new WebSocketServer({
  server,
  path: "/ws"
});

const PORT = Number(process.env.PORT || 3000);

initializeDatabase();
attachWebSocket(wss);

app.disable("x-powered-by");

app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: false }));

app.use("/api", apiRoutes);

app.get("/health", (_req, res) => {
  res.json({
    status: "ok",
    app: "InternDrCare",
    time: new Date().toISOString()
  });
});

app.use(express.static(path.join(__dirname, "public")));

app.get("*", (req, res, next) => {
  if (req.path.startsWith("/api/")) {
    return next();
  }

  res.sendFile(
    path.join(__dirname, "public", "index.html")
  );
});

app.use((err, _req, res, _next) => {
  console.error("Server error:", err);

  res.status(err.status || 500).json({
    error:
      err.status && err.status < 500
        ? err.message
        : "Internal server error"
  });
});

server.listen(PORT, () => {
  console.log("==========================================");
  console.log(`InternDrCare is running at http://localhost:${PORT}`);
  console.log(`Health check: http://localhost:${PORT}/health`);
  console.log(`WebSocket: ws://localhost:${PORT}/ws`);
  console.log("==========================================");
});
