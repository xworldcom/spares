function firstAlnum(value: string): string {
  const match = value.match(/[a-zA-Z0-9]/);
  return match?.[0] ?? "";
}

/** Two-letter initials from an email, iPhone Messages style. No profile name yet. */
export function initialsFromEmail(email: string): string {
  const local = email.split("@")[0]?.trim() ?? "";
  if (!local) {
    return "?";
  }

  const tokens = local.split(/[._+\-]+/).filter((token) => firstAlnum(token));
  if (tokens.length >= 2) {
    return (firstAlnum(tokens[0]) + firstAlnum(tokens[1])).toUpperCase();
  }

  const letters = local.replace(/[^a-zA-Z0-9]/g, "");
  if (letters.length >= 2) {
    return letters.slice(0, 2).toUpperCase();
  }
  if (letters.length === 1) {
    return letters.toUpperCase();
  }
  return "?";
}

export function isHumanComment(activity: { kind: string }) {
  return activity.kind === "message";
}
