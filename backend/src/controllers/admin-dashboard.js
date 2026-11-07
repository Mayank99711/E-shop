import { getAdminDashboard } from "../services/admin-dashboard.js";

export async function adminDashboard(_request, response, next) {
  try {
    response.json(await getAdminDashboard());
  } catch (error) {
    next(error);
  }
}
