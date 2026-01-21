import { cancelUserSubscription, createSubscriptionPlan, createUserSubscription, deleteSubscriptionPlan, extendUserSubscription, getAllSubscriptionPlans, getAllUserSubscriptions, getSubscriptionPlanById, getSubscriptionStats, updateSubscriptionPlan } from '@/controllers/subscription.controller';
import { verifyAdmin, verifyToken } from '@/middlewares/auth.middleware';
import {Router } from 'express'



const router = Router();


router.post("/subscription-plans", verifyToken, verifyAdmin, createSubscriptionPlan);
router.get("/subscription-plans", verifyToken, verifyAdmin, getAllSubscriptionPlans);
router.get("/subscription-plans/stats", verifyToken, verifyAdmin, getSubscriptionStats);
router.get("/subscription-plans/:id", verifyToken, verifyAdmin, getSubscriptionPlanById);
router.put("/subscription-plans/:id", verifyToken, verifyAdmin, updateSubscriptionPlan);
router.delete("/subscription-plans/:id", verifyToken, verifyAdmin, deleteSubscriptionPlan);


router.get("/user-subscriptions", verifyToken, verifyAdmin, getAllUserSubscriptions);
router.post("/user-subscriptions", verifyToken, verifyAdmin, createUserSubscription);
router.post("/user-subscriptions/:id/cancel", verifyToken, verifyAdmin, cancelUserSubscription);
router.post("/user-subscriptions/:id/extend", verifyToken, verifyAdmin, extendUserSubscription);

export default router;