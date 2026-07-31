const { createClient } = require("@supabase/supabase-js");

// ─────────────────────────────────────────────────────────────────────────────
// FIX: Supabase client is created LAZILY (inside each function call),
// NOT at module load time (top level).
//
// Why this matters:
//   When Docker starts the container, Node requires() every module before
//   app.listen() is called. If createClient() runs at the top level and
//   SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY are not yet set (e.g., because
//   Coolify injects env vars at runtime, not at require() time), the Supabase
//   client is constructed with undefined values.
//
//   While the Supabase JS client itself doesn't throw on undefined args, some
//   versions do validate synchronously and can throw, crashing the server
//   before it ever listens on port 7001 — causing the health check to always
//   fail and the container to be marked unhealthy.
//
//   Moving createClient() inside each function ensures env vars are already
//   set by the time any authentication call is made.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Returns a Supabase admin client using the service-role key.
 * Called on every request (not at module load) so env vars are guaranteed set.
 */
function getSupabaseClient() {
  return createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );
}

async function requireAuth(req, res, next) {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res.status(401).json({
        success: false,
        message: "Unauthorized",
      });
    }

    const token = authHeader.split(" ")[1];
    const supabase = getSupabaseClient();
    const { data, error } = await supabase.auth.getUser(token);

    if (error || !data?.user) {
      return res.status(401).json({
        success: false,
        message: "Invalid token",
      });
    }

    req.user = data.user;
    next();
  } catch (err) {
    return res.status(401).json({
      success: false,
      message: "Authentication failed",
    });
  }
}

async function requireFaculty(req, res, next) {
  try {
    const supabase = getSupabaseClient();
    const { data, error } = await supabase
      .from("profiles")
      .select("role, name")
      .eq("id", req.user.id)
      .single();

    if (error || !data) {
      return res.status(403).json({
        success: false,
        message: "Access denied",
      });
    }

    const isHod = String(data.name || "").toUpperCase().includes("HOD");
    if (data.role !== "faculty" && data.role !== "admin" && !isHod) {
      return res.status(403).json({
        success: false,
        message: "Access denied",
      });
    }

    next();
  } catch (err) {
    return res.status(403).json({
      success: false,
      message: "Role verification failed",
    });
  }
}

module.exports = { requireAuth, requireFaculty };
