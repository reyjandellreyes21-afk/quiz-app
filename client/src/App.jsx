import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import qaLogo from "./assets/QA-logo.png";
import examLogo from "./assets/exam-logo.png";
import cscLogo from "./assets/csc-logo.png";
import prcLogo from "./assets/prc-logo.png";
import heroStudyImage from "./assets/hero.png";
import websiteLeadersImage from "./assets/website-leaders.png";

/**
 * Dev: call the API on its own origin. The Vite proxy (`/api` → 4000) can 404 some POST routes
 * even when GET works. `cors()` on the server allows the browser origin.
 */
const defaultApiUrl = () => {
  if (!import.meta.env.DEV) return "http://localhost:4000/api/v1";
  return "http://127.0.0.1:4000/api/v1";
};
const API_URL = (import.meta.env.VITE_API_URL || defaultApiUrl()).replace(/\/+$/, "");
const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID || "";
const VIEWS = {
  DASHBOARD: "dashboard",
  BROWSE: "browse",
  QUIZ_INTRO: "quiz_intro",
  QUIZ: "quiz",
  RESULT: "result",
  HISTORY: "history",
  CREATE: "create",
  EDIT: "edit",
  PROFILE: "profile",
  USERS: "users",
};

/** Success toast: full visible time before fade; fade length (should match CSS transition) */
const PUBLISH_TOAST_DURATION_MS = 7500;
const PUBLISH_TOAST_FADE_MS = 350;

const buildEmptyQuestion = () => ({
  text: "",
  kind: "mcq",
  options: ["", "", "", ""],
  correctOptionIndex: 0,
});
/** Title-case each word: "rey jandell b reyes" → "Rey Jandell B Reyes". */
const formatDisplayName = (name) => {
  if (!name || typeof name !== "string") return "";
  return name
    .trim()
    .split(/\s+/)
    .map((segment) => {
      if (!segment) return "";
      return segment.charAt(0).toUpperCase() + segment.slice(1).toLowerCase();
    })
    .filter(Boolean)
    .join(" ");
};
/** Prefer structured name fields from the API; fall back to legacy `name` string. */
const getDisplayNameFromUser = (user) => {
  if (!user || typeof user !== "object") return "";
  const parts = [user.firstName, user.middleName, user.lastName].map((s) => String(s ?? "").trim()).filter(Boolean);
  if (parts.length > 0) return formatDisplayName(parts.join(" "));
  return formatDisplayName(user.name || "");
};

const PROFILE_GENDER_OPTIONS = [
  ["female", "Female"],
  ["male", "Male"],
  ["non_binary", "Non-binary"],
  ["other", "Other"],
  ["prefer_not_to_say", "Prefer not to say"],
];

function formatBirthdayDisplay(iso) {
  if (!iso || typeof iso !== "string") return "";
  const parts = iso.split("-");
  if (parts.length !== 3) return iso;
  const y = Number(parts[0]);
  const m = Number(parts[1]);
  const d = Number(parts[2]);
  if (!y || !m || !d) return iso;
  try {
    return new Date(y, m - 1, d).toLocaleDateString(undefined, { dateStyle: "medium" });
  } catch {
    return iso;
  }
}

function formatGenderDisplay(value) {
  const v = String(value || "").trim();
  if (!v) return "";
  const found = PROFILE_GENDER_OPTIONS.find(([k]) => k === v);
  return found ? found[1] : v;
}
const toTitleCase = (value) =>
  String(value || "")
    .trim()
    .split(/\s+/)
    .map((segment) => (segment ? segment.charAt(0).toUpperCase() + segment.slice(1).toLowerCase() : ""))
    .filter(Boolean)
    .join(" ");
