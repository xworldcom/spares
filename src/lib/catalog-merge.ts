/**
 * Merge helpers for durable catalog writes.
 *
 * Every mutation rewrites the whole `db.json` document. Preview, Soft Launch, and each
 * serverless instance share one Blob object, so a write built from a snapshot that is a
 * few hundred milliseconds old used to erase rows another request had just written —
 * staff logins Kevin created stopped signing in and vanished from Directory. Rows that
 * identify people, hosts, and the org tree are merged against the latest durable copy
 * instead of overwritten.
 */

export type MergeableRow = { id: string; deletedAt?: string };

export type MergeableUser = MergeableRow & { email: string };

function normalize(email: string) {
  return email.trim().toLowerCase();
}

/**
 * Union by id, in the order the writer intends. Rows only in `latest` are kept because a
 * concurrent writer added them; a soft delete on either side stays deleted so a stale
 * writer cannot resurrect a removed person.
 */
export function mergeRowsForWrite<T extends MergeableRow>(
  latest: readonly T[],
  next: readonly T[],
): T[] {
  const latestById = new Map(latest.map((row) => [row.id, row]));
  const intended = new Set(next.map((row) => row.id));
  const merged: T[] = next.map((row) => {
    const previous = latestById.get(row.id);
    if (!previous) {
      return row;
    }
    if (previous.deletedAt || row.deletedAt) {
      const deletedAt = previous.deletedAt ?? row.deletedAt;
      return { ...previous, ...row, deletedAt };
    }
    return row;
  });
  for (const row of latest) {
    if (!intended.has(row.id)) {
      merged.push(row);
    }
  }
  return merged;
}

/**
 * A seed heal can move a demo login onto its canonical id. Keeping the pre-heal row too
 * would leave two live rows for one address, and login fails closed on ambiguity — so
 * when a merge produces twins, keep the rows the in-flight write knows about. Twins that
 * both arrived from concurrent writers are kept: dropping one would lose a real person.
 */
function dropStaleEmailTwins<T extends MergeableUser>(rows: T[], next: readonly T[]): T[] {
  const intended = new Set(next.map((row) => row.id));
  const liveIds = new Map<string, string[]>();
  for (const row of rows) {
    if (row.deletedAt) {
      continue;
    }
    const email = normalize(row.email);
    liveIds.set(email, [...(liveIds.get(email) ?? []), row.id]);
  }
  const dropped = new Set<string>();
  for (const ids of liveIds.values()) {
    if (ids.length < 2) {
      continue;
    }
    const keep = ids.filter((id) => intended.has(id));
    if (keep.length === 0 || keep.length === ids.length) {
      continue;
    }
    for (const id of ids) {
      if (!intended.has(id)) {
        dropped.add(id);
      }
    }
  }
  return dropped.size === 0 ? rows : rows.filter((row) => !dropped.has(row.id));
}

export function mergeUsersForWrite<T extends MergeableUser>(
  latest: readonly T[],
  next: readonly T[],
): T[] {
  return dropStaleEmailTwins(mergeRowsForWrite(latest, next), next);
}

/** True when another live row already owns the address after merging. */
export function liveEmailConflict(
  users: readonly MergeableUser[],
  login: { id: string; email: string },
) {
  const email = normalize(login.email);
  return users.some(
    (user) => user.id !== login.id && !user.deletedAt && normalize(user.email) === email,
  );
}

export function loginRenameConflicts(
  latestUsers: readonly MergeableUser[] | undefined,
  mergedUsers: readonly MergeableUser[],
  login: { id: string; email: string },
) {
  if (latestUsers && liveEmailConflict(latestUsers, login)) {
    return true;
  }
  return liveEmailConflict(mergedUsers, login);
}

export function mergeIdLists(
  latest: readonly string[] | undefined,
  next: readonly string[] | undefined,
): string[] | undefined {
  if (!latest?.length && !next?.length) {
    return undefined;
  }
  return [...new Set([...(latest ?? []), ...(next ?? [])])];
}
