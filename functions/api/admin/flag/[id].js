import { verifyAuth, jsonResponse, errResponse, isAdmin } from "../../_helpers.js";

// PUT /api/admin/flags/:id  { reviewed: true }
// Dismisses a report without deleting the post — for false positives, so
// admins aren't stuck choosing only between "ignore" and "delete".
export async function onRequestPut({ request, params, env }) {
  try {
    const db = env.DB;
    const cu = await verifyAuth(request, db);
    if (!cu) return errResponse("Unauthorized", 401);
    if (!isAdmin(cu)) return errResponse("Admin access required", 403);

    const flagId = params.id;
    const { reviewed } = await request.json();

    await db.prepare(
      "UPDATE post_reports SET status = ?, reviewedBy = ?, reviewedAt = ? WHERE id = ?"
    ).bind(reviewed ? "reviewed" : "pending", cu.id, Date.now(), flagId).run();

    return jsonResponse({ success: true });
  } catch (err) {
    console.error("Admin flag review error:", err);
    return errResponse("Failed to update flag: " + err.message, 500);
  }
}
