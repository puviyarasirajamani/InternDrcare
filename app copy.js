const API_BASE = "/api";

let currentUser = null;
let currentPage = "dashboard";
let websocket = null;


/* =====================================================
   TOKEN MANAGEMENT
===================================================== */

function getAccessToken() {
  return localStorage.getItem(
    "accessToken"
  );
}

function getRefreshToken() {
  return localStorage.getItem(
    "refreshToken"
  );
}

function saveSession(data) {
  localStorage.setItem(
    "accessToken",
    data.accessToken
  );

  localStorage.setItem(
    "refreshToken",
    data.refreshToken
  );

  localStorage.setItem(
    "user",
    JSON.stringify(
      data.user
    )
  );
}

function clearSession() {
  localStorage.removeItem(
    "accessToken"
  );

  localStorage.removeItem(
    "refreshToken"
  );

  localStorage.removeItem(
    "user"
  );
}


/* =====================================================
   API CLIENT
===================================================== */

async function api(
  endpoint,
  options = {},
  retry = true
) {
  const headers =
    options.headers || {};

  const token =
    getAccessToken();

  if (token) {
    headers.Authorization =
      `Bearer ${token}`;
  }

  const response =
    await fetch(
      API_BASE + endpoint,
      {
        ...options,
        headers
      }
    );

  if (
    response.status === 401 &&
    retry &&
    getRefreshToken()
  ) {
    const refreshed =
      await refreshSession();

    if (refreshed) {
      return api(
        endpoint,
        options,
        false
      );
    }
  }

  const data =
    await response
      .json()
      .catch(
        () => ({})
      );

  if (!response.ok) {
    throw new Error(
      data.error ||
      "Request failed."
    );
  }

  return data;
}

async function refreshSession() {
  try {
    const response =
      await fetch(
        API_BASE +
          "/auth/refresh",
        {
          method:
            "POST",

          headers: {
            "Content-Type":
              "application/json"
          },

          body:
            JSON.stringify({
              refreshToken:
                getRefreshToken()
            })
        }
      );

    if (!response.ok) {
      clearSession();
      window.location.href =
        "/";
      return false;
    }

    const data =
      await response.json();

    localStorage.setItem(
      "accessToken",
      data.accessToken
    );

    localStorage.setItem(
      "refreshToken",
      data.refreshToken
    );

    return true;
  } catch {
    clearSession();

    window.location.href =
      "/";

    return false;
  }
}


/* =====================================================
   AUTH PAGE
===================================================== */

function showMessage(
  text,
  type = "success"
) {
  const message =
    document.getElementById(
      "message"
    );

  if (!message) {
    return;
  }

  message.textContent =
    text;

  message.className =
    `message ${type}`;

  setTimeout(() => {
    message.className =
      "message hidden";
  }, 5000);
}

function initializeAuthPage() {
  const tabs =
    document.querySelectorAll(
      ".tab"
    );

  tabs.forEach(tab => {
    tab.addEventListener(
      "click",
      () => {
        document
          .querySelectorAll(
            ".tab"
          )
          .forEach(
            item =>
              item.classList.remove(
                "active"
              )
          );

        tab.classList.add(
          "active"
        );

        const isLogin =
          tab.dataset.tab ===
          "login";

        document
          .getElementById(
            "loginForm"
          )
          .classList.toggle(
            "hidden",
            !isLogin
          );

        document
          .getElementById(
            "registerForm"
          )
          .classList.toggle(
            "hidden",
            isLogin
          );
      }
    );
  });

  const loginForm =
    document.getElementById(
      "loginForm"
    );

  if (loginForm) {
    loginForm.addEventListener(
      "submit",
      async event => {
        event.preventDefault();

        try {
          const data =
            await api(
              "/auth/login",
              {
                method:
                  "POST",

                headers: {
                  "Content-Type":
                    "application/json"
                },

                body:
                  JSON.stringify({
                    email:
                      document.getElementById(
                        "loginEmail"
                      ).value,

                    password:
                      document.getElementById(
                        "loginPassword"
                      ).value
                  })
              }
            );

          saveSession(
            data
          );

          window.location.href =
            "/app.html";
        } catch (error) {
          showMessage(
            error.message,
            "error"
          );
        }
      }
    );
  }

  const registerForm =
    document.getElementById(
      "registerForm"
    );

  if (registerForm) {
    registerForm.addEventListener(
      "submit",
      async event => {
        event.preventDefault();

        try {
          const data =
            await api(
              "/auth/register",
              {
                method:
                  "POST",

                headers: {
                  "Content-Type":
                    "application/json"
                },

                body:
                  JSON.stringify({
                    fullName:
                      document.getElementById(
                        "registerFullName"
                      ).value,

                    email:
                      document.getElementById(
                        "registerEmail"
                      ).value,

                    password:
                      document.getElementById(
                        "registerPassword"
                      ).value,

                    role:
                      document.getElementById(
                        "registerRole"
                      ).value,

                    department:
                      document.getElementById(
                        "registerDepartment"
                      ).value,

                    specialization:
                      document.getElementById(
                        "registerSpecialization"
                      ).value
                  })
              }
            );

          saveSession(
            data
          );

          window.location.href =
            "/app.html";
        } catch (error) {
          showMessage(
            error.message,
            "error"
          );
        }
      }
    );
  }
}


