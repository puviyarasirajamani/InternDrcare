
const API = "/api";
const TOKEN_KEY = "interndrcare_token";

let currentUser = null;
let currentPage = "dashboard";

const content = document.getElementById("appContent");
const token = () => localStorage.getItem(TOKEN_KEY);

async function api(path, options = {}) {
  const headers = {
    Authorization: "Bearer " + token(),
    ...(options.body ? { "Content-Type": "application/json" } : {}),
    ...(options.headers || {})
  };

  const response = await fetch(API + path, {
    ...options,
    headers
  });

  const data = await response.json().catch(() => ({}));

  if (response.status === 401) {
    localStorage.removeItem(TOKEN_KEY);
    window.location.href = "/";
    throw new Error("Please log in again.");
  }

  if (!response.ok) {
    throw new Error(data.error || "Request failed.");
  }

  return data;
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, character => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  })[character]);
}

function messageHtml(text, error = false) {
  return `<p class="message ${error ? "error" : "success"}">${escapeHtml(text)}</p>`;
}

function showError(error) {
  const box = document.getElementById("pageMessage");
  if (box) {
    box.innerHTML = messageHtml(error.message || "Something went wrong.", true);
  } else {
    content.insertAdjacentHTML(
      "afterbegin",
      messageHtml(error.message || "Something went wrong.", true)
    );
  }
}

function pageHeader(title, description = "") {
  return `
    <div class="page-heading">
      <div>
        <p class="eyebrow">INTERNDRCARE WORKSPACE</p>
        <h1>${escapeHtml(title)}</h1>
        <p class="muted">${escapeHtml(description)}</p>
      </div>
    </div>
    <div id="pageMessage"></div>
  `;
}

function card(title, body) {
  return `<section class="panel"><h2>${escapeHtml(title)}</h2>${body}</section>`;
}

function emptyState(text) {
  return `<p class="empty-state">${escapeHtml(text)}</p>`;
}

function statusBadge(status) {
  return `<span class="status-badge">${escapeHtml(
    String(status || "").replaceAll("_", " ")
  )}</span>`;
}

function setPageActive(page) {
  currentPage = page;
  document.querySelectorAll(".nav-button").forEach(button => {
    button.classList.toggle("active", button.dataset.page === page);
  });
}

async function renderPage(page) {
  setPageActive(page);
  content.innerHTML = `<p class="muted">Loading...</p>`;

  try {
    if (page === "dashboard") await renderDashboard();
    else if (page === "connections") await renderConnections();
    else if (page === "tasks") await renderTasks();
    else if (page === "cases") await renderCases();
    else if (page === "ai") renderAI();
    else if (page === "notifications") await renderNotifications();
  } catch (error) {
    content.innerHTML = pageHeader("Something went wrong");
    showError(error);
  }
}

async function renderDashboard() {
  const data = await api("/dashboard");
  const tasks = data.tasks || {};

  content.innerHTML = pageHeader(
    "Dashboard",
    `Welcome, ${currentUser.full_name}. Your hospital workspace at ${currentUser.hospital}.`
  ) + `
    <div class="stats-grid">
      <div class="stat-card"><span>Approved connections</span><strong>${data.connections || 0}</strong></div>
      <div class="stat-card"><span>Pending requests</span><strong>${data.pendingConnections || 0}</strong></div>
      <div class="stat-card"><span>Total tasks</span><strong>${tasks.total || 0}</strong></div>
      <div class="stat-card"><span>Open cases</span><strong>${data.cases || 0}</strong></div>
    </div>
    ${card("Task overview", `
      <div class="overview-row">
        <span>Open: <strong>${tasks.open || 0}</strong></span>
        <span>In progress: <strong>${tasks.in_progress || 0}</strong></span>
        <span>Completed: <strong>${tasks.completed || 0}</strong></span>
      </div>
      <button class="primary-button" data-go="tasks">View tasks</button>
    `)}
    ${card("Getting started", `
      <ol class="steps-list">
        <li>Confirm that your hospital name is entered consistently.</li>
        <li>Find colleagues using the Connections page.</li>
        <li>Approve a connection before using task assignment.</li>
        <li>Use only fictional information while testing.</li>
      </ol>
    `)}
  `;

  content.querySelector("[data-go='tasks']").addEventListener("click", () => {
    renderPage("tasks");
  });
}

