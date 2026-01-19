import { adminChangePassword, adminLogin, adminRefreshToken, adminVerifyOTP } from "@/controllers/auth.controller";
import { verifyAdmin, verifyToken } from "@/middlewares/auth.middleware";
import expores from "express"


const router = expores.Router();

router.post("/admin-login",adminLogin);
router.post("/admin-verify-otp",adminVerifyOTP);
router.post("/admin-logout",verifyToken,verifyAdmin,adminLogin)
router.post("/admin-password-change",verifyToken,verifyAdmin,adminChangePassword);
router.post('/admin-refresh-token',verifyToken,verifyAdmin,adminRefreshToken);

export default router;