const getQuizListId = (quiz) => quiz?.id || quiz?._id;
const isQuizOwner = (quiz, currentUser) => {
  if (!currentUser?.id || quiz?.createdBy == null || quiz.createdBy === "") return false;
  return String(quiz.createdBy) === String(currentUser.id);
};
const formatTime = (seconds) => `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
const getQuestionId = (question) => question?.id || question?._id;
const getQuestionKey = (question, index) => getQuestionId(question) || `idx-${index}`;
const normalizeQuestionKind = (value) => (value === "tf" ? "tf" : value === "fill" ? "fill" : "mcq");
const isQuestionInvalid = (q) => {
  if (!q.text?.trim() || q.text.trim().length < 5) return true;
  const kind = normalizeQuestionKind(q.kind);
  if (kind === "fill") return !(q.blankAnswer && String(q.blankAnswer).trim().length >= 1);
  return !Array.isArray(q.options) || q.options.some((o) => !String(o || "").trim()) || !q.options[q.correctOptionIndex]?.trim();
};
const buildQuestionPayload = (question) => {
  const kind = normalizeQuestionKind(question.kind);
  if (kind === "fill") {
    return {
      text: question.text.trim(),
      kind: "fill",
      options: [],
      correctAnswer: String(question.blankAnswer).trim(),
    };
  }
  return {
    text: question.text.trim(),
    kind,
    options: question.options.map((option) => option.trim()),
    correctAnswer: question.options[question.correctOptionIndex].trim(),
  };
};
const toEditableQuestion = (question) => {
  const kind = normalizeQuestionKind(question.kind);
  if (kind === "fill") {
    return {
      id: getQuestionId(question),
      text: question.text || "",
      kind: "fill",
      options: [],
      blankAnswer: question.correctAnswer || "",
      correctOptionIndex: 0,
    };
  }
  const options = Array.isArray(question.options) ? question.options : ["", ""];
  const matchedIndex = options.findIndex((opt) => String(opt).trim() === String(question.correctAnswer || "").trim());
  return {
    id: getQuestionId(question),
    text: question.text || "",
    kind,
    options,
    correctOptionIndex: matchedIndex >= 0 ? matchedIndex : 0,
    blankAnswer: "",
  };
};
const toCreateDraftQuestion = (question) => {
  const kind = normalizeQuestionKind(question.kind);
  if (kind === "fill") {
    return {
      text: question.text || "",
      kind: "fill",
      options: [],
      blankAnswer: question.correctAnswer || "",
      correctOptionIndex: 0,
    };
  }
  const options = Array.isArray(question.options) ? question.options : [];
  const safeOptions = kind === "tf" ? ["True", "False"] : options.length >= 2 ? options : ["", "", "", ""];
  const matchedIndex = safeOptions.findIndex((opt) => String(opt).trim() === String(question.correctAnswer || "").trim());
  return {
    text: question.text || "",
    kind,
    options: safeOptions,
    correctOptionIndex: matchedIndex >= 0 ? matchedIndex : 0,
    blankAnswer: "",
  };
};
const getApiErrorMessage = (payload, fallback) => {
  if (!payload || typeof payload !== "object") return fallback;
  const detailed = Array.isArray(payload.error?.details)
    ? payload.error.details
        .map((entry) => {
          const msg = entry?.msg || entry?.message;
          if (!msg) return "";
          const field = entry?.path || entry?.param;
          return field ? `${field}: ${msg}` : msg;
        })
        .filter(Boolean)
        .join(" ")
    : "";
  const normalizedDetails = detailed.replace(/\s{2,}/g, " ").trim();
  if (normalizedDetails) return normalizedDetails;
  const genericMessage = payload.error?.message || payload.message || fallback;
  return genericMessage === "Validation failed." ? "Please check your quiz fields and try again." : genericMessage;
};
const readApiPayload = async (response) => {
  const text = await response.text();
  const trimmed = text.trim();
  if (!trimmed) {
    if (!response.ok) return { error: { message: `Request failed (${response.status})` } };
    return null;
  }
  try {
    return JSON.parse(trimmed);
  } catch {
    if (!response.ok) {
      return { error: { message: text.slice(0, 200) || `Request failed (${response.status})` } };
    }
    return { error: { message: "Invalid response from server." } };
  }
};
const apiRequest = async (path, { method = "GET", token, body, headers = {} } = {}) => {
  const requestHeaders = { ...headers };
  if (token) requestHeaders.Authorization = `Bearer ${token}`;
  const hasBody = body !== undefined;
  if (hasBody && !(body instanceof FormData) && !requestHeaders["Content-Type"]) {
    requestHeaders["Content-Type"] = "application/json";
  }
  const response = await fetch(`${API_URL}${path}`, {
    method,
    headers: requestHeaders,
    body: hasBody ? (body instanceof FormData ? body : JSON.stringify(body)) : undefined,
  });
  const payload = await readApiPayload(response);
  if (!response.ok) {
    const proxiedDev = import.meta.env.DEV && API_URL.startsWith("/");
    let fallback = `Request failed (${response.status})`;
    if (response.status === 502 && proxiedDev) {
      fallback =
        "Request failed (502): Vite could not reach the API at http://127.0.0.1:4000. Start the backend (quiz-app/server → npm run dev) and wait for MongoDB to connect.";
    }
    const requestedUrl =
      typeof window !== "undefined"
        ? (() => {
            try {
              const base =
                API_URL.startsWith("http") ? API_URL : `${window.location.origin}${API_URL.startsWith("/") ? "" : "/"}${API_URL}`;
              return new URL(path.replace(/^\//, ""), `${base.replace(/\/+$/, "")}/`).href;
            } catch {
              return `${API_URL}${path}`;
            }
          })()
        : `${API_URL}${path}`;
    const error = new Error(
      `${getApiErrorMessage(payload, fallback)}${response.status === 404 ? `\nRequested: ${requestedUrl}` : ""}`,
    );
    error.status = response.status;
    throw error;
  }
  return payload;
};

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

const defaultHomePosts = [
  {
    id: "seed-1",
    author: "Ana Dela Cruz",
    role: "Civil Service Reviewee",
    content:
      "Anyone reviewing for the Civil Service Professional exam this month? I made a quick reviewer for analogy and grammar. I can share it if you need.",
    timeLabel: "2h ago",
    likes: 18,
    comments: 7,
  },
  {
    id: "seed-2",
    author: "Mark Santos",
    role: "PRC Board Exam Taker",
    content:
      "Sharing my routine: 50-item mock quiz every night + 30 mins discussion with my study buddy. Huge help for retention.",
    timeLabel: "4h ago",
    likes: 24,
    comments: 10,
  },
];

const LANDING_TARGET_EXAMS = [
  {
    badge: "CSC",
    logo: cscLogo,
    title: "Civil Service Examinations",
    description:
      "Prepare for Civil Service Commission eligibility tests used for careers across Philippine government agencies.",
  },
  {
    badge: "PRC",
    logo: prcLogo,
    title: "Professional Regulation Commission",
    description: "Board exams and professional licensure aligned with your field and regulatory requirements.",
  },
  {
    badge: "UCE",
    title: "University Entrance Exams",
    description: "Practice and readiness for college admissions and campus-specific screening assessments.",
  },
  {
    badge: "Bar",
    title: "Philippine Bar Examination",
    description: "Structured preparation focus for the Supreme Court bar and legal practice readiness.",
  },
  {
    badge: "NAT",
    title: "National Achievement Test",
    description: "National Assessment milestones for basic education outcomes and institutional benchmarks.",
  },
  {
    badge: "LET",
    title: "Licensure Exam for Teachers",
    description: "LET coverage for classroom practice, pedagogy, and professional teaching standards.",
  },
];

const LANDING_EXAM_SLIDE_SIZE = 3;
const LANDING_EXAM_SLIDES = Array.from({ length: Math.ceil(LANDING_TARGET_EXAMS.length / LANDING_EXAM_SLIDE_SIZE) }, (_, i) =>
  LANDING_TARGET_EXAMS.slice(i * LANDING_EXAM_SLIDE_SIZE, i * LANDING_EXAM_SLIDE_SIZE + LANDING_EXAM_SLIDE_SIZE),
);

function LandingIllustration() {
  return (
    <img src={websiteLeadersImage} alt="Exam community leaders" className="h-auto w-full max-w-xl drop-shadow-2xl" />
  );
}

function QuizAppLogo({ className = "h-7 w-auto max-w-[11rem] shrink-0 object-contain sm:h-8 sm:max-w-[13rem]" }) {
  return <img src={examLogo} alt="exam logo" className={className} />;
}

function EyeShowPasswordIcon(props) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width={20} height={20} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden {...props}>
      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

function EyeHidePasswordIcon(props) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width={20} height={20} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden {...props}>
      <path d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19m-6.72-1.07a3 3 0 01-4.24-4.24" />
      <path d="M1 1l22 22" />
    </svg>
  );
}

function ChevronDownIcon(props) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden {...props}>
      <path d="M6 9l6 6 6-6" />
    </svg>
  );
}

function ChevronLeftIcon(props) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width={20} height={20} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden {...props}>
      <path d="M15 18l-6-6 6-6" />
    </svg>
  );
}

function ChevronRightIcon(props) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width={20} height={20} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden {...props}>
      <path d="M9 18l6-6-6-6" />
    </svg>
  );
}

function LandingFooterIconMail(props) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width={20} height={20} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden {...props}>
      <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
      <path d="M22 6l-10 7L2 6" />
    </svg>
  );
}

function LandingFooterIconPhone(props) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width={20} height={20} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden {...props}>
      <path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07 19.5 19.5 0 01-6-6 19.79 19.79 0 01-3.07-8.67A2 2 0 014.11 2h3a2 2 0 012 1.72 12.84 12.84 0 00.7 2.81 2 2 0 01-.45 2.11L8.09 9.91a16 16 0 006 6l1.27-1.27a2 2 0 012.11-.45 12.84 12.84 0 002.81.7A2 2 0 0122 16.92z" />
    </svg>
  );
}

function LandingFooterIconMapPin(props) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width={20} height={20} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden {...props}>
      <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z" />
      <circle cx="12" cy="10" r="3" />
    </svg>
  );
}

function LandingSiteFooter() {
  const accent = "text-teal-400 shrink-0";
  const aboutLinks = ["Blog", "Media", "Careers", "Our team", "Community", "Partnership"];
  return (
    <footer className="landing-site-footer w-full" role="contentinfo">
      <svg className="block h-11 w-full shrink-0" viewBox="0 0 1440 48" preserveAspectRatio="none" aria-hidden>
        <path fill="#2d3748" d="M0 48V16Q720 0 1440 16V48H0z" />
      </svg>
      <div className="-mt-px bg-[#2d3748] px-6 pb-8 pt-0 sm:px-8 lg:px-12">
        <div className="app-container mx-auto grid max-w-7xl grid-cols-1 gap-12 pb-14 md:grid-cols-2 md:gap-10 lg:grid-cols-4 lg:gap-8 lg:pb-16">
          <div className="text-left">
            <h2 className="text-base font-bold tracking-tight text-white">Why Exam Forum</h2>
            <p className="mt-4 text-sm leading-relaxed text-white/85">
              We offer free practice and peer support for Filipino learners working toward licensure and career exams.
            </p>
            <p className="mt-3 text-sm leading-relaxed text-white/85">
              Prepare with quizzes, forum discussions, and instant feedback—stay motivated, learn faster, and track your progress in one place.
            </p>
          </div>
          <nav className="text-left" aria-label="About">
            <h2 className="text-base font-bold tracking-tight text-white">About</h2>
            <ul className="mt-4 flex flex-col gap-2.5">
              {aboutLinks.map((label) => (
                <li key={label}>
                  <a href="#" className="landing-footer-about-link">
                    {label}
                  </a>
                </li>
              ))}
            </ul>
          </nav>
          <div className="text-left">
            <h2 className="text-base font-bold tracking-tight text-white">Contact</h2>
            <ul className="mt-4 flex flex-col gap-4 text-sm">
              <li className="flex gap-3">
                <LandingFooterIconMail className={`${accent} mt-0.5`} />
                <a href="mailto:support@examforum.ph">support@examforum.ph</a>
              </li>
              <li className="flex gap-3">
                <LandingFooterIconPhone className={`${accent} mt-0.5`} />
                <span className="text-white/90">
                  +63 917 000 0000
                  <br />
                  +63 920 000 0000
                </span>
              </li>
              <li className="flex gap-3">
                <LandingFooterIconMapPin className={`${accent} mt-0.5 self-start`} />
                <span className="text-white/90">
                  Ayala Ave, Makati City
                  <br />
                  Metro Manila, Philippines
                </span>
              </li>
            </ul>
          </div>
          <div className="text-left">
            <h2 className="text-base font-bold tracking-tight text-white">Key stats</h2>
            <dl className="mt-4 flex flex-col gap-6">
              <div>
                <dt className="text-xs font-medium uppercase tracking-wide text-white/55">Forum posts</dt>
                <dd className="mt-1 text-2xl font-semibold tabular-nums text-white">12k+</dd>
              </div>
              <div>
                <dt className="text-xs font-medium uppercase tracking-wide text-white/55">Mock quizzes</dt>
                <dd className="mt-1 text-2xl font-semibold tabular-nums text-white">250+</dd>
              </div>
              <div>
                <dt className="text-xs font-medium uppercase tracking-wide text-white/55">Avg. pass rate</dt>
                <dd className="mt-1 text-2xl font-semibold tabular-nums text-white">87%</dd>
              </div>
            </dl>
          </div>
        </div>
        <div className="app-container mx-auto max-w-7xl border-t border-white/15 pt-10">
          <div className="flex flex-col items-center gap-8 lg:flex-row lg:items-end lg:justify-between">
            <div className="flex flex-col items-center gap-1 lg:items-start">
              <QuizAppLogo className="h-9 w-auto max-w-[12rem] shrink-0 object-contain brightness-0 invert sm:h-10 sm:max-w-[13rem]" />
              <p className="text-xs font-medium tracking-wide text-white/55">Path to pass</p>
            </div>
            <nav className="flex flex-wrap justify-center gap-x-6 gap-y-2 text-sm text-white/85" aria-label="Legal">
              <a href="#">Privacy Policy</a>
              <a href="#">Copyright</a>
              <a href="#">Terms of Service</a>
            </nav>
            <div className="flex items-center justify-center gap-2 sm:gap-3">
              <a href="#" className="landing-footer-social" aria-label="Facebook">
                <svg className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
                  <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" />
                </svg>
              </a>
              <a href="#" className="landing-footer-social" aria-label="X / Twitter">
                <svg className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
                  <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
                </svg>
              </a>
              <a href="#" className="landing-footer-social" aria-label="Instagram">
                <svg className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
                  <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z" />
                </svg>
              </a>
              <a href="#" className="landing-footer-social" aria-label="YouTube">
                <svg className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
                  <path d="M23.498 6.186a3.016 3.016 0 00-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 00.502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 002.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 002.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z" />
                </svg>
              </a>
            </div>
          </div>
        </div>
      </div>
    </footer>
  );
}

function LandingFeatureIconDiscussion(props) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width={22} height={22} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden {...props}>
      <path d="M21 11.5a8.38 8.38 0 01-.9 3.8 8.5 8.5 0 01-7.6 4.7 8.38 8.38 0 01-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 01-.9-3.8 8.5 8.5 0 014.7-7.6 8.38 8.38 0 013.8-.9h.5a8.48 8.48 0 018 8v.5z" />
    </svg>
  );
}

function LandingFeatureIconExchange(props) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width={22} height={22} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden {...props}>
      <path d="M4 19.5A2.5 2.5 0 016.5 17H20" />
      <path d="M6.5 2H20v20H6.5A2.5 2.5 0 014 19.5v-15A2.5 2.5 0 016.5 2z" />
      <path d="M8 7h8M8 11h6" />
    </svg>
  );
}

function LandingFeatureIconBuddy(props) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width={22} height={22} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden {...props}>
      <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75" />
    </svg>
  );
}

function LandingFeatureRow({ Icon, eyebrow, title, body }) {
  return (
    <div className="flex gap-4 sm:gap-5">
      <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-teal-50 text-brand-accent shadow-sm dark:bg-slate-800 dark:text-brand-accent">
        <Icon className="h-5 w-5" />
      </div>
      <div className="min-w-0">
        <p className="text-xs font-semibold uppercase tracking-wide text-brand-accent">{eyebrow}</p>
        <h3 className="mt-1 text-base font-bold leading-snug text-neutral-900 dark:text-slate-100 sm:text-lg">{title}</h3>
        <p className="mt-2 text-sm leading-relaxed text-neutral-600 dark:text-slate-400">{body}</p>
      </div>
    </div>
  );
}

const LANDING_FEATURE_ROWS = [
  {
    Icon: LandingFeatureIconDiscussion,
    eyebrow: "Guided Discussions",
    title: "Clarify difficult topics faster",
    body: "Discuss confusing concepts with fellow reviewees and learn from practical explanations.",
  },
  {
    Icon: LandingFeatureIconExchange,
    eyebrow: "Resource Exchange",
    title: "Get quality reviewers and drills",
    body: "Access community-shared notes, flashcards, and mock tests by exam category.",
  },
  {
    Icon: LandingFeatureIconBuddy,
    eyebrow: "Study Buddy Matching",
    title: "Stay consistent until exam day",
    body: "Pair up with exam buddies for daily check-ins, goal tracking, and motivation.",
  },
];

function MenuIcon(props) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width={22} height={22} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" aria-hidden {...props}>
      <line x1="4" x2="20" y1="7" y2="7" />
      <line x1="4" x2="20" y1="12" y2="12" />
      <line x1="4" x2="20" y1="17" y2="17" />
    </svg>
  );
}

function SunIcon(props) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden {...props}>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" />
    </svg>
  );
}

function MoonIcon(props) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden {...props}>
      <path d="M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z" />
    </svg>
  );
}

function CategoryDropdown({ value, onChange, categories, placeholder = "Pick or type a category" }) {
  const [open, setOpen] = useState(false);
  const query = String(value || "").toLowerCase();
  const options = categories.filter((category) => !query || category.toLowerCase().includes(query));

  return (
    <div className="relative">
      <input
        className="input-base pr-10"
        placeholder={placeholder}
        value={value}
        onFocus={() => setOpen(true)}
        onChange={(e) => {
          onChange(e.target.value);
          setOpen(true);
        }}
        required
      />
      <button
        type="button"
        className="absolute inset-y-0 right-0 flex w-10 items-center justify-center text-neutral-500 hover:text-neutral-700 dark:text-slate-400 dark:hover:text-slate-200"
        onClick={() => setOpen((prev) => !prev)}
        aria-label="Toggle category suggestions"
      >
        <ChevronDownIcon className={`transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open && options.length > 0 && (
        <div className="absolute z-20 mt-1 max-h-56 w-full overflow-auto rounded-xl border border-neutral-200 bg-white p-1 shadow-lg dark:border-slate-600 dark:bg-slate-900">
          {options.map((category) => (
            <button
              key={category}
              type="button"
              className="w-full rounded-lg px-3 py-2 text-left text-sm text-neutral-700 hover:bg-neutral-100 dark:text-slate-300 dark:hover:bg-slate-800"
              onMouseDown={(e) => {
                e.preventDefault();
                onChange(category);
                setOpen(false);
              }}
            >
              {category}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function App() {
  const [authMode, setAuthMode] = useState("login");
  const [authPanelVisible, setAuthPanelVisible] = useState(false);
  const [authLoading, setAuthLoading] = useState(false);
  const [showAuthPassword, setShowAuthPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [form, setForm] = useState({
    firstName: "",
    middleName: "",
    lastName: "",
    email: "",
    password: "",
    confirmPassword: "",
  });
  const [user, setUser] = useState(null);
  const [token, setToken] = useState(() => localStorage.getItem("quiz_token") || "");
  const [message, setMessage] = useState("");
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [accountMenuOpen, setAccountMenuOpen] = useState(false);
  const accountMenuRef = useRef(null);
  const [theme, setTheme] = useState(() => {
    try {
      return typeof window !== "undefined" && localStorage.getItem("quiz_theme_v2") === "dark" ? "dark" : "light";
    } catch {
      return "light";
    }
  });
  const [landingExamSlide, setLandingExamSlide] = useState(0);
  const [usersList, setUsersList] = useState([]);
  const [usersLoading, setUsersLoading] = useState(false);
  const [usersError, setUsersError] = useState("");

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
  const [browseLoading, setBrowseLoading] = useState(false);
  const [browseError, setBrowseError] = useState("");
  const [browseDeleteId, setBrowseDeleteId] = useState(null);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState("");
  const [historyClearLoading, setHistoryClearLoading] = useState(false);
  const [historyRefreshTick, setHistoryRefreshTick] = useState(0);
  const [dashboardLoading, setDashboardLoading] = useState(false);
  const [dashboardError, setDashboardError] = useState("");
  const [quizLoading, setQuizLoading] = useState(false);
  const [createLoading, setCreateLoading] = useState(false);
  const [submitLoading, setSubmitLoading] = useState(false);
  const [submitError, setSubmitError] = useState("");
  const [quizzesRefreshTick, setQuizzesRefreshTick] = useState(0);

  const [createState, setCreateState] = useState({
    title: "",
    category: "",
    description: "",
    generatorProvider: "manual",
    generatorQuestionCount: 5,
    questions: [buildEmptyQuestion()],
  });
  const [createMessage, setCreateMessage] = useState("");
  const [publishFlash, setPublishFlash] = useState("");
  const [publishFlashExiting, setPublishFlashExiting] = useState(false);
  const publishFlashTimersRef = useRef({ fade: null, remove: null });
  const [createGeneratorLoading, setCreateGeneratorLoading] = useState(false);
  const [editState, setEditState] = useState({ quizId: "", title: "", category: "", description: "", questions: [] });
  const [editRemovedQuestionIds, setEditRemovedQuestionIds] = useState([]);
  const [editLoading, setEditLoading] = useState(false);
  const [editSaving, setEditSaving] = useState(false);
  const [editMessage, setEditMessage] = useState("");
  const [quizMessage, setQuizMessage] = useState("");
  const [homePostDraft, setHomePostDraft] = useState("");
  const [homePosts, setHomePosts] = useState(defaultHomePosts);
  const [likedPostIds, setLikedPostIds] = useState({});
  const [postComments, setPostComments] = useState({});
  const [commentDraftByPost, setCommentDraftByPost] = useState({});
  const [profileEditing, setProfileEditing] = useState(false);
  const [profileDraft, setProfileDraft] = useState({
    firstName: "",
    middleName: "",
    lastName: "",
    email: "",
    phone: "",
    birthday: "",
    address: "",
    education: "",
    gender: "",
  });
  const [profileSaving, setProfileSaving] = useState(false);
  const [profileError, setProfileError] = useState("");

  const googleBtnRef = useRef(null);

  useEffect(() => {
    if (theme === "dark") document.documentElement.classList.add("dark");
    else document.documentElement.classList.remove("dark");
    localStorage.setItem("quiz_theme_v2", theme);
  }, [theme]);

  useEffect(() => {
    if (!publishFlash) return undefined;
    setPublishFlashExiting(false);
    const fadeAt = Math.max(0, PUBLISH_TOAST_DURATION_MS - PUBLISH_TOAST_FADE_MS);
    publishFlashTimersRef.current.fade = window.setTimeout(() => setPublishFlashExiting(true), fadeAt);
    publishFlashTimersRef.current.remove = window.setTimeout(() => {
      setPublishFlash("");
      setPublishFlashExiting(false);
    }, PUBLISH_TOAST_DURATION_MS);
    return () => {
      window.clearTimeout(publishFlashTimersRef.current.fade);
      window.clearTimeout(publishFlashTimersRef.current.remove);
    };
  }, [publishFlash]);

  const dismissPublishFlash = useCallback(() => {
    window.clearTimeout(publishFlashTimersRef.current.fade);
    window.clearTimeout(publishFlashTimersRef.current.remove);
    setPublishFlashExiting(true);
    publishFlashTimersRef.current.remove = window.setTimeout(() => {
      setPublishFlash("");
      setPublishFlashExiting(false);
    }, PUBLISH_TOAST_FADE_MS);
  }, []);

  useEffect(() => {
    const ensureIconLink = (selector, rel) => {
      let link = document.querySelector(selector);
      if (!link) {
        link = document.createElement("link");
        link.setAttribute("rel", rel);
        document.head.appendChild(link);
      }
      link.setAttribute("href", qaLogo);
      link.setAttribute("type", "image/png");
    };
    ensureIconLink('link[rel="icon"]', "icon");
    ensureIconLink('link[rel="apple-touch-icon"]', "apple-touch-icon");
  }, []);

  const submitQuiz = useCallback(async () => {
    if (!activeQuiz) return;
    setSubmitError("");
    setSubmitLoading(true);
    const submissionAnswers = activeQuiz.questions.reduce((acc, question, index) => {
      const questionId = getQuestionId(question);
      if (!questionId) return acc;
      const key = getQuestionKey(question, index);
      if (question.kind === "fill") {
        const typed = answers[key];
        if (typeof typed === "string" && typed.trim()) acc[questionId] = typed.trim();
        return acc;
      }
      const selectedOptionIndex = answers[key];
      if (typeof selectedOptionIndex === "number" && question.options[selectedOptionIndex] !== undefined) {
        acc[questionId] = question.options[selectedOptionIndex];
      }
      return acc;
    }, {});
    const activeQuizId = activeQuiz.id || activeQuiz._id;
    if (!activeQuizId) {
      setSubmitLoading(false);
      return;
    }
    try {
      const data = await apiRequest(`/quizzes/${activeQuizId}/submissions`, {
        method: "POST",
        token,
        body: { answers: submissionAnswers },
      });
      setResult(data);
      setActiveQuiz(null);
      setActiveView(VIEWS.RESULT);
    } catch (error) {
      setSubmitError(error.message || "Unable to submit quiz.");
    } finally {
      setSubmitLoading(false);
    }
  }, [activeQuiz, token, answers]);

  useEffect(() => {
    if (!token || user) return;
    (async () => {
      try {
        const data = await apiRequest("/auth/me", { token });
        setUser(data.user);
      } catch {
        localStorage.removeItem("quiz_token");
        setToken("");
      }
    })();
  }, [token, user]);

  useEffect(() => {
    if (!user) return;
    setBrowseLoading(true);
    setBrowseError("");
    const query = selectedCategory ? `?category=${encodeURIComponent(selectedCategory)}` : "";
    (async () => {
      try {
        const data = await apiRequest(`/quizzes${query}`);
        const playableQuizzes = data.filter((quiz) => (quiz.questionCount || 0) > 0);
        setQuizzes(playableQuizzes);
        setCategories([...new Set(playableQuizzes.map((q) => q.category))]);
      } catch (error) {
        setBrowseError(error.message || "Unable to load quizzes.");
      } finally {
        setBrowseLoading(false);
      }
    })();
  }, [user, selectedCategory, result, quizzesRefreshTick]);

  useEffect(() => {
    if (!user || !token) return;
    setHistoryLoading(true);
    setDashboardLoading(true);
    setHistoryError("");
    setDashboardError("");
    (async () => {
      try {
        const [historyData, dashboardData] = await Promise.all([
          apiRequest("/users/me/history", { token }),
          apiRequest("/users/me/dashboard", { token }),
        ]);
        setAttempts(historyData);
        setDashboard(dashboardData);
      } catch (error) {
        const message = error.message || "Unable to load your data.";
        setHistoryError(message);
        setDashboardError(message);
      } finally {
        setHistoryLoading(false);
        setDashboardLoading(false);
      }
    })();
  }, [user, token, result, historyRefreshTick]);

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
    if (user || !GOOGLE_CLIENT_ID || !authPanelVisible || !googleBtnRef.current) return;
    const initGoogle = () => {
      if (!window.google?.accounts?.id || !googleBtnRef.current) return;
      window.google.accounts.id.initialize({
        client_id: GOOGLE_CLIENT_ID,
        callback: async (response) => {
          try {
            const data = await apiRequest("/auth/google", {
              method: "POST",
              body: { credential: response.credential },
            });
            setUser(data.user);
            setToken(data.token);
            localStorage.setItem("quiz_token", data.token);
            setMessage("");
          } catch (error) {
            setMessage(error.message || "Google login failed.");
          }
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
  }, [authMode, user, authPanelVisible]);

  const progress = useMemo(() => {
    if (!activeQuiz) return 0;
    return Math.round((Object.keys(answers).length / activeQuiz.questions.length) * 100);
  }, [activeQuiz, answers]);

  const streakDays = useMemo(() => getStreakDays(attempts), [attempts]);
  const currentQuestion = activeQuiz?.questions[currentQuestionIndex];

  const openAuthPanel = useCallback((mode) => {
    setAuthMode(mode);
    setMessage("");
    setAuthPanelVisible(true);
  }, []);

  const closeAuthPanel = useCallback(() => {
    setAuthPanelVisible(false);
    setMessage("");
    setShowAuthPassword(false);
    setShowConfirmPassword(false);
  }, []);

  useEffect(() => {
    if (!authPanelVisible || user) return undefined;
    const onKeyDown = (event) => {
      if (event.key === "Escape") closeAuthPanel();
    };
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = prevOverflow;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [authPanelVisible, user, closeAuthPanel]);

  useEffect(() => {
    if (!accountMenuOpen) return undefined;
    const onPointerDown = (event) => {
      if (accountMenuRef.current && !accountMenuRef.current.contains(event.target)) {
        setAccountMenuOpen(false);
      }
    };
    const onKeyDown = (event) => {
      if (event.key === "Escape") setAccountMenuOpen(false);
    };
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [accountMenuOpen]);

  useEffect(() => {
    if (!token || activeView !== VIEWS.PROFILE) return undefined;
    let cancelled = false;
    (async () => {
      try {
        const data = await apiRequest("/auth/me", { token });
        if (!cancelled) setUser(data.user);
      } catch {
        if (!cancelled) {
          localStorage.removeItem("quiz_token");
          setToken("");
          setUser(null);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token, activeView]);

  useEffect(() => {
    if (activeView !== VIEWS.PROFILE) {
      setProfileEditing(false);
      setProfileError("");
    }
  }, [activeView]);

  useEffect(() => {
    if (!token || activeView !== VIEWS.USERS) return undefined;
    let cancelled = false;
    setUsersLoading(true);
    setUsersError("");
    (async () => {
      try {
        const data = await apiRequest("/users", { token });
        if (!cancelled) setUsersList(data.users || []);
      } catch (error) {
        if (!cancelled) setUsersError(error.message || "Unable to load users.");
      } finally {
        if (!cancelled) setUsersLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token, activeView]);

  const handleAuth = async (event) => {
    event.preventDefault();
    setMessage("");
    if (authMode === "signup" && form.password !== form.confirmPassword) {
      setMessage("Passwords do not match.");
      return;
    }
    setAuthLoading(true);
    try {
      const endpoint = authMode === "signup" ? "/auth/register" : "/auth/login";
      const body =
        authMode === "signup"
          ? {
              firstName: form.firstName.trim(),
              middleName: form.middleName.trim(),
              lastName: form.lastName.trim(),
              email: form.email.trim(),
              password: form.password,
            }
          : { email: form.email.trim(), password: form.password };
      const data = await apiRequest(endpoint, { method: "POST", body });
      setUser(data.user);
      setToken(data.token);
      localStorage.setItem("quiz_token", data.token);
      setForm({
        firstName: "",
        middleName: "",
        lastName: "",
        email: "",
        password: "",
        confirmPassword: "",
      });
      setShowAuthPassword(false);
      setShowConfirmPassword(false);
    } catch (error) {
      setMessage(error.message || "Cannot reach server.");
    } finally {
      setAuthLoading(false);
    }
  };

  const startQuiz = async () => {
    if (!selectedQuiz) return;
    setQuizMessage("");
    if ((selectedQuiz.questionCount || 0) < 1) {
      setQuizMessage("This quiz has no questions yet. Add at least one question in Create before starting.");
      return;
    }
    setQuizLoading(true);
    try {
      const data = await apiRequest(`/quizzes/${selectedQuiz.id}`);
      if (!data.questions?.length) {
        setQuizMessage("This quiz has no playable questions yet.");
        return;
      }
      setActiveQuiz(data);
      setAnswers({});
      setCurrentQuestionIndex(0);
      setSecondsLeft(data.questions.length * 30);
      setActiveView(VIEWS.QUIZ);
    } catch (error) {
      setQuizMessage(error.message || "Unable to load quiz.");
    } finally {
      setQuizLoading(false);
    }
  };

  const logout = () => {
    localStorage.removeItem("quiz_token");
    setToken("");
    setUser(null);
    setAuthPanelVisible(false);
    setAccountMenuOpen(false);
    setActiveQuiz(null);
    setResult(null);
    setSelectedQuiz(null);
  };

  const openProfileEdit = () => {
    if (!user) return;
    setProfileDraft({
      firstName: user.firstName ?? "",
      middleName: user.middleName ?? "",
      lastName: user.lastName ?? "",
      email: user.email || "",
      phone: user.phone ?? "",
      birthday: user.birthday ?? "",
      address: user.address ?? "",
      education: user.education ?? "",
      gender: user.gender ?? "",
    });
    setProfileError("");
    setProfileEditing(true);
  };

  const cancelProfileEdit = () => {
    setProfileEditing(false);
    setProfileError("");
  };

  const handleProfileSubmit = async (event) => {
    event.preventDefault();
    if (!token) return;
    setProfileSaving(true);
    setProfileError("");
    try {
      const data = await apiRequest("/auth/me", {
        method: "PATCH",
        token,
        body: {
          firstName: profileDraft.firstName.trim(),
          middleName: profileDraft.middleName.trim(),
          lastName: profileDraft.lastName.trim(),
          email: (user?.email || "").trim(),
          phone: profileDraft.phone.trim(),
          birthday: profileDraft.birthday.trim() || null,
          address: profileDraft.address.trim(),
          education: profileDraft.education.trim(),
          gender: profileDraft.gender.trim(),
        },
      });
      setUser(data.user);
      if (data.token) {
        setToken(data.token);
        localStorage.setItem("quiz_token", data.token);
      }
      setProfileEditing(false);
    } catch (error) {
      setProfileError(error.message || "Could not update profile.");
    } finally {
      setProfileSaving(false);
    }
  };

  const handleClearHistory = async () => {
    if (!token || attempts.length === 0) return;
    if (!window.confirm("Clear all quiz history? This cannot be undone.")) return;
    setHistoryClearLoading(true);
    try {
      await apiRequest("/users/me/history/clear", { method: "POST", token, body: {} });
      setHistoryRefreshTick((t) => t + 1);
    } catch (error) {
      window.alert(error.message || "Could not clear history.");
    } finally {
      setHistoryClearLoading(false);
    }
  };

  const handleDeleteQuiz = async (quiz) => {
    const quizId = getQuizListId(quiz);
    if (!quizId || !token || !isQuizOwner(quiz, user)) return;
    const title = quiz.title?.trim() || "this quiz";
    if (!window.confirm(`Delete "${title}"? This cannot be undone.`)) return;
    setBrowseDeleteId(quizId);
    try {
      await apiRequest(`/quizzes/${quizId}`, { method: "DELETE", token });
      if (selectedQuiz && getQuizListId(selectedQuiz) === quizId) {
        setSelectedQuiz(null);
        setActiveView(VIEWS.BROWSE);
      }
      setQuizzesRefreshTick((t) => t + 1);
    } catch (error) {
      window.alert(error.message || "Could not delete quiz.");
    } finally {
      setBrowseDeleteId(null);
    }
  };

  const openEditQuiz = async (quiz) => {
    const quizId = getQuizListId(quiz);
    if (!quizId || !token || !isQuizOwner(quiz, user)) return;
    setEditLoading(true);
    setEditMessage("");
    try {
      const meta = await apiRequest(`/quizzes/${quizId}`);
      let questions;
      try {
        questions = await apiRequest(`/quizzes/${quizId}/questions/manage`, { token });
      } catch (error) {
        if (error?.status === 404 || String(error?.message || "").toLowerCase().includes("route not found")) {
          throw new Error("Edit route is not available on your running backend yet. Restart the server (quiz-app/server -> npm run dev), then try Edit again.");
        }
        throw error;
      }
      const preparedQuestions = (Array.isArray(questions) ? questions : []).map(toEditableQuestion);
      setEditState({
        quizId,
        title: meta?.title ?? quiz.title ?? "",
        category: meta?.category ?? quiz.category ?? "",
        description: meta?.description ?? quiz.description ?? "",
        questions: preparedQuestions.length ? preparedQuestions : [buildEmptyQuestion()],
      });
      setEditRemovedQuestionIds([]);
      setActiveView(VIEWS.EDIT);
    } catch (error) {
      window.alert(error.message || "Unable to open editor.");
    } finally {
      setEditLoading(false);
    }
  };

  const addQuestion = () => setCreateState((prev) => ({ ...prev, questions: [...prev.questions, buildEmptyQuestion()] }));
  const removeQuestion = (index) => setCreateState((prev) => ({ ...prev, questions: prev.questions.filter((_, idx) => idx !== index) }));
  const updateQuestionField = (index, key, value) => setCreateState((prev) => {
    const next = [...prev.questions];
    next[index] = { ...next[index], [key]: value };
    return { ...prev, questions: next };
  });
  const setQuestionKind = (questionIndex, kind) => setCreateState((prev) => {
    const next = [...prev.questions];
    const q = next[questionIndex];
    const prevKind = q.kind === "tf" ? "tf" : q.kind === "fill" ? "fill" : "mcq";
    if (prevKind === kind) return prev;
    if (kind === "tf") {
      next[questionIndex] = {
        ...q,
        kind: "tf",
        options: ["True", "False"],
        correctOptionIndex: Math.min(q.correctOptionIndex, 1),
        blankAnswer: "",
      };
    } else if (kind === "fill") {
      next[questionIndex] = {
        ...q,
        kind: "fill",
        options: [],
        blankAnswer: "",
        correctOptionIndex: 0,
      };
    } else {
      next[questionIndex] = {
        ...q,
        kind: "mcq",
        options: ["", "", "", ""],
        correctOptionIndex: 0,
        blankAnswer: "",
      };
    }
    return { ...prev, questions: next };
  });
  const updateOption = (questionIndex, optionIndex, value) => setCreateState((prev) => {
    const next = [...prev.questions];
    const options = [...next[questionIndex].options];
    options[optionIndex] = value;
    next[questionIndex] = { ...next[questionIndex], options };
    return { ...prev, questions: next };
  });
  const addQuestionOption = (questionIndex) => setCreateState((prev) => {
    const next = [...prev.questions];
    const q = next[questionIndex];
    if (q.kind === "tf" || q.kind === "fill") return prev;
    next[questionIndex] = { ...q, options: [...q.options, ""] };
    return { ...prev, questions: next };
  });
  const removeQuestionOption = (questionIndex, optionIndex) => setCreateState((prev) => {
    const next = [...prev.questions];
    const q = next[questionIndex];
    if (q.kind === "tf" || q.kind === "fill") return prev;
    if (q.options.length <= 2) return prev;
    const options = q.options.filter((_, i) => i !== optionIndex);
    let { correctOptionIndex } = q;
    if (optionIndex === correctOptionIndex) correctOptionIndex = 0;
    else if (optionIndex < correctOptionIndex) correctOptionIndex -= 1;
    next[questionIndex] = { ...q, options, correctOptionIndex };
    return { ...prev, questions: next };
  });

  const handleGenerateQuestions = async () => {
    setCreateMessage("");
    const normalizedTitle = toTitleCase(createState.title);
    const normalizedCategory = toTitleCase(createState.category);
    if (!normalizedTitle || !normalizedCategory) {
      setCreateMessage("Add title and category first so Gemini can generate relevant questions.");
      return;
    }
    setCreateGeneratorLoading(true);
    try {
      const data = await apiRequest("/quizzes/generate", {
        method: "POST",
        token,
        body: {
          title: normalizedTitle,
          category: normalizedCategory,
          description: createState.description.trim(),
          questionCount: Number(createState.generatorQuestionCount) || 5,
        },
      });
      const generatedQuestions = Array.isArray(data?.questions) ? data.questions.map(toCreateDraftQuestion) : [];
      if (!generatedQuestions.length) {
        setCreateMessage("Gemini did not return valid questions. Try a more specific topic.");
        return;
      }
      setCreateState((prev) => ({
        ...prev,
        title: normalizedTitle,
        category: normalizedCategory,
        questions: generatedQuestions,
      }));
      setCreateMessage(`Generated ${generatedQuestions.length} question${generatedQuestions.length === 1 ? "" : "s"} with Gemini.`);
    } catch (error) {
      setCreateMessage(error.message || "Unable to generate questions right now.");
    } finally {
      setCreateGeneratorLoading(false);
    }
  };

  const handleCreateQuiz = async (event) => {
    event.preventDefault();
    setCreateMessage("");
    const normalizedTitle = toTitleCase(createState.title);
    const normalizedCategory = toTitleCase(createState.category);
    const hasInvalidQuestion = createState.questions.some((q) => {
      if (!q.text.trim() || q.text.trim().length < 5) return true;
      const k = q.kind === "tf" ? "tf" : q.kind === "fill" ? "fill" : "mcq";
      if (k === "fill") return !(q.blankAnswer && String(q.blankAnswer).trim().length >= 1);
      return q.options.some((o) => !o.trim()) || !q.options[q.correctOptionIndex]?.trim();
    });
    if (!normalizedTitle || !normalizedCategory || hasInvalidQuestion) return setCreateMessage("Complete title, category, and all question fields.");
    if (normalizedTitle.length < 3) return setCreateMessage("Quiz title must be at least 3 characters.");
    if (normalizedCategory.length < 2) return setCreateMessage("Category must be at least 2 characters.");
    setCreateLoading(true);
    try {
      const questionsPayload = createState.questions.map((question) => {
        const k = question.kind === "tf" ? "tf" : question.kind === "fill" ? "fill" : "mcq";
        if (k === "fill") {
          return {
            text: question.text.trim(),
            kind: "fill",
            options: [],
            correctAnswer: String(question.blankAnswer).trim(),
          };
        }
        return {
          text: question.text.trim(),
          kind: k,
          options: question.options.map((option) => option.trim()),
          correctAnswer: question.options[question.correctOptionIndex].trim(),
        };
      });

      await apiRequest("/quizzes/with-questions", {
        method: "POST",
        token,
        body: {
          title: normalizedTitle,
          category: normalizedCategory,
          description: createState.description.trim(),
          questions: questionsPayload,
        },
      });
      setCreateState((prev) => ({ ...prev, title: normalizedTitle, category: normalizedCategory }));
      setPublishFlash("Quiz published successfully.");
      setCreateState({
        title: "",
        category: "",
        description: "",
        generatorProvider: "manual",
        generatorQuestionCount: 5,
        questions: [buildEmptyQuestion()],
      });
      setQuizzesRefreshTick((prev) => prev + 1);
      setActiveView(VIEWS.BROWSE);
    } catch (error) {
      setCreateMessage(error.message || "Unable to publish now.");
    } finally {
      setCreateLoading(false);
    }
  };

  const addEditQuestion = () => setEditState((prev) => ({ ...prev, questions: [...prev.questions, buildEmptyQuestion()] }));
  const removeEditQuestion = (index) => setEditState((prev) => {
    const target = prev.questions[index];
    const targetId = getQuestionId(target);
    if (targetId) setEditRemovedQuestionIds((ids) => [...ids, targetId]);
    const nextQuestions = prev.questions.filter((_, idx) => idx !== index);
    return { ...prev, questions: nextQuestions.length ? nextQuestions : [buildEmptyQuestion()] };
  });
  const updateEditQuestionField = (index, key, value) => setEditState((prev) => {
    const next = [...prev.questions];
    next[index] = { ...next[index], [key]: value };
    return { ...prev, questions: next };
  });
  const setEditQuestionKind = (questionIndex, kind) => setEditState((prev) => {
    const next = [...prev.questions];
    const q = next[questionIndex];
    const prevKind = normalizeQuestionKind(q.kind);
    if (prevKind === kind) return prev;
    if (kind === "tf") {
      next[questionIndex] = { ...q, kind: "tf", options: ["True", "False"], correctOptionIndex: 0, blankAnswer: "" };
    } else if (kind === "fill") {
      next[questionIndex] = { ...q, kind: "fill", options: [], correctOptionIndex: 0, blankAnswer: "" };
    } else {
      next[questionIndex] = { ...q, kind: "mcq", options: ["", "", "", ""], correctOptionIndex: 0, blankAnswer: "" };
    }
    return { ...prev, questions: next };
  });
  const updateEditOption = (questionIndex, optionIndex, value) => setEditState((prev) => {
    const next = [...prev.questions];
    const options = [...next[questionIndex].options];
    options[optionIndex] = value;
    next[questionIndex] = { ...next[questionIndex], options };
    return { ...prev, questions: next };
  });
  const addEditOption = (questionIndex) => setEditState((prev) => {
    const next = [...prev.questions];
    const q = next[questionIndex];
    if (normalizeQuestionKind(q.kind) !== "mcq") return prev;
    next[questionIndex] = { ...q, options: [...q.options, ""] };
    return { ...prev, questions: next };
  });
  const removeEditOption = (questionIndex, optionIndex) => setEditState((prev) => {
    const next = [...prev.questions];
    const q = next[questionIndex];
    if (normalizeQuestionKind(q.kind) !== "mcq" || q.options.length <= 2) return prev;
    const options = q.options.filter((_, i) => i !== optionIndex);
    let { correctOptionIndex } = q;
    if (optionIndex === correctOptionIndex) correctOptionIndex = 0;
    else if (optionIndex < correctOptionIndex) correctOptionIndex -= 1;
    next[questionIndex] = { ...q, options, correctOptionIndex };
    return { ...prev, questions: next };
  });
  const handleSaveQuizEdits = async (event) => {
    event.preventDefault();
    setEditMessage("");
    const normalizedTitle = toTitleCase(editState.title);
    const normalizedCategory = toTitleCase(editState.category);
    if (normalizedTitle.length < 3) return setEditMessage("Quiz title must be at least 3 characters.");
    if (normalizedCategory.length < 2) return setEditMessage("Category must be at least 2 characters.");
    if (editState.questions.some(isQuestionInvalid)) return setEditMessage("Complete all question fields before saving.");
    setEditSaving(true);
    try {
      await apiRequest(`/quizzes/${editState.quizId}`, {
        method: "PUT",
        token,
        body: { title: normalizedTitle, category: normalizedCategory, description: editState.description.trim() },
      });
      setEditState((prev) => ({ ...prev, title: normalizedTitle, category: normalizedCategory }));
      for (const questionId of editRemovedQuestionIds) {
        await apiRequest(`/quizzes/${editState.quizId}/questions/${questionId}`, { method: "DELETE", token });
      }
      for (const question of editState.questions) {
        const payload = buildQuestionPayload(question);
        const questionId = getQuestionId(question);
        if (questionId) {
          await apiRequest(`/quizzes/${editState.quizId}/questions/${questionId}`, { method: "PUT", token, body: payload });
        } else {
          await apiRequest(`/quizzes/${editState.quizId}/questions`, { method: "POST", token, body: payload });
        }
      }
      setEditMessage("Quiz updated successfully.");
      setQuizzesRefreshTick((prev) => prev + 1);
      setActiveView(VIEWS.BROWSE);
    } catch (error) {
      setEditMessage(error.message || "Unable to save quiz changes.");
    } finally {
      setEditSaving(false);
    }
  };

  const renderNavButton = (id, label) => (
    <button
      type="button"
      onClick={() => {
        setActiveView(id);
        setMobileMenuOpen(false);
      }}
      className={`w-full rounded-xl px-3 py-2.5 text-center text-sm font-medium transition-colors md:w-auto md:min-w-[5.5rem] md:shrink-0 md:rounded-full md:px-4 md:py-2 ${
        activeView === id
          ? "bg-brand-soft text-brand-primary ring-1 ring-brand-border md:bg-white md:font-semibold md:text-brand-primary md:shadow-sm md:ring-0 md:dark:bg-slate-800 md:dark:text-slate-100 md:dark:shadow-md"
          : "text-neutral-600 hover:bg-neutral-100 hover:text-neutral-900 md:hover:bg-white/85 md:hover:text-neutral-900 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-100 md:dark:hover:bg-slate-800/80"
      }`}
    >
      {label}
    </button>
  );

  if (!user) {
    return (
      <div className="landing-shell">
        <header className="landing-nav">
          <div className="app-container flex h-[4.25rem] items-center justify-between gap-4 px-6 sm:px-8 lg:px-10">
            <div className="flex min-w-0 items-center">
              <QuizAppLogo />
            </div>
            <nav className="flex shrink-0 items-center gap-3 sm:gap-4" aria-label="Sign in">
              <button type="button" className="landing-btn-nav-text" onClick={() => openAuthPanel("login")}>
                Log in
              </button>
              <button type="button" className="landing-btn-nav-primary" onClick={() => openAuthPanel("signup")}>
                Sign up
              </button>
            </nav>
          </div>
        </header>

        <main>
          <div className="landing-hero-band">
            <div className="app-container px-6 sm:px-8 lg:px-12">
              <div className="relative mx-auto w-full max-w-6xl">
                <section className="relative grid min-h-[calc(100svh-5.5rem)] grid-cols-1 items-start gap-10 pb-28 pt-[200px] sm:min-h-[calc(100svh-4.25rem)] sm:gap-12 sm:pb-32 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,0.95fr)] lg:gap-x-12 lg:gap-y-8 lg:pb-36 xl:gap-x-16">
              <div className="flex max-w-xl flex-col items-center gap-7 text-center sm:gap-8 lg:max-w-none lg:items-start lg:text-left">
                <div className="flex w-full flex-col gap-5 sm:gap-6">
                  <h1 className="text-balance text-[2rem] font-extrabold leading-[1.12] tracking-tight text-neutral-900 sm:text-5xl sm:leading-[1.08] dark:text-slate-50">
                    A learning forum for <span className="text-brand-primary dark:text-brand-accent">Filipino exam takers</span>
                  </h1>
                  <p className="mx-auto max-w-xl text-pretty text-lg leading-relaxed text-neutral-600 dark:text-slate-400 md:text-xl md:leading-relaxed lg:mx-0">
                    Exchange knowledge, share reviewers, and test your readiness before Philippine licensure and career exams.
                  </p>
                </div>
                <div className="flex flex-wrap items-center justify-center gap-3 sm:gap-4 lg:justify-start">
                  <button type="button" className="landing-hero-cta px-10" onClick={() => openAuthPanel("signup")}>
                    Join Exam Forum
                  </button>
                  <button type="button" className="btn-secondary rounded-full px-8 py-3 text-sm" onClick={() => openAuthPanel("login")}>
                    Continue learning
                  </button>
                </div>
                <div className="flex w-full max-w-md flex-wrap justify-center gap-x-10 gap-y-8 border-t border-neutral-200/80 pt-9 dark:border-slate-700/80 sm:max-w-lg sm:gap-x-12 lg:max-w-none lg:justify-start">
                  <div className="min-w-[5.5rem] text-center lg:text-left">
                    <span className="block text-2xl font-semibold tracking-tight text-neutral-900 dark:text-slate-100">12k+</span>
                    <span className="mt-1 block text-sm text-neutral-500 dark:text-slate-400">Forum posts</span>
                  </div>
                  <div className="min-w-[5.5rem] text-center lg:text-left">
                    <span className="block text-2xl font-semibold tracking-tight text-neutral-900 dark:text-slate-100">250+</span>
                    <span className="mt-1 block text-sm text-neutral-500 dark:text-slate-400">Mock quizzes</span>
                  </div>
                  <div className="min-w-[5.5rem] text-center lg:text-left">
                    <span className="block text-2xl font-semibold tracking-tight text-neutral-900 dark:text-slate-100">24/7</span>
                    <span className="mt-1 block text-sm text-neutral-500 dark:text-slate-400">Peer support</span>
                  </div>
                </div>
              </div>
              <div className="flex justify-center lg:justify-end lg:self-start">
                <div className="w-full max-w-md sm:max-w-lg lg:max-w-xl xl:max-w-2xl">
                  <LandingIllustration />
                </div>
              </div>
              <button
                type="button"
                className="absolute bottom-6 left-1/2 z-10 flex h-11 w-11 -translate-x-1/2 items-center justify-center rounded-full border border-neutral-200/90 bg-white/95 text-neutral-600 shadow-md backdrop-blur-sm transition hover:border-neutral-300 hover:bg-white hover:text-neutral-900 dark:border-slate-600 dark:bg-slate-900/95 dark:text-slate-300 dark:hover:border-slate-500 dark:hover:bg-slate-800 dark:hover:text-white sm:bottom-8"
                aria-label="Scroll to content below"
                onClick={() => document.getElementById("landing-next-section")?.scrollIntoView({ behavior: "smooth", block: "start" })}
              >
                <ChevronDownIcon className="h-5 w-5" />
              </button>
                </section>
              </div>
            </div>
          </div>

          <div className="app-container px-6 pb-24 pt-12 sm:px-8 md:pb-32 md:pt-14 lg:px-12">
          <section
            id="landing-next-section"
            className="scroll-mt-24 px-4 py-10 sm:scroll-mt-28 sm:px-8 md:px-10 md:py-12"
          >
            <p className="mx-auto max-w-3xl text-center text-lg font-semibold leading-snug tracking-tight text-neutral-900 dark:text-slate-100 sm:text-xl">
              All the exams you need to prepare for in one place
            </p>
            <div className="relative mt-10">
              <button
                type="button"
                className="absolute left-0 top-[42%] z-10 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full border border-neutral-200/90 bg-white text-neutral-500 shadow-sm transition hover:border-neutral-300 hover:text-neutral-900 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-400 dark:hover:border-slate-500 sm:left-1 md:left-2"
                aria-label="Previous exams"
                onClick={() =>
                  setLandingExamSlide((s) => (s - 1 + LANDING_EXAM_SLIDES.length) % LANDING_EXAM_SLIDES.length)
                }
              >
                <ChevronLeftIcon className="h-5 w-5" />
              </button>
              <button
                type="button"
                className="absolute right-0 top-[42%] z-10 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full border border-neutral-200/90 bg-white text-neutral-500 shadow-sm transition hover:border-neutral-300 hover:text-neutral-900 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-400 dark:hover:border-slate-500 sm:right-1 md:right-2"
                aria-label="Next exams"
                onClick={() => setLandingExamSlide((s) => (s + 1) % LANDING_EXAM_SLIDES.length)}
              >
                <ChevronRightIcon className="h-5 w-5" />
              </button>
              <div className="mx-auto grid w-full max-w-5xl grid-cols-1 justify-items-center gap-12 px-4 sm:grid-cols-3 sm:gap-x-8 sm:gap-y-0 md:gap-x-12 md:px-6">
                {LANDING_EXAM_SLIDES[landingExamSlide].map((exam) => (
                  <div key={exam.title} className="flex w-full max-w-[20rem] flex-col items-center gap-3 text-center sm:max-w-none">
                    {exam.logo ? (
                      <div className="flex h-[4.25rem] w-[4.25rem] shrink-0 items-center justify-center overflow-hidden rounded-2xl p-2">
                        <img src={exam.logo} alt={`${exam.title} logo`} className="max-h-full max-w-full object-contain" />
                      </div>
                    ) : (
                      <div className="flex h-[4.25rem] w-[4.25rem] shrink-0 items-center justify-center rounded-2xl bg-brand-soft text-sm font-bold tracking-tight text-brand-primary shadow-sm dark:bg-slate-800 dark:text-brand-accent sm:text-base">
                        {exam.badge}
                      </div>
                    )}
                    <h3 className="px-1 text-[15px] font-semibold leading-snug text-brand-accent sm:text-base md:whitespace-nowrap md:text-lg">{exam.title}</h3>
                    <p className="text-pretty text-sm leading-relaxed text-neutral-600 dark:text-slate-400">{exam.description}</p>
                  </div>
                ))}
              </div>
              <div className="mt-10 flex justify-center gap-2.5">
                {LANDING_EXAM_SLIDES.map((_, i) => (
                  <button
                    key={i}
                    type="button"
                    className={`h-2 w-2 rounded-full transition ${i === landingExamSlide ? "bg-neutral-700 dark:bg-slate-200" : "bg-neutral-300 dark:bg-slate-600"}`}
                    aria-label={`Exam slide ${i + 1}`}
                    aria-current={i === landingExamSlide}
                    onClick={() => setLandingExamSlide(i)}
                  />
                ))}
              </div>
            </div>
          </section>

          <section className="mt-16 lg:mt-24">
            <h2 className="mx-auto max-w-3xl text-center text-2xl font-bold tracking-tight text-neutral-900 dark:text-slate-100 md:text-3xl">
              The best way to prepare for Philippine exams
            </h2>
            <div className="mt-12 grid grid-cols-1 gap-12 lg:mt-14 lg:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] lg:items-center lg:gap-8 xl:gap-14">
              <div className="order-2 flex max-w-lg flex-col gap-12 justify-self-center lg:order-1 lg:justify-self-end">
                <LandingFeatureRow {...LANDING_FEATURE_ROWS[0]} />
                <LandingFeatureRow {...LANDING_FEATURE_ROWS[1]} />
              </div>
              <div className="order-1 flex justify-center px-4 lg:order-2 lg:px-2">
                <img
                  src={heroStudyImage}
                  alt="Student preparing for exams"
                  className="h-auto w-full max-w-[280px] object-contain drop-shadow-lg md:max-w-[320px] lg:max-w-[340px]"
                />
              </div>
              <div className="order-3 flex max-w-lg flex-col gap-12 justify-self-center lg:justify-self-start">
                <LandingFeatureRow {...LANDING_FEATURE_ROWS[2]} />
              </div>
            </div>
          </section>

          <section className="mt-16 border-t border-neutral-200/90 pt-16 text-center dark:border-slate-700 md:mt-24 md:pt-20">
            <h2 className="mx-auto max-w-2xl text-2xl font-bold tracking-tight text-neutral-900 dark:text-slate-100 md:text-3xl">Start your review journey with people who get it</h2>
            <p className="mx-auto mt-5 max-w-lg text-base leading-relaxed text-neutral-600 dark:text-slate-400 md:mt-6">
              Build confidence, sharpen your weak areas, and prepare smarter with a supportive exam community.
            </p>
            <div className="mt-10 flex flex-col items-center justify-center gap-4 sm:flex-row sm:gap-5">
              <button type="button" className="landing-hero-cta min-w-[12rem] px-10" onClick={() => openAuthPanel("signup")}>
                Create free account
              </button>
              <button type="button" className="btn-secondary min-w-[12rem] rounded-full px-8 py-3 text-sm" onClick={() => openAuthPanel("login")}>
                Log in
              </button>
            </div>
          </section>
          </div>

          <LandingSiteFooter />
        </main>

        {authPanelVisible && (
          <div
            className="landing-auth-modal-root fixed inset-0 z-[100] flex items-center justify-center p-6 sm:p-10"
            role="dialog"
            aria-modal="true"
            aria-labelledby="auth-modal-title"
          >
            <button
              type="button"
              className="landing-auth-modal-backdrop absolute inset-0 bg-neutral-900/45 backdrop-blur-[3px] dark:bg-black/55"
              aria-label="Close sign-in dialog"
              onClick={closeAuthPanel}
            />
            <div className="landing-auth-panel relative z-10 w-full max-w-[26rem]" onClick={(event) => event.stopPropagation()}>
              <div className="landing-card relative">
                <button type="button" className="landing-auth-close" onClick={closeAuthPanel} aria-label="Close">
                  <span aria-hidden="true">×</span>
                </button>
                <div className="mb-8 pr-10">
                  <h2 id="auth-modal-title" className="text-2xl font-bold tracking-tight text-neutral-900 dark:text-slate-100 md:text-[1.65rem]">
                    {authMode === "signup" ? "Create an account" : "Welcome back"}
                  </h2>
                  <p className="mt-4 max-w-md text-sm leading-relaxed text-neutral-600 dark:text-slate-400 md:text-[15px] md:leading-relaxed">
                    {authMode === "signup"
                      ? "Create your account to join exam-focused groups and start your review plan."
                      : "Sign in with email or Google to continue your forum and review progress."}
                  </p>
                </div>

                <form onSubmit={handleAuth} className="space-y-5">
                {authMode === "signup" && (
                  <div className="flex flex-col gap-y-1">
                    <div className="grid grid-cols-1 gap-x-2 md:grid-cols-3 md:gap-x-3">
                      <span className="block text-sm font-semibold tracking-tight text-neutral-900 dark:text-slate-100">Name</span>
                      <div className="hidden min-w-0 md:block" aria-hidden="true" />
                      <div className="hidden min-w-0 md:block" aria-hidden="true" />
                    </div>
                    <div className="grid grid-cols-1 gap-y-3 md:grid-cols-3 md:gap-x-3 md:gap-y-0">
                      <div className="min-w-0">
                        <label htmlFor="auth-first-name" className="mb-1.5 block text-xs font-medium text-neutral-600 dark:text-slate-400">
                          First name
                        </label>
                        <input
                          id="auth-first-name"
                          name="firstName"
                          className="landing-input"
                          placeholder="Jane"
                          autoComplete="given-name"
                          value={form.firstName}
                          onChange={(e) => setForm((prev) => ({ ...prev, firstName: e.target.value }))}
                          required
                          minLength={2}
                        />
                      </div>
                      <div className="min-w-0">
                        <label htmlFor="auth-middle-name" className="mb-1.5 block text-xs font-medium text-neutral-600 dark:text-slate-400">
                          Middle <span className="font-normal text-neutral-500 dark:text-slate-500">(opt.)</span>
                        </label>
                        <input
                          id="auth-middle-name"
                          name="middleName"
                          className="landing-input"
                          placeholder="Maria"
                          autoComplete="additional-name"
                          value={form.middleName}
                          onChange={(e) => setForm((prev) => ({ ...prev, middleName: e.target.value }))}
                        />
                      </div>
                      <div className="min-w-0">
                        <label htmlFor="auth-last-name" className="mb-1.5 block text-xs font-medium text-neutral-600 dark:text-slate-400">
                          Last name
                        </label>
                        <input
                          id="auth-last-name"
                          name="lastName"
                          className="landing-input"
                          placeholder="Reyes"
                          autoComplete="family-name"
                          value={form.lastName}
                          onChange={(e) => setForm((prev) => ({ ...prev, lastName: e.target.value }))}
                          required
                          minLength={2}
                        />
                      </div>
                    </div>
                  </div>
                )}
                <div>
                  <label htmlFor="auth-email" className="mb-1.5 block text-sm font-medium text-neutral-700 dark:text-slate-300">
                    Email
                  </label>
                  <input
                    id="auth-email"
                    name="email"
                    className="landing-input"
                    type="email"
                    placeholder="you@example.com"
                    autoComplete="email"
                    value={form.email}
                    onChange={(e) => setForm((prev) => ({ ...prev, email: e.target.value }))}
                    required
                  />
                </div>
                <div>
                  <label htmlFor="auth-password" className="mb-1.5 block text-sm font-medium text-neutral-700 dark:text-slate-300">
                    Password
                  </label>
                  <div className="relative">
                    <input
                      id="auth-password"
                      name="password"
                      className="landing-input pr-11"
                      type={showAuthPassword ? "text" : "password"}
                      placeholder="At least 8 characters"
                      minLength={8}
                      autoComplete={authMode === "signup" ? "new-password" : "current-password"}
                      value={form.password}
                      onChange={(e) => setForm((prev) => ({ ...prev, password: e.target.value }))}
                      required
                    />
                    <button
                      type="button"
                      className="absolute right-2 top-1/2 -translate-y-1/2 rounded-lg p-1.5 text-neutral-500 transition hover:bg-neutral-100 hover:text-neutral-800 focus:outline-none focus:ring-2 focus:ring-brand-primary/35 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-100"
                      onClick={() => setShowAuthPassword((prev) => !prev)}
                      aria-label={showAuthPassword ? "Hide password" : "Show password"}
                      aria-pressed={showAuthPassword}
                      tabIndex={0}
                    >
                      {showAuthPassword ? <EyeHidePasswordIcon /> : <EyeShowPasswordIcon />}
                    </button>
                  </div>
                </div>
                {authMode === "signup" && (
                  <div>
                    <label htmlFor="auth-confirm-password" className="mb-1.5 block text-sm font-medium text-neutral-700 dark:text-slate-300">
                      Confirm password
                    </label>
                    <div className="relative">
                      <input
                        id="auth-confirm-password"
                        name="confirmPassword"
                        className="landing-input pr-11"
                        type={showConfirmPassword ? "text" : "password"}
                        placeholder="Re-enter your password"
                        minLength={8}
                        autoComplete="new-password"
                        value={form.confirmPassword}
                        onChange={(e) => setForm((prev) => ({ ...prev, confirmPassword: e.target.value }))}
                        required
                      />
                      <button
                        type="button"
                        className="absolute right-2 top-1/2 -translate-y-1/2 rounded-lg p-1.5 text-neutral-500 transition hover:bg-neutral-100 hover:text-neutral-800 focus:outline-none focus:ring-2 focus:ring-brand-primary/35 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-100"
                        onClick={() => setShowConfirmPassword((prev) => !prev)}
                        aria-label={showConfirmPassword ? "Hide confirm password" : "Show confirm password"}
                        aria-pressed={showConfirmPassword}
                        tabIndex={0}
                      >
                        {showConfirmPassword ? <EyeHidePasswordIcon /> : <EyeShowPasswordIcon />}
                      </button>
                    </div>
                  </div>
                )}
                {message && (
                  <p className="app-alert-error" role="alert">
                    {message}
                  </p>
                )}
                <button type="submit" className="landing-btn-primary" disabled={authLoading}>
                  {authLoading
                    ? authMode === "signup"
                      ? "Creating account…"
                      : "Signing in…"
                    : authMode === "signup"
                      ? "Create account"
                      : "Log in"}
                </button>
                </form>

                <div className="my-6 flex items-center gap-3">
                  <span className="h-px flex-1 bg-neutral-200 dark:bg-slate-600" />
                  <span className="text-xs font-medium uppercase tracking-wide text-neutral-600 dark:text-slate-400">or</span>
                  <span className="h-px flex-1 bg-neutral-200 dark:bg-slate-600" />
                </div>

                <div className="flex flex-col items-center gap-3">
                  {GOOGLE_CLIENT_ID ? (
                    <div
                      className="flex min-h-[44px] w-full max-w-[320px] justify-center [&>div]:w-full [&>div]:flex [&>div]:justify-center"
                      ref={googleBtnRef}
                    />
                  ) : (
                    <p className="text-center text-xs text-neutral-500 dark:text-slate-400">
                      Add{" "}
                      <code className="rounded bg-neutral-100 px-1 py-0.5 text-[11px] text-neutral-700 dark:bg-slate-800 dark:text-slate-200">VITE_GOOGLE_CLIENT_ID</code>{" "}
                      for Google sign-in.
                    </p>
                  )}
                </div>

                <p className="mt-8 text-center text-sm text-neutral-600 dark:text-slate-400">
                  {authMode === "signup" ? (
                    <>
                      Already have an account?{" "}
                      <button
                        type="button"
                        className="landing-link"
                        onClick={() => {
                          setAuthMode("login");
                          setMessage("");
                          setShowAuthPassword(false);
                          setShowConfirmPassword(false);
                          setForm((prev) => ({ ...prev, confirmPassword: "" }));
                        }}
                      >
                        Log in
                      </button>
                    </>
                  ) : (
                    <>
                      New here?{" "}
                      <button
                        type="button"
                        className="landing-link"
                        onClick={() => {
                          setAuthMode("signup");
                          setMessage("");
                          setShowAuthPassword(false);
                          setShowConfirmPassword(false);
                        }}
                      >
                        Create account
                      </button>
                    </>
                  )}
                </p>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-app dark:bg-slate-950">
      {publishFlash ? (
        <div
          role="status"
          aria-live="polite"
          className={`fixed left-1/2 top-[4.75rem] z-[60] w-[min(100vw-2rem,26rem)] -translate-x-1/2 overflow-hidden rounded-2xl border border-emerald-200/80 bg-white/95 shadow-[0_22px_50px_-14px_rgba(5,150,105,0.35),0_8px_16px_-8px_rgba(15,23,42,0.12)] backdrop-blur-xl ring-1 ring-emerald-500/[0.08] transition-[opacity,transform] duration-[350ms] ease-out dark:border-emerald-500/25 dark:bg-slate-900/95 dark:shadow-[0_22px_50px_-14px_rgba(0,0,0,0.55),0_0_0_1px_rgba(16,185,129,0.12)] dark:ring-emerald-400/10 ${publishFlashExiting ? "pointer-events-none translate-y-[-6px] opacity-0" : "translate-y-0 opacity-100"}`}
        >
          <div className="relative flex items-start gap-3 px-4 pb-3 pt-4 sm:gap-3.5 sm:px-5 sm:pb-3.5 sm:pt-4">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 text-white shadow-lg shadow-emerald-600/30 ring-2 ring-white/25 dark:ring-emerald-400/20">
              <svg xmlns="http://www.w3.org/2000/svg" width={22} height={22} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.25} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <path d="M20 6L9 17l-5-5" />
              </svg>
            </span>
            <div className="min-w-0 flex-1 pt-0.5">
              <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-emerald-600 dark:text-emerald-400">Published</p>
              <p className="mt-1 text-[15px] font-medium leading-snug tracking-tight text-neutral-800 dark:text-slate-100">{publishFlash}</p>
            </div>
            <button
              type="button"
              className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-transparent text-neutral-400 transition hover:border-neutral-200 hover:bg-neutral-100 hover:text-neutral-700 dark:text-slate-500 dark:hover:border-slate-600 dark:hover:bg-slate-800 dark:hover:text-slate-200"
              aria-label="Dismiss notification"
              onClick={dismissPublishFlash}
            >
              <svg xmlns="http://www.w3.org/2000/svg" width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" aria-hidden>
                <path d="M18 6L6 18M6 6l12 12" />
              </svg>
            </button>
          </div>
          <div className="relative h-1 overflow-hidden bg-emerald-100/90 dark:bg-emerald-950/80">
            <div
              className="publish-toast-progress h-full w-full rounded-none bg-gradient-to-r from-emerald-500 to-teal-500 dark:from-emerald-400 dark:to-teal-400"
              style={{ animationDuration: `${PUBLISH_TOAST_DURATION_MS}ms` }}
            />
          </div>
        </div>
      ) : null}
      <header className="sticky top-0 z-50 border-b border-neutral-200/80 bg-white/90 shadow-[0_1px_0_rgba(15,23,42,0.04)] backdrop-blur-md dark:border-slate-700/80 dark:bg-slate-900/95">
        <div className="app-container flex h-[4.25rem] items-center justify-between gap-3">
          <button
            type="button"
            className="rounded-xl px-1 py-1 focus:outline-none"
            onClick={() => {
              setActiveView(VIEWS.DASHBOARD);
              setMobileMenuOpen(false);
            }}
            aria-label="Go to dashboard"
          >
            <QuizAppLogo className="h-7 w-auto max-w-[9rem] shrink-0 object-contain sm:h-8 sm:max-w-[11rem]" />
          </button>
          <nav className="hidden items-center md:flex" aria-label="Main">
            <div className="flex items-center gap-0.5 rounded-full border border-neutral-200/80 bg-slate-100/70 p-1 shadow-inner shadow-slate-200/40 dark:border-slate-600/80 dark:bg-slate-800/70 dark:shadow-slate-950/50">
              {renderNavButton(VIEWS.DASHBOARD, "Home")}
              {renderNavButton(VIEWS.BROWSE, "Browse")}
              {renderNavButton(VIEWS.HISTORY, "History")}
              {renderNavButton(VIEWS.CREATE, "Create")}
            </div>
          </nav>
          <div className="hidden items-center md:flex">
            <div className="relative" ref={accountMenuRef}>
              <button
                type="button"
                className="inline-flex items-center gap-2 rounded-full border border-neutral-200/90 bg-white px-3.5 py-2 text-sm font-medium text-neutral-800 shadow-sm transition hover:border-neutral-300 hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100 dark:hover:border-slate-500 dark:hover:bg-slate-800"
                aria-expanded={accountMenuOpen}
                aria-haspopup="menu"
                aria-label="Account menu"
                onClick={() => setAccountMenuOpen((prev) => !prev)}
              >
                <span className="max-w-[10rem] truncate">{getDisplayNameFromUser(user) || "Account"}</span>
                <ChevronDownIcon className={`shrink-0 text-neutral-500 transition-transform dark:text-slate-400 ${accountMenuOpen ? "rotate-180" : ""}`} />
              </button>
              {accountMenuOpen && (
                <div
                  role="menu"
                  className="absolute right-0 z-50 mt-1.5 w-[min(100vw-1.5rem,16rem)] min-w-[16rem] overflow-hidden rounded-xl border border-neutral-200/90 bg-white py-1 shadow-lg shadow-slate-900/10 dark:border-slate-600 dark:bg-slate-900 dark:shadow-black/40"
                >
                  <button
                    type="button"
                    role="menuitem"
                    className="flex w-full px-4 py-2.5 text-left text-sm text-neutral-800 hover:bg-neutral-50 dark:text-slate-200 dark:hover:bg-slate-800"
                    onClick={() => {
                      setActiveView(VIEWS.PROFILE);
                      setAccountMenuOpen(false);
                    }}
                  >
                    Profile
                  </button>
                  <button
                    type="button"
                    role="menuitem"
                    className="flex w-full px-4 py-2.5 text-left text-sm text-neutral-800 hover:bg-neutral-50 dark:text-slate-200 dark:hover:bg-slate-800"
                    onClick={() => {
                      setActiveView(VIEWS.USERS);
                      setAccountMenuOpen(false);
                    }}
                  >
                    Users
                  </button>
                  <div role="none" className="border-t border-neutral-200 px-4 pb-3 pt-3 dark:border-slate-700">
                    <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-neutral-500 dark:text-slate-400">Theme</p>
                    <div className="flex w-full rounded-lg bg-neutral-100 p-0.5 dark:bg-slate-800" role="group" aria-label="Theme">
                      <button
                        type="button"
                        role="radio"
                        aria-checked={theme === "light"}
                        className={`flex flex-1 items-center justify-center gap-1 rounded-md py-2 text-xs font-semibold transition ${
                          theme === "light"
                            ? "bg-white text-neutral-900 shadow-sm dark:bg-slate-700 dark:text-white"
                            : "text-neutral-500 hover:text-neutral-800 dark:text-slate-400 dark:hover:text-slate-200"
                        }`}
                        onClick={() => setTheme("light")}
                      >
                        <SunIcon />
                        Light
                      </button>
                      <button
                        type="button"
                        role="radio"
                        aria-checked={theme === "dark"}
                        className={`flex flex-1 items-center justify-center gap-1 rounded-md py-2 text-xs font-semibold transition ${
                          theme === "dark"
                            ? "bg-white text-neutral-900 shadow-sm dark:bg-slate-700 dark:text-white"
                            : "text-neutral-500 hover:text-neutral-800 dark:text-slate-400 dark:hover:text-slate-200"
                        }`}
                        onClick={() => setTheme("dark")}
                      >
                        <MoonIcon />
                        Dark
                      </button>
                    </div>
                  </div>
                  <button type="button" role="menuitem" className="flex w-full px-4 py-2.5 text-left text-sm font-medium text-rose-700 hover:bg-rose-50 dark:text-rose-400 dark:hover:bg-rose-950/50" onClick={logout}>
                    Logout
                  </button>
                </div>
              )}
            </div>
          </div>
          <button
            type="button"
            className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-neutral-200/90 bg-white text-neutral-700 shadow-sm transition hover:border-neutral-300 hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-200 dark:hover:border-slate-500 dark:hover:bg-slate-800 md:hidden"
            onClick={() => setMobileMenuOpen((prev) => !prev)}
            aria-expanded={mobileMenuOpen}
            aria-label={mobileMenuOpen ? "Close menu" : "Open menu"}
          >
            <MenuIcon />
          </button>
        </div>
        {mobileMenuOpen && (
          <div className="app-container border-t border-neutral-100 bg-slate-50/80 pb-3 pt-2 dark:border-slate-800 dark:bg-slate-950/80 md:hidden">
            <div className="flex flex-col gap-1 rounded-xl border border-neutral-200/80 bg-white p-2 shadow-sm dark:border-slate-700 dark:bg-slate-900">
              {renderNavButton(VIEWS.DASHBOARD, "Home")}
              {renderNavButton(VIEWS.BROWSE, "Browse")}
              {renderNavButton(VIEWS.HISTORY, "History")}
              {renderNavButton(VIEWS.CREATE, "Create")}
              <div className="my-1 border-t border-neutral-200 pt-2 dark:border-slate-700">
                <p className="mb-2 px-1 text-[11px] font-semibold uppercase tracking-wide text-neutral-500 dark:text-slate-400">Account</p>
                <div className="mb-3 px-1">
                  <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-neutral-500 dark:text-slate-400">Theme</p>
                  <div className="flex w-full rounded-lg bg-neutral-100 p-0.5 dark:bg-slate-800" role="group" aria-label="Theme">
                    <button
                      type="button"
                      role="radio"
                      aria-checked={theme === "light"}
                      className={`flex flex-1 items-center justify-center gap-1 rounded-md py-2.5 text-xs font-semibold transition ${
                        theme === "light"
                          ? "bg-white text-neutral-900 shadow-sm dark:bg-slate-700 dark:text-white"
                          : "text-neutral-500 hover:text-neutral-800 dark:text-slate-400 dark:hover:text-slate-200"
                      }`}
                      onClick={() => setTheme("light")}
                    >
                      <SunIcon />
                      Light
                    </button>
                    <button
                      type="button"
                      role="radio"
                      aria-checked={theme === "dark"}
                      className={`flex flex-1 items-center justify-center gap-1 rounded-md py-2.5 text-xs font-semibold transition ${
                        theme === "dark"
                          ? "bg-white text-neutral-900 shadow-sm dark:bg-slate-700 dark:text-white"
                          : "text-neutral-500 hover:text-neutral-800 dark:text-slate-400 dark:hover:text-slate-200"
                      }`}
                      onClick={() => setTheme("dark")}
                    >
                      <MoonIcon />
                      Dark
                    </button>
                  </div>
                </div>
                <button
                  type="button"
                  className="w-full rounded-xl px-3 py-2 text-center text-sm text-neutral-800 hover:bg-neutral-100 dark:text-slate-200 dark:hover:bg-slate-800"
                  onClick={() => {
                    setActiveView(VIEWS.PROFILE);
                    setMobileMenuOpen(false);
                  }}
                >
                  Profile
                </button>
                <button
                  type="button"
                  className="w-full rounded-xl px-3 py-2 text-center text-sm text-neutral-800 hover:bg-neutral-100 dark:text-slate-200 dark:hover:bg-slate-800"
                  onClick={() => {
                    setActiveView(VIEWS.USERS);
                    setMobileMenuOpen(false);
                  }}
                >
                  Users
                </button>
                <button type="button" className="btn-danger mt-2 w-full dark:border-rose-900/50 dark:text-rose-400 dark:hover:bg-rose-950/40" onClick={() => { logout(); setMobileMenuOpen(false); }}>
                  Logout
                </button>
              </div>
            </div>
          </div>
        )}
      </header>

      <main className="app-container space-y-4 py-6 pb-12 md:space-y-6 md:py-8">
        {activeView === VIEWS.DASHBOARD && (
          <section className="space-y-4 md:space-y-6">
            {dashboardLoading && <p className="text-sm text-neutral-600 dark:text-slate-400">Loading home feed...</p>}
            {dashboardError && <p className="app-alert-danger-text text-sm">{dashboardError}</p>}
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
              <div className="space-y-4 lg:col-span-2">
                <article className="app-card">
                  <h2 className="text-xl font-semibold">What's on your mind?</h2>
                  <p className="mt-1 text-sm text-neutral-600 dark:text-slate-400">Share tips, ask questions, or post your exam progress.</p>
                  <textarea
                    className="input-base mt-3 min-h-[110px] resize-y"
                    placeholder="Post something helpful for your fellow examinees..."
                    value={homePostDraft}
                    onChange={(e) => setHomePostDraft(e.target.value)}
                  />
                  <div className="mt-3 flex justify-end">
                    <button
                      type="button"
                      className="btn-primary px-6 disabled:opacity-50"
                      disabled={!homePostDraft.trim()}
                      onClick={() => {
                        const content = homePostDraft.trim();
                        if (!content) return;
                        setHomePosts((prev) => [
                          {
                            id: `post-${Date.now()}`,
                            author: getDisplayNameFromUser(user) || "You",
                            role: "Forum Member",
                            content,
                            timeLabel: "Just now",
                            likes: 0,
                            comments: 0,
                          },
                          ...prev,
                        ]);
                        setHomePostDraft("");
                      }}
                    >
                      Post
                    </button>
                  </div>
                </article>

                <div className="space-y-3">
                  {homePosts.map((post) => (
                    <article key={post.id} className="app-card">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="text-sm font-semibold text-neutral-900 dark:text-slate-100">{post.author}</p>
                          <p className="text-xs text-neutral-500 dark:text-slate-400">
                            {post.role} • {post.timeLabel}
                          </p>
                        </div>
                      </div>
                      <p className="mt-3 text-sm leading-relaxed text-neutral-700 dark:text-slate-300">{post.content}</p>
                      <div className="mt-4 flex items-center gap-4 border-t border-neutral-100 pt-3 text-xs text-neutral-500 dark:border-slate-700 dark:text-slate-400">
                        <span>{post.likes + (likedPostIds[post.id] ? 1 : 0)} likes</span>
                        <span>{post.comments + (postComments[post.id]?.length || 0)} comments</span>
                      </div>
                      <div className="mt-3 flex items-center gap-2">
                        <button
                          type="button"
                          className={`rounded-lg border px-3 py-1.5 text-xs font-medium transition ${
                            likedPostIds[post.id]
                              ? "border-brand-border bg-brand-soft text-brand-primary"
                              : "border-neutral-200 bg-white text-neutral-700 hover:bg-neutral-50 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
                          }`}
                          onClick={() =>
                            setLikedPostIds((prev) => ({
                              ...prev,
                              [post.id]: !prev[post.id],
                            }))
                          }
                        >
                          {likedPostIds[post.id] ? "Liked" : "Like"}
                        </button>
                      </div>
                      <div className="mt-3 space-y-2">
                        {(postComments[post.id] || []).map((entry) => (
                          <div key={entry.id} className="rounded-lg border border-neutral-200 bg-neutral-50 px-3 py-2 dark:border-slate-600 dark:bg-slate-800/80">
                            <p className="text-xs font-semibold text-neutral-800 dark:text-slate-200">{entry.author}</p>
                            <p className="mt-1 text-sm text-neutral-700 dark:text-slate-300">{entry.content}</p>
                          </div>
                        ))}
                        <div className="flex items-center gap-2">
                          <input
                            className="input-base h-10"
                            placeholder="Write a comment..."
                            value={commentDraftByPost[post.id] || ""}
                            onChange={(e) =>
                              setCommentDraftByPost((prev) => ({
                                ...prev,
                                [post.id]: e.target.value,
                              }))
                            }
                          />
                          <button
                            type="button"
                            className="btn-secondary h-10 px-4 py-0 disabled:opacity-50"
                            disabled={!String(commentDraftByPost[post.id] || "").trim()}
                            onClick={() => {
                              const content = String(commentDraftByPost[post.id] || "").trim();
                              if (!content) return;
                              setPostComments((prev) => ({
                                ...prev,
                                [post.id]: [
                                  ...(prev[post.id] || []),
                                  {
                                    id: `comment-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
                                    author: getDisplayNameFromUser(user) || "You",
                                    content,
                                  },
                                ],
                              }));
                              setCommentDraftByPost((prev) => ({ ...prev, [post.id]: "" }));
                            }}
                          >
                            Comment
                          </button>
                        </div>
                      </div>
                    </article>
                  ))}
                </div>
              </div>

              <div className="space-y-4">
                <article className="app-card">
                  <h3 className="text-lg font-semibold text-neutral-900 dark:text-slate-100">Quick Stats</h3>
                  <div className="mt-3 space-y-2 text-sm">
                    <p className="flex items-center justify-between rounded-lg bg-neutral-50 px-3 py-2 dark:bg-slate-800/70">
                      <span className="text-neutral-600 dark:text-slate-400">Quizzes Taken</span>
                      <span className="font-semibold text-neutral-900 dark:text-slate-100">{dashboard.totalAttempts || 0}</span>
                    </p>
                    <p className="flex items-center justify-between rounded-lg bg-neutral-50 px-3 py-2 dark:bg-slate-800/70">
                      <span className="text-neutral-600 dark:text-slate-400">Average Score</span>
                      <span className="font-semibold text-neutral-900 dark:text-slate-100">{dashboard.averageScore || 0}%</span>
                    </p>
                    <p className="flex items-center justify-between rounded-lg bg-neutral-50 px-3 py-2 dark:bg-slate-800/70">
                      <span className="text-neutral-600 dark:text-slate-400">Current Streak</span>
                      <span className="font-semibold text-neutral-900 dark:text-slate-100">{streakDays} days</span>
                    </p>
                  </div>
                </article>
                <article className="app-card">
                  <h3 className="text-lg font-semibold text-neutral-900 dark:text-slate-100">Community Tips</h3>
                  <ul className="mt-3 space-y-2 text-sm text-neutral-700 dark:text-slate-300">
                    <li className="rounded-lg border border-neutral-200 bg-neutral-50 px-3 py-2 dark:border-slate-600 dark:bg-slate-800/80">Answer at least one forum question daily.</li>
                    <li className="rounded-lg border border-neutral-200 bg-neutral-50 px-3 py-2 dark:border-slate-600 dark:bg-slate-800/80">Share one reviewer per week to help others.</li>
                    <li className="rounded-lg border border-neutral-200 bg-neutral-50 px-3 py-2 dark:border-slate-600 dark:bg-slate-800/80">Join a study buddy group for accountability.</li>
                  </ul>
                </article>
              </div>
            </div>
          </section>
        )}

        {activeView === VIEWS.BROWSE && (
          <section className="space-y-4 md:space-y-6">
            {browseLoading && <p className="text-sm text-neutral-600 dark:text-slate-400">Loading quizzes...</p>}
            {browseError && <p className="app-alert-danger-text text-sm">{browseError}</p>}
            <div className="flex flex-wrap gap-2">
              <button type="button" onClick={() => setSelectedCategory("")} className={`rounded-full px-3 py-1 text-xs font-medium ${selectedCategory === "" ? "bg-brand-soft text-brand-primary ring-1 ring-brand-border" : "bg-neutral-100 text-neutral-700 dark:bg-slate-800 dark:text-slate-200"}`}>All</button>
              {categories.map((category) => (
                <button key={category} type="button" onClick={() => setSelectedCategory(category)} className={`rounded-full px-3 py-1 text-xs font-medium ${selectedCategory === category ? "bg-brand-soft text-brand-primary ring-1 ring-brand-border" : "bg-neutral-100 text-neutral-700 dark:bg-slate-800 dark:text-slate-200"}`}>
                  {category}
                </button>
              ))}
            </div>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
              {quizzes.map((quiz) => {
                const qid = getQuizListId(quiz);
                const own = isQuizOwner(quiz, user);
                const deleting = browseDeleteId === qid;
                return (
                  <article key={qid} className="app-card-interactive group flex h-full flex-col">
                    <div className="min-h-0 flex-1">
                      <span className="inline-flex rounded-full border border-brand-border bg-brand-soft px-3 py-1 text-xs font-medium text-brand-primary">{quiz.category}</span>
                      <h3 className="mt-2 text-lg font-semibold text-neutral-900 dark:text-slate-100">{quiz.title}</h3>
                      <p className="mt-2 line-clamp-2 text-sm text-neutral-600 dark:text-slate-400">{quiz.description || "Challenge yourself with this quiz."}</p>
                      <p className="mt-3 text-sm text-neutral-600 dark:text-slate-400">{quiz.questionCount} questions • {Math.max(1, Math.round(quiz.questionCount / 2))} min</p>
                    </div>
                    <div className="mt-auto flex shrink-0 flex-col gap-2 border-t border-neutral-100 pt-4 dark:border-slate-700">
                      <button type="button" onClick={() => { setSelectedQuiz(quiz); setActiveView(VIEWS.QUIZ_INTRO); }} className="btn-primary w-full">View Quiz</button>
                      {own && (
                        <div className="grid grid-cols-2 gap-2">
                          <button
                            type="button"
                            className="btn-secondary w-full min-w-0 disabled:opacity-60"
                            disabled={editLoading}
                            onClick={() => openEditQuiz(quiz)}
                          >
                            {editLoading ? "Opening editor..." : "Edit quiz"}
                          </button>
                          <button
                            type="button"
                            className="btn-danger w-full min-w-0 disabled:opacity-60"
                            disabled={deleting}
                            onClick={() => handleDeleteQuiz(quiz)}
                          >
                            {deleting ? "Deleting…" : "Delete quiz"}
                          </button>
                        </div>
                      )}
                    </div>
                  </article>
                );
              })}
            </div>
            {!browseLoading && quizzes.length === 0 && (
              <article className="app-card">
                <h3 className="text-lg font-semibold text-neutral-900 dark:text-slate-100">No playable quizzes yet</h3>
                <p className="mt-2 text-sm text-neutral-600 dark:text-slate-400">Create a quiz and add at least one question to make it appear here.</p>
                <button type="button" className="btn-primary mt-4" onClick={() => setActiveView(VIEWS.CREATE)}>Go to Create</button>
              </article>
            )}
          </section>
        )}

        {activeView === VIEWS.EDIT && (
          <section className="app-card space-y-4 md:space-y-6">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h2 className="text-2xl font-semibold text-neutral-900 dark:text-slate-100">Edit Quiz</h2>
                <p className="mt-1 text-sm text-neutral-600 dark:text-slate-400">Update quiz info and manage questions.</p>
              </div>
              <button type="button" className="btn-secondary" onClick={() => setActiveView(VIEWS.BROWSE)}>Back to Browse</button>
            </div>
            <form onSubmit={handleSaveQuizEdits} className="space-y-4">
              <div>
                <label className="label-base">Quiz Title</label>
                <input className="input-base" value={editState.title} onChange={(e) => setEditState((prev) => ({ ...prev, title: e.target.value }))} required />
              </div>
              <div>
                <label className="label-base">Category</label>
                <CategoryDropdown
                  value={editState.category}
                  onChange={(nextCategory) => setEditState((prev) => ({ ...prev, category: nextCategory }))}
                  categories={categories}
                />
              </div>
              <div>
                <label className="label-base">Description</label>
                <textarea className="input-base" rows={3} value={editState.description} onChange={(e) => setEditState((prev) => ({ ...prev, description: e.target.value }))} />
              </div>
              <div className="space-y-3">
                {editState.questions.map((question, qIndex) => {
                  const qKind = normalizeQuestionKind(question.kind);
                  return (
                    <div key={`edit-q-${getQuestionId(question) || qIndex}`} className="rounded-xl border border-neutral-200 bg-neutral-50 p-4 dark:border-slate-600 dark:bg-slate-800/50">
                      <div className="mb-2 flex items-center justify-between">
                        <p className="text-sm font-semibold text-neutral-900 dark:text-slate-100">Question {qIndex + 1}</p>
                        <button type="button" className="text-xs text-rose-600 dark:text-rose-400" onClick={() => removeEditQuestion(qIndex)}>Remove</button>
                      </div>
                      <input className="input-base mb-2" placeholder="Question text" value={question.text} onChange={(e) => updateEditQuestionField(qIndex, "text", e.target.value)} required />
                      <div className="mb-3">
                        <p className="label-base mb-2">Answer type</p>
                        <div className="flex flex-wrap gap-2">
                          <button type="button" onClick={() => setEditQuestionKind(qIndex, "mcq")} className={`rounded-xl px-3 py-2 text-sm ${qKind === "mcq" ? "bg-brand-soft text-brand-primary ring-1 ring-brand-border" : "border border-neutral-200 bg-white text-neutral-600 hover:bg-neutral-50 dark:border-slate-600 dark:bg-slate-950 dark:text-slate-300 dark:hover:bg-slate-800"}`}>Multiple choice</button>
                          <button type="button" onClick={() => setEditQuestionKind(qIndex, "tf")} className={`rounded-xl px-3 py-2 text-sm ${qKind === "tf" ? "bg-brand-soft text-brand-primary ring-1 ring-brand-border" : "border border-neutral-200 bg-white text-neutral-600 hover:bg-neutral-50 dark:border-slate-600 dark:bg-slate-950 dark:text-slate-300 dark:hover:bg-slate-800"}`}>True / false</button>
                          <button type="button" onClick={() => setEditQuestionKind(qIndex, "fill")} className={`rounded-xl px-3 py-2 text-sm ${qKind === "fill" ? "bg-brand-soft text-brand-primary ring-1 ring-brand-border" : "border border-neutral-200 bg-white text-neutral-600 hover:bg-neutral-50 dark:border-slate-600 dark:bg-slate-950 dark:text-slate-300 dark:hover:bg-slate-800"}`}>Fill in the blank</button>
                        </div>
                      </div>
                      {qKind === "fill" ? (
                        <div>
                          <label className="label-base">Correct answer</label>
                          <input className="input-base mt-1" value={question.blankAnswer || ""} onChange={(e) => updateEditQuestionField(qIndex, "blankAnswer", e.target.value)} required />
                        </div>
                      ) : (
                        <>
                          <div className="space-y-2">
                            {question.options.map((option, optIndex) => (
                              <div key={`edit-q-${qIndex}-o-${optIndex}`} className="flex items-center gap-2">
                                <input type="radio" name={`edit-correct-${qIndex}`} checked={question.correctOptionIndex === optIndex} onChange={() => updateEditQuestionField(qIndex, "correctOptionIndex", optIndex)} />
                                <input className="input-base min-w-0 flex-1" placeholder={qKind === "tf" ? (optIndex === 0 ? "True" : "False") : `Option ${optIndex + 1}`} value={option} onChange={(e) => updateEditOption(qIndex, optIndex, e.target.value)} required />
                                {qKind === "mcq" && question.options.length > 2 && (
                                  <button type="button" className="shrink-0 text-xs text-neutral-500 hover:text-rose-600" onClick={() => removeEditOption(qIndex, optIndex)}>Remove</button>
                                )}
                              </div>
                            ))}
                          </div>
                          {qKind === "mcq" && (
                            <button type="button" className="btn-secondary mt-2 w-full md:w-auto" onClick={() => addEditOption(qIndex)}>
                              Add option
                            </button>
                          )}
                        </>
                      )}
                    </div>
                  );
                })}
              </div>
              <button type="button" className="btn-secondary w-full md:w-auto" onClick={addEditQuestion}>Add Question</button>
              {editMessage && (
                <p className={`text-sm font-medium ${editMessage.includes("success") ? "text-emerald-700 dark:text-emerald-300" : "text-rose-700 dark:text-rose-300"}`}>
                  {editMessage}
                </p>
              )}
              <button type="submit" className="btn-primary w-full" disabled={editSaving}>{editSaving ? "Saving..." : "Save Changes"}</button>
            </form>
          </section>
        )}

        {activeView === VIEWS.QUIZ_INTRO && selectedQuiz && (
          <section className="app-card relative overflow-hidden">
            <div className="absolute inset-0 bg-gradient-to-br from-brand-soft via-white to-neutral-50 dark:from-slate-900 dark:via-slate-900 dark:to-slate-950" />
            <div className="relative space-y-4">
              <h2 className="text-2xl font-semibold text-neutral-900 dark:text-slate-100">{selectedQuiz.title}</h2>
              <p className="text-sm text-neutral-700 dark:text-slate-300">{selectedQuiz.description || "No description provided."}</p>
              <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                <div className="app-surface-muted p-3 text-sm">Category: {selectedQuiz.category}</div>
                <div className="app-surface-muted p-3 text-sm">Questions: {selectedQuiz.questionCount}</div>
                <div className="app-surface-muted p-3 text-sm">Estimated: {selectedQuiz.questionCount * 30}s</div>
              </div>
              {quizMessage && <p className="app-alert-danger-text text-sm">{quizMessage}</p>}
              <label className="flex items-center gap-2 text-sm text-neutral-700 dark:text-slate-300">
                <input type="checkbox" checked={timedMode} onChange={(e) => setTimedMode(e.target.checked)} />
                Timed mode
              </label>
              <div className="flex flex-col gap-2 md:flex-row">
                <button type="button" className="btn-primary w-full md:w-auto disabled:opacity-50" onClick={startQuiz} disabled={quizLoading || (selectedQuiz.questionCount || 0) < 1}>
                  {quizLoading ? "Loading..." : "Start Quiz"}
                </button>
                <button type="button" className="btn-secondary w-full md:w-auto" onClick={() => setActiveView(VIEWS.BROWSE)}>Back</button>
              </div>
            </div>
          </section>
        )}

        {activeView === VIEWS.QUIZ && activeQuiz && currentQuestion && (
          <section className="mx-auto max-w-3xl space-y-4">
            <div className="app-card">
              <div className="mb-3 flex items-center justify-between text-sm">
                <p className="text-neutral-600 dark:text-slate-400">{activeQuiz.title}</p>
                <p className="font-medium text-brand-primary">{timedMode ? formatTime(secondsLeft) : "Practice Mode"}</p>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-neutral-200/90 dark:bg-slate-700">
                <div
                  className="h-2 rounded-full bg-gradient-to-r from-brand-primary to-brand-accent transition-all duration-300 ease-out"
                  style={{ width: `${progress}%` }}
                />
              </div>
              <p className="mt-2 text-xs uppercase tracking-wide text-neutral-500 dark:text-slate-400">Question {currentQuestionIndex + 1} of {activeQuiz.questions.length}</p>
            </div>

            <div className="app-card">
              <h3 className="text-lg font-semibold text-neutral-900 dark:text-slate-100">{currentQuestion.text}</h3>
              {(() => {
                const cqKey = getQuestionKey(currentQuestion, currentQuestionIndex);
                const fillVal = answers[cqKey];
                return currentQuestion.kind === "fill" ? (
                  <div className="mt-4">
                    <label className="label-base" htmlFor={`fill-${cqKey}`}>
                      Your answer
                    </label>
                    <input
                      id={`fill-${cqKey}`}
                      type="text"
                      className="input-base mt-1"
                      value={typeof fillVal === "string" ? fillVal : ""}
                      onChange={(e) => setAnswers((prev) => ({ ...prev, [cqKey]: e.target.value }))}
                      placeholder="Type your answer"
                      autoComplete="off"
                    />
                  </div>
                ) : (
                  <div className="mt-4 grid gap-2">
                    {currentQuestion.options.map((option, optionIndex) => (
                      <button
                        key={`${cqKey}-${optionIndex}`}
                        type="button"
                        onClick={() => setAnswers((prev) => ({ ...prev, [cqKey]: optionIndex }))}
                        className={`w-full rounded-xl border px-4 py-3 text-left text-sm transition ${answers[cqKey] === optionIndex ? "border-brand-primary bg-brand-soft text-brand-primary" : "border-neutral-200 bg-white text-neutral-800 hover:border-brand-border dark:border-slate-600 dark:bg-slate-950 dark:text-slate-100 dark:hover:border-brand-border/80"}`}
                      >
                        {option}
                      </button>
                    ))}
                  </div>
                );
              })()}
            </div>

            <div className="sticky bottom-3 rounded-2xl border border-neutral-200 bg-white/95 p-3 shadow-sm backdrop-blur dark:border-slate-700 dark:bg-slate-900/95 md:static md:border-none md:bg-transparent md:p-0 md:shadow-none dark:md:bg-transparent">
              <div className="flex flex-col gap-2 md:flex-row">
                <button type="button" className="btn-secondary w-full md:w-auto" disabled={currentQuestionIndex === 0} onClick={() => setCurrentQuestionIndex((prev) => Math.max(0, prev - 1))}>Previous</button>
                {currentQuestionIndex < activeQuiz.questions.length - 1 ? (
                  <button type="button" className="btn-primary w-full md:w-auto" onClick={() => setCurrentQuestionIndex((prev) => prev + 1)}>Next</button>
                ) : (
                  <button type="button" className="btn-primary w-full md:w-auto disabled:opacity-50" onClick={submitQuiz} disabled={submitLoading}>
                    {submitLoading ? "Submitting..." : "Submit Quiz"}
                  </button>
                )}
              </div>
              {submitError && <p className="app-alert-danger-text mt-2 text-sm">{submitError}</p>}
            </div>
          </section>
        )}

        {activeView === VIEWS.QUIZ && activeQuiz && !currentQuestion && (
          <section className="mx-auto max-w-3xl">
            <article className="app-card">
              <h3 className="text-lg font-semibold text-neutral-900 dark:text-slate-100">No questions available</h3>
              <p className="mt-2 text-sm text-neutral-600 dark:text-slate-400">This quiz cannot be played because it has no questions.</p>
              <button type="button" className="btn-primary mt-4" onClick={() => setActiveView(VIEWS.BROWSE)}>Back to Browse</button>
            </article>
          </section>
        )}

        {activeView === VIEWS.RESULT && result && (
          <section className="mx-auto max-w-3xl space-y-4">
            <article className="app-card ring-1 ring-brand-border">
              <p className="meta-label">Result</p>
              <h2 className="mt-1 text-2xl font-semibold text-neutral-900 dark:text-slate-100">{result.scorePercent}%</h2>
              <span className={`mt-2 inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${result.scorePercent >= 80 ? "bg-brand-muted text-brand-primary" : result.scorePercent >= 60 ? "bg-brand-soft text-brand-primary" : "bg-neutral-100 text-neutral-600 dark:bg-slate-800 dark:text-slate-300"}`}>
                {result.scorePercent >= 80 ? "Excellent" : result.scorePercent >= 60 ? "Good" : "Try Again"}
              </span>
              <div className="mt-4 grid grid-cols-1 gap-2 text-sm md:grid-cols-3">
                <div className="app-surface-muted p-3">Correct: {result.correctCount}</div>
                <div className="app-surface-muted p-3">Wrong: {result.totalQuestions - result.correctCount}</div>
                <div className="app-surface-muted p-3">Total: {result.totalQuestions}</div>
              </div>
            </article>
            <article className="app-card space-y-2">
              {result.breakdown.map((entry, idx) => (
                <div key={entry.questionId} className={`rounded-xl border p-3 text-sm ${entry.isCorrect ? "border-brand-border bg-brand-soft text-brand-primary" : "border-neutral-200 bg-neutral-50 text-neutral-800 dark:border-slate-600 dark:bg-slate-800/70 dark:text-slate-200"}`}>
                  Q{idx + 1}: {entry.isCorrect ? "Correct" : `Wrong (answer: ${entry.correctAnswer})`}
                </div>
              ))}
            </article>
            <div className="flex flex-col gap-2 md:flex-row">
              <button type="button" className="btn-primary w-full md:w-auto" onClick={() => setActiveView(VIEWS.BROWSE)}>Take Similar Quiz</button>
              <button type="button" className="btn-secondary w-full md:w-auto" onClick={() => setActiveView(VIEWS.DASHBOARD)}>Back to Home</button>
            </div>
          </section>
        )}

        {activeView === VIEWS.HISTORY && (
          <section className="app-card space-y-4 md:space-y-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 className="text-2xl font-semibold text-neutral-900 dark:text-slate-100">Quiz History</h2>
              <button
                type="button"
                className="btn-danger shrink-0 disabled:opacity-50"
                disabled={attempts.length === 0 || historyLoading || historyClearLoading}
                onClick={handleClearHistory}
              >
                {historyClearLoading ? "Clearing…" : "Clear history"}
              </button>
            </div>
            {historyLoading && <p className="text-sm text-neutral-600 dark:text-slate-400">Loading history...</p>}
            {historyError && <p className="app-alert-danger-text text-sm">{historyError}</p>}
            <div className="space-y-2">
              {attempts.length === 0 && <p className="text-sm text-neutral-500 dark:text-slate-400">No attempts yet.</p>}
              {attempts.map((attempt) => (
                <article key={attempt._id || attempt.id} className="app-history-row">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-sm font-medium text-neutral-900 dark:text-slate-100">{attempt.quizTitle}</p>
                    <div className="flex items-center gap-2">
                      <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${attempt.scorePercent >= 60 ? "bg-brand-soft text-brand-primary" : "bg-neutral-100 text-neutral-600 dark:bg-slate-800 dark:text-slate-300"}`}>
                        {attempt.scorePercent >= 60 ? "Pass" : "Needs Retry"}
                      </span>
                      <span className="text-sm font-medium text-brand-primary">{attempt.scorePercent}%</span>
                    </div>
                  </div>
                  <p className="mt-1 text-xs text-neutral-500 dark:text-slate-400">{new Date(attempt.submittedAt).toLocaleString()}</p>
                </article>
              ))}
            </div>
          </section>
        )}

        {activeView === VIEWS.PROFILE && (
          <section className="app-card space-y-4 md:space-y-6">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <h2 className="text-2xl font-semibold text-neutral-900 dark:text-slate-100">Profile</h2>
              {user && !profileEditing ? (
                <button type="button" className="btn-secondary shrink-0" onClick={openProfileEdit}>
                  Edit profile
                </button>
              ) : null}
            </div>
            {user ? (
              profileEditing ? (
                <form onSubmit={handleProfileSubmit} className="space-y-4">
                  <div className="flex flex-wrap items-center gap-4">
                    <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl bg-brand-soft text-xl font-bold text-brand-primary ring-1 ring-brand-border">
                      {(getDisplayNameFromUser(profileDraft) || user.email || "?").charAt(0)}
                    </div>
                    <p className="text-sm text-neutral-600 dark:text-slate-400">Update your name.</p>
                  </div>
                  <div className="flex flex-col gap-y-1">
                    <div className="grid grid-cols-1 gap-x-3 md:grid-cols-3 md:gap-x-4">
                      <span className="block text-sm font-semibold tracking-tight text-neutral-900 dark:text-slate-100">Name</span>
                      <div className="hidden min-w-0 md:block" aria-hidden="true" />
                      <div className="hidden min-w-0 md:block" aria-hidden="true" />
                    </div>
                    <div className="grid grid-cols-1 gap-y-3 md:grid-cols-3 md:gap-x-4 md:gap-y-0">
                      <div className="min-w-0">
                        <label
                          className="mb-1.5 block text-xs font-medium text-neutral-600 dark:text-slate-400"
                          htmlFor="profile-first-name"
                        >
                          First name
                        </label>
                        <input
                          id="profile-first-name"
                          name="firstName"
                          className="input-base mt-1"
                          autoComplete="given-name"
                          value={profileDraft.firstName}
                          onChange={(e) => setProfileDraft((prev) => ({ ...prev, firstName: e.target.value }))}
                          required
                          minLength={2}
                        />
                      </div>
                      <div className="min-w-0">
                        <label
                          className="mb-1.5 block text-xs font-medium text-neutral-600 dark:text-slate-400"
                          htmlFor="profile-middle-name"
                        >
                          Middle <span className="font-normal text-neutral-500 dark:text-slate-500">(optional)</span>
                        </label>
                        <input
                          id="profile-middle-name"
                          name="middleName"
                          className="input-base mt-1"
                          autoComplete="additional-name"
                          value={profileDraft.middleName}
                          onChange={(e) => setProfileDraft((prev) => ({ ...prev, middleName: e.target.value }))}
                        />
                      </div>
                      <div className="min-w-0">
                        <label
                          className="mb-1.5 block text-xs font-medium text-neutral-600 dark:text-slate-400"
                          htmlFor="profile-last-name"
                        >
                          Last name
                        </label>
                        <input
                          id="profile-last-name"
                          name="lastName"
                          className="input-base mt-1"
                          autoComplete="family-name"
                          value={profileDraft.lastName}
                          onChange={(e) => setProfileDraft((prev) => ({ ...prev, lastName: e.target.value }))}
                          required
                          minLength={2}
                        />
                      </div>
                    </div>
                  </div>
                  <div>
                    <label className="label-base" htmlFor="profile-email">
                      Email
                    </label>
                    <input
                      id="profile-email"
                      name="email"
                      type="email"
                      readOnly
                      aria-readonly="true"
                      className="input-base mt-1 cursor-default read-only:border-neutral-200 read-only:bg-neutral-50 read-only:text-neutral-700 dark:read-only:border-slate-600 dark:read-only:bg-slate-900/50 dark:read-only:text-slate-300"
                      autoComplete="email"
                      value={profileDraft.email}
                    />
                  </div>
                  <div className="grid grid-cols-1 gap-4 md:grid-cols-8 md:gap-x-4">
                    <div className="min-w-0 md:col-span-2">
                      <label className="label-base" htmlFor="profile-gender">
                        Gender
                      </label>
                      <select
                        id="profile-gender"
                        name="gender"
                        className="input-base mt-1"
                        value={profileDraft.gender}
                        onChange={(e) => setProfileDraft((prev) => ({ ...prev, gender: e.target.value }))}
                      >
                        <option value="">Not specified</option>
                        {PROFILE_GENDER_OPTIONS.map(([value, label]) => (
                          <option key={value} value={value}>
                            {label}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="min-w-0 md:col-span-2">
                      <label className="label-base" htmlFor="profile-birthday">
                        Birthday
                      </label>
                      <input
                        id="profile-birthday"
                        name="birthday"
                        type="date"
                        className="input-base mt-1"
                        value={profileDraft.birthday}
                        onChange={(e) => setProfileDraft((prev) => ({ ...prev, birthday: e.target.value }))}
                      />
                    </div>
                    <div className="min-w-0 md:col-span-4">
                      <label className="label-base" htmlFor="profile-phone">
                        Phone number
                      </label>
                      <input
                        id="profile-phone"
                        name="phone"
                        type="tel"
                        inputMode="tel"
                        autoComplete="tel"
                        className="input-base mt-1"
                        value={profileDraft.phone}
                        onChange={(e) => setProfileDraft((prev) => ({ ...prev, phone: e.target.value }))}
                      />
                    </div>
                  </div>
                  <div>
                    <label className="label-base" htmlFor="profile-address">
                      Address
                    </label>
                    <textarea
                      id="profile-address"
                      name="address"
                      rows={3}
                      autoComplete="street-address"
                      className="input-base mt-1 min-h-[5rem] resize-y"
                      value={profileDraft.address}
                      onChange={(e) => setProfileDraft((prev) => ({ ...prev, address: e.target.value }))}
                    />
                  </div>
                  <div>
                    <label className="label-base" htmlFor="profile-education">
                      Education
                    </label>
                    <input
                      id="profile-education"
                      name="education"
                      type="text"
                      autoComplete="off"
                      className="input-base mt-1"
                      placeholder="e.g. BS Computer Science"
                      value={profileDraft.education}
                      onChange={(e) => setProfileDraft((prev) => ({ ...prev, education: e.target.value }))}
                    />
                  </div>
                  {profileError ? (
                    <p className="app-alert-danger-text text-sm" role="alert">
                      {profileError}
                    </p>
                  ) : null}
                  <div className="flex flex-wrap gap-2">
                    <button type="submit" className="btn-primary min-w-[7rem]" disabled={profileSaving}>
                      {profileSaving ? "Saving…" : "Save changes"}
                    </button>
                    <button type="button" className="btn-secondary min-w-[7rem]" disabled={profileSaving} onClick={cancelProfileEdit}>
                      Cancel
                    </button>
                  </div>
                </form>
              ) : (
                <div className="space-y-4">
                  <div className="flex flex-wrap items-center gap-4">
                    <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl bg-brand-soft text-xl font-bold text-brand-primary ring-1 ring-brand-border">
                      {(getDisplayNameFromUser(user) || "?").charAt(0)}
                    </div>
                    <div>
                      <p className="text-lg font-semibold text-neutral-900 dark:text-slate-100">{getDisplayNameFromUser(user)}</p>
                      <p className="text-sm text-neutral-600 dark:text-slate-400">{user.email}</p>
                    </div>
                  </div>
                  {(user.phone ||
                    user.birthday ||
                    user.address ||
                    user.education ||
                    user.gender) && (
                    <dl className="grid max-w-lg gap-x-6 gap-y-2 text-sm md:grid-cols-[8rem_1fr]">
                      {user.phone ? (
                        <>
                          <dt className="text-neutral-500 dark:text-slate-400">Phone</dt>
                          <dd className="text-neutral-900 dark:text-slate-100">{user.phone}</dd>
                        </>
                      ) : null}
                      {user.birthday ? (
                        <>
                          <dt className="text-neutral-500 dark:text-slate-400">Birthday</dt>
                          <dd className="text-neutral-900 dark:text-slate-100">{formatBirthdayDisplay(user.birthday)}</dd>
                        </>
                      ) : null}
                      {user.address ? (
                        <>
                          <dt className="text-neutral-500 dark:text-slate-400">Address</dt>
                          <dd className="whitespace-pre-wrap text-neutral-900 dark:text-slate-100">{user.address}</dd>
                        </>
                      ) : null}
                      {user.education ? (
                        <>
                          <dt className="text-neutral-500 dark:text-slate-400">Education</dt>
                          <dd className="text-neutral-900 dark:text-slate-100">{user.education}</dd>
                        </>
                      ) : null}
                      {user.gender ? (
                        <>
                          <dt className="text-neutral-500 dark:text-slate-400">Gender</dt>
                          <dd className="text-neutral-900 dark:text-slate-100">{formatGenderDisplay(user.gender)}</dd>
                        </>
                      ) : null}
                    </dl>
                  )}
                  <p className="text-xs text-neutral-500 dark:text-slate-400">Details refresh from the server when you open this page.</p>
                </div>
              )
            ) : (
              <p className="app-alert-danger-text text-sm">Could not load your profile. Try signing in again.</p>
            )}
          </section>
        )}

        {activeView === VIEWS.USERS && (
          <section className="app-card space-y-4 md:space-y-6">
            <div>
              <h2 className="text-2xl font-semibold text-neutral-900 dark:text-slate-100">Users</h2>
              <p className="mt-1 text-sm text-neutral-600 dark:text-slate-400">People registered on this app (names only).</p>
            </div>
            {usersLoading && <p className="text-sm text-neutral-600 dark:text-slate-400">Loading users...</p>}
            {usersError && <p className="app-alert-danger-text text-sm">{usersError}</p>}
            {!usersLoading && !usersError && (
              <ul className="divide-y divide-neutral-200 rounded-xl border border-neutral-200 dark:divide-slate-700 dark:border-slate-600">
                {usersList.length === 0 && <li className="px-4 py-6 text-sm text-neutral-500 dark:text-slate-400">No users yet.</li>}
                {usersList.map((u) => (
                  <li key={u.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3">
                    <span className="font-medium text-neutral-900 dark:text-slate-100">{formatDisplayName(u.name)}</span>
                    {u.joinedAt && (
                      <span className="text-xs text-neutral-500 dark:text-slate-400">{new Date(u.joinedAt).toLocaleDateString()}</span>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </section>
        )}

        {activeView === VIEWS.CREATE && (
          <section className="app-card space-y-4 md:space-y-6">
            <div>
              <h2 className="text-2xl font-semibold text-neutral-900 dark:text-slate-100">Create Quiz</h2>
              <p className="mt-1 text-sm text-neutral-600 dark:text-slate-400">Create and publish a quiz with multiple-choice, true/false, or fill-in-the-blank questions.</p>
            </div>
            <form onSubmit={handleCreateQuiz} className="space-y-4">
              <div>
                <label className="label-base">Quiz Title</label>
                <input
                  className="input-base"
                  placeholder="e.g. Math"
                  value={createState.title}
                  onChange={(e) => setCreateState((prev) => ({ ...prev, title: e.target.value }))}
                  required
                />
              </div>
              <div>
                <label className="label-base">Category</label>
                <CategoryDropdown
                  value={createState.category}
                  onChange={(nextCategory) => setCreateState((prev) => ({ ...prev, category: nextCategory }))}
                  categories={categories}
                />
              </div>
              <div>
                <label className="label-base">Description</label>
                <textarea
                  className="input-base"
                  rows={3}
                  placeholder="e.g. Practice problems for beginners"
                  value={createState.description}
                  onChange={(e) => setCreateState((prev) => ({ ...prev, description: e.target.value }))}
                />
              </div>
              <div className="relative overflow-hidden rounded-2xl border border-violet-200 bg-gradient-to-br from-violet-50 via-indigo-50 to-fuchsia-50 p-4 shadow-sm dark:border-violet-800/60 dark:from-slate-900 dark:via-indigo-950 dark:to-violet-950">
                <div className="pointer-events-none absolute -right-10 -top-10 h-28 w-28 rounded-full bg-violet-300/25 blur-2xl dark:bg-violet-500/15" />
                <div className="pointer-events-none absolute -bottom-10 -left-10 h-28 w-28 rounded-full bg-fuchsia-300/20 blur-2xl dark:bg-fuchsia-500/10" />
                <div className="relative">
                  <p className="text-xs font-semibold uppercase tracking-wide text-violet-700 dark:text-violet-300">AI Assistant</p>
                  <p className="mt-1 text-sm font-semibold text-violet-950 dark:text-slate-100">Quiz generator</p>
                  <p className="mt-1 text-xs text-violet-700/90 dark:text-violet-200/90">Switch to Gemini to auto-create questions from your topic.</p>
                </div>
                <div className="mt-2 grid gap-3 md:grid-cols-3 md:items-start">
                  <div className="md:col-span-1">
                    <label className="label-base text-violet-900 dark:text-violet-200">Provider</label>
                    <div className="relative mt-1">
                      <select
                        className="input-base appearance-none border-violet-200 bg-white/90 pr-10 focus:border-violet-500 focus:ring-violet-500/25 dark:border-violet-700 dark:bg-slate-900/90 dark:focus:border-violet-400 dark:focus:ring-violet-400/25"
                        value={createState.generatorProvider}
                        onChange={(e) => setCreateState((prev) => ({ ...prev, generatorProvider: e.target.value }))}
                      >
                        <option value="manual">Manual</option>
                        <option value="gemini">Gemini</option>
                      </select>
                      <ChevronDownIcon className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-violet-600 dark:text-violet-400" />
                    </div>
                  </div>
                  <div
                    className={`contents transition-all duration-300 ease-out ${
                      createState.generatorProvider === "gemini"
                        ? "opacity-100"
                        : "pointer-events-none opacity-0"
                    }`}
                    aria-hidden={createState.generatorProvider !== "gemini"}
                  >
                    <div
                      className={`md:col-span-1 overflow-hidden transition-all duration-300 ease-out ${
                        createState.generatorProvider === "gemini" ? "max-h-40 translate-y-0" : "max-h-0 -translate-y-1"
                      }`}
                    >
                      <label className="label-base text-violet-900 dark:text-violet-200">Question count</label>
                      <input
                        type="number"
                        min={1}
                        max={20}
                        className="input-base mt-1 border-violet-200 bg-white/90 focus:border-violet-500 focus:ring-violet-500/25 dark:border-violet-700 dark:bg-slate-900/90 dark:focus:border-violet-400 dark:focus:ring-violet-400/25"
                        value={createState.generatorQuestionCount}
                        onChange={(e) =>
                          setCreateState((prev) => ({
                            ...prev,
                            generatorQuestionCount: Math.min(20, Math.max(1, Number(e.target.value) || 1)),
                          }))
                        }
                      />
                    </div>
                    <div
                      className={`md:col-span-1 md:self-end overflow-hidden transition-all duration-300 ease-out ${
                        createState.generatorProvider === "gemini" ? "max-h-40 translate-y-0" : "max-h-0 -translate-y-1"
                      }`}
                    >
                      <button
                        type="button"
                        className="btn-base w-full cursor-not-allowed bg-gradient-to-r from-violet-400 to-indigo-400 text-white opacity-75"
                        aria-disabled="true"
                        onClick={() =>
                          setCreateMessage("AI generation is temporarily unavailable. The owner currently has no budget yet for this API.")
                        }
                      >
                        Generate with Gemini
                      </button>
                    </div>
                  </div>
                </div>
                <p className="mt-3 text-xs text-violet-700/90 dark:text-violet-200/85">
                  {createState.generatorProvider === "gemini"
                    ? "This feature will be fully available soon. The owner currently has no budget yet for this API."
                    : "Manual mode is active. Add your own questions below and publish when ready."}
                </p>
              </div>
              <div className="space-y-3">
                {createState.questions.map((question, qIndex) => {
                  const qKind = question.kind === "tf" ? "tf" : question.kind === "fill" ? "fill" : "mcq";
                  return (
                  <div key={`q-${qIndex}`} className="rounded-xl border border-neutral-200 bg-neutral-50 p-4 dark:border-slate-600 dark:bg-slate-800/50">
                    <div className="mb-2 flex items-center justify-between">
                      <p className="text-sm font-semibold text-neutral-900 dark:text-slate-100">Question {qIndex + 1}</p>
                      {createState.questions.length > 1 && <button type="button" className="text-xs text-brand-primary" onClick={() => removeQuestion(qIndex)}>Remove</button>}
                    </div>
                    <input className="input-base mb-2" placeholder="Question text" value={question.text} onChange={(e) => updateQuestionField(qIndex, "text", e.target.value)} required />
                    <div className="mb-3">
                      <p className="label-base mb-2">Answer type</p>
                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={() => setQuestionKind(qIndex, "mcq")}
                          className={`rounded-xl px-3 py-2 text-sm ${qKind === "mcq" ? "bg-brand-soft text-brand-primary ring-1 ring-brand-border" : "border border-neutral-200 bg-white text-neutral-600 hover:bg-neutral-50 dark:border-slate-600 dark:bg-slate-950 dark:text-slate-300 dark:hover:bg-slate-800"}`}
                        >
                          Multiple choice
                        </button>
                        <button
                          type="button"
                          onClick={() => setQuestionKind(qIndex, "tf")}
                          className={`rounded-xl px-3 py-2 text-sm ${qKind === "tf" ? "bg-brand-soft text-brand-primary ring-1 ring-brand-border" : "border border-neutral-200 bg-white text-neutral-600 hover:bg-neutral-50 dark:border-slate-600 dark:bg-slate-950 dark:text-slate-300 dark:hover:bg-slate-800"}`}
                        >
                          True / false
                        </button>
                        <button
                          type="button"
                          onClick={() => setQuestionKind(qIndex, "fill")}
                          className={`rounded-xl px-3 py-2 text-sm ${qKind === "fill" ? "bg-brand-soft text-brand-primary ring-1 ring-brand-border" : "border border-neutral-200 bg-white text-neutral-600 hover:bg-neutral-50 dark:border-slate-600 dark:bg-slate-950 dark:text-slate-300 dark:hover:bg-slate-800"}`}
                        >
                          Fill in the blank
                        </button>
                      </div>
                      <p className="mt-1.5 text-xs text-neutral-500 dark:text-slate-400">
                        {qKind === "mcq"
                          ? "Starts with four answer choices. Use Add option if you need more."
                          : qKind === "tf"
                            ? "Two choices, True and False by default—you can edit the labels if needed."
                            : "Players type the answer. Grading ignores uppercase vs lowercase."}
                      </p>
                    </div>
                    {qKind === "fill" ? (
                      <div>
                        <label className="label-base">Correct answer</label>
                        <input
                          className="input-base mt-1"
                          placeholder="e.g. Paris"
                          value={question.blankAnswer ?? ""}
                          onChange={(e) => updateQuestionField(qIndex, "blankAnswer", e.target.value)}
                          required
                        />
                      </div>
                    ) : (
                      <>
                        <div className="space-y-2">
                          {question.options.map((option, optIndex) => (
                            <div key={`q-${qIndex}-o-${optIndex}`} className="flex items-center gap-2">
                              <input type="radio" name={`correct-${qIndex}`} checked={question.correctOptionIndex === optIndex} onChange={() => updateQuestionField(qIndex, "correctOptionIndex", optIndex)} />
                              <input
                                className="input-base min-w-0 flex-1"
                                placeholder={qKind === "tf" ? (optIndex === 0 ? "True" : "False") : `Option ${optIndex + 1}`}
                                value={option}
                                onChange={(e) => updateOption(qIndex, optIndex, e.target.value)}
                                required
                              />
                              {qKind === "mcq" && question.options.length > 2 && (
                                <button
                                  type="button"
                                  className="shrink-0 text-xs text-neutral-500 hover:text-rose-600"
                                  onClick={() => removeQuestionOption(qIndex, optIndex)}
                                >
                                  Remove
                                </button>
                              )}
                            </div>
                          ))}
                        </div>
                        {qKind === "mcq" && (
                          <button type="button" className="btn-secondary mt-2 w-full md:w-auto" onClick={() => addQuestionOption(qIndex)}>
                            Add option
                          </button>
                        )}
                      </>
                    )}
                  </div>
                  );
                })}
              </div>
              <button type="button" className="btn-secondary w-full md:w-auto" onClick={addQuestion}>Add Question</button>
              {createMessage && (
                <p
                  className={`text-sm font-medium ${createMessage.includes("success") ? "text-emerald-700 dark:text-emerald-300" : "text-rose-700 dark:text-rose-300"}`}
                >
                  {createMessage}
                </p>
              )}
              <button type="submit" className="btn-primary w-full" disabled={createLoading}>{createLoading ? "Publishing..." : "Publish Quiz"}</button>
            </form>
          </section>
        )}
      </main>
    </div>
  );
}

export default App;