async function renderConnections() {
  const [connectionData, colleagueData] = await Promise.all([
    api("/connections"),
    api("/users/colleagues")
  ]);

  const connections = connectionData.connections || [];
  const colleagues = colleagueData.users || [];

  let html = pageHeader(
    "Connections",
    "Connect with colleagues at your hospital. Interns approve or reject requests."
  );

  if (currentUser.role === "SENIOR") {
    html += card("Find interns", colleagues.length ? `
      <div class="form-grid">
        <label for="colleagueSelect">Intern</label>
        <select id="colleagueSelect">
          ${colleagues.filter(user => user.role === "INTERN").map(user => `
            <option value="${user.id}">
              ${escapeHtml(user.full_name)} — ${escapeHtml(user.department || "Department not set")}
            </option>
          `).join("")}
        </select>
        <button class="primary-button" id="sendConnection">Send request</button>
      </div>
    ` : emptyState("No interns from your hospital have registered yet."));
  }

  html += card("Your connections", connections.length ? `
    <div class="table-wrap"><table>
      <thead><tr><th>Colleague</th><th>Role</th><th>Status</th><th>Action</th></tr></thead>
      <tbody>
        ${connections.map(connection => {
          const isSenior = currentUser.id === connection.senior_id;
          const colleague = isSenior
            ? connection.intern_name
            : connection.senior_name;
          const role = isSenior ? "Intern" : "Senior Doctor";
          const canRespond =
            currentUser.role === "INTERN" &&
            connection.intern_id === currentUser.id &&
            connection.status === "PENDING";

          return `<tr>
            <td>${escapeHtml(colleague)}</td>
            <td>${role}</td>
            <td>${statusBadge(connection.status)}</td>
            <td>${canRespond ? `
              <button class="small-button approve" data-connection="${connection.id}" data-status="APPROVED">Approve</button>
              <button class="small-button reject" data-connection="${connection.id}" data-status="REJECTED">Reject</button>
            ` : "—"}</td>
          </tr>`;
        }).join("")}
      </tbody>
    </table></div>
  ` : emptyState("No connection requests yet."));

  content.innerHTML = html;

  const sendButton = document.getElementById("sendConnection");

  if (sendButton) {
    sendButton.addEventListener("click", async () => {
      const internId = Number(document.getElementById("colleagueSelect").value);

      if (!internId) return showError(new Error("Select an intern first."));

      try {
        await api("/connections/request", {
          method: "POST",
          body: JSON.stringify({ intern_id: internId })
        });
        await renderConnections();
      } catch (error) {
        showError(error);
      }
    });
  }

  content.querySelectorAll("[data-connection]").forEach(button => {
    button.addEventListener("click", async () => {
      try {
        await api(`/connections/${button.dataset.connection}`, {
          method: "PATCH",
          body: JSON.stringify({ status: button.dataset.status })
        });
        await renderConnections();
      } catch (error) {
        showError(error);
      }
    });
  });
}