/* =====================================================
   APPLICATION INITIALIZATION
===================================================== */

async function initializeApp() {
  try {
    const response =
      await api(
        "/auth/me"
      );

    currentUser =
      response.user;

    document.getElementById(
      "userInfo"
    ).innerHTML = `
      <strong>${escapeHtml(currentUser.full_name)}</strong>
      <br>
      <small>${currentUser.role === "SENIOR" ? "Senior Doctor" : "Intern Doctor"}</small>
      <br>
      <small>${escapeHtml(currentUser.department || "General")}</small>
    `;

    initializeNavigation();

    initializeLogout();

    initializeBrowserNotifications();

    connectWebSocket();

    await loadPage(
      "dashboard"
    );

    await updateNotificationBadge();
  } catch (error) {
    clearSession();

    window.location.href =
      "/";
  }
}


function initializeNavigation() {
  document
    .querySelectorAll(
      ".nav-item"
    )
    .forEach(button => {
      button.addEventListener(
        "click",
        async () => {
          await loadPage(
            button.dataset.page
          );
        }
      );
    });
}


function initializeLogout() {
  document
    .getElementById(
      "logoutButton"
    )
    .addEventListener(
      "click",
      async () => {
        try {
          await api(
            "/auth/logout",
            {
              method:
                "POST",

              headers: {
                "Content-Type":
                  "application/json"
              },

              body:
                JSON.stringify({
                  refreshToken:
                    getRefreshToken()
                })
            }
          );
        } catch {
        }

        clearSession();

        window.location.href =
          "/";
      }
    );
}


/* =====================================================
   WEBSOCKET
===================================================== */

function connectWebSocket() {
  const protocol =
    window.location.protocol ===
    "https:"
      ? "wss"
      : "ws";

  const token =
    getAccessToken();

  websocket =
    new WebSocket(
      `${protocol}://${window.location.host}/ws?token=${encodeURIComponent(token)}`
    );

  websocket.onmessage =
    async event => {
      const message =
        JSON.parse(
          event.data
        );

      if (
        message.type ===
        "NOTIFICATION"
      ) {
        await updateNotificationBadge();

        showBrowserNotification(
          message.notification
            .title,
          message.notification
            .message
        );

        if (
          currentPage ===
          "notifications"
        ) {
          await loadNotifications();
        }
      }
    };

  websocket.onclose =
    () => {
      setTimeout(
        () => {
          if (
            getAccessToken()
          ) {
            connectWebSocket();
          }
        },
        5000
      );
    };
}


/* =====================================================
   BROWSER NOTIFICATIONS
===================================================== */

function initializeBrowserNotifications() {
  const button =
    document.getElementById(
      "enableNotifications"
    );

  button.addEventListener(
    "click",
    async () => {
      if (
        !("Notification" in window)
      ) {
        alert(
          "Browser notifications are not supported."
        );

        return;
      }

      const permission =
        await Notification.requestPermission();

      alert(
        permission ===
          "granted"
          ? "Browser notifications enabled."
          : "Notification permission was not granted."
      );
    }
  );
}

function showBrowserNotification(
  title,
  body
) {
  if (
    "Notification" in window &&
    Notification.permission ===
      "granted"
  ) {
    new Notification(
      title,
      {
        body
      }
    );
  }
}


/* =====================================================
   PAGE LOADING
===================================================== */

