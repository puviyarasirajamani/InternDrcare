
const jwt = require("jsonwebtoken");
const { JWT_SECRET } = require("./middleware");

const clients = new Map();

function attachWebSocket(wss) {
  wss.on("connection", (socket, request) => {
    try {
      const url = new URL(
        request.url,
        `http://${request.headers.host || "localhost"}`
      );

      const token = url.searchParams.get("token");

      if (!token) {
        socket.close(1008, "Authentication required");
        return;
      }

      const user = jwt.verify(token, JWT_SECRET);
      const userId = Number(user.id);

      if (!Number.isInteger(userId)) {
        socket.close(1008, "Invalid user");
        return;
      }

      if (!clients.has(userId)) {
        clients.set(userId, new Set());
      }

      clients.get(userId).add(socket);

      socket.on("close", () => {
        const sockets = clients.get(userId);

        if (sockets) {
          sockets.delete(socket);

          if (sockets.size === 0) {
            clients.delete(userId);
          }
        }
      });

      socket.send(JSON.stringify({
        type: "CONNECTED"
      }));
    } catch (_error) {
      socket.close(1008, "Invalid token");
    }
  });
}

function sendToUser(userId, payload) {
  const sockets = clients.get(Number(userId));

  if (!sockets) return;

  const message = JSON.stringify(payload);

  for (const socket of sockets) {
    if (socket.readyState === 1) {
      socket.send(message);
    }
  }
}

module.exports = {
  attachWebSocket,
  sendToUser
};
