import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { OAuth2Client } from "google-auth-library";
import { config } from "../config/config.js";
import { AppError } from "../errors/AppError.js";
import { User } from "../models/User.js";

const googleClient = new OAuth2Client(config.googleClientId || undefined);

const tokenForUser = (user) =>
  jwt.sign({ sub: user._id.toString(), email: user.email }, config.jwtSecret, {
    expiresIn: config.jwtExpiresIn,
  });

export const register = async (req, res, next) => {
  try {
    const { name, email, password } = req.body;
    const normalizedEmail = email.toLowerCase();
    const existing = await User.findOne({ email: normalizedEmail });
    if (existing) {
      throw new AppError(409, "Email already registered.");
    }
    const passwordHash = await bcrypt.hash(password, 10);
    const user = await User.create({
      name,
      email: normalizedEmail,
      passwordHash,
    });
    res.status(201).json({
      user: { id: user._id, name: user.name, email: user.email },
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
      user: { id: user._id, name: user.name, email: user.email },
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

    if (!user) {
      user = await User.create({
        name: payload.name || normalizedEmail.split("@")[0],
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
      await user.save();
    }

    res.json({
      user: { id: user._id, name: user.name, email: user.email, avatarUrl: user.avatarUrl },
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
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        avatarUrl: user.avatarUrl,
      },
    });
  } catch (error) {
    next(error);
  }
};