async function loadPage(
  page
) {
  currentPage =
    page;

  document
    .querySelectorAll(
      ".nav-item"
    )
    .forEach(
      item =>
        item.classList.toggle(
          "active",
          item.dataset.page ===
            page
        )
    );

  const title =
    page.charAt(0)
      .toUpperCase() +
    page.slice(1);

  document.getElementById(
    "pageTitle"
  ).textContent =
    title;

  const content =
    document.getElementById(
      "content"
    );

  content.innerHTML =
    `<div class="card">Loading...</div>`;

  try {
    switch (page) {
      case "dashboard":
        await loadDashboard();
        break;

      case "connections":
        await loadConnections();
        break;

      case "cases":
        await loadCases();
        break;

      case "tasks":
        await loadTasks();
        break;

      case "reviews":
        await loadReviews();
        break;

      case "shifts":
        await loadShifts();
        break;

      case "ai":
        loadAI();
        break;

      case "notifications":
        await loadNotifications();
        break;

      default:
        content.innerHTML =
          "Page not found.";
    }
  } catch (error) {
    content.innerHTML = `
      <div class="card">
        <strong>Error:</strong>
        ${escapeHtml(error.message)}
      </div>
    `;
  }
}


/* =====================================================
   DASHBOARD
===================================================== */

async function loadDashboard() {
  const data =
    await api(
      "/dashboard"
    );

  const metrics =
    Object.entries(
      data.metrics
    )
      .map(
        ([key, value]) => `
          <div class="metric-card">
            <h3>${formatLabel(key)}</h3>
            <strong>${value}</strong>
          </div>
        `
      )
      .join("");

  let extra = "";

  if (
    data.role ===
    "SENIOR"
  ) {
    extra = `
      <div class="card">
        <div class="card-header">
          <h2>Intern Performance</h2>
        </div>

        <div class="item-list">
          ${
            data.internPerformance
              .map(
                intern => `
                  <div class="list-item">
                    <strong>${escapeHtml(intern.full_name)}</strong>
                    <p>
                      Completed:
                      ${intern.completed_tasks || 0}
                      /
                      ${intern.total_tasks || 0}
                      tasks
                    </p>
                  </div>
                `
              )
              .join("") ||
            "<p>No connected Intern Doctors yet.</p>"
          }
        </div>
      </div>
    `;
  }

  document.getElementById(
    "content"
  ).innerHTML = `
    <div class="metrics">
      ${metrics}
    </div>

    ${extra}
  `;
}


/* =====================================================
   CONNECTIONS
===================================================== */

async function loadConnections() {
  const content =
    document.getElementById(
      "content"
    );

  const data =
    await api(
      "/connections"
    );

  let discover =
    "";

  if (
    currentUser.role ===
    "SENIOR"
  ) {
    discover = `
      <div class="card">
        <div class="card-header">
          <h2>Discover Intern Doctors</h2>
          <button
            class="primary-button"
            id="loadInterns"
          >
            Find Interns
          </button>
        </div>

        <div
          id="internDiscovery"
        ></div>
      </div>
    `;
  }

  content.innerHTML = `
    ${discover}

    <div class="card">
      <h2>Your Connections</h2>

      <div class="item-list">
        ${
          data.connections
            .map(
              connection => `
                <div class="list-item">

                  <h3>
                    ${escapeHtml(connection.full_name)}
                  </h3>

                  <p>
                    ${escapeHtml(connection.email)}
                  </p>

                  <p>
                    Department:
                    ${escapeHtml(connection.department || "Not specified")}
                  </p>

                  <span class="status">
                    ${connection.status}
                  </span>

                  <div class="actions">
                    ${
                      currentUser.role === "INTERN" &&
                      connection.status === "PENDING"
                        ? `
                          <button
                            class="small-button success-button"
                            onclick="updateConnection(${connection.id}, 'APPROVED')"
                          >
                            Approve
                          </button>

                          <button
                            class="small-button danger-button"
                            onclick="updateConnection(${connection.id}, 'REJECTED')"
                          >
                            Reject
                          </button>
                        `
                        : ""
                    }

                    ${
                      connection.status === "APPROVED"
                        ? `
                          <button
                            class="small-button danger-button"
                            onclick="updateConnection(${connection.id}, 'TERMINATED')"
                          >
                            Terminate
                          </button>
                        `
                        : ""
                    }
                  </div>

                </div>
              `
            )
            .join("") ||
          "<p>No connections found.</p>"
        }
      </div>
    </div>
  `;

  const loadInterns =
    document.getElementById(
      "loadInterns"
    );

  if (loadInterns) {
    loadInterns.addEventListener(
      "click",
      loadInternDiscovery
    );
  }
}

