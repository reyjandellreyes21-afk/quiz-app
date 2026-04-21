import { useCallback, useEffect, useMemo, useRef, useState } from "react";

const API_URL = "http://localhost:4000/api/v1";
const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID || "";
const VIEWS = { DASHBOARD: "dashboard", BROWSE: "browse", QUIZ_INTRO: "quiz_intro", QUIZ: "quiz", RESULT: "result", HISTORY: "history", CREATE: "create" };

const buildEmptyQuestion = () => ({ text: "", options: ["", "", "", ""], correctOptionIndex: 0 });
const formatTime = (seconds) => `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;

const getStreakDays = (attempts) => {
  if (!attempts.length) return 0;
  const uniqueDays = [...new Set(attempts.map((a) => new Date(a.submittedAt).toISOString().slice(0, 10)))].sort().reverse();
  let streak = 0;
  const cursor = new Date();
  cursor.setHours(0, 0, 0, 0);
  for (const day of uniqueDays) {
    if (day !== cursor.toISOString().slice(0, 10)) break;
    streak += 1;
    cursor.setDate(cursor.getDate() - 1);
  }
  return streak;
};

function App() {
  const [authMode, setAuthMode] = useState("login");
  const [form, setForm] = useState({ name: "", email: "", password: "" });
  const [user, setUser] = useState(null);
  const [token, setToken] = useState(() => localStorage.getItem("quiz_token") || "");
  const [message, setMessage] = useState("");
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const [activeView, setActiveView] = useState(VIEWS.DASHBOARD);
  const [categories, setCategories] = useState([]);
  const [selectedCategory, setSelectedCategory] = useState("");
  const [quizzes, setQuizzes] = useState([]);
  const [selectedQuiz, setSelectedQuiz] = useState(null);
  const [activeQuiz, setActiveQuiz] = useState(null);

  const [answers, setAnswers] = useState({});
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [timedMode, setTimedMode] = useState(true);
  const [secondsLeft, setSecondsLeft] = useState(0);
  const [result, setResult] = useState(null);

  const [attempts, setAttempts] = useState([]);
  const [dashboard, setDashboard] = useState({ totalAttempts: 0, averageScore: 0, bestScore: 0, recentAttempts: [] });
  const [loading, setLoading] = useState(false);

  const [createState, setCreateState] = useState({ title: "", category: "", description: "", questions: [buildEmptyQuestion()] });
  const [createMessage, setCreateMessage] = useState("");

  const googleBtnRef = useRef(null);

  const submitQuiz = useCallback(async () => {
    if (!activeQuiz) return;
    const response = await fetch(`${API_URL}/quizzes/${activeQuiz.id}/submissions`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ answers }),
    });
    const data = await response.json();
    setResult(data);
    setActiveQuiz(null);
    setActiveView(VIEWS.RESULT);
  }, [activeQuiz, token, answers]);

  useEffect(() => {
    if (!token || user) return;
    fetch(`${API_URL}/auth/me`, { headers: { Authorization: `Bearer ${token}` } })
      .then((res) => (res.ok ? res.json() : Promise.reject()))
      .then((data) => setUser(data.user))
      .catch(() => {
        localStorage.removeItem("quiz_token");
        setToken("");
      });
  }, [token, user]);

  useEffect(() => {
    if (!user) return;
    const query = selectedCategory ? `?category=${encodeURIComponent(selectedCategory)}` : "";
    fetch(`${API_URL}/quizzes${query}`)
      .then((res) => res.json())
      .then((data) => {
        setQuizzes(data);
        setCategories([...new Set(data.map((q) => q.category))]);
      });
  }, [user, selectedCategory, result]);

  useEffect(() => {
    if (!user || !token) return;
    fetch(`${API_URL}/users/me/history`, { headers: { Authorization: `Bearer ${token}` } }).then((res) => res.json()).then(setAttempts);
    fetch(`${API_URL}/users/me/dashboard`, { headers: { Authorization: `Bearer ${token}` } }).then((res) => res.json()).then(setDashboard);
  }, [user, token, result]);

  useEffect(() => {
    if (!activeQuiz || !timedMode || secondsLeft <= 0) return;
    const timer = setTimeout(() => {
      setSecondsLeft((prev) => {
        if (prev <= 1) {
          submitQuiz();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearTimeout(timer);
  }, [activeQuiz, timedMode, secondsLeft, submitQuiz]);

  useEffect(() => {
    if (user || !GOOGLE_CLIENT_ID || !googleBtnRef.current) return;
    const initGoogle = () => {
      if (!window.google?.accounts?.id || !googleBtnRef.current) return;
      window.google.accounts.id.initialize({
        client_id: GOOGLE_CLIENT_ID,
        callback: async (response) => {
          const apiResponse = await fetch(`${API_URL}/auth/google`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ credential: response.credential }),
          });
          const data = await apiResponse.json();
          if (!apiResponse.ok) return setMessage(data.message || "Google login failed.");
          setUser(data.user);
          setToken(data.token);
          localStorage.setItem("quiz_token", data.token);
          setMessage("");
        },
      });
      googleBtnRef.current.innerHTML = "";
      window.google.accounts.id.renderButton(googleBtnRef.current, { theme: "outline", size: "large", shape: "pill", text: authMode === "signup" ? "signup_with" : "signin_with", width: 320 });
    };
    if (window.google?.accounts?.id) return initGoogle();
    const script = document.createElement("script");
    script.src = "https://accounts.google.com/gsi/client";
    script.async = true;
    script.defer = true;
    script.onload = initGoogle;
    document.body.appendChild(script);
  }, [authMode, user]);

  const progress = useMemo(() => {
    if (!activeQuiz) return 0;
    return Math.round((Object.keys(answers).length / activeQuiz.questions.length) * 100);
  }, [activeQuiz, answers]);

  const streakDays = useMemo(() => getStreakDays(attempts), [attempts]);
  const currentQuestion = activeQuiz?.questions[currentQuestionIndex];

  const handleAuth = async (event) => {
    event.preventDefault();
    setMessage("");
    try {
      const endpoint = authMode === "signup" ? "/auth/register" : "/auth/login";
      const response = await fetch(`${API_URL}${endpoint}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) });
      const data = await response.json();
      if (!response.ok) return setMessage(data.message || "Authentication failed.");
      setUser(data.user);
      setToken(data.token);
      localStorage.setItem("quiz_token", data.token);
      setForm({ name: "", email: "", password: "" });
    } catch {
      setMessage("Cannot reach server.");
    }
  };

  const startQuiz = async () => {
    if (!selectedQuiz) return;
    setLoading(true);
    const response = await fetch(`${API_URL}/quizzes/${selectedQuiz.id}`);
    const data = await response.json();
    setActiveQuiz(data);
    setAnswers({});
    setCurrentQuestionIndex(0);
    setSecondsLeft(data.questions.length * 30);
    setLoading(false);
    setActiveView(VIEWS.QUIZ);
  };

  const logout = () => {
    localStorage.removeItem("quiz_token");
    setToken("");
    setUser(null);
    setActiveQuiz(null);
    setResult(null);
    setSelectedQuiz(null);
  };

  const addQuestion = () => setCreateState((prev) => ({ ...prev, questions: [...prev.questions, buildEmptyQuestion()] }));
  const removeQuestion = (index) => setCreateState((prev) => ({ ...prev, questions: prev.questions.filter((_, idx) => idx !== index) }));
  const updateQuestionField = (index, key, value) => setCreateState((prev) => {
    const next = [...prev.questions];
    next[index] = { ...next[index], [key]: value };
    return { ...prev, questions: next };
  });
  const updateOption = (questionIndex, optionIndex, value) => setCreateState((prev) => {
    const next = [...prev.questions];
    const options = [...next[questionIndex].options];
    options[optionIndex] = value;
    next[questionIndex] = { ...next[questionIndex], options };
    return { ...prev, questions: next };
  });

  const handleCreateQuiz = async (event) => {
    event.preventDefault();
    setCreateMessage("");
    const hasInvalidQuestion = createState.questions.some((q) => !q.text.trim() || q.options.some((o) => !o.trim()));
    if (!createState.title.trim() || !createState.category.trim() || hasInvalidQuestion) return setCreateMessage("Complete title, category, and all question fields.");
    setLoading(true);
    try {
      const quizResponse = await fetch(`${API_URL}/quizzes`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ title: createState.title.trim(), category: createState.category.trim(), description: createState.description.trim() }),
      });
      const quizData = await quizResponse.json();
      if (!quizResponse.ok) return setCreateMessage(quizData.message || "Unable to create quiz.");
      for (const q of createState.questions) {
        await fetch(`${API_URL}/quizzes/${quizData.id}/questions`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
          body: JSON.stringify({ text: q.text.trim(), options: q.options.map((o) => o.trim()), correctAnswer: q.options[q.correctOptionIndex].trim() }),
        });
      }
      setCreateMessage("Quiz published successfully.");
      setCreateState({ title: "", category: "", description: "", questions: [buildEmptyQuestion()] });
      setActiveView(VIEWS.BROWSE);
    } catch {
      setCreateMessage("Unable to publish now.");
    } finally {
      setLoading(false);
    }
  };

  const renderNavButton = (id, label) => (
    <button
      type="button"
      onClick={() => {
        setActiveView(id);
        setMobileMenuOpen(false);
      }}
      className={`rounded-xl px-3 py-2 text-sm ${activeView === id ? "bg-indigo-500/15 text-indigo-300 ring-1 ring-indigo-400/30" : "text-slate-300 hover:bg-slate-800 hover:text-white"}`}
    >
      {label}
    </button>
  );

  if (!user) {
    return (
      <main className="app-container flex min-h-screen items-center">
        <form onSubmit={handleAuth} className="app-card mx-auto w-full max-w-md space-y-3">
          <div>
            <p className="inline-flex rounded-full border border-indigo-500/30 bg-indigo-500/10 px-3 py-1 text-xs text-indigo-300">Quiz SaaS</p>
            <h1 className="mt-2 text-3xl font-bold tracking-tight">Quiz.app</h1>
            <p className="mt-1 text-sm text-slate-400">Minimal, professional, dark-mode learning experience.</p>
          </div>
          {authMode === "signup" && <input className="input-base" placeholder="Full name" value={form.name} onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))} required />}
          <input className="input-base" type="email" placeholder="Email" value={form.email} onChange={(e) => setForm((prev) => ({ ...prev, email: e.target.value }))} required />
          <input className="input-base" type="password" placeholder="Password" value={form.password} onChange={(e) => setForm((prev) => ({ ...prev, password: e.target.value }))} required />
          {message && <p className="text-xs text-rose-400">{message}</p>}
          <button className="btn-primary w-full">{authMode === "signup" ? "Create account" : "Log in"}</button>
          <div className="flex items-center gap-2"><span className="h-px flex-1 bg-slate-700" /><span className="text-xs text-slate-500">or</span><span className="h-px flex-1 bg-slate-700" /></div>
          {GOOGLE_CLIENT_ID ? <div className="flex justify-center" ref={googleBtnRef} /> : <p className="text-xs text-slate-500">Set `VITE_GOOGLE_CLIENT_ID` for Google sign-in.</p>}
          <button type="button" onClick={() => setAuthMode((prev) => (prev === "signup" ? "login" : "signup"))} className="btn-ghost w-full">
            {authMode === "signup" ? "Have an account? Log in" : "New user? Create account"}
          </button>
        </form>
      </main>
    );
  }

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-50 border-b border-slate-800/80 bg-slate-950/80 backdrop-blur">
        <div className="app-container flex h-16 items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 rounded-xl bg-gradient-to-br from-indigo-500 via-violet-500 to-cyan-500 p-px">
              <div className="flex h-full w-full items-center justify-center rounded-xl bg-slate-950 text-xs font-bold">QZ</div>
            </div>
            <div>
              <p className="text-sm font-semibold">Quiz.app</p>
              <p className="text-xs text-slate-500">Modern learning SaaS</p>
            </div>
          </div>
          <nav className="hidden items-center gap-1 md:flex">
            {renderNavButton(VIEWS.DASHBOARD, "Dashboard")}
            {renderNavButton(VIEWS.BROWSE, "Browse")}
            {renderNavButton(VIEWS.HISTORY, "History")}
            {renderNavButton(VIEWS.CREATE, "Create")}
          </nav>
          <div className="hidden items-center gap-2 md:flex">
            <span className="rounded-full border border-indigo-500/30 bg-indigo-500/10 px-3 py-1 text-xs text-indigo-300">Streak {streakDays}</span>
            <button type="button" className="btn-danger" onClick={logout}>Logout</button>
          </div>
          <button type="button" className="btn-ghost md:hidden" onClick={() => setMobileMenuOpen((prev) => !prev)}>Menu</button>
        </div>
        {mobileMenuOpen && (
          <div className="app-container pb-3 md:hidden">
            <div className="app-card flex flex-col gap-2 p-3">
              {renderNavButton(VIEWS.DASHBOARD, "Dashboard")}
              {renderNavButton(VIEWS.BROWSE, "Browse")}
              {renderNavButton(VIEWS.HISTORY, "History")}
              {renderNavButton(VIEWS.CREATE, "Create")}
              <button type="button" className="btn-danger w-full" onClick={logout}>Logout</button>
            </div>
          </div>
        )}
      </header>

      <main className="app-container space-y-4 py-6 md:space-y-6">
        {activeView === VIEWS.DASHBOARD && (
          <section className="space-y-4 md:space-y-6">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {[
                { label: "Quizzes Taken", value: dashboard.totalAttempts || 0 },
                { label: "Average Score", value: `${dashboard.averageScore || 0}%` },
                { label: "Best Score", value: `${dashboard.bestScore || 0}%` },
                { label: "Current Streak", value: `${streakDays} days` },
              ].map((stat) => (
                <article key={stat.label} className="app-card p-4">
                  <p className="meta-label">{stat.label}</p>
                  <p className="mt-2 text-2xl font-semibold">{stat.value}</p>
                </article>
              ))}
            </div>
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
              <article className="app-card lg:col-span-2">
                <h2 className="text-2xl font-semibold">Performance</h2>
                <div className="mt-4 grid gap-3 sm:grid-cols-2">
                  <div className="rounded-xl border border-slate-800 bg-slate-950 p-3">
                    <p className="meta-label">Category Focus</p>
                    <p className="mt-1 text-sm text-slate-300">Tech and Science are your strongest categories.</p>
                  </div>
                  <div className="rounded-xl border border-slate-800 bg-slate-950 p-3">
                    <p className="meta-label">Improvement Goal</p>
                    <p className="mt-1 text-sm text-slate-300">Reach 80% average this week to unlock the Expert badge.</p>
                  </div>
                </div>
              </article>
              <article className="app-card relative overflow-hidden">
                <div className="absolute inset-0 bg-gradient-to-br from-indigo-500/10 via-violet-500/10 to-cyan-500/10" />
                <div className="relative">
                  <h3 className="text-lg font-semibold">Daily Challenge</h3>
                  <p className="mt-2 text-sm text-slate-300">Complete one quiz today for bonus XP and streak protection.</p>
                  <button type="button" className="btn-primary mt-4 w-full" onClick={() => setActiveView(VIEWS.BROWSE)}>Start Challenge</button>
                </div>
              </article>
            </div>
            <article className="app-card">
              <h3 className="text-lg font-semibold">Recent History</h3>
              <div className="mt-4 space-y-2">
                {attempts.length === 0 && <p className="text-sm text-slate-500">No attempts yet.</p>}
                {attempts.slice(0, 6).map((attempt) => (
                  <div key={attempt._id || attempt.id} className="rounded-xl border border-slate-800 bg-slate-950 p-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="text-sm font-medium">{attempt.quizTitle}</p>
                      <div className="flex items-center gap-2">
                        <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${attempt.scorePercent >= 60 ? "bg-emerald-500/10 text-emerald-300" : "bg-rose-500/10 text-rose-300"}`}>
                          {attempt.scorePercent >= 60 ? "Pass" : "Needs Retry"}
                        </span>
                        <span className="text-sm text-indigo-300">{attempt.scorePercent}%</span>
                      </div>
                    </div>
                    <p className="mt-1 text-xs text-slate-500">{new Date(attempt.submittedAt).toLocaleString()}</p>
                  </div>
                ))}
              </div>
            </article>
          </section>
        )}

        {activeView === VIEWS.BROWSE && (
          <section className="space-y-4">
            <div className="flex flex-wrap gap-2">
              <button type="button" onClick={() => setSelectedCategory("")} className={`rounded-full px-3 py-1 text-xs font-medium ${selectedCategory === "" ? "bg-indigo-500/15 text-indigo-300 ring-1 ring-indigo-400/30" : "bg-slate-800 text-slate-300"}`}>All</button>
              {categories.map((category) => (
                <button key={category} type="button" onClick={() => setSelectedCategory(category)} className={`rounded-full px-3 py-1 text-xs font-medium ${selectedCategory === category ? "bg-indigo-500/15 text-indigo-300 ring-1 ring-indigo-400/30" : "bg-slate-800 text-slate-300"}`}>
                  {category}
                </button>
              ))}
            </div>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
              {quizzes.map((quiz) => (
                <article key={quiz.id} className="app-card-interactive group">
                  <span className="inline-flex rounded-full border border-indigo-500/30 bg-indigo-500/10 px-3 py-1 text-xs text-indigo-300">{quiz.category}</span>
                  <h3 className="mt-2 text-lg font-semibold">{quiz.title}</h3>
                  <p className="mt-2 line-clamp-2 text-sm text-slate-400">{quiz.description || "Challenge yourself with this quiz."}</p>
                  <p className="mt-3 text-sm text-slate-400">{quiz.questionCount} questions • {Math.max(1, Math.round(quiz.questionCount / 2))} min</p>
                  <button type="button" onClick={() => { setSelectedQuiz(quiz); setActiveView(VIEWS.QUIZ_INTRO); }} className="btn-primary mt-4 w-full">View Quiz</button>
                </article>
              ))}
            </div>
          </section>
        )}

        {activeView === VIEWS.QUIZ_INTRO && selectedQuiz && (
          <section className="app-card relative overflow-hidden">
            <div className="absolute inset-0 bg-gradient-to-br from-indigo-500/10 via-violet-500/10 to-cyan-500/10" />
            <div className="relative space-y-4">
              <h2 className="text-2xl font-semibold">{selectedQuiz.title}</h2>
              <p className="text-sm text-slate-300">{selectedQuiz.description || "No description provided."}</p>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <div className="rounded-xl border border-slate-800 bg-slate-950 p-3 text-sm">Category: {selectedQuiz.category}</div>
                <div className="rounded-xl border border-slate-800 bg-slate-950 p-3 text-sm">Questions: {selectedQuiz.questionCount}</div>
                <div className="rounded-xl border border-slate-800 bg-slate-950 p-3 text-sm">Estimated: {selectedQuiz.questionCount * 30}s</div>
              </div>
              <label className="flex items-center gap-2 text-sm text-slate-300">
                <input type="checkbox" checked={timedMode} onChange={(e) => setTimedMode(e.target.checked)} />
                Timed mode
              </label>
              <div className="flex flex-col gap-2 sm:flex-row">
                <button type="button" className="btn-primary w-full sm:w-auto" onClick={startQuiz} disabled={loading}>{loading ? "Loading..." : "Start Quiz"}</button>
                <button type="button" className="btn-secondary w-full sm:w-auto" onClick={() => setActiveView(VIEWS.BROWSE)}>Back</button>
              </div>
            </div>
          </section>
        )}

        {activeView === VIEWS.QUIZ && activeQuiz && currentQuestion && (
          <section className="mx-auto max-w-3xl space-y-4">
            <div className="app-card">
              <div className="mb-3 flex items-center justify-between text-sm">
                <p className="text-slate-400">{activeQuiz.title}</p>
                <p className="text-indigo-300">{timedMode ? formatTime(secondsLeft) : "Practice Mode"}</p>
              </div>
              <div className="h-2 rounded-full bg-slate-800">
                <div className="h-2 rounded-full bg-indigo-500 transition-all" style={{ width: `${progress}%` }} />
              </div>
              <p className="mt-2 text-xs uppercase tracking-wide text-slate-500">Question {currentQuestionIndex + 1} of {activeQuiz.questions.length}</p>
            </div>

            <div className="app-card">
              <h3 className="text-lg font-semibold">{currentQuestion.text}</h3>
              <div className="mt-4 grid gap-2">
                {currentQuestion.options.map((option) => (
                  <button
                    key={option}
                    type="button"
                    onClick={() => setAnswers((prev) => ({ ...prev, [currentQuestion.id]: option }))}
                    className={`w-full rounded-xl border px-4 py-3 text-left text-sm transition ${answers[currentQuestion.id] === option ? "border-indigo-500 bg-indigo-500/15 text-indigo-200" : "border-slate-700 bg-slate-950 text-slate-200 hover:border-slate-500"}`}
                  >
                    {option}
                  </button>
                ))}
              </div>
            </div>

            <div className="sticky bottom-3 rounded-2xl border border-slate-700/60 bg-slate-900/90 p-3 backdrop-blur sm:static sm:border-none sm:bg-transparent sm:p-0">
              <div className="flex flex-col gap-2 sm:flex-row">
                <button type="button" className="btn-secondary w-full sm:w-auto" disabled={currentQuestionIndex === 0} onClick={() => setCurrentQuestionIndex((prev) => Math.max(0, prev - 1))}>Previous</button>
                {currentQuestionIndex < activeQuiz.questions.length - 1 ? (
                  <button type="button" className="btn-primary w-full sm:w-auto" onClick={() => setCurrentQuestionIndex((prev) => prev + 1)}>Next</button>
                ) : (
                  <button type="button" className="btn-primary w-full sm:w-auto" onClick={submitQuiz}>Submit Quiz</button>
                )}
              </div>
            </div>
          </section>
        )}

        {activeView === VIEWS.RESULT && result && (
          <section className="mx-auto max-w-3xl space-y-4">
            <article className="app-card ring-1 ring-indigo-400/25">
              <p className="meta-label">Result</p>
              <h2 className="mt-1 text-2xl font-semibold">{result.scorePercent}%</h2>
              <span className={`mt-2 inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${result.scorePercent >= 80 ? "bg-emerald-500/10 text-emerald-300" : result.scorePercent >= 60 ? "bg-amber-500/10 text-amber-300" : "bg-rose-500/10 text-rose-300"}`}>
                {result.scorePercent >= 80 ? "Excellent" : result.scorePercent >= 60 ? "Good" : "Try Again"}
              </span>
              <div className="mt-4 grid grid-cols-3 gap-2 text-sm">
                <div className="rounded-xl border border-slate-800 bg-slate-950 p-3">Correct: {result.correctCount}</div>
                <div className="rounded-xl border border-slate-800 bg-slate-950 p-3">Wrong: {result.totalQuestions - result.correctCount}</div>
                <div className="rounded-xl border border-slate-800 bg-slate-950 p-3">Total: {result.totalQuestions}</div>
              </div>
            </article>
            <article className="app-card space-y-2">
              {result.breakdown.map((entry, idx) => (
                <div key={entry.questionId} className={`rounded-xl border p-3 text-sm ${entry.isCorrect ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-300" : "border-rose-500/30 bg-rose-500/10 text-rose-300"}`}>
                  Q{idx + 1}: {entry.isCorrect ? "Correct" : `Wrong (answer: ${entry.correctAnswer})`}
                </div>
              ))}
            </article>
            <div className="flex flex-col gap-2 sm:flex-row">
              <button type="button" className="btn-primary w-full sm:w-auto" onClick={() => setActiveView(VIEWS.BROWSE)}>Take Similar Quiz</button>
              <button type="button" className="btn-secondary w-full sm:w-auto" onClick={() => setActiveView(VIEWS.DASHBOARD)}>Back to Dashboard</button>
            </div>
          </section>
        )}

        {activeView === VIEWS.HISTORY && (
          <section className="app-card">
            <h2 className="text-2xl font-semibold">Quiz History</h2>
            <div className="mt-4 space-y-2">
              {attempts.length === 0 && <p className="text-sm text-slate-500">No attempts yet.</p>}
              {attempts.map((attempt) => (
                <article key={attempt._id || attempt.id} className="rounded-xl border border-slate-800 bg-slate-950 p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-sm font-medium">{attempt.quizTitle}</p>
                    <div className="flex items-center gap-2">
                      <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${attempt.scorePercent >= 60 ? "bg-emerald-500/10 text-emerald-300" : "bg-rose-500/10 text-rose-300"}`}>
                        {attempt.scorePercent >= 60 ? "Pass" : "Needs Retry"}
                      </span>
                      <span className="text-sm text-indigo-300">{attempt.scorePercent}%</span>
                    </div>
                  </div>
                  <p className="mt-1 text-xs text-slate-500">{new Date(attempt.submittedAt).toLocaleString()}</p>
                </article>
              ))}
            </div>
          </section>
        )}

        {activeView === VIEWS.CREATE && (
          <section className="app-card space-y-4">
            <div>
              <h2 className="text-2xl font-semibold">Create Quiz</h2>
              <p className="mt-1 text-sm text-slate-400">Create and publish a quiz with multiple-choice questions.</p>
            </div>
            <form onSubmit={handleCreateQuiz} className="space-y-4">
              <div>
                <label className="label-base">Quiz Title</label>
                <input className="input-base" value={createState.title} onChange={(e) => setCreateState((prev) => ({ ...prev, title: e.target.value }))} required />
              </div>
              <div>
                <label className="label-base">Category</label>
                <input className="input-base" value={createState.category} onChange={(e) => setCreateState((prev) => ({ ...prev, category: e.target.value }))} required />
              </div>
              <div>
                <label className="label-base">Description</label>
                <textarea className="input-base" rows={3} value={createState.description} onChange={(e) => setCreateState((prev) => ({ ...prev, description: e.target.value }))} />
              </div>
              <div className="space-y-3">
                {createState.questions.map((question, qIndex) => (
                  <div key={`q-${qIndex}`} className="rounded-xl border border-slate-800 bg-slate-950 p-4">
                    <div className="mb-2 flex items-center justify-between">
                      <p className="text-sm font-semibold">Question {qIndex + 1}</p>
                      {createState.questions.length > 1 && <button type="button" className="text-xs text-rose-400" onClick={() => removeQuestion(qIndex)}>Remove</button>}
                    </div>
                    <input className="input-base mb-2" placeholder="Question text" value={question.text} onChange={(e) => updateQuestionField(qIndex, "text", e.target.value)} required />
                    <div className="space-y-2">
                      {question.options.map((option, optIndex) => (
                        <div key={`q-${qIndex}-o-${optIndex}`} className="flex items-center gap-2">
                          <input type="radio" name={`correct-${qIndex}`} checked={question.correctOptionIndex === optIndex} onChange={() => updateQuestionField(qIndex, "correctOptionIndex", optIndex)} />
                          <input className="input-base" placeholder={`Option ${optIndex + 1}`} value={option} onChange={(e) => updateOption(qIndex, optIndex, e.target.value)} required />
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
              <button type="button" className="btn-secondary w-full sm:w-auto" onClick={addQuestion}>Add Question</button>
              {createMessage && <p className="text-sm text-indigo-300">{createMessage}</p>}
              <button type="submit" className="btn-primary w-full" disabled={loading}>{loading ? "Publishing..." : "Publish Quiz"}</button>
            </form>
          </section>
        )}
      </main>
    </div>
  );
}

export default App;
