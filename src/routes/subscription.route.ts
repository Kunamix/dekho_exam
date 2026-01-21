import { cancelUserSubscription, createSubscriptionPlan, createUserSubscription, deleteSubscriptionPlan, extendUserSubscription, getAllSubscriptionPlans, getAllUserSubscriptions, getSubscriptionPlanById, getSubscriptionStats, updateSubscriptionPlan } from '@/controllers/subscription.controller';
import { verifyAdmin, verifyToken } from '@/middlewares/auth.middleware';
import {Router } from 'express'



const router = Router();


router.post("/subscription/subscription-plans", verifyToken, verifyAdmin, createSubscriptionPlan);
router.get("/subscription/subscription-plans", verifyToken, verifyAdmin, getAllSubscriptionPlans);
router.get("/subscription/subscription-plans/stats", verifyToken, verifyAdmin, getSubscriptionStats);
router.get("/subscription/subscription-plans/:id", verifyToken, verifyAdmin, getSubscriptionPlanById);
router.put("/subscription/subscription-plans/:id", verifyToken, verifyAdmin, updateSubscriptionPlan);
router.delete("/subscription/subscription-plans/:id", verifyToken, verifyAdmin, deleteSubscriptionPlan);


router.get("/subscription/user-subscriptions", verifyToken, verifyAdmin, getAllUserSubscriptions);
router.post("/subscription/user-subscriptions", verifyToken, verifyAdmin, createUserSubscription);
router.post("/subscription/user-subscriptions/:id/cancel", verifyToken, verifyAdmin, cancelUserSubscription);
router.post("/subscription/user-subscriptions/:id/extend", verifyToken, verifyAdmin, extendUserSubscription);

export default router;