async function loadInternDiscovery() {
  const data =
    await api(
      "/users/interns"
    );

  document.getElementById(
    "internDiscovery"
  ).innerHTML =
    data.interns
      .map(
        intern => `
          <div class="list-item">
            <strong>
              ${escapeHtml(intern.full_name)}
            </strong>

            <p>
              ${escapeHtml(intern.email)}
            </p>

            <button
              class="small-button success-button"
              onclick="sendConnectionRequest(${intern.id})"
            >
              Send Connection Request
            </button>
          </div>
        `
      )
      .join("");
}

async function sendConnectionRequest(
  internId
) {
  try {
    await api(
      "/connections/request",
      {
        method:
          "POST",

        headers: {
          "Content-Type":
            "application/json"
        },

        body:
          JSON.stringify({
            internId
          })
      }
    );

    alert(
      "Connection request sent."
    );

    await loadConnections();
  } catch (error) {
    alert(
      error.message
    );
  }
}

async function updateConnection(
  id,
  status
) {
  try {
    await api(
      `/connections/${id}`,
      {
        method:
          "PATCH",

        headers: {
          "Content-Type":
            "application/json"
        },

        body:
          JSON.stringify({
            status
          })
      }
    );

    await loadConnections();
  } catch (error) {
    alert(
      error.message
    );
  }
}


/* =====================================================
   CASES
===================================================== */

async function loadCases() {
  const data =
    await api(
      "/cases"
    );

  let createForm =
    "";

  if (
    currentUser.role ===
    "SENIOR"
  ) {
    const connections =
      await api(
        "/connections"
      );

    const approvedInterns =
      connections.connections.filter(
        connection =>
          connection.status ===
          "APPROVED"
      );

    createForm = `
      <div class="card">
        <h2>Create Medical Case</h2>

        <form
          id="caseForm"
          class="form-grid"
        >

          <div class="form-group">
            <label>Title</label>
            <input
              id="caseTitle"
              required
            >
          </div>

          <div class="form-group">
            <label>Category</label>
            <input
              id="caseCategory"
              value="General"
            >
          </div>

          <div class="form-group">
            <label>Priority</label>

            <select
              id="casePriority"
            >
              <option>CRITICAL</option>
              <option>HIGH</option>
              <option selected>MEDIUM</option>
              <option>LOW</option>
            </select>
          </div>

          <div class="form-group">
            <label>Assign Intern</label>

            <select
              id="caseIntern"
            >
              <option value="">
                Unassigned
              </option>

              ${
                approvedInterns
                  .map(
                    intern => `
                      <option value="${intern.intern_id}">
                        ${escapeHtml(intern.full_name)}
                      </option>
                    `
                  )
                  .join("")
              }
            </select>
          </div>

          <div
            class="form-group"
            style="grid-column: 1 / -1"
          >
            <label>Description</label>

            <textarea
              id="caseDescription"
              required
            ></textarea>
          </div>

          <button
            class="primary-button"
            type="submit"
          >
            Create Case
          </button>

        </form>
      </div>
    `;
  }

  document.getElementById(
    "content"
  ).innerHTML = `
    ${createForm}

    <div class="card">
      <h2>Medical Cases</h2>

      <div class="item-list">
        ${
          data.cases
            .map(
              medicalCase => `
                <div class="list-item">

                  <h3>
                    ${escapeHtml(medicalCase.title)}
                  </h3>

                  <p>
                    ${escapeHtml(medicalCase.description)}
                  </p>

                  <span
                    class="priority ${medicalCase.priority}"
                  >
                    ${medicalCase.priority}
                  </span>

                  <span class="status">
                    ${medicalCase.status}
                  </span>

                  <p>
                    Category:
                    ${escapeHtml(medicalCase.category)}
                  </p>

                  <p>
                    Assigned:
                    ${escapeHtml(
                      medicalCase.intern_name ||
                      medicalCase.senior_name ||
                      "Unassigned"
                    )}
                  </p>

                </div>
              `
            )
            .join("") ||
          "<p>No cases found.</p>"
        }
      </div>
    </div>
  `;

  const caseForm =
    document.getElementById(
      "caseForm"
    );

  if (caseForm) {
    caseForm.addEventListener(
      "submit",
      createCase
    );
  }
}

async function createCase(
  event
) {
  event.preventDefault();

  try {
    await api(
      "/cases",
      {
        method:
          "POST",

        headers: {
          "Content-Type":
            "application/json"
        },

        body:
          JSON.stringify({
            title:
              document.getElementById(
                "caseTitle"
              ).value,

            category:
              document.getElementById(
                "caseCategory"
              ).value,

            priority:
              document.getElementById(
                "casePriority"
              ).value,

            internId:
              document.getElementById(
                "caseIntern"
              ).value ||
              null,

            description:
              document.getElementById(
                "caseDescription"
              ).value
          })
      }
    );

    await loadCases();
  } catch (error) {
    alert(
      error.message
    );
  }
}


