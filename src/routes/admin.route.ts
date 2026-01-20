import { admin, adminChangePassword, adminLogin, adminRefreshToken, adminVerifyOTP } from "@/controllers/admin/auth.controller";
import { getCategoriesList, getQuestionsList, getSubjectsList, getTestsList } from "@/controllers/admin/content.controller";
import { getDashboardCharts, getDashboardStats, getRecentUsersWidget } from "@/controllers/admin/dashboard.controller";
import { getPaymentHistory, getSubscriptionPlansList } from "@/controllers/admin/finance.controller";
import { getAllUsersData } from "@/controllers/admin/user.controller";
import { verifyAdmin, verifyToken } from "@/middlewares/auth.middleware";
import expores from "express"


const router = expores.Router();

router.get("/me",verifyToken,verifyAdmin,admin);
router.post("/admin-login",adminLogin);
router.post("/admin-verify-otp",adminVerifyOTP);
router.post("/admin-logout",verifyToken,verifyAdmin,adminLogin)
router.post("/admin-password-change",verifyToken,verifyAdmin,adminChangePassword);
router.post('/admin-refresh-token',verifyToken,verifyAdmin,adminRefreshToken);

// user 
router.get("/get-all-users-data",verifyToken,verifyAdmin,getAllUsersData);

// content
router.get("/get-categories-list",verifyToken,verifyAdmin,getCategoriesList);
router.get("/get-subjects-list",verifyToken,verifyAdmin,getSubjectsList);
router.get("/get-questions-list",verifyToken,verifyAdmin,getQuestionsList);
router.get("/get-tests-list",verifyToken,verifyAdmin,getTestsList);

// dashboard
router.get("/get-dashboard-stats",verifyToken,verifyAdmin,getDashboardStats);
router.get("/get-dashboard-charts",verifyToken,verifyAdmin,getDashboardCharts);
router.get("/get-recent-user-widget",verifyToken,verifyAdmin,getRecentUsersWidget);

// finance
router.get("/get-payment-history",verifyToken,verifyAdmin,getPaymentHistory);
router.get("/get-subscription-plan-list",verifyToken,verifyAdmin,getSubscriptionPlansList);

export default router;