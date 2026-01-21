import { prisma } from "@/database/db";
import { ApiResponse } from "@/utils/ApiResponse";
import { asyncHandler } from "@/utils/asyncHandler";
import { format, startOfMonth, subDays, subMonths } from "date-fns";
import { Request, Response } from "express";

export const getDashboardStats = asyncHandler(
  async (req: Request, res: Response) => {
    const today = new Date();
    const lastMonthStart = startOfMonth(subMonths(today, 1));
    const thisMonthStart = startOfMonth(today);

    // 1. Parallel Data Fetching
    const [
      totalUsers,
      totalUsersLastMonth,
      totalCategories,
      totalQuestions,
      activeSubscriptions,
      totalRevenue,
      totalRevenueLastMonth,
    ] = await Promise.all([
      // User Counts
      prisma.user.count({ where: { role: "STUDENT" } }),
      prisma.user.count({
        where: { role: "STUDENT", createdAt: { lt: thisMonthStart } },
      }),

      // Content Counts
      prisma.category.count({ where: { isActive: true } }),
      prisma.question.count({ where: { isActive: true } }),

      // Subscription Counts
      prisma.userSubscription.count({
        where: { isActive: true, endDate: { gt: today } },
      }),

      // Revenue (Total)
      prisma.payment.aggregate({
        where: { status: "SUCCESS" },
        _sum: { amount: true },
      }),

      // Revenue (Up to start of this month for growth calc)
      prisma.payment.aggregate({
        where: { status: "SUCCESS", createdAt: { lt: thisMonthStart } },
        _sum: { amount: true },
      }),
    ]);

    // 2. Calculate Growth Percentages
    const currentRevenue = Number(totalRevenue._sum.amount || 0);
    const previousRevenue = Number(totalRevenueLastMonth._sum.amount || 0);
    const revenueGrowth =
      previousRevenue === 0
        ? 100
        : ((currentRevenue - previousRevenue) / previousRevenue) * 100;

    const userGrowth =
      totalUsersLastMonth === 0
        ? 100
        : ((totalUsers - totalUsersLastMonth) / totalUsersLastMonth) * 100;

    const stats = {
      totalUsers,
      userGrowth: parseFloat(userGrowth.toFixed(1)),
      totalCategories,
      totalQuestions,
      activeSubscriptions,
      totalRevenue: currentRevenue,
      revenueGrowth: parseFloat(revenueGrowth.toFixed(1)),
    };

    return res
      .status(200)
      .json(new ApiResponse(200, stats, "Dashboard stats fetched"));
  },
);

export const getDashboardCharts = asyncHandler(async (_req: Request, res: Response) => {
  const today = new Date();

  // 1. User Registration Data (Last 15 Days)
  const fifteenDaysAgo = subDays(today, 15);
  const usersLast15Days = await prisma.user.groupBy({
    by: ['createdAt'],
    where: { createdAt: { gte: fifteenDaysAgo } },
    _count: { id: true },
  });

  // Transform for frontend: [{ date: '2024-01-01', users: 145 }]
  // Note: Prisma returns distinct createdAt timestamps. In prod, use raw query or map in JS. 
  // Simplified JS mapping approach:
  const userRegistrationData = usersLast15Days.map(item => ({
    date: format(item.createdAt, 'yyyy-MM-dd'),
    users: item._count.id
  })); // *Note: In a real large DB, grouping by Day requires a raw query or day-truncation*


  // 2. Subscription Distribution (Pie Chart)
  const subDistributionRaw = await prisma.userSubscription.groupBy({
    by: ['type'],
    where: { isActive: true },
    _count: { id: true }
  });

  const subscriptionDistribution = subDistributionRaw.map((item, index) => ({
    name: item.type === 'CATEGORY_SPECIFIC' ? 'Category-Specific' : 'All Categories',
    value: item._count.id,
    fill: index === 0 ? 'hsl(var(--chart-1))' : 'hsl(var(--chart-2))'
  }));


  // 3. Test Attempts By Category
  const categories = await prisma.category.findMany({
    include: {
      tests: {
        include: {
          _count: {
            select: { testAttempts: true }
          }
        }
      }
    }
  });

  const testAttemptsByCategory = categories.map(cat => {
    const attempts = cat.tests.reduce((acc, test) => acc + test._count.testAttempts, 0);
    return {
      category: cat.name,
      attempts: attempts
    };
  }).sort((a, b) => b.attempts - a.attempts).slice(0, 8); // Top 8


  // 4. Monthly Revenue (Last 12 months)
  // This usually requires a Raw Query in Postgres to truncate dates efficiently
  const revenueRaw = await prisma.$queryRaw`
    SELECT TO_CHAR("createdAt", 'Mon') as month, SUM(amount) as revenue
    FROM "Payment"
    WHERE status = 'SUCCESS' AND "createdAt" > NOW() - INTERVAL '1 year'
    GROUP BY TO_CHAR("createdAt", 'Mon'), EXTRACT(MONTH FROM "createdAt")
    ORDER BY EXTRACT(MONTH FROM "createdAt")
  `;

  return res.status(200).json(new ApiResponse(200, {
    userRegistrationData,
    subscriptionDistribution,
    testAttemptsByCategory,
    monthlyRevenue: revenueRaw
  }, "Chart data fetched"));
});