/* =====================================================
   TASKS
===================================================== */

async function loadTasks() {
  const data =
    await api(
      "/tasks"
    );

  let createForm =
    "";

  if (
    currentUser.role ===
    "SENIOR"
  ) {
    const connections =
      await api(
        "/connections"
      );

    const approved =
      connections.connections.filter(
        item =>
          item.status ===
          "APPROVED"
      );

    createForm = `
      <div class="card">
        <h2>Create Task</h2>

        <form
          id="taskForm"
          class="form-grid"
        >

          <div class="form-group">
            <label>Title</label>
            <input
              id="taskTitle"
              required
            >
          </div>

          <div class="form-group">
            <label>Intern</label>

            <select
              id="taskIntern"
              required
            >
              <option value="">
                Select Intern
              </option>

              ${
                approved
                  .map(
                    intern => `
                      <option value="${intern.intern_id}">
                        ${escapeHtml(intern.full_name)}
                      </option>
                    `
                  )
                  .join("")
              }
            </select>
          </div>

          <div class="form-group">
            <label>Priority</label>

            <select
              id="taskPriority"
            >
              <option>CRITICAL</option>
              <option>HIGH</option>
              <option selected>MEDIUM</option>
              <option>LOW</option>
            </select>
          </div>

          <div class="form-group">
            <label>Deadline</label>

            <input
              id="taskDeadline"
              type="datetime-local"
            >
          </div>

          <div
            class="form-group"
            style="grid-column: 1 / -1"
          >
            <label>Description</label>

            <textarea
              id="taskDescription"
              required
            ></textarea>
          </div>

          <div
            class="form-group"
            style="grid-column: 1 / -1"
          >
            <label>Requirements</label>

            <textarea
              id="taskRequirements"
            ></textarea>
          </div>

          <button
            class="primary-button"
            type="submit"
          >
            Create Task
          </button>

        </form>
      </div>
    `;
  }

  document.getElementById(
    "content"
  ).innerHTML = `
    ${createForm}

    <div class="card">
      <h2>Tasks</h2>

      <div class="item-list">

        ${
          data.tasks
            .map(
              task => `
                <div class="list-item">

                  <h3>
                    ${escapeHtml(task.title)}
                  </h3>

                  <p>
                    ${escapeHtml(task.description)}
                  </p>

                  <span
                    class="priority ${task.priority}"
                  >
                    ${task.priority}
                  </span>

                  <span class="status">
                    ${task.status}
                  </span>

                  ${
                    task.deadline
                      ? `
                        <p>
                          Deadline:
                          ${new Date(task.deadline).toLocaleString()}
                        </p>
                      `
                      : ""
                  }

                  <p>
                    ${
                      currentUser.role === "SENIOR"
                        ? `Assigned to: ${escapeHtml(task.intern_name || "Unassigned")}`
                        : `Supervisor: ${escapeHtml(task.senior_name)}`
                    }
                  </p>

                  <div class="actions">

                    ${
                      currentUser.role === "INTERN" &&
                      task.status === "NOT_STARTED"
                        ? `
                          <button
                            class="small-button"
                            onclick="updateTaskStatus(${task.id}, 'IN_PROGRESS')"
                          >
                            Start
                          </button>
                        `
                        : ""
                    }

                    ${
                      currentUser.role === "INTERN" &&
                      task.status === "IN_PROGRESS"
                        ? `
                          <button
                            class="small-button"
                            onclick="updateTaskStatus(${task.id}, 'AWAITING_REVIEW')"
                          >
                            Submit for Review
                          </button>

                          <button
                            class="small-button success-button"
                            onclick="requestReview(${task.id})"
                          >
                            Request Senior Review
                          </button>
                        `
                        : ""
                    }

                    <button
                      class="small-button"
                      onclick="showComments(${task.id})"
                    >
                      Comments
                    </button>

                  </div>

                </div>
              `
            )
            .join("") ||
          "<p>No tasks found.</p>"
        }

      </div>
    </div>

    <div
      id="commentsArea"
    ></div>
  `;

  const taskForm =
    document.getElementById(
      "taskForm"
    );

  if (taskForm) {
    taskForm.addEventListener(
      "submit",
      createTask
    );
  }
}

