import { eq } from "drizzle-orm";
import { database, user, type Database } from "@shopping-mcp/database";

/** The signed-in user's own account. `userId` must come from a verified token or session. */
export async function getAccount(userId: string, db: Database = database()) {
  const [row] = await db
    .select({ userId: user.id, email: user.email, name: user.name })
    .from(user)
    .where(eq(user.id, userId));
  return row ?? null;
}
