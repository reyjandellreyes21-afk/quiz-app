import mongoose from "mongoose";

const userSchema = new mongoose.Schema(
  {
    firstName: { type: String, default: "", trim: true },
    middleName: { type: String, default: "", trim: true },
    lastName: { type: String, default: "", trim: true },
    /** Denormalized full name for legacy reads / listings; kept in sync on save when parts exist. */
    name: { type: String, default: "", trim: true },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    passwordHash: { type: String, default: null },
    provider: { type: String, enum: ["local", "google"], default: "local" },
    providerId: { type: String, default: null },
    avatarUrl: { type: String, default: "" },
    emailVerified: { type: Boolean, default: false },
    phone: { type: String, default: "", trim: true },
    /** Birth date (no time zone semantics; stored as UTC midnight). */
    birthday: { type: Date, default: null },
    address: { type: String, default: "", trim: true },
    education: { type: String, default: "", trim: true },
    gender: { type: String, default: "", trim: true },
  },
  { timestamps: true },
);

userSchema.pre("save", function syncFullName(next) {
  const fn = (this.firstName || "").trim();
  const mn = (this.middleName || "").trim();
  const ln = (this.lastName || "").trim();
  const joined = [fn, mn, ln].filter(Boolean).join(" ");
  if (joined) this.name = joined;
  next();
});

export const User = mongoose.model("User", userSchema);