async function createTask(
  event
) {
  event.preventDefault();

  try {
    await api(
      "/tasks",
      {
        method:
          "POST",

        headers: {
          "Content-Type":
            "application/json"
        },

        body:
          JSON.stringify({
            title:
              document.getElementById(
                "taskTitle"
              ).value,

            internId:
              Number(
                document.getElementById(
                  "taskIntern"
                ).value
              ),

            priority:
              document.getElementById(
                "taskPriority"
              ).value,

            deadline:
              document.getElementById(
                "taskDeadline"
              ).value
                ? new Date(
                    document.getElementById(
                      "taskDeadline"
                    ).value
                  ).toISOString()
                : null,

            description:
              document.getElementById(
                "taskDescription"
              ).value,

            requirements:
              document.getElementById(
                "taskRequirements"
              ).value
          })
      }
    );

    await loadTasks();
  } catch (error) {
    alert(
      error.message
    );
  }
}

async function updateTaskStatus(
  taskId,
  status
) {
  try {
    await api(
      `/tasks/${taskId}`,
      {
        method:
          "PATCH",

        headers: {
          "Content-Type":
            "application/json"
        },

        body:
          JSON.stringify({
            status
          })
      }
    );

    await loadTasks();
  } catch (error) {
    alert(
      error.message
    );
  }
}

async function requestReview(
  taskId
) {
  const message =
    prompt(
      "Optional message for the Senior Doctor:"
    ) || "";

  try {
    await api(
      `/tasks/${taskId}/reviews`,
      {
        method:
          "POST",

        headers: {
          "Content-Type":
            "application/json"
        },

        body:
          JSON.stringify({
            message
          })
      }
    );

    alert(
      "Review request sent."
    );

    await loadTasks();
  } catch (error) {
    alert(
      error.message
    );
  }
}

async function showComments(
  taskId
) {
  const data =
    await api(
      `/tasks/${taskId}/comments`
    );

  document.getElementById(
    "commentsArea"
  ).innerHTML = `
    <div class="card">

      <h2>Task Comments</h2>

      <div class="item-list">

        ${
          data.comments
            .map(
              comment => `
                <div class="list-item">
                  <strong>
                    ${escapeHtml(comment.full_name)}
                  </strong>

                  <p>
                    ${escapeHtml(comment.content)}
                  </p>
                </div>
              `
            )
            .join("") ||
          "<p>No comments yet.</p>"
        }

      </div>

      <textarea
        id="newComment"
        placeholder="Write a comment..."
      ></textarea>

      <button
        class="primary-button"
        onclick="addComment(${taskId})"
      >
        Add Comment
      </button>

    </div>
  `;
}

async function addComment(
  taskId
) {
  const content =
    document.getElementById(
      "newComment"
    ).value;

  try {
    await api(
      `/tasks/${taskId}/comments`,
      {
        method:
          "POST",

        headers: {
          "Content-Type":
            "application/json"
        },

        body:
          JSON.stringify({
            content
          })
      }
    );

    await showComments(
      taskId
    );
  } catch (error) {
    alert(
      error.message
    );
  }
}


/* =====================================================
   REVIEWS
===================================================== */

async function loadReviews() {
  const data =
    await api(
      "/reviews"
    );

  document.getElementById(
    "content"
  ).innerHTML = `
    <div class="card">

      <h2>Review Requests</h2>

      <div class="item-list">

        ${
          data.reviews
            .map(
              review => `
                <div class="list-item">

                  <h3>
                    ${escapeHtml(review.task_title)}
                  </h3>

                  ${
                    review.requester_name
                      ? `<p>Requested by: ${escapeHtml(review.requester_name)}</p>`
                      : ""
                  }

                  <p>
                    ${escapeHtml(review.message || "")}
                  </p>

                  <span class="status">
                    ${review.status}
                  </span>

                  ${
                    currentUser.role === "SENIOR" &&
                    review.status === "PENDING"
                      ? `
                        <div class="actions">

                          <button
                            class="small-button success-button"
                            onclick="completeReview(${review.id}, 'APPROVED')"
                          >
                            Approve
                          </button>

                          <button
                            class="small-button"
                            onclick="completeReview(${review.id}, 'REVISION_REQUESTED')"
                          >
                            Request Revision
                          </button>

                          <button
                            class="small-button danger-button"
                            onclick="completeReview(${review.id}, 'REJECTED')"
                          >
                            Reject
                          </button>

                        </div>
                      `
                      : ""
                  }

                </div>
              `
            )
            .join("") ||
          "<p>No reviews found.</p>"
        }

      </div>

    </div>
  `;
}