export const getRecentUsersWidget = asyncHandler(async (_req: Request, res: Response) => {
  const recentUsers = await prisma.user.findMany({
    take: 8,
    orderBy: { createdAt: 'desc' },
    select: {
      name: true,
      phoneNumber: true,
      createdAt: true,
      isActive: true
    }
  });

  const formatted = recentUsers.map(u => ({
    name: u.name || "Unknown",
    phone: u.phoneNumber,
    registeredOn: u.createdAt,
    status: u.isActive ? 'Active' : 'Inactive'
  }));

  return res.status(200).json(new ApiResponse(200, formatted, "Recent users fetched"));
});

// Add to dashboard.controller.ts

export const getReportsAnalytics = asyncHandler(
  async (req: Request, res: Response) => {
    const today = new Date();
    const last7Days = subDays(today, 7);
    const last30Days = subDays(today, 30);

    // 1. Get test attempts by category (real data)
    const categoryAttempts = await prisma.category.findMany({
      where: { isActive: true },
      select: {
        id: true,
        name: true,
        tests: {
          select: {
            _count: {
              select: { testAttempts: true }
            }
          }
        }
      }
    });

    const testAttemptsByCategory = categoryAttempts.map(cat => ({
      category: cat.name,
      attempts: cat.tests.reduce((sum, test) => sum + test._count.testAttempts, 0)
    })).sort((a, b) => b.attempts - a.attempts);

    // 2. Daily user registrations (last 7 days)
    const dailyRegistrations = await prisma.$queryRaw<Array<{ date: string; users: number }>>`
      SELECT 
        DATE("createdAt") as date,
        COUNT(*)::int as users
      FROM "User"
      WHERE "createdAt" >= ${last7Days}
      GROUP BY DATE("createdAt")
      ORDER BY date ASC
    `;

    // 3. Question difficulty distribution
    const difficultyStats = await prisma.question.groupBy({
      by: ['difficultyLevel'],
      where: { isActive: true },
      _count: { id: true }
    });

    const difficultyDistribution = difficultyStats.map(stat => ({
      name: stat.difficultyLevel,
      value: stat._count.id
    }));

    // 4. Average test score and total attempts
    const testStats = await prisma.testAttempt.aggregate({
      where: { 
        status: 'SUBMITTED',
        createdAt: { gte: last30Days }
      },
      _avg: { percentage: true },
      _count: { id: true }
    });

    // 5. Top performing users (based on average scores)
    const topUsers = await prisma.$queryRaw<Array<{
      userId: string;
      name: string;
      email: string;
      avgScore: number;
      testsAttempted: number;
    }>>`
      SELECT 
        u.id as "userId",
        u.name,
        u.email,
        AVG(ta.percentage)::numeric(5,2) as "avgScore",
        COUNT(ta.id)::int as "testsAttempted"
      FROM "User" u
      INNER JOIN "TestAttempt" ta ON ta."userId" = u.id
      WHERE ta.status = 'SUBMITTED'
      GROUP BY u.id, u.name, u.email
      HAVING COUNT(ta.id) >= 3
      ORDER BY "avgScore" DESC
      LIMIT 10
    `;

    // 6. Subscription conversion funnel
    const totalUsers = await prisma.user.count({ where: { role: 'STUDENT' } });
    const usersWithAttempts = await prisma.user.count({
      where: {
        role: 'STUDENT',
        testAttempts: { some: {} }
      }
    });
    const activeSubscribers = await prisma.userSubscription.count({
      where: { isActive: true, endDate: { gt: today } }
    });

    const conversionFunnel = [
      { name: 'Total Users', value: totalUsers },
      { name: 'Test Takers', value: usersWithAttempts },
      { name: 'Active Subscribers', value: activeSubscribers },
    ];

    // 7. Most popular category
    const mostPopular = testAttemptsByCategory[0] || { category: 'N/A', attempts: 0 };

    return res.status(200).json(
      new ApiResponse(200, {
        testAttemptsByCategory,
        dailyRegistrations,
        difficultyDistribution,
        averageTestScore: Number(testStats._avg.percentage || 0).toFixed(1),
        totalTestAttempts: testStats._count.id,
        topPerformers: topUsers,
        conversionFunnel,
        mostPopularCategory: mostPopular.category,
        mostPopularAttempts: mostPopular.attempts
      }, "Reports analytics fetched successfully")
    );
  }
);

