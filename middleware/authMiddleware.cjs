const { createClient } = require("@supabase/supabase-js");

function getSupabaseServerClient() {
  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error("Supabase configuration missing");
  }

  return createClient(supabaseUrl, serviceRoleKey);
}

async function requireAuth(req, res, next) {
  try {
    const authorizationHeader = req.headers?.authorization;
    if (!authorizationHeader || !authorizationHeader.startsWith("Bearer ")) {
      return res.status(401).json({
        success: false,
        message: "Unauthorized",
        error: "Missing or invalid authorization token",
        data: null,
      });
    }

    const token = authorizationHeader.slice("Bearer ".length).trim();
    if (!token) {
      return res.status(401).json({
        success: false,
        message: "Unauthorized",
        error: "Missing authorization token",
        data: null,
      });
    }

    const supabase = getSupabaseServerClient();
    const { data: userData, error: userError } = await supabase.auth.getUser(token);

    if (userError || !userData?.user?.id) {
      return res.status(401).json({
        success: false,
        message: "Unauthorized",
        error: "Invalid or expired token",
        data: null,
      });
    }

    const user = userData.user;
    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .single();

    if (profileError || !profile?.role) {
      return res.status(401).json({
        success: false,
        message: "Unauthorized",
        error: "Unable to resolve user role",
        data: null,
      });
    }

    req.user = {
      id: user.id,
      role: profile.role,
    };

    return next();
  } catch (error) {
    console.error("requireAuth middleware error:", error);
    return res.status(401).json({
      success: false,
      message: "Unauthorized",
      error: "Authentication failed",
      data: null,
    });
  }
}

function requireRole(role) {
  return function checkRole(req, res, next) {
    try {
      if (!req.user || req.user.role !== role) {
        return res.status(403).json({
          success: false,
          message: "Forbidden",
          error: "Insufficient permissions",
          data: null,
        });
      }

      return next();
    } catch (error) {
      console.error("requireRole middleware error:", error);
      return res.status(403).json({
        success: false,
        message: "Forbidden",
        error: "Authorization failed",
        data: null,
      });
    }
  };
}

function requireAnyRole(...roles) {
  return function checkAnyRole(req, res, next) {
    try {
      if (!req.user || !roles.includes(req.user.role)) {
        return res.status(403).json({
          success: false,
          message: "Forbidden",
          error: "Insufficient permissions",
          data: null,
        });
      }
      return next();
    } catch (error) {
      console.error("requireAnyRole middleware error:", error);
      return res.status(403).json({
        success: false,
        message: "Forbidden",
        error: "Authorization failed",
        data: null,
      });
    }
  };
}

module.exports = {
  requireAuth,
  requireRole,
  requireAnyRole,
};
