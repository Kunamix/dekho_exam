import { cancelUserSubscription, createSubscriptionPlan, createUserSubscription, deleteSubscriptionPlan, extendUserSubscription, getAllSubscriptionPlans, getAllUserSubscriptions, getSubscriptionPlanById, getSubscriptionStats, updateSubscriptionPlan } from '@/controllers/subscription.controller';
import { verifyAdmin, verifyToken } from '@/middlewares/auth.middleware';
import {Router } from 'express'



const router = Router();


router.post("/subscription/create", verifyToken, verifyAdmin, createSubscriptionPlan);
router.get("/subscription/get-all-subscriptions", verifyToken,  getAllSubscriptionPlans);
router.get("/subscription/stats", verifyToken, verifyAdmin, getSubscriptionStats);
router.get("/subscription/get-subscription-by-id/:id", verifyToken, verifyAdmin, getSubscriptionPlanById);
router.put("/subscription/update-subscription/:id", verifyToken, verifyAdmin, updateSubscriptionPlan);
router.delete("/subscription/delete-subscription/:id", verifyToken, verifyAdmin, deleteSubscriptionPlan);


router.get("/subscription/get-all-user-subscription", verifyToken, verifyAdmin, getAllUserSubscriptions);
router.post("/subscription/create-user-subscription", verifyToken, verifyAdmin, createUserSubscription);
router.post("/subscription/user-subscriptions/:id/cancel", verifyToken, verifyAdmin, cancelUserSubscription);
router.post("/subscription/user-subscriptions/:id/extend", verifyToken, verifyAdmin, extendUserSubscription);
router.get("/subscription/my-subscriptions", verifyToken, getAllUserSubscriptions);
export default router;