async function completeReview(
  reviewId,
  status
) {
  const feedback =
    prompt(
      "Enter review feedback:"
    ) || "";

  try {
    await api(
      `/reviews/${reviewId}`,
      {
        method:
          "PATCH",

        headers: {
          "Content-Type":
            "application/json"
        },

        body:
          JSON.stringify({
            status,
            feedback
          })
      }
    );

    await loadReviews();
  } catch (error) {
    alert(
      error.message
    );
  }
}


/* =====================================================
   SHIFTS
===================================================== */

async function loadShifts() {
  const data =
    await api(
      "/shifts"
    );

  document.getElementById(
    "content"
  ).innerHTML = `
    <div class="card">

      <h2>Create Shift</h2>

      <form
        id="shiftForm"
        class="form-grid"
      >

        <div class="form-group">
          <label>Department</label>
          <input
            id="shiftDepartment"
            required
          >
        </div>

        <div class="form-group">
          <label>Start</label>
          <input
            id="shiftStart"
            type="datetime-local"
            required
          >
        </div>

        <div class="form-group">
          <label>End</label>
          <input
            id="shiftEnd"
            type="datetime-local"
            required
          >
        </div>

        <button
          class="primary-button"
          type="submit"
        >
          Create Shift
        </button>

      </form>

    </div>

    <div class="card">

      <h2>Shift History</h2>

      <div class="item-list">

        ${
          data.shifts
            .map(
              shift => `
                <div class="list-item">

                  <strong>
                    ${escapeHtml(shift.department)}
                  </strong>

                  <p>
                    ${new Date(shift.start_time).toLocaleString()}
                    →
                    ${new Date(shift.end_time).toLocaleString()}
                  </p>

                  <span class="status">
                    ${shift.status}
                  </span>

                  <div class="actions">

                    ${
                      shift.status === "SCHEDULED"
                        ? `
                          <button
                            class="small-button success-button"
                            onclick="updateShiftStatus(${shift.id}, 'ACTIVE')"
                          >
                            Start
                          </button>
                        `
                        : ""
                    }

                    ${
                      shift.status === "ACTIVE"
                        ? `
                          <button
                            class="small-button"
                            onclick="updateShiftStatus(${shift.id}, 'COMPLETED')"
                          >
                            Complete
                          </button>
                        `
                        : ""
                    }

                  </div>

                </div>
              `
            )
            .join("") ||
          "<p>No shifts found.</p>"
        }

      </div>

    </div>
  `;

  document
    .getElementById(
      "shiftForm"
    )
    .addEventListener(
      "submit",
      createShift
    );
}

async function createShift(
  event
) {
  event.preventDefault();

  try {
    await api(
      "/shifts",
      {
        method:
          "POST",

        headers: {
          "Content-Type":
            "application/json"
        },

        body:
          JSON.stringify({
            department:
              document.getElementById(
                "shiftDepartment"
              ).value,

            startTime:
              document.getElementById(
                "shiftStart"
              ).value,

            endTime:
              document.getElementById(
                "shiftEnd"
              ).value
          })
      }
    );

    await loadShifts();
  } catch (error) {
    alert(
      error.message
    );
  }
}

async function updateShiftStatus(
  shiftId,
  status
) {
  try {
    await api(
      `/shifts/${shiftId}/status`,
      {
        method:
          "PATCH",

        headers: {
          "Content-Type":
            "application/json"
        },

        body:
          JSON.stringify({
            status
          })
      }
    );

    await loadShifts();
  } catch (error) {
    alert(
      error.message
    );
  }
}


/* =====================================================
   AI ASSISTANT
===================================================== */

function loadAI() {
  document.getElementById(
    "content"
  ).innerHTML = `
    <div class="grid">

      <div class="card">

        <h2>AI Instruction → Task</h2>

        <textarea
          id="aiInstruction"
          placeholder="Example: Urgently review the patient's CBC and ECG results today, monitor fever and update the cardiology team."
        ></textarea>

        <button
          class="primary-button"
          onclick="analyzeInstruction()"
        >
          Analyze Instruction
        </button>

        <pre
          id="instructionResult"
        ></pre>

      </div>


      <div class="card">

        <h2>AI Clinical Note Organizer</h2>

        <textarea
          id="clinicalNote"
          placeholder="Paste an unstructured clinical note here..."
        ></textarea>

        <button
          class="primary-button"
          onclick="organizeNote()"
        >
          Organize Note
        </button>

        <pre
          id="noteResult"
        ></pre>

      </div>

    </div>


    <div class="card">

      <h2>AI Shift Handover</h2>

      <button
        class="primary-button"
        onclick="generateHandover()"
      >
        Generate Handover Report
      </button>

      <pre
        id="handoverResult"
      ></pre>

    </div>
  `;
}

