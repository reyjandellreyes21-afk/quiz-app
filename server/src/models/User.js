import mongoose from "mongoose";

const userSchema = new mongoose.Schema(
  {
    firstName: { type: String, default: "", trim: true },
    middleName: { type: String, default: "", trim: true },
    lastName: { type: String, default: "", trim: true },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    passwordHash: { type: String, default: null },
    provider: { type: String, enum: ["local", "google"], default: "local" },
    providerId: { type: String, default: null },
    avatarUrl: { type: String, default: "" },
    emailVerified: { type: Boolean, default: false },
    username: { type: String, default: "", trim: true },
    country: { type: String, default: "", trim: true },
    age: { type: Number, default: null },
    acceptedTerms: { type: Boolean, default: false },
    acceptedTermsAt: { type: Date, default: null },
    phone: { type: String, default: "", trim: true },
    /** Birth date (no time zone semantics; stored as UTC midnight). */
    birthday: { type: Date, default: null },
    address: { type: String, default: "", trim: true },
    education: { type: String, default: "", trim: true },
    gender: { type: String, default: "", trim: true },
  },
  { timestamps: true },
);

export const User = mongoose.model("User", userSchema);
