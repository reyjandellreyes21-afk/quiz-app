import { User } from "../models/User.js";
import { displayNameFromDocument } from "../utils/displayName.js";

/** Public directory: names only (no emails). */
export const listUsers = async (_req, res, next) => {
  try {
    const rows = await User.find({})
      .select("_id firstName middleName lastName name createdAt")
      .sort({ createdAt: -1 })
      .limit(100)
      .lean();
    res.json({
      users: rows.map((u) => ({
        id: u._id.toString(),
        name: displayNameFromDocument(u),
        joinedAt: u.createdAt?.toISOString?.() ?? null,
      })),
    });
  } catch (error) {
    next(error);
  }
};
