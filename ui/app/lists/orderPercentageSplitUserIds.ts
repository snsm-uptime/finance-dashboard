/**
 * Leftmost percentage-track segment is always the signed-in user when they
 * are a member. Remaining ids keep their original relative order.
 */
export function orderPercentageSplitUserIds(
  userIds: string[],
  currentUserId: string,
): string[] {
  if (userIds.length === 0) return userIds;
  const rest = userIds.filter((id) => id !== currentUserId);
  if (rest.length === userIds.length) return userIds;
  return [currentUserId, ...rest];
}
