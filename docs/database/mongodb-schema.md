# MongoDB Schema Design - Quiz App

## Collections

### `users`

- `_id` ObjectId
- `name` String (required)
- `email` String (required, unique, lowercase)
- `passwordHash` String (nullable for social auth)
- `provider` String (`local`, `google`)
- `providerId` String (nullable)
- `role` String (`user`, `admin`)
- `createdAt` Date
- `updatedAt` Date

### `quizzes`

- `_id` ObjectId
- `title` String (required)
- `description` String
- `category` String
- `difficulty` String (`easy`, `medium`, `hard`)
- `createdBy` ObjectId -> `users._id`
- `isPublished` Boolean
- `questionCount` Number (denormalized, optional)
- `createdAt` Date
- `updatedAt` Date

### `questions`

- `_id` ObjectId
- `quizId` ObjectId -> `quizzes._id`
- `text` String (required)
- `type` String (`single_choice`)
- `choices` Array of:
  - `_id` String
  - `text` String
  - `isCorrect` Boolean
- `explanation` String
- `points` Number
- `order` Number
- `createdAt` Date
- `updatedAt` Date

### `attempts`

- `_id` ObjectId
- `userId` ObjectId -> `users._id`
- `quizId` ObjectId -> `quizzes._id`
- `quizTitle` String (snapshot)
- `scorePercent` Number
- `correctCount` Number
- `totalQuestions` Number
- `durationSec` Number
- `answers` Array of:
  - `questionId` ObjectId
  - `selectedChoiceId` String
  - `isCorrect` Boolean
- `submittedAt` Date
- `createdAt` Date
- `updatedAt` Date

## Relationships

- One user creates many quizzes.
- One quiz has many questions.
- One user has many attempts.
- One quiz has many attempts.
- One attempt has many answers (embedded).

## Example Documents

```json
{
  "_id": "6610a1000000000000000001",
  "name": "Jane Doe",
  "email": "jane@example.com",
  "passwordHash": "$2b$10$...",
  "provider": "local",
  "role": "user",
  "createdAt": "2026-04-21T10:00:00.000Z",
  "updatedAt": "2026-04-21T10:00:00.000Z"
}
```

```json
{
  "_id": "6610b2000000000000000001",
  "title": "JavaScript Fundamentals",
  "description": "Core JS concepts",
  "category": "Programming",
  "difficulty": "medium",
  "createdBy": "6610a1000000000000000001",
  "isPublished": true,
  "questionCount": 20,
  "createdAt": "2026-04-21T11:00:00.000Z",
  "updatedAt": "2026-04-21T11:00:00.000Z"
}
```

```json
{
  "_id": "6610d4000000000000000001",
  "userId": "6610a1000000000000000001",
  "quizId": "6610b2000000000000000001",
  "quizTitle": "JavaScript Fundamentals",
  "scorePercent": 85,
  "correctCount": 17,
  "totalQuestions": 20,
  "durationSec": 300,
  "answers": [
    {
      "questionId": "6610c3000000000000000001",
      "selectedChoiceId": "c1",
      "isCorrect": true
    }
  ],
  "submittedAt": "2026-04-21T11:30:00.000Z"
}
```

## Indexing Suggestions

- `users`
  - unique index: `{ email: 1 }`
  - compound index: `{ provider: 1, providerId: 1 }`
- `quizzes`
  - compound index: `{ category: 1, difficulty: 1, isPublished: 1 }`
  - compound index: `{ createdBy: 1, createdAt: -1 }`
- `questions`
  - compound index: `{ quizId: 1, order: 1 }`
- `attempts`
  - compound index: `{ userId: 1, submittedAt: -1 }`
  - compound index: `{ quizId: 1, submittedAt: -1 }`
  - compound index: `{ userId: 1, quizId: 1, submittedAt: -1 }`
