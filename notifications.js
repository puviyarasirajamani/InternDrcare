
const { db } = require("./database");
const { sendToUser } = require("./websocket");

function createNotification(
  userId,
  category,
  title,
  message,
  data = {}
) {
  const result = db.prepare(`
    INSERT INTO notifications (
      user_id, category, title, message, data
    )
    VALUES (?, ?, ?, ?, ?)
  `).run(
    Number(userId),
    String(category),
    String(title),
    String(message),
    JSON.stringify(data)
  );

  const notification = db.prepare(`
    SELECT *
    FROM notifications
    WHERE id = ?
  `).get(result.lastInsertRowid);

  sendToUser(userId, {
    type: "NOTIFICATION",
    notification
  });

  return notification;
}

module.exports = {
  createNotification
};
