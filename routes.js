
const express = require("express");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");

const { db } = require("./database");
const {
  authenticate,
  authorize,
  sanitizeString,
  validateRequired,
  JWT_SECRET
} = require("./middleware");

const { createNotification } = require("./notifications");
const {
  analyzeInstruction,
  organizeClinicalNote,
  generateShiftHandover
} = require("./ai");

const router = express.Router();

function issueToken(user) {
  return jwt.sign(
    {
      id: user.id,
      role: user.role,
      hospital: user.hospital
    },
    JWT_SECRET,
    { expiresIn: "8h" }
  );
}

function publicUser(user) {
  if (!user) return null;

  return {
    id: user.id,
    full_name: user.full_name,
    email: user.email,
    role: user.role,
    hospital: user.hospital,
    department: user.department,
    specialization: user.specialization,
    phone: user.phone,
    created_at: user.created_at
  };
}

function currentUser(req) {
  return db.prepare(
    "SELECT * FROM users WHERE id = ?"
  ).get(req.user.id);
}

function sameHospital(userA, userB) {
  return Boolean(
    userA &&
    userB &&
    userA.hospital.trim().toLowerCase() ===
      userB.hospital.trim().toLowerCase()
  );
}

function approvedConnection(seniorId, internId) {
  return db.prepare(`
    SELECT *
    FROM connections
    WHERE senior_id = ?
      AND intern_id = ?
      AND status = 'APPROVED'
  `).get(seniorId, internId);
}

function hasApprovedPair(userA, userB) {
  const senior = userA.role === "SENIOR" ? userA : userB;
  const intern = userA.role === "INTERN" ? userA : userB;

  if (!senior || !intern) return false;

  return Boolean(approvedConnection(senior.id, intern.id));
}

function parseJson(value, fallback = {}) {
  try {
    return JSON.parse(value || "{}");
  } catch (_error) {
    return fallback;
  }
}

function asyncRoute(handler) {
  return (req, res, next) => {
    try {
      handler(req, res, next);
    } catch (error) {
      next(error);
    }
  };
}

// Health endpoint
router.get("/health", (_req, res) => {
  res.json({ status: "ok", app: "InternDrCare" });
});

