# Dynamic Quiz API Design (Node.js + Express)

Base URL: `http://localhost:4000/api/v1`

## 1) Routes

### Auth (JWT)
- `POST /auth/register`
- `POST /auth/login`

### Quiz CRUD
- `GET /quizzes` (public, supports `?category=Programming`)
- `GET /quizzes/:quizId` (public, player-safe payload)
- `POST /quizzes` (auth required)
- `PUT /quizzes/:quizId` (auth + owner)
- `DELETE /quizzes/:quizId` (auth + owner)

### Question CRUD
- `POST /quizzes/:quizId/questions` (auth + owner)
- `PUT /quizzes/:quizId/questions/:questionId` (auth + owner)
- `DELETE /quizzes/:quizId/questions/:questionId` (auth + owner)

### Submissions / Scores
- `POST /quizzes/:quizId/submissions` (auth required)

### User History
- `GET /users/me/history` (auth required)

## 2) Sample Requests / Responses

### Register
`POST /auth/register`
```json
{
  "name": "Alice",
  "email": "alice@example.com",
  "password": "password123"
}
```

Response:
```json
{
  "user": {
    "id": "6dd4fa36-5d1a-47ef-90a6-b6af80d47f59",
    "name": "Alice",
    "email": "alice@example.com"
  },
  "token": "eyJhbGciOi..."
}
```

### Create Quiz
`POST /quizzes` with `Authorization: Bearer <token>`
```json
{
  "title": "React Basics",
  "category": "Programming",
  "description": "Intro-level React quiz"
}
```

Response:
```json
{
  "id": "0f1a04dc-98eb-4d41-9d07-c5fc95f5ab72",
  "title": "React Basics",
  "category": "Programming",
  "description": "Intro-level React quiz",
  "questionCount": 0,
  "createdBy": "6dd4fa36-5d1a-47ef-90a6-b6af80d47f59",
  "createdAt": "2026-04-21T10:00:00.000Z",
  "updatedAt": "2026-04-21T10:00:00.000Z"
}
```

### Add Question
`POST /quizzes/:quizId/questions` with auth
```json
{
  "text": "What hook stores component state?",
  "options": ["useMemo", "useState", "useEffect", "useRef"],
  "correctAnswer": "useState"
}
```

### Submit Answers
`POST /quizzes/:quizId/submissions` with auth
```json
{
  "answers": {
    "q-js-1": "let",
    "q-js-2": "Type and value"
  }
}
```

Response:
```json
{
  "id": "87f7cefd-33d0-4acf-bec3-e9579f076851",
  "userId": "6dd4fa36-5d1a-47ef-90a6-b6af80d47f59",
  "quizId": "js-basics",
  "quizTitle": "JavaScript Basics",
  "scorePercent": 100,
  "correctCount": 2,
  "totalQuestions": 2,
  "breakdown": [
    {
      "questionId": "q-js-1",
      "submittedAnswer": "let",
      "correctAnswer": "let",
      "isCorrect": true
    }
  ],
  "submittedAt": "2026-04-21T10:05:00.000Z"
}
```

### Error response format
```json
{
  "message": "Validation failed.",
  "details": [
    {
      "type": "field",
      "path": "email",
      "msg": "Invalid value"
    }
  ]
}
```

## 3) Folder Structure
```text
server/
  index.js
  src/
    app.js
    config/
      config.js
    controllers/
      authController.js
      quizController.js
      submissionController.js
      historyController.js
    data/
      store.js
    errors/
      AppError.js
    middleware/
      auth.js
      validate.js
      errorHandlers.js
    routes/
      authRoutes.js
      quizRoutes.js
      userRoutes.js
      index.js
    utils/
      sanitize.js
```

## 4) Middleware Needed
- `requireAuth`: validates JWT and injects `req.user`.
- `validate`: central validation result handling from `express-validator`.
- `notFoundHandler`: consistent 404 for unknown routes.
- `errorHandler`: centralized API error formatting and safe 500 handling.

## 5) Error Handling Best Practices
- Use a custom `AppError` with explicit status codes.
- Validate all input on route boundaries.
- Return consistent JSON error shape across endpoints.
- Never leak internal stack traces to clients.
- Log server-side 500 errors only; keep client messages generic.
- Enforce ownership checks (`quiz.createdBy === req.user.id`) for mutating resources.

## 6) Production Scalability Notes
- Replace in-memory `store.js` with PostgreSQL + Prisma/TypeORM.
- Add refresh-token rotation and token revocation strategy.
- Add rate limiting, API versioning policies, and structured logs.
- Add background jobs for analytics, leaderboards, and notifications.
