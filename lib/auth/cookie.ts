// The session cookie name lives alone in this file, with no Node-only imports,
// so both the Edge middleware and the Node runtime can share one constant
// without pulling node:crypto / Prisma into the Edge bundle.
export const SESSION_COOKIE = "move_session";