// Register
router.post("/auth/register", asyncRoute(async (req, res) => {
  const error = validateRequired(req.body, [
    "full_name",
    "email",
    "password",
    "role",
    "hospital"
  ]);

  if (error) {
    return res.status(400).json({ error });
  }

  const fullName = sanitizeString(req.body.full_name, 100);
  const email = sanitizeString(req.body.email, 254).toLowerCase();
  const password = String(req.body.password);
  const role = String(req.body.role).toUpperCase();
  const hospital = sanitizeString(req.body.hospital, 150);
  const department = sanitizeString(req.body.department, 100);
  const specialization = sanitizeString(req.body.specialization, 100);
  const phone = sanitizeString(req.body.phone, 30);

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return res.status(400).json({ error: "Enter a valid email address." });
  }

  if (password.length < 8 || password.length > 128) {
    return res.status(400).json({
      error: "Password must contain between 8 and 128 characters."
    });
  }

  if (!["SENIOR", "INTERN"].includes(role)) {
    return res.status(400).json({
      error: "Role must be SENIOR or INTERN."
    });
  }

  if (!fullName || !hospital) {
    return res.status(400).json({
      error: "Name and hospital are required."
    });
  }

  const existing = db.prepare(
    "SELECT id FROM users WHERE email = ?"
  ).get(email);

  if (existing) {
    return res.status(409).json({
      error: "An account with this email already exists."
    });
  }

  const passwordHash = await bcrypt.hash(password, 12);

  const result = db.prepare(`
    INSERT INTO users (
      full_name, email, password_hash, role,
      hospital, department, specialization, phone
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    fullName,
    email,
    passwordHash,
    role,
    hospital,
    department,
    specialization,
    phone
  );

  const user = db.prepare(
    "SELECT * FROM users WHERE id = ?"
  ).get(result.lastInsertRowid);

  res.status(201).json({
    message: "Registration successful.",
    token: issueToken(user),
    user: publicUser(user)
  });
}));

// Login
router.post("/auth/login", asyncRoute(async (req, res) => {
  const email = sanitizeString(req.body.email, 254).toLowerCase();
  const password = String(req.body.password || "");

  if (!email || !password) {
    return res.status(400).json({
      error: "Email and password are required."
    });
  }

  const user = db.prepare(
    "SELECT * FROM users WHERE email = ?"
  ).get(email);

  if (!user || !(await bcrypt.compare(password, user.password_hash))) {
    return res.status(401).json({
      error: "Incorrect email or password."
    });
  }

  res.json({
    message: "Login successful.",
    token: issueToken(user),
    user: publicUser(user)
  });
}));

router.get("/auth/me", authenticate, (req, res) => {
  const user = currentUser(req);

  if (!user) {
    return res.status(401).json({ error: "Account not found." });
  }

  res.json({ user: publicUser(user) });
});

router.post("/auth/logout", authenticate, (_req, res) => {
  // JWTs are stateless; the frontend must discard its token.
  res.json({ message: "Logged out. Remove your local token." });
});

// Dashboard summary
router.get("/dashboard", authenticate, (req, res) => {
  const user = currentUser(req);

  const connections = db.prepare(`
    SELECT COUNT(*) AS count
    FROM connections
    WHERE status = 'APPROVED'
      AND (senior_id = ? OR intern_id = ?)
  `).get(user.id, user.id).count;

  const pending = db.prepare(`
    SELECT COUNT(*) AS count
    FROM connections
    WHERE status = 'PENDING'
      AND (senior_id = ? OR intern_id = ?)
  `).get(user.id, user.id).count;

  const tasks = db.prepare(`
    SELECT
      COUNT(*) AS total,
      SUM(CASE WHEN status = 'OPEN' THEN 1 ELSE 0 END) AS open,
      SUM(CASE WHEN status = 'IN_PROGRESS' THEN 1 ELSE 0 END) AS in_progress,
      SUM(CASE WHEN status = 'COMPLETED' THEN 1 ELSE 0 END) AS completed
    FROM tasks
    WHERE assigned_to = ? OR assigned_by = ?
  `).get(user.id, user.id);

  const cases = db.prepare(`
    SELECT COUNT(*) AS count
    FROM cases
    WHERE created_by = ? OR assigned_to = ?
  `).get(user.id, user.id).count;

  res.json({
    user: publicUser(user),
    connections,
    pendingConnections: pending,
    tasks: {
      total: tasks.total || 0,
      open: tasks.open || 0,
      in_progress: tasks.in_progress || 0,
      completed: tasks.completed || 0
    },
    cases
  });
});

// Find colleagues at the same hospital
router.get("/users/colleagues", authenticate, (req, res) => {
  const me = currentUser(req);

  const colleagues = db.prepare(`
    SELECT id, full_name, email, role, hospital,
           department, specialization
    FROM users
    WHERE id != ?
      AND lower(trim(hospital)) = lower(trim(?))
      AND role != ?
    ORDER BY full_name
  `).all(me.id, me.hospital, me.role);

  res.json({ users: colleagues });
});

// Compatibility endpoint for intern search
router.get("/users/interns", authenticate, authorize("SENIOR"), (req, res) => {
  const me = currentUser(req);

  const interns = db.prepare(`
    SELECT id, full_name, email, role, hospital,
           department, specialization
    FROM users
    WHERE role = 'INTERN'
      AND lower(trim(hospital)) = lower(trim(?))
      AND id != ?
    ORDER BY full_name
  `).all(me.hospital, me.id);

  res.json({ users: interns });
});

// Connection list for either role
router.get("/connections", authenticate, (req, res) => {
  const user = currentUser(req);

  const rows = db.prepare(`
    SELECT c.*,
      s.full_name AS senior_name,
      s.email AS senior_email,
      i.full_name AS intern_name,
      i.email AS intern_email
    FROM connections c
    JOIN users s ON s.id = c.senior_id
    JOIN users i ON i.id = c.intern_id
    WHERE c.senior_id = ? OR c.intern_id = ?
    ORDER BY c.created_at DESC
  `).all(user.id, user.id);

  res.json({ connections: rows });
});

// Senior requests connection with an intern
router.post("/connections/request", authenticate, authorize("SENIOR"), (req, res) => {
  const senior = currentUser(req);
  const internId = Number(req.body.intern_id);

  if (!Number.isInteger(internId) || internId <= 0) {
    return res.status(400).json({ error: "Valid intern_id is required." });
  }

  const intern = db.prepare(
    "SELECT * FROM users WHERE id = ? AND role = 'INTERN'"
  ).get(internId);

  if (!intern) {
    return res.status(404).json({ error: "Intern not found." });
  }

  if (!sameHospital(senior, intern)) {
    return res.status(403).json({
      error: "You can connect only with interns at your hospital."
    });
  }

  const existing = db.prepare(`
    SELECT *
    FROM connections
    WHERE senior_id = ? AND intern_id = ?
  `).get(senior.id, intern.id);

  if (existing && ["PENDING", "APPROVED"].includes(existing.status)) {
    return res.status(409).json({
      error: "A pending or approved connection already exists."
    });
  }

  let connectionId;

  if (existing) {
    db.prepare(`
      UPDATE connections
      SET status = 'PENDING',
          requested_by = ?,
          updated_at = datetime('now')
      WHERE id = ?
    `).run(senior.id, existing.id);

    connectionId = existing.id;
  } else {
    const result = db.prepare(`
      INSERT INTO connections (
        senior_id, intern_id, status, requested_by
      )
      VALUES (?, ?, 'PENDING', ?)
    `).run(senior.id, intern.id, senior.id);

    connectionId = result.lastInsertRowid;
  }

  createNotification(
    intern.id,
    "CONNECTION",
    "Connection request",
    `${senior.full_name} has requested to connect with you.`,
    { connection_id: connectionId }
  );

  res.status(201).json({
    message: "Connection request sent.",
    connection_id: connectionId
  });
});

// Intern approves or rejects a request
router.patch("/connections/:id", authenticate, authorize("INTERN"), (req, res) => {
  const intern = currentUser(req);
  const connectionId = Number(req.params.id);
  const status = String(req.body.status || "").toUpperCase();

  if (!["APPROVED", "REJECTED"].includes(status)) {
    return res.status(400).json({
      error: "Status must be APPROVED or REJECTED."
    });
  }

  const connection = db.prepare(`
    SELECT *
    FROM connections
    WHERE id = ? AND intern_id = ? AND status = 'PENDING'
  `).get(connectionId, intern.id);

  if (!connection) {
    return res.status(404).json({
      error: "Pending connection request not found."
    });
  }

  const senior = db.prepare(
    "SELECT * FROM users WHERE id = ?"
  ).get(connection.senior_id);

  if (!sameHospital(senior, intern)) {
    return res.status(403).json({
      error: "These users do not belong to the same hospital."
    });
  }

  db.prepare(`
    UPDATE connections
    SET status = ?, updated_at = datetime('now')
    WHERE id = ?
  `).run(status, connectionId);

  createNotification(
    senior.id,
    "CONNECTION",
    `Connection ${status.toLowerCase()}`,
    `${intern.full_name} ${status.toLowerCase()} your request.`,
    { connection_id: connectionId }
  );

  res.json({
    message: `Connection ${status.toLowerCase()}.`,
    connection_id: connectionId,
    status
  });
});

// Create task (senior assigns task to connected intern)
router.post("/tasks", authenticate, authorize("SENIOR"), (req, res) => {
  const senior = currentUser(req);
  const assignedTo = Number(req.body.assigned_to);
  const title = sanitizeString(req.body.title, 200);
  const description = sanitizeString(req.body.description, 5000);
  const dueAt = req.body.due_at
    ? sanitizeString(req.body.due_at, 50)
    : null;

  if (!Number.isInteger(assignedTo) || !title) {
    return res.status(400).json({
      error: "A valid assigned_to and task title are required."
    });
  }

  const intern = db.prepare(
    "SELECT * FROM users WHERE id = ? AND role = 'INTERN'"
  ).get(assignedTo);

  if (!intern || !sameHospital(senior, intern)) {
    return res.status(403).json({
      error: "The intern must belong to your hospital."
    });
  }

  const connection = approvedConnection(senior.id, intern.id);

  if (!connection) {
    return res.status(403).json({
      error: "An approved connection is required before assigning tasks."
    });
  }

  const result = db.prepare(`
    INSERT INTO tasks (
      connection_id, assigned_by, assigned_to,
      title, description, due_at
    )
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(
    connection.id,
    senior.id,
    intern.id,
    title,
    description,
    dueAt
  );

  createNotification(
    intern.id,
    "TASK",
    "New task assigned",
    `Your senior assigned: ${title}`,
    { task_id: result.lastInsertRowid }
  );

  res.status(201).json({
    message: "Task created.",
    task_id: result.lastInsertRowid
  });
});

// List tasks for the logged-in user
router.get("/tasks", authenticate, (req, res) => {
  const user = currentUser(req);

  const tasks = db.prepare(`
    SELECT t.*,
      a.full_name AS assigned_by_name,
      b.full_name AS assigned_to_name
    FROM tasks t
    JOIN users a ON a.id = t.assigned_by
    JOIN users b ON b.id = t.assigned_to
    WHERE t.assigned_to = ? OR t.assigned_by = ?
    ORDER BY t.created_at DESC
  `).all(user.id, user.id);

  res.json({ tasks });
});

// Update task status
router.patch("/tasks/:id", authenticate, (req, res) => {
  const user = currentUser(req);
  const taskId = Number(req.params.id);
  const status = String(req.body.status || "").toUpperCase();

  if (!["OPEN", "IN_PROGRESS", "COMPLETED", "CANCELLED"].includes(status)) {
    return res.status(400).json({ error: "Invalid task status." });
  }

  const task = db.prepare(
    "SELECT * FROM tasks WHERE id = ?"
  ).get(taskId);

  if (!task) {
    return res.status(404).json({ error: "Task not found." });
  }

  if (user.id !== task.assigned_to && user.id !== task.assigned_by) {
    return res.status(403).json({ error: "You cannot update this task." });
  }

  if (user.id === task.assigned_by && status !== "CANCELLED") {
    return res.status(403).json({
      error: "Only the assigned intern can change task progress."
    });
  }

  db.prepare(`
    UPDATE tasks
    SET status = ?, updated_at = datetime('now')
    WHERE id = ?
  `).run(status, taskId);

  if (user.id === task.assigned_to) {
    createNotification(
      task.assigned_by,
      "TASK",
      "Task status updated",
      `Task "${task.title}" is now ${status}.`,
      { task_id: taskId }
    );
  }

  res.json({ message: "Task updated.", status });
});

// Create case/work item
router.post("/cases", authenticate, (req, res) => {
  const user = currentUser(req);
  const title = sanitizeString(req.body.title, 200);
  const summary = sanitizeString(req.body.summary, 5000);
  const assignedTo = req.body.assigned_to
    ? Number(req.body.assigned_to)
    : null;

  if (!title) {
    return res.status(400).json({ error: "Case title is required." });
  }

  if (assignedTo !== null) {
    const assignee = db.prepare(
      "SELECT * FROM users WHERE id = ?"
    ).get(assignedTo);

    if (!assignee || !sameHospital(user, assignee)) {
      return res.status(403).json({
        error: "Assignee must belong to your hospital."
      });
    }

    if (user.role === "SENIOR" && assignee.role === "INTERN") {
      if (!approvedConnection(user.id, assignee.id)) {
        return res.status(403).json({
          error: "An approved connection is required."
        });
      }
    }
  }

  const result = db.prepare(`
    INSERT INTO cases (created_by, assigned_to, title, summary)
    VALUES (?, ?, ?, ?)
  `).run(user.id, assignedTo, title, summary);

  if (assignedTo && assignedTo !== user.id) {
    createNotification(
      assignedTo,
      "CASE",
      "Case assigned",
      `A case has been assigned to you: ${title}`,
      { case_id: result.lastInsertRowid }
    );
  }

  res.status(201).json({
    message: "Case created.",
    case_id: result.lastInsertRowid
  });
});

// List cases
router.get("/cases", authenticate, (req, res) => {
  const user = currentUser(req);

  const cases = db.prepare(`
    SELECT c.*,
      creator.full_name AS creator_name,
      assignee.full_name AS assignee_name
    FROM cases c
    JOIN users creator ON creator.id = c.created_by
    LEFT JOIN users assignee ON assignee.id = c.assigned_to
    WHERE c.created_by = ? OR c.assigned_to = ?
    ORDER BY c.created_at DESC
  `).all(user.id, user.id);

  res.json({ cases });
});

// Update case status
router.patch("/cases/:id", authenticate, (req, res) => {
  const user = currentUser(req);
  const caseId = Number(req.params.id);
  const status = String(req.body.status || "").toUpperCase();

  if (!["OPEN", "IN_PROGRESS", "CLOSED"].includes(status)) {
    return res.status(400).json({ error: "Invalid case status." });
  }

  const item = db.prepare(
    "SELECT * FROM cases WHERE id = ?"
  ).get(caseId);

  if (!item) {
    return res.status(404).json({ error: "Case not found." });
  }

  if (item.created_by !== user.id && item.assigned_to !== user.id) {
    return res.status(403).json({ error: "You cannot update this case." });
  }

  db.prepare(`
    UPDATE cases
    SET status = ?, updated_at = datetime('now')
    WHERE id = ?
  `).run(status, caseId);

  res.json({ message: "Case updated.", status });
});

// AI text helpers
router.post("/ai/analyze", authenticate, (req, res) => {
  res.json(analyzeInstruction(req.body.text));
});

router.post("/ai/organize-note", authenticate, (req, res) => {
  res.json(organizeClinicalNote(req.body.text));
});

router.post("/ai/handover", authenticate, (req, res) => {
  res.json(generateShiftHandover(req.body.text));
});

// Notifications list
router.get("/notifications", authenticate, (req, res) => {
  const notifications = db.prepare(`
    SELECT *
    FROM notifications
    WHERE user_id = ?
    ORDER BY created_at DESC
    LIMIT 100
  `).all(req.user.id).map(item => ({
    ...item,
    data: parseJson(item.data),
    is_read: Boolean(item.is_read)
  }));

  res.json({ notifications });
});

// Mark a notification as read
router.patch("/notifications/:id/read", authenticate, (req, res) => {
  const result = db.prepare(`
    UPDATE notifications
    SET is_read = 1
    WHERE id = ? AND user_id = ?
  `).run(Number(req.params.id), req.user.id);

  if (!result.changes) {
    return res.status(404).json({
      error: "Notification not found."
    });
  }

  res.json({ message: "Notification marked as read." });
});

// Unknown API endpoint
router.use((_req, res) => {
  res.status(404).json({ error: "API endpoint not found." });
});

module.exports = router;
