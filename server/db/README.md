# PostgreSQL Schema Design - Quiz Application

## Table Structures (columns + types)

### `users`
- `id UUID PK`
- `full_name VARCHAR(120)`
- `email VARCHAR(255) UNIQUE`
- `password_hash TEXT`
- `created_at TIMESTAMPTZ`
- `updated_at TIMESTAMPTZ`

### `quizzes`
- `id UUID PK`
- `title VARCHAR(180)`
- `category VARCHAR(80)`
- `description TEXT`
- `is_published BOOLEAN`
- `created_by UUID FK -> users(id)`
- `created_at TIMESTAMPTZ`
- `updated_at TIMESTAMPTZ`

### `questions`
- `id UUID PK`
- `quiz_id UUID FK -> quizzes(id)`
- `question_text TEXT`
- `position INTEGER` (unique within quiz)
- `points INTEGER`
- `created_at TIMESTAMPTZ`
- `updated_at TIMESTAMPTZ`

### `choices`
- `id UUID PK`
- `question_id UUID FK -> questions(id)`
- `choice_text TEXT`
- `position INTEGER` (unique within question)
- `is_correct BOOLEAN`
- `created_at TIMESTAMPTZ`

### `attempts`
- `id UUID PK`
- `user_id UUID FK -> users(id)`
- `quiz_id UUID FK -> quizzes(id)`
- `started_at TIMESTAMPTZ`
- `submitted_at TIMESTAMPTZ`
- `score INTEGER`
- `max_score INTEGER`
- `percentage NUMERIC(5,2)`
- `status VARCHAR(20)` (`in_progress | submitted | timed_out`)

### `answers`
- `id UUID PK`
- `attempt_id UUID FK -> attempts(id)`
- `question_id UUID FK -> questions(id)`
- `selected_choice_id UUID FK -> choices(id)`
- `is_correct BOOLEAN`
- `awarded_points INTEGER`
- `answered_at TIMESTAMPTZ`
- Unique: `(attempt_id, question_id)`

## Keys and Relationship Design (ERD explanation)

- One `user` can create many `quizzes` (`users 1:N quizzes`).
- One `quiz` has many `questions` (`quizzes 1:N questions`).
- One `question` has many `choices` (`questions 1:N choices`).
- One `user` can have many `attempts` per quiz (`users 1:N attempts`, `quizzes 1:N attempts`).
- One `attempt` has many `answers` (`attempts 1:N answers`).
- Each `answer` references one `question` and optionally one selected `choice`.

This keeps data normalized:
- No repeated question/choice blobs in `attempts`.
- Quiz content remains in authoring tables (`quizzes/questions/choices`).
- User response data remains in transactional tables (`attempts/answers`).

## Sample Queries (join quizzes + results)

### 1) User quiz history with quiz metadata
```sql
SELECT
  a.id AS attempt_id,
  q.title AS quiz_title,
  q.category,
  a.score,
  a.max_score,
  a.percentage,
  a.submitted_at
FROM attempts a
JOIN quizzes q ON q.id = a.quiz_id
WHERE a.user_id = $1
ORDER BY a.submitted_at DESC;
```

### 2) Latest attempt per quiz for a user
```sql
SELECT DISTINCT ON (a.quiz_id)
  a.quiz_id,
  q.title,
  a.score,
  a.max_score,
  a.percentage,
  a.submitted_at
FROM attempts a
JOIN quizzes q ON q.id = a.quiz_id
WHERE a.user_id = $1
ORDER BY a.quiz_id, a.submitted_at DESC;
```

### 3) Detailed attempt review (question + selected choice + correctness)
```sql
SELECT
  qz.title AS quiz_title,
  qs.position AS question_no,
  qs.question_text,
  c.choice_text AS selected_choice,
  an.is_correct,
  an.awarded_points
FROM answers an
JOIN attempts atp ON atp.id = an.attempt_id
JOIN questions qs ON qs.id = an.question_id
JOIN quizzes qz ON qz.id = atp.quiz_id
LEFT JOIN choices c ON c.id = an.selected_choice_id
WHERE an.attempt_id = $1
ORDER BY qs.position;
```

### 4) Leaderboard for a quiz (best percentage per user)
```sql
SELECT
  u.id AS user_id,
  u.full_name,
  MAX(a.percentage) AS best_percentage
FROM attempts a
JOIN users u ON u.id = a.user_id
WHERE a.quiz_id = $1
  AND a.status = 'submitted'
GROUP BY u.id, u.full_name
ORDER BY best_percentage DESC, u.full_name ASC
LIMIT 20;
```

## Execution

Apply schema:
```bash
psql -d <database_name> -f server/db/schema.sql
```
