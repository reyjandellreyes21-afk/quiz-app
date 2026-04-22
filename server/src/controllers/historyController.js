import { Attempt } from "../models/Attempt.js";
import { AppError } from "../errors/AppError.js";

export const getMyHistory = async (req, res, next) => {
  try {
    const page = Number(req.query.page || 1);
    const limit = Number(req.query.limit || 0);
    const shouldPaginate = Number.isFinite(page) && Number.isFinite(limit) && page > 0 && limit > 0;

    if (!shouldPaginate) {
      const results = await Attempt.find({ userId: req.user.id }).sort({ submittedAt: -1 }).lean();
      return res.json(results);
    }

    const skip = (page - 1) * limit;
    const [items, total] = await Promise.all([
      Attempt.find({ userId: req.user.id }).sort({ submittedAt: -1 }).skip(skip).limit(limit).lean(),
      Attempt.countDocuments({ userId: req.user.id }),
    ]);
    return res.json({
      items,
      pagination: { page, limit, total },
    });
  } catch (error) {
    next(error);
  }
};

export const getMyDashboard = async (req, res, next) => {
  try {
    const attempts = await Attempt.find({ userId: req.user.id }).lean();
    const totalAttempts = attempts.length;
    const averageScore = totalAttempts
      ? Math.round(attempts.reduce((sum, a) => sum + a.scorePercent, 0) / totalAttempts)
      : 0;
    const bestScore = totalAttempts ? Math.max(...attempts.map((a) => a.scorePercent)) : 0;

    res.json({
      totalAttempts,
      averageScore,
      bestScore,
      recentAttempts: attempts
        .sort((a, b) => new Date(b.submittedAt) - new Date(a.submittedAt))
        .slice(0, 5),
    });
  } catch (error) {
    next(error);
  }
};

export const getAttemptById = async (req, res, next) => {
  try {
    const attempt = await Attempt.findById(req.params.attemptId).lean();
    if (!attempt) throw new AppError(404, "Attempt not found.", null, "NOT_FOUND");
    if (attempt.userId.toString() !== req.user.id) throw new AppError(403, "Forbidden.", null, "FORBIDDEN");
    res.json(attempt);
  } catch (error) {
    next(error);
  }
};

/** Removes all rows for this user in MongoDB collection `attempts` (see Attempt model). */
export const clearMyHistory = async (req, res, next) => {
  try {
    await Attempt.deleteMany({ userId: req.user.id });
    res.status(204).send();
  } catch (error) {
    next(error);
  }
};
