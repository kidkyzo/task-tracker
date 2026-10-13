export function credentialCounts(tokens: readonly { revoked_at: string | null }[]) {
  const active = tokens.filter((token) => token.revoked_at === null).length;
  return { active, revoked: tokens.length - active };
}
