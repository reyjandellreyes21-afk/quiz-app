import { User } from "../models/User.js";

/** Public directory: names only (no emails). */
export const listUsers = async (_req, res, next) => {
  try {
    const rows = await User.find({})
      .select("_id name createdAt")
      .sort({ createdAt: -1 })
      .limit(100)
      .lean();
    res.json({
      users: rows.map((u) => ({
        id: u._id.toString(),
        name: u.name,
        joinedAt: u.createdAt?.toISOString?.() ?? null,
      })),
    });
  } catch (error) {
    next(error);
  }
};
