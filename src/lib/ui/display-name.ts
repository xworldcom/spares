function titleCaseToken(token: string): string {
  const letter = token.match(/[a-zA-Z0-9]/);
  if (!letter) {
    return token;
  }
  const index = token.indexOf(letter[0]);
  return (
    token.slice(0, index) +
    token.charAt(index).toUpperCase() +
    token.slice(index + 1).toLowerCase()
  );
}

/** Prefer stored profile name, else derive from email local-part. */
export function displayPersonName(user: { name?: string; email: string }): string {
  const stored = user.name?.trim();
  if (stored) {
    return stored;
  }
  return displayNameFromEmail(user.email);
}

/** Human label from an email local-part. */
export function displayNameFromEmail(email: string): string {
  const trimmed = email.trim();
  const local = trimmed.split("@")[0] ?? "";
  if (!local) {
    return trimmed || "Unknown";
  }
  const tokens = local.split(/[._+\-]+/).filter(Boolean);
  if (tokens.length === 0) {
    return trimmed;
  }
  return tokens.map(titleCaseToken).join(" ");
}