async function renderTasks() {
  const data = await api("/tasks");
  const tasks = data.tasks || [];

  let html = pageHeader("Tasks", "View assigned work and update task progress.");

  if (currentUser.role === "SENIOR") {
    const connectionData = await api("/connections");
    const approved = (connectionData.connections || []).filter(
      item => item.status === "APPROVED"
    );

    html += card("Assign a task", approved.length ? `
      <form id="taskForm" class="stack-form">
        <label for="taskIntern">Connected intern</label>
        <select id="taskIntern" required>
          ${approved.map(item => `
            <option value="${item.intern_id}">${escapeHtml(item.intern_name)}</option>
          `).join("")}
        </select>
        <label for="taskTitle">Task title</label>
        <input id="taskTitle" maxlength="200" required>
        <label for="taskDescription">Description</label>
        <textarea id="taskDescription" maxlength="5000" rows="3"></textarea>
        <label for="taskDue">Due date (optional)</label>
        <input id="taskDue" type="datetime-local">
        <button class="primary-button" type="submit">Create task</button>
      </form>
    ` : emptyState("You need an approved intern connection before assigning tasks."));
  }

  html += card("Task list", tasks.length ? `
    <div class="table-wrap"><table>
      <thead><tr><th>Task</th><th>Assigned by</th><th>Assigned to</th><th>Status</th><th>Update</th></tr></thead>
      <tbody>
        ${tasks.map(task => `
          <tr>
            <td><strong>${escapeHtml(task.title)}</strong><br><span class="muted small">${escapeHtml(task.description || "")}</span></td>
            <td>${escapeHtml(task.assigned_by_name)}</td>
            <td>${escapeHtml(task.assigned_to_name)}</td>
            <td>${statusBadge(task.status)}</td>
            <td>${task.assigned_to === currentUser.id ? `
              <select data-task-status="${task.id}">
                ${["OPEN", "IN_PROGRESS", "COMPLETED"].map(status => `
                  <option value="${status}" ${task.status === status ? "selected" : ""}>${status.replaceAll("_", " ")}</option>
                `).join("")}
              </select>
            ` : "—"}</td>
          </tr>
        `).join("")}
      </tbody>
    </table></div>
  ` : emptyState("No tasks yet."));

  content.innerHTML = html;

  const form = document.getElementById("taskForm");

  if (form) {
    form.addEventListener("submit", async event => {
      event.preventDefault();

      const dueValue = document.getElementById("taskDue").value;

      try {
        await api("/tasks", {
          method: "POST",
          body: JSON.stringify({
            assigned_to: Number(document.getElementById("taskIntern").value),
            title: document.getElementById("taskTitle").value,
            description: document.getElementById("taskDescription").value,
            due_at: dueValue || null
          })
        });
        await renderTasks();
      } catch (error) {
        showError(error);
      }
    });
  }

  content.querySelectorAll("[data-task-status]").forEach(select => {
    select.addEventListener("change", async () => {
      try {
        await api(`/tasks/${select.dataset.taskStatus}`, {
          method: "PATCH",
          body: JSON.stringify({ status: select.value })
        });
        await renderTasks();
      } catch (error) {
        showError(error);
      }
    });
  });
}

async function renderCases() {
  const data = await api("/cases");
  const cases = data.cases || [];

  content.innerHTML = pageHeader("Cases", "Track general work items. Do not store identifiable patient data.") +
    card("Create a work item", `
      <form id="caseForm" class="stack-form">
        <label for="caseTitle">Title</label>
        <input id="caseTitle" maxlength="200" required>
        <label for="caseSummary">Summary (fictional or non-identifying only)</label>
        <textarea id="caseSummary" maxlength="5000" rows="3"></textarea>
        <button class="primary-button" type="submit">Create case</button>
      </form>
    `) +
    card("Your cases", cases.length ? `
      <div class="table-wrap"><table>
        <thead><tr><th>Title</th><th>Created by</th><th>Assigned to</th><th>Status</th><th>Update</th></tr></thead>
        <tbody>
          ${cases.map(item => `
            <tr>
              <td>${escapeHtml(item.title)}<br><span class="muted small">${escapeHtml(item.summary || "")}</span></td>
              <td>${escapeHtml(item.creator_name)}</td>
              <td>${escapeHtml(item.assignee_name || "Unassigned")}</td>
              <td>${statusBadge(item.status)}</td>
              <td>
                <select data-case-status="${item.id}">
                  ${["OPEN", "IN_PROGRESS", "CLOSED"].map(status => `
                    <option value="${status}" ${item.status === status ? "selected" : ""}>${status.replaceAll("_", " ")}</option>
                  `).join("")}
                </select>
              </td>
            </tr>
          `).join("")}
        </tbody>
      </table></div>
    ` : emptyState("No cases created yet."));

  document.getElementById("caseForm").addEventListener("submit", async event => {
    event.preventDefault();

    try {
      await api("/cases", {
        method: "POST",
        body: JSON.stringify({
          title: document.getElementById("caseTitle").value,
          summary: document.getElementById("caseSummary").value
        })
      });
      await renderCases();
    } catch (error) {
      showError(error);
    }
  });

  content.querySelectorAll("[data-case-status]").forEach(select => {
    select.addEventListener("change", async () => {
      try {
        await api(`/cases/${select.dataset.caseStatus}`, {
          method: "PATCH",
          body: JSON.stringify({ status: select.value })
        });
        await renderCases();
      } catch (error) {
        showError(error);
      }
    });
  });
}

