import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { OAuth2Client } from "google-auth-library";
import { config } from "../config/config.js";
import { AppError } from "../errors/AppError.js";
import { User } from "../models/User.js";
import { splitGoogleDisplayName, userToClient } from "../utils/displayName.js";

const googleClient = new OAuth2Client(config.googleClientId || undefined);

const tokenForUser = (user) =>
  jwt.sign({ sub: user._id.toString(), email: user.email }, config.jwtSecret, {
    expiresIn: config.jwtExpiresIn,
  });

export const register = async (req, res, next) => {
  try {
    const { firstName, middleName, lastName, email, password } = req.body;
    const normalizedEmail = email.toLowerCase();
    const existing = await User.findOne({ email: normalizedEmail });
    if (existing) {
      throw new AppError(409, "Email already registered.");
    }
    const passwordHash = await bcrypt.hash(password, 10);
    const user = await User.create({
      firstName: String(firstName).trim(),
      middleName: String(middleName || "").trim(),
      lastName: String(lastName).trim(),
      email: normalizedEmail,
      passwordHash,
    });
    res.status(201).json({
      user: userToClient(user),
      token: tokenForUser(user),
    });
  } catch (error) {
    next(error);
  }
};

export const login = async (req, res, next) => {
  try {
    const { email, password } = req.body;
    const user = await User.findOne({ email: email.toLowerCase() });
    if (!user) throw new AppError(401, "Invalid credentials.");
    if (!user.passwordHash) {
      throw new AppError(400, "This account uses Google sign-in. Please continue with Google.");
    }

    const isValid = await bcrypt.compare(password, user.passwordHash);
    if (!isValid) throw new AppError(401, "Invalid credentials.");

    res.json({
      user: userToClient(user),
      token: tokenForUser(user),
    });
  } catch (error) {
    next(error);
  }
};

export const googleAuth = async (req, res, next) => {
  try {
    if (!config.googleClientId) {
      throw new AppError(500, "Google auth is not configured on the server.");
    }
    const { credential } = req.body;
    if (!credential) throw new AppError(400, "Missing Google credential.");

    const ticket = await googleClient.verifyIdToken({
      idToken: credential,
      audience: config.googleClientId,
    });
    const payload = ticket.getPayload();
    if (!payload?.email || !payload?.sub) throw new AppError(401, "Invalid Google token.");

    const normalizedEmail = payload.email.toLowerCase();
    let user = await User.findOne({
      $or: [{ email: normalizedEmail }, { provider: "google", providerId: payload.sub }],
    });

    const emailLocal = normalizedEmail.split("@")[0];
    const nameParts = splitGoogleDisplayName(payload.name, emailLocal);

    if (!user) {
      user = await User.create({
        ...nameParts,
        email: normalizedEmail,
        provider: "google",
        providerId: payload.sub,
        avatarUrl: payload.picture || "",
        emailVerified: Boolean(payload.email_verified),
      });
    } else {
      user.provider = "google";
      user.providerId = payload.sub;
      user.avatarUrl = payload.picture || user.avatarUrl;
      user.emailVerified = Boolean(payload.email_verified);
      if (!(user.firstName || "").trim() && !(user.lastName || "").trim()) {
        user.firstName = nameParts.firstName;
        user.middleName = nameParts.middleName;
        user.lastName = nameParts.lastName;
      }
      await user.save();
    }

    res.json({
      user: userToClient(user),
      token: tokenForUser(user),
    });
  } catch (error) {
    next(error);
  }
};

export const getMe = async (req, res, next) => {
  try {
    const user = await User.findById(req.user.id).lean();
    if (!user) throw new AppError(401, "User no longer exists.", null, "UNAUTHORIZED");
    res.json({
      user: userToClient(user),
    });
  } catch (error) {
    next(error);
  }
};

/** PATCH body: optional profile fields including name, email, phone, birthday, address, education, gender. New JWT when email changes. */
export const updateMe = async (req, res, next) => {
  try {
    const {
      firstName,
      middleName,
      lastName,
      email,
      phone,
      birthday,
      address,
      education,
      gender,
    } = req.body || {};
    const updatingName =
      firstName !== undefined || middleName !== undefined || lastName !== undefined;
    const updatingExtras =
      phone !== undefined ||
      birthday !== undefined ||
      address !== undefined ||
      education !== undefined ||
      gender !== undefined;
    if (!updatingName && email === undefined && !updatingExtras) {
      throw new AppError(400, "No updates provided.");
    }

    const userDoc = await User.findById(req.user.id);
    if (!userDoc) throw new AppError(401, "User no longer exists.");

    let emailChanged = false;
    const prevEmail = userDoc.email;

    if (firstName !== undefined) userDoc.firstName = String(firstName).trim();
    if (middleName !== undefined) userDoc.middleName = String(middleName).trim();
    if (lastName !== undefined) userDoc.lastName = String(lastName).trim();

    if (updatingName) {
      const fn = (userDoc.firstName || "").trim();
      const ln = (userDoc.lastName || "").trim();
      if (fn.length < 2) throw new AppError(400, "First name must be at least 2 characters.");
      if (ln.length < 2) throw new AppError(400, "Last name must be at least 2 characters.");
    }

    if (email !== undefined) {
      const normalized = String(email).trim().toLowerCase();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)) throw new AppError(400, "Invalid email.");
      if (normalized !== prevEmail) {
        const existing = await User.findOne({ email: normalized }).lean();
        if (existing && existing._id.toString() !== req.user.id) {
          throw new AppError(409, "Email already in use.");
        }
        emailChanged = true;
      }
      userDoc.email = normalized;
    }

    if (phone !== undefined) userDoc.phone = String(phone).trim();
    if (address !== undefined) userDoc.address = String(address).trim();
    if (education !== undefined) userDoc.education = String(education).trim();
    if (gender !== undefined) userDoc.gender = String(gender).trim();

    if (birthday !== undefined) {
      const raw = birthday === null || birthday === "" ? null : String(birthday).trim();
      if (!raw) {
        userDoc.birthday = null;
      } else {
        const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(raw);
        if (!m) throw new AppError(400, "Invalid birthday.");
        const y = Number(m[1]);
        const mo = Number(m[2]);
        const day = Number(m[3]);
        const d = new Date(Date.UTC(y, mo - 1, day));
        if (Number.isNaN(d.getTime()) || d.getUTCFullYear() !== y || d.getUTCMonth() !== mo - 1 || d.getUTCDate() !== day) {
          throw new AppError(400, "Invalid birthday.");
        }
        userDoc.birthday = d;
      }
    }

    await userDoc.save();

    const payload = { user: userToClient(userDoc) };
    if (emailChanged) {
      payload.token = tokenForUser(userDoc);
    }

    res.json(payload);
  } catch (error) {
    next(error);
  }
};
