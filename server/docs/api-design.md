# Quiz API v1 Design

Base URL: `/api/v1`

## Authentication

- `POST /auth/register`
- `POST /auth/login`
- `POST /auth/google`
- `GET /auth/me` (JWT)

## Quizzes

- `GET /quizzes?category=<name>`
- `GET /quizzes/:quizId`
- `POST /quizzes` (JWT)
- `PUT /quizzes/:quizId` (JWT, owner)
- `DELETE /quizzes/:quizId` (JWT, owner)

## Questions

- `GET /quizzes/:quizId/questions`
  - Public users receive sanitized questions.
  - Quiz owners receive editable question payload.
- `POST /quizzes/:quizId/questions` (JWT, owner)
- `PUT /quizzes/:quizId/questions/:questionId` (JWT, owner)
- `DELETE /quizzes/:quizId/questions/:questionId` (JWT, owner)

## Submissions

- `POST /quizzes/:quizId/submissions` (JWT)
  - Accepts `answers` as map (`{questionId: option}`) or list (`[{questionId, selectedOption}]`).
  - Persists score and breakdown in attempts.

## User Progress

- `GET /users/me/history` (JWT)
  - No query: full list.
  - With `page` and `limit`: paginated response.
- `GET /users/me/dashboard` (JWT)
- `GET /attempts/:attemptId` (JWT, owner)

## Error Response Shape

```json
{
  "success": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Validation failed.",
    "requestId": "uuid",
    "details": []
  }
}
```

## Middleware

- `requireAuth` JWT verification
- `validate` request validation (`express-validator`)
- `assignRequestId` request correlation id (`X-Request-Id`)
- `errorHandler` centralized error response