function renderAI() {
  content.innerHTML = pageHeader(
    "AI Helpers",
    "Simple text organization for demonstration. Review all outputs before use."
  ) + card("Choose a helper", `
    <label for="aiMode">Tool</label>
    <select id="aiMode">
      <option value="analyze">Break instruction into tasks</option>
      <option value="organize-note">Organize note text</option>
      <option value="handover">Shift handover checklist</option>
    </select>
    <label for="aiText">Text to organize</label>
    <textarea id="aiText" rows="7" maxlength="5000" placeholder="Enter fictional, non-identifying text..."></textarea>
    <button id="runAI" class="primary-button">Organize text</button>
    <pre id="aiResult" class="result-box" hidden></pre>
    <p class="small muted">This helper does not diagnose, recommend treatment, or validate clinical correctness.</p>
  `);

  document.getElementById("runAI").addEventListener("click", async () => {
    const mode = document.getElementById("aiMode").value;
    const text = document.getElementById("aiText").value;
    const output = document.getElementById("aiResult");

    try {
      const result = await api("/ai/" + mode, {
        method: "POST",
        body: JSON.stringify({ text })
      });

      output.textContent = JSON.stringify(result, null, 2);
      output.hidden = false;
    } catch (error) {
      showError(error);
    }
  });
}

async function renderNotifications() {
  const data = await api("/notifications");
  const notifications = data.notifications || [];

  content.innerHTML = pageHeader("Notifications", "Updates about your connections and tasks.") +
    card("Recent notifications", notifications.length ? `
      <div class="notification-list">
        ${notifications.map(item => `
          <article class="notification-item ${item.is_read ? "" : "unread"}">
            <div class="notification-top">
              <strong>${escapeHtml(item.title)}</strong>
              ${item.is_read ? "" : '<span class="status-badge">NEW</span>'}
            </div>
            <p>${escapeHtml(item.message)}</p>
            <span class="muted small">${escapeHtml(item.created_at)}</span>
            ${item.is_read ? "" : `<button class="small-button" data-read="${item.id}">Mark as read</button>`}
          </article>
        `).join("")}
      </div>
    ` : emptyState("No notifications yet."));

  content.querySelectorAll("[data-read]").forEach(button => {
    button.addEventListener("click", async () => {
      try {
        await api(`/notifications/${button.dataset.read}/read`, {
          method: "PATCH",
          body: JSON.stringify({})
        });
        await renderNotifications();
      } catch (error) {
        showError(error);
      }
    });
  });
}

document.querySelectorAll(".nav-button").forEach(button => {
  button.addEventListener("click", () => renderPage(button.dataset.page));
});

document.getElementById("logoutButton").addEventListener("click", () => {
  localStorage.removeItem(TOKEN_KEY);
  window.location.href = "/";
});

async function startApp() {
  if (!token()) {
    window.location.href = "/";
    return;
  }

  try {
    const result = await api("/auth/me");
    currentUser = result.user;

    document.getElementById("userName").textContent = currentUser.full_name;
    document.getElementById("userRole").textContent =
      `${currentUser.role === "SENIOR" ? "Senior Doctor" : "Intern"} · ${currentUser.hospital}`;

    if (currentUser.role === "INTERN") {
      // Interns can review requests, but cannot send requests themselves.
      // The backend also enforces this permission.
    }

    await renderPage("dashboard");

    const socketUrl = new URL("/ws", window.location.href);
    socketUrl.protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    socketUrl.searchParams.set("token", token());

    const socket = new WebSocket(socketUrl);

    socket.addEventListener("message", event => {
      try {
        const data = JSON.parse(event.data);
        if (data.type === "NOTIFICATION" && currentPage === "notifications") {
          renderNotifications().catch(() => {});
        }
      } catch (_error) {
        // Ignore malformed socket messages.
      }
    });
  } catch (error) {
    content.innerHTML = pageHeader("Unable to load workspace");
    showError(error);
  }
}

startApp();
