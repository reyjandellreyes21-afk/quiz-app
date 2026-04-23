/** Full display string from structured name + legacy `name` fallback. */
export function displayNameFromDocument(doc) {
  if (!doc) return "";
  const fn = typeof doc.firstName === "string" ? doc.firstName.trim() : "";
  const mn = typeof doc.middleName === "string" ? doc.middleName.trim() : "";
  const ln = typeof doc.lastName === "string" ? doc.lastName.trim() : "";
  const fromParts = [fn, mn, ln].filter(Boolean).join(" ");
  if (fromParts) return fromParts;
  return typeof doc.name === "string" ? doc.name.trim() : "";
}

function birthdayToIsoDate(d) {
  if (!d) return "";
  const x = d instanceof Date ? d : new Date(d);
  if (Number.isNaN(x.getTime())) return "";
  return x.toISOString().slice(0, 10);
}

/** @param {import("mongoose").Document | object} doc */
export function userToClient(doc) {
  const o = doc?.toObject ? doc.toObject() : doc;
  if (!o) return null;
  const id = o._id?.toString?.() ?? o._id;
  return {
    id,
    firstName: o.firstName ?? "",
    middleName: o.middleName ?? "",
    lastName: o.lastName ?? "",
    name: displayNameFromDocument(o),
    email: o.email,
    avatarUrl: o.avatarUrl || "",
    phone: o.phone ?? "",
    birthday: birthdayToIsoDate(o.birthday),
    address: o.address ?? "",
    education: o.education ?? "",
    gender: o.gender ?? "",
  };
}

/** Split Google `name` into first / middle / last. */
export function splitGoogleDisplayName(fullName, emailLocalFallback) {
  const raw = String(fullName || "").trim();
  if (!raw) {
    const fb = String(emailLocalFallback || "User").split("@")[0] || "User";
    return { firstName: fb, middleName: "", lastName: fb };
  }
  const parts = raw.split(/\s+/).filter(Boolean);
  if (parts.length === 1) return { firstName: parts[0], middleName: "", lastName: parts[0] };
  if (parts.length === 2) return { firstName: parts[0], middleName: "", lastName: parts[1] };
  return {
    firstName: parts[0],
    middleName: parts.slice(1, -1).join(" "),
    lastName: parts[parts.length - 1],
  };
}