async function analyzeInstruction() {
  try {
    const data =
      await api(
        "/ai/analyze-instruction",
        {
          method:
            "POST",

          headers: {
            "Content-Type":
              "application/json"
          },

          body:
            JSON.stringify({
              instruction:
                document.getElementById(
                  "aiInstruction"
                ).value
            })
        }
      );

    document.getElementById(
      "instructionResult"
    ).textContent =
      JSON.stringify(
        data,
        null,
        2
      );
  } catch (error) {
    alert(
      error.message
    );
  }
}

async function organizeNote() {
  try {
    const data =
      await api(
        "/ai/organize-note",
        {
          method:
            "POST",

          headers: {
            "Content-Type":
              "application/json"
          },

          body:
            JSON.stringify({
              note:
                document.getElementById(
                  "clinicalNote"
                ).value
            })
        }
      );

    document.getElementById(
      "noteResult"
    ).textContent =
      JSON.stringify(
        data,
        null,
        2
      );
  } catch (error) {
    alert(
      error.message
    );
  }
}

async function generateHandover() {
  try {
    const data =
      await api(
        "/ai/handover"
      );

    document.getElementById(
      "handoverResult"
    ).textContent =
      data.handover;
  } catch (error) {
    alert(
      error.message
    );
  }
}


/* =====================================================
   NOTIFICATIONS
===================================================== */

async function loadNotifications() {
  const data =
    await api(
      "/notifications"
    );

  document.getElementById(
    "content"
  ).innerHTML = `
    <div class="card">

      <div class="card-header">

        <h2>
          Notifications
        </h2>

        <button
          class="small-button"
          onclick="markAllNotificationsRead()"
        >
          Mark All Read
        </button>

      </div>

      <div class="item-list">

        ${
          data.notifications
            .map(
              notification => `
                <div
                  class="list-item ${notification.is_read ? "" : "notification-unread"}"
                >

                  <strong>
                    ${escapeHtml(notification.title)}
                  </strong>

                  <p>
                    ${escapeHtml(notification.message)}
                  </p>

                  <small>
                    ${new Date(notification.created_at).toLocaleString()}
                  </small>

                  ${
                    !notification.is_read
                      ? `
                        <div class="actions">

                          <button
                            class="small-button"
                            onclick="markNotificationRead(${notification.id})"
                          >
                            Mark Read
                          </button>

                        </div>
                      `
                      : ""
                  }

                </div>
              `
            )
            .join("") ||
          "<p>No notifications.</p>"
        }

      </div>

    </div>
  `;
}

async function updateNotificationBadge() {
  try {
    const data =
      await api(
        "/notifications"
      );

    const unread =
      data.notifications.filter(
        notification =>
          !notification.is_read
      ).length;

    document.getElementById(
      "notificationBadge"
    ).textContent =
      unread;
  } catch {
  }
}

async function markNotificationRead(
  id
) {
  await api(
    `/notifications/${id}/read`,
    {
      method:
        "PATCH"
    }
  );

  await loadNotifications();

  await updateNotificationBadge();
}

async function markAllNotificationsRead() {
  await api(
    "/notifications/read-all",
    {
      method:
        "PATCH"
    }
  );

  await loadNotifications();

  await updateNotificationBadge();
}


/* =====================================================
   UTILITIES
===================================================== */

function escapeHtml(value) {
  return String(
    value ?? ""
  )
    .replace(
      /&/g,
      "&amp;"
    )
    .replace(
      /</g,
      "&lt;"
    )
    .replace(
      />/g,
      "&gt;"
    )
    .replace(
      /"/g,
      "&quot;"
    )
    .replace(
      /'/g,
      "&#039;"
    );
}

function formatLabel(value) {
  return value
    .replace(
      /([A-Z])/g,
      " $1"
    )
    .replace(
      /^./,
      character =>
        character.toUpperCase()
    );
}


/* =====================================================
   APPLICATION START
===================================================== */

document.addEventListener(
  "DOMContentLoaded",
  () => {
    if (
      window.location.pathname ===
        "/" ||
      window.location.pathname.endsWith(
        "index.html"
      )
    ) {
      initializeAuthPage();
      return;
    }

    initializeApp();
  }
);