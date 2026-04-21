export const sanitizeQuizForList = (quiz) => ({
  id: quiz.id,
  title: quiz.title,
  category: quiz.category,
  description: quiz.description,
  questionCount: quiz.questions.length,
  createdBy: quiz.createdBy,
  createdAt: quiz.createdAt,
  updatedAt: quiz.updatedAt,
});

export const sanitizeQuizForPlayer = (quiz) => ({
  ...sanitizeQuizForList(quiz),
  questions: quiz.questions.map((question) => ({
    id: question.id,
    text: question.text,
    options: question.options,
  })),
});
