import jwt from "jsonwebtoken";
import { config } from "../config/config.js";
import { AppError } from "../errors/AppError.js";
import { User } from "../models/User.js";

export const requireAuth = async (req, _res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return next(new AppError(401, "Missing or invalid Authorization header."));
  }

  const token = authHeader.split(" ")[1];
  try {
    const decoded = jwt.verify(token, config.jwtSecret);
    const user = await User.findById(decoded.sub);
    if (!user) {
      return next(new AppError(401, "User for token no longer exists."));
    }
    req.user = { id: user._id.toString(), email: user.email, name: user.name };
    return next();
  } catch {
    return next(new AppError(401, "Invalid or expired token."));
  }
};
