
# InternDrCare

InternDrCare is a student software project for organizing communication and supervised task workflows between senior doctors and interns at the same hospital.

## Features

- Account registration and login
- Senior Doctor and Intern roles
- Hospital-based colleague discovery
- Connection requests and intern approval/rejection
- Task assignment and progress tracking
- Work-item/case tracking
- Notifications
- Basic AI-style text organization helpers
- SQLite database persistence
- WebSocket notification delivery

## Technology stack

- Node.js
- Express
- SQLite using better-sqlite3
- HTML, CSS and JavaScript
- JSON Web Tokens
- WebSockets

## Requirements

- Node.js 20 or later
- npm

## Installation

1. Clone or download the repository.
2. Open the project folder in a terminal.
3. Install dependencies:

   ```bash
   npm install
   ```

4. Copy `.env.example` to `.env`.
5. Set a private, random `JWT_SECRET` in `.env`.
6. Start the application:

   ```bash
   npm start
   ```

7. Open `http://localhost:3000`.

Health check: `http://localhost:3000/health`

## Main project structure

```text
InternDrCare/
├── server.js
├── package.json
├── .env.example
├── .gitignore
├── README.md
├── public/
│   ├── index.html
│   ├── app.html
│   ├── app.js
│   ├── app copy.js
│   └── style.css
└── src/
    ├── database.js
    ├── middleware.js
    ├── routes.js
    ├── ai.js
    ├── notifications.js
    ├── notification.js
    ├── websocket.js
    └── webscoket.js
```

## Important limitations

This is a development baseline, not a production-ready hospital information system.

- The text helpers are not a trained medical AI model.
- Do not enter identifiable patient records or confidential clinical information.
- Real deployment requires security review, audit logging, access controls, backups, privacy compliance and clinical governance.
- Use HTTPS and secure token handling before deploying to a public server.
- The sample authentication implementation is intended for local development and needs further security hardening before real-world use.

## License

Choose a license before publishing this project for reuse.
