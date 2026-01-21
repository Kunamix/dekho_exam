import {
  getCategoriesList,
  getQuestionsList,
  getSubjectsList,
  getTestsList,
} from "@/controllers/dashboard/content.controller";
import {
  getDashboardCharts,
  getDashboardStats,
  getRecentUsersWidget,
} from "@/controllers/dashboard/dashboard.controller";
import {
  getPaymentHistory,
  getSubscriptionPlansList,
} from "@/controllers/dashboard/finance.controller";
import { getAllUsersData } from "@/controllers/dashboard/user.controller";
import { verifyAdmin, verifyToken } from "@/middlewares/auth.middleware";
import expores from "express";

const router = expores.Router();

// user
router.get("/dashboard/get-all-users-data", verifyToken, verifyAdmin, getAllUsersData);

// content
router.get("/dashboard/get-categories-list", verifyToken, verifyAdmin, getCategoriesList);
router.get("/dashboard/get-subjects-list", verifyToken, verifyAdmin, getSubjectsList);
router.get("/dashboard/get-questions-list", verifyToken, verifyAdmin, getQuestionsList);
router.get("/dashboard/get-tests-list", verifyToken, verifyAdmin, getTestsList);

// dashboard
router.get("/dashboard/get-dashboard-stats", verifyToken, verifyAdmin, getDashboardStats);
router.get(
  "/dashboard/get-dashboard-charts",
  verifyToken,
  verifyAdmin,
  getDashboardCharts,
);
router.get(
  "/dashboard/get-recent-user-widget",
  verifyToken,
  verifyAdmin,
  getRecentUsersWidget,
);

// finance
router.get("/get-payment-history", verifyToken, verifyAdmin, getPaymentHistory);
router.get(
  "/get-subscription-plan-list",
  verifyToken,
  verifyAdmin,
  getSubscriptionPlansList,
);

export default router;
