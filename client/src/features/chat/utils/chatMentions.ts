export type MentionCandidate = {
  id: string;
  username: string;
};

export type MentionMatch = {
  userId: string;
  username: string;
};

/** Active @query at cursor, if any. */
export function getActiveMentionQuery(
  text: string,
  cursorPos: number
): { query: string; start: number; end: number } | null {
  if (cursorPos < 0 || cursorPos > text.length) return null;
  const before = text.slice(0, cursorPos);
  const m = before.match(/@([^@\n]*)$/);
  if (!m) return null;
  const start = before.length - m[0].length;
  if (start > 0 && /[A-Za-z0-9._-]/.test(before[start - 1])) return null;
  return { query: m[1], start, end: cursorPos };
}

export function filterMentionCandidates(
  candidates: MentionCandidate[],
  query: string,
  excludeUserId?: string
): MentionCandidate[] {
  const q = query.trim().toLowerCase();
  return candidates
    .filter((c) => {
      if (!c?.id || !c?.username) return false;
      if (excludeUserId && c.id === excludeUserId) return false;
      if (!q) return true;
      const name = c.username.toLowerCase();
      return name.startsWith(q) || name.includes(q);
    })
    .slice(0, 8);
}

export function insertMention(
  text: string,
  start: number,
  end: number,
  username: string
): { text: string; cursor: number } {
  const insertion = `@${username} `;
  const next = `${text.slice(0, start)}${insertion}${text.slice(end)}`;
  return { text: next, cursor: start + insertion.length };
}

/** Resolve mentions against known candidates (longest username first). */
export function resolveMentions(text: string, candidates: MentionCandidate[]): MentionMatch[] {
  if (!text || !candidates?.length) return [];
  const normalized = [...candidates]
    .filter((c) => c?.id && c?.username)
    .sort((a, b) => b.username.length - a.username.length);

  const found = new Map<string, MentionMatch>();
  let i = 0;
  while (i < text.length) {
    if (text[i] !== '@') {
      i += 1;
      continue;
    }
    if (i > 0 && /[A-Za-z0-9._-]/.test(text[i - 1])) {
      i += 1;
      continue;
    }
    const rest = text.slice(i + 1);
    let matched: MentionCandidate | null = null;
    for (const c of normalized) {
      if (rest.length < c.username.length) continue;
      if (rest.slice(0, c.username.length).toLowerCase() !== c.username.toLowerCase()) continue;
      const after = rest[c.username.length];
      if (after && /[A-Za-z0-9_]/.test(after)) continue;
      matched = c;
      break;
    }
    if (matched) {
      found.set(matched.id, { userId: matched.id, username: matched.username });
      i += 1 + matched.username.length;
    } else {
      i += 1;
    }
  }
  return Array.from(found.values());
}

export type MentionSegment =
  | { type: 'text'; value: string }
  | { type: 'mention'; value: string; username: string };

/** Split message into text / mention segments for rendering. */
export function segmentMessageMentions(
  message: string,
  mentions?: MentionMatch[] | null
): MentionSegment[] {
  if (!message) return [{ type: 'text', value: '' }];
  const list =
    mentions && mentions.length
      ? [...mentions].sort((a, b) => b.username.length - a.username.length)
      : null;

  if (!list?.length) {
    // Fallback: highlight @token without spaces
    const parts: MentionSegment[] = [];
    const re = /@([A-Za-z0-9._-]+)/g;
    let last = 0;
    let m: RegExpExecArray | null;
    while ((m = re.exec(message))) {
      if (m.index > last) parts.push({ type: 'text', value: message.slice(last, m.index) });
      parts.push({ type: 'mention', value: m[0], username: m[1] });
      last = m.index + m[0].length;
    }
    if (last < message.length) parts.push({ type: 'text', value: message.slice(last) });
    return parts.length ? parts : [{ type: 'text', value: message }];
  }

  const parts: MentionSegment[] = [];
  let i = 0;
  while (i < message.length) {
    if (message[i] !== '@') {
      let j = i + 1;
      while (j < message.length && message[j] !== '@') j += 1;
      parts.push({ type: 'text', value: message.slice(i, j) });
      i = j;
      continue;
    }
    if (i > 0 && /[A-Za-z0-9._-]/.test(message[i - 1])) {
      parts.push({ type: 'text', value: '@' });
      i += 1;
      continue;
    }
    const rest = message.slice(i + 1);
    let matched: MentionMatch | null = null;
    for (const m of list) {
      if (rest.length < m.username.length) continue;
      if (rest.slice(0, m.username.length).toLowerCase() !== m.username.toLowerCase()) continue;
      const after = rest[m.username.length];
      if (after && /[A-Za-z0-9_]/.test(after)) continue;
      matched = m;
      break;
    }
    if (matched) {
      parts.push({
        type: 'mention',
        value: `@${matched.username}`,
        username: matched.username
      });
      i += 1 + matched.username.length;
    } else {
      parts.push({ type: 'text', value: '@' });
      i += 1;
    }
  }
  return parts.length ? parts : [{ type: 'text', value: message }];
}
