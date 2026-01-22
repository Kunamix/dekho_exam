import { prisma } from "@/database/db";
import { SubscriptionType, TestStatus } from "@/generated/prisma/enums";
import { ApiError } from "@/utils/ApiError";
import { ApiResponse } from "@/utils/ApiResponse";
import { asyncHandler } from "@/utils/asyncHandler";
import { Request, Response } from "express";

export const getTestsBySubject = asyncHandler(
  async (req: Request, res: Response) => {
    let { categoryId, subjectId } = req.params;

    if (!categoryId || !subjectId) {
      throw new ApiError(400, "Category ID and Subject ID are required");
    }

    categoryId = categoryId.toString();
    subjectId = subjectId.toString();

    // 1. Verify Subject exists in this Category
    const validLink = await prisma.categorySubject.findUnique({
      where: {
        categoryId_subjectId: {
          categoryId,
          subjectId,
        },
      },
    });

    if (!validLink) {
      throw new ApiError(
        404,
        "This subject does not belong to the selected category",
      );
    }

    // 2. Fetch Tests specifically linked to this Subject
    const tests = await prisma.test.findMany({
      where: {
        categoryId: categoryId,
        subjectId: subjectId,
        isActive: true,
      },
      select: {
        id: true,
        name: true,
        description: true,
        totalQuestions: true,
        durationMinutes: true,
        isPaid: true,
        testNumber: true,
        // Check if user has attempted this test (optional, good for UI)
        testAttempts: {
          where: { userId: (req as any).user?.userId },
          select: { status: true, totalMarks: true },
        },
      },
      orderBy: {
        testNumber: "asc",
      },
    });

    return res
      .status(200)
      .json(new ApiResponse(200, tests, "Subject tests fetched successfully"));
  },
);

export const getTestDetails = asyncHandler(
  async (req: Request, res: Response) => {
    const { testId } = req.params;

    const test = await prisma.test.findUnique({
      where: { id: testId.toString() },
      include: {
        category: { select: { name: true } },
        subject: { select: { name: true } },
      },
    });

    if (!test) {
      throw new ApiError(404, "Test not found");
    }

    return res
      .status(200)
      .json(new ApiResponse(200, test, "Test details fetched"));
  },
);

export const startTest = asyncHandler(async (req: Request, res: Response) => {
  const userId = (req as any).user.id;
  const { testId } = req.body;

  if (!testId) throw new ApiError(400, "Test ID is required");

  // 1. Fetch Test and User details
  const [test, user] = await Promise.all([
    prisma.test.findUnique({ where: { id: testId } }),
    prisma.user.findUnique({ where: { id: userId } }),
  ]);

  if (!test) throw new ApiError(404, "Test not found");
  if (!test.isActive)
    throw new ApiError(400, "This test is currently inactive");
  if (!user) throw new ApiError(404, "User not found");

  // =================================================================
  // 2. ACCESS CONTROL LOGIC (The "Gatekeeper")
  // =================================================================

  let consumeFreeAttempt = false;

  // Only check permissions if the test is marked as PAID
  if (test.isPaid) {
    const FREE_LIMIT = 2;

    // Check A: Does user have free attempts left?
    if (user.freeTestsUsed < FREE_LIMIT) {
      consumeFreeAttempt = true; // We will increment this later in transaction
    } else {
      // Check B: User has used all free attempts. Check Subscriptions.

      const activeSubscription = await prisma.userSubscription.findFirst({
        where: {
          userId: userId,
          isActive: true,
          endDate: { gt: new Date() }, // Subscription must not be expired
          OR: [
            // Option 1: User has "ALL_CATEGORIES" pass
            { type: SubscriptionType.ALL_CATEGORIES },
            // Option 2: User has bought THIS specific category
            {
              type: SubscriptionType.CATEGORY_SPECIFIC,
              categoryId: test.categoryId,
            },
          ],
        },
      });

      if (!activeSubscription) {
        throw new ApiError(
          403,
          "You have used your free attempts. Please purchase a subscription to access this test.",
        );
      }
    }
  }

  // =================================================================
  // 3. QUESTION GENERATION LOGIC
  // =================================================================

  let selectedQuestions: any[] = [];

  if (test.subjectId) {
    // SCENARIO A: Subject-Specific Test (e.g., "Math Test 1")
    // Fetch random questions from topics belonging to this subject

    // 1. Get Topic IDs
    const topics = await prisma.topic.findMany({
      where: { subjectId: test.subjectId, isActive: true },
      select: { id: true },
    });
    const topicIds = topics.map((t) => t.id);

    // 2. Fetch random questions
    // (In production with millions of rows, use raw query. For now, this is efficient enough)
    const allQuestionIds = await prisma.question.findMany({
      where: { topicId: { in: topicIds }, isActive: true },
      select: { id: true },
    });

    // Shuffle and slice
    const shuffled = allQuestionIds.sort(() => 0.5 - Math.random());
    const selectedIds = shuffled.slice(0, test.totalQuestions).map((q) => q.id);

    selectedQuestions = await prisma.question.findMany({
      where: { id: { in: selectedIds } },
      select: {
        id: true,
        questionText: true,
        option1: true,
        option2: true,
        option3: true,
        option4: true,
        questionImageUrl: true,
      },
    });
  } else {
    // SCENARIO B: Full Mock Test (Category Level)
    // We need to fetch questions based on the blueprint defined in CategorySubject
    // (e.g., 25 Math, 25 English, 25 GK, 25 Reasoning)

    const blueprint = await prisma.categorySubject.findMany({
      where: { categoryId: test.categoryId },
      include: { subject: { include: { topics: { select: { id: true } } } } },
    });

    for (const item of blueprint) {
      const questionsNeeded = item.questionsPerTest;
      const subjectTopicIds = item.subject.topics.map((t) => t.id);

      // Fetch potential question IDs for this subject
      const subjectQuestionIds = await prisma.question.findMany({
        where: { topicId: { in: subjectTopicIds }, isActive: true },
        select: { id: true },
      });

      // Shuffle and take required amount
      const shuffled = subjectQuestionIds.sort(() => 0.5 - Math.random());
      const selectedIds = shuffled.slice(0, questionsNeeded).map((q) => q.id);

      const subjectQuestions = await prisma.question.findMany({
        where: { id: { in: selectedIds } },
        select: {
          id: true,
          questionText: true,
          option1: true,
          option2: true,
          option3: true,
          option4: true,
          questionImageUrl: true,
        },
      });

      selectedQuestions = [...selectedQuestions, ...subjectQuestions];
    }
  }

  // Shuffle the final list so subjects are mixed (optional)
  selectedQuestions = selectedQuestions.sort(() => 0.5 - Math.random());

  // =================================================================
  // 4. TRANSACTION: CREATE ATTEMPT & UPDATE USER
  // =================================================================

  const result = await prisma.$transaction(async (tx) => {
    // A. Create the Attempt
    const attempt = await tx.testAttempt.create({
      data: {
        userId: userId.toString(),
        testId: testId.toString(),
        attemptNumber: 1,
        totalQuestions: selectedQuestions.length,
        questionIds: selectedQuestions.map((q) => q.id), // Store the exact order
        questionSetSeed: Date.now().toString(), // Simple seed reference
        status: "IN_PROGRESS",
      },
    });

    // B. If this was a free attempt, increment the counter
    if (consumeFreeAttempt) {
      await tx.user.update({
        where: { id: userId },
        data: { freeTestsUsed: { increment: 1 } },
      });
    }

    return attempt;
  });

  return res.status(201).json(
    new ApiResponse(
      201,
      {
        attemptId: result.id,
        duration: test.durationMinutes,
        questions: selectedQuestions,
        isFreeAttempt: consumeFreeAttempt,
      },
      "Test started successfully",
    ),
  );
});


export const reportIssue = asyncHandler(async (req: Request, res: Response) => {
  const userId = (req as any).user.id;
  const { type, entityId, description } = req.body;

  if (!type || !description) {
    throw new ApiError(400, "Type and Description are required");
  }

  // Basic validation based on type
  if (type === "QUESTION" || type === "TEST") {
    if (!entityId)
      throw new ApiError(
        400,
        "Entity ID is required for Question/Test reports",
      );
  }

  // Create Report
  const report = await prisma.report.create({
    data: {
      userId,
      type, // e.g., "QUESTION"
      entityId, // e.g., Question ID
      description, // e.g., "Option 2 is incorrect, it should be 150 not 100"
      status: "PENDING",
    },
  });

  // Optional: Trigger Notification for Admins here
  // await notifyAdmins(report);

  return res
    .status(201)
    .json(
      new ApiResponse(
        201,
        {},
        "Report submitted successfully. We will review it shortly.",
      ),
    );
});

// Create Test
export const createTest = asyncHandler(async (req: Request, res: Response) => {
  const userId = (req as any).user?.userId;
  const {
    categoryId,
    subjectId,
    name,
    description,
    totalQuestions,
    durationMinutes,
    positiveMarks,
    negativeMarks,
    isPaid,
    testNumber,
  } = req.body;

  if (!categoryId || !name || !testNumber) {
    throw new ApiError(
      400,
      "Category ID, test name, and test number are required",
    );
  }

  const category = await prisma.category.findUnique({
    where: { id: categoryId },
  });

  if (!category) {
    throw new ApiError(404, "Category not found");
  }

  if (subjectId) {
    const subject = await prisma.subject.findUnique({
      where: { id: subjectId },
    });

    if (!subject) {
      throw new ApiError(404, "Subject not found");
    }
  }

  // Check for duplicate test number in category
  const existingTest = await prisma.test.findFirst({
    where: {
      categoryId,
      testNumber: Number(testNumber),
    },
  });

  if (existingTest) {
    throw new ApiError(
      409,
      "Test with this number already exists in this category",
    );
  }

  const test = await prisma.test.create({
    data: {
      categoryId,
      subjectId,
      name,
      description,
      totalQuestions: Number(totalQuestions) || 100,
      durationMinutes: Number(durationMinutes) || 60,
      positiveMarks: positiveMarks || 1.0,
      negativeMarks: negativeMarks || 0.25,
      isPaid: isPaid || false,
      testNumber: Number(testNumber),
      createdById: userId,
    },
  });

  return res
    .status(201)
    .json(new ApiResponse(201, test, "Test created successfully"));
});

// Get All Tests
export const getAllTests = asyncHandler(async (req: Request, res: Response) => {
  const {
    page = 1,
    limit = 10,
    isActive,
    isPaid,
    search,
    categoryId,
    subjectId,
  } = req.query;

  const skip = (Number(page) - 1) * Number(limit);

  const where: any = {};

  if (isActive !== undefined) {
    where.isActive = isActive === "true";
  }

  if (isPaid !== undefined) {
    where.isPaid = isPaid === "true";
  }

  if (search) {
    where.OR = [
      { name: { contains: search as string, mode: "insensitive" } },
      { description: { contains: search as string, mode: "insensitive" } },
    ];
  }

  if (categoryId) {
    where.categoryId = categoryId as string;
  }

  if (subjectId) {
    where.subjectId = subjectId as string;
  }

  const [tests, total] = await Promise.all([
    prisma.test.findMany({
      where,
      skip,
      take: Number(limit),
      orderBy: [{ testNumber: "asc" }, { createdAt: "desc" }],
      include: {
        category: {
          select: {
            id: true,
            name: true,
          },
        },
        subject: {
          select: {
            id: true,
            name: true,
          },
        },
        _count: {
          select: {
            testAttempts: true,
          },
        },
        createdBy: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
      },
    }),
    prisma.test.count({ where }),
  ]);

  return res.status(200).json(
    new ApiResponse(
      200,
      {
        tests,
        pagination: {
          total,
          page: Number(page),
          limit: Number(limit),
          totalPages: Math.ceil(total / Number(limit)),
        },
      },
      "Tests fetched successfully",
    ),
  );
});

// Get Single Test
export const getTestById = asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;

  const test = await prisma.test.findUnique({
    where: { id: id.toString() },
    include: {
      category: {
        select: {
          id: true,
          name: true,
          categorySubjects: {
            include: {
              subject: {
                select: {
                  id: true,
                  name: true,
                },
              },
            },
          },
        },
      },
      subject: {
        select: {
          id: true,
          name: true,
        },
      },
      testAttempts: {
        select: {
          id: true,
          userId: true,
          attemptNumber: true,
          status: true,
          totalMarks: true,
          percentage: true,
          submittedAt: true,
        },
        orderBy: { createdAt: "desc" },
        take: 10,
      },
      _count: {
        select: {
          testAttempts: true,
        },
      },
      createdBy: {
        select: {
          id: true,
          name: true,
          email: true,
        },
      },
    },
  });

  if (!test) {
    throw new ApiError(404, "Test not found");
  }

  return res
    .status(200)
    .json(new ApiResponse(200, test, "Test fetched successfully"));
});

// Update Test
export const updateTest = asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;
  const {
    name,
    description,
    totalQuestions,
    durationMinutes,
    positiveMarks,
    negativeMarks,
    isPaid,
    testNumber,
    isActive,
  } = req.body;

  const test = await prisma.test.findUnique({
    where: { id: id.toString() },
  });

  if (!test) {
    throw new ApiError(404, "Test not found");
  }

  // Check for duplicate test number if updating
  if (testNumber && Number(testNumber) !== test.testNumber) {
    const existingTest = await prisma.test.findFirst({
      where: {
        categoryId: test.categoryId,
        testNumber: Number(testNumber),
        id: { not: id.toString() },
      },
    });

    if (existingTest) {
      throw new ApiError(
        409,
        "Test with this number already exists in this category",
      );
    }
  }

  const updatedTest = await prisma.test.update({
    where: { id: id.toString() },
    data: {
      name,
      description,
      totalQuestions: totalQuestions ? Number(totalQuestions) : undefined,
      durationMinutes: durationMinutes ? Number(durationMinutes) : undefined,
      positiveMarks,
      negativeMarks,
      isPaid,
      testNumber: testNumber ? Number(testNumber) : undefined,
      isActive,
    },
  });

  return res
    .status(200)
    .json(new ApiResponse(200, updatedTest, "Test updated successfully"));
});

// Delete Test
export const deleteTest = asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;

  const test = await prisma.test.findUnique({
    where: { id: id.toString() },
    include: {
      _count: {
        select: {
          testAttempts: true,
        },
      },
    },
  });

  if (!test) {
    throw new ApiError(404, "Test not found");
  }

  if (test._count.testAttempts > 0) {
    // Soft delete if test has attempts
    await prisma.test.update({
      where: { id: id.toString() },
      data: { isActive: false },
    });

    return res
      .status(200)
      .json(
        new ApiResponse(
          200,
          {},
          "Test has been deactivated (soft deleted) as it has associated attempts",
        ),
      );
  }

  // Hard delete if no attempts
  await prisma.test.delete({
    where: { id: id.toString() },
  });

  return res
    .status(200)
    .json(new ApiResponse(200, {}, "Test deleted successfully"));
});

// Get Test Statistics
export const getTestStats = asyncHandler(
  async (req: Request, res: Response) => {
    const { testId } = req.query;

    const where: any = {};

    if (testId) {
      where.testId = testId as string;
    }

    const [
      totalAttempts,
      submittedAttempts,
      averageScore,
      averagePercentage,
      completionRate,
    ] = await Promise.all([
      prisma.testAttempt.count({ where }),
      prisma.testAttempt.count({
        where: { ...where, status: "SUBMITTED" },
      }),
      prisma.testAttempt.aggregate({
        where: { ...where, status: "SUBMITTED" },
        _avg: {
          totalMarks: true,
        },
      }),
      prisma.testAttempt.aggregate({
        where: { ...where, status: "SUBMITTED" },
        _avg: {
          percentage: true,
        },
      }),
      prisma.testAttempt.groupBy({
        by: ["status"],
        where,
        _count: true,
      }),
    ]);

    const stats = {
      totalAttempts,
      submittedAttempts,
      inProgressAttempts: totalAttempts - submittedAttempts,
      averageScore: averageScore._avg.totalMarks || 0,
      averagePercentage: averagePercentage._avg.percentage || 0,
      statusBreakdown: completionRate.reduce((acc, curr) => {
        acc[curr.status] = curr._count;
        return acc;
      }, {} as any),
    };

    return res
      .status(200)
      .json(
        new ApiResponse(200, stats, "Test statistics fetched successfully"),
      );
  },
);

// Clone Test
export const cloneTest = asyncHandler(async (req: Request, res: Response) => {
  const userId = (req as any).user?.userId;
  const { id } = req.params;
  const { testNumber } = req.body;

  if (!testNumber) {
    throw new ApiError(400, "Test number is required for cloning");
  }

  const originalTest = await prisma.test.findUnique({
    where: { id: id.toString() },
  });

  if (!originalTest) {
    throw new ApiError(404, "Test not found");
  }

  // Check for duplicate test number
  const existingTest = await prisma.test.findFirst({
    where: {
      categoryId: originalTest.categoryId,
      testNumber: Number(testNumber),
    },
  });

  if (existingTest) {
    throw new ApiError(
      409,
      "Test with this number already exists in this category",
    );
  }

  const clonedTest = await prisma.test.create({
    data: {
      categoryId: originalTest.categoryId,
      subjectId: originalTest.subjectId,
      name: `${originalTest.name} (Copy)`,
      description: originalTest.description,
      totalQuestions: originalTest.totalQuestions,
      durationMinutes: originalTest.durationMinutes,
      positiveMarks: originalTest.positiveMarks,
      negativeMarks: originalTest.negativeMarks,
      isPaid: originalTest.isPaid,
      testNumber: Number(testNumber),
      createdById: userId,
    },
  });

  return res
    .status(201)
    .json(new ApiResponse(201, clonedTest, "Test cloned successfully"));
});

// Naman sir 
export const getTestsByCategory = asyncHandler(async (req: Request, res: Response) => {
  const { categoryId } = req.params;
  const userId = (req as any).user.userId;

  if (!categoryId) throw new ApiError(400, "Category ID is required");

  const tests = await prisma.test.findMany({
    where: { categoryId:categoryId.toString(), isActive: true },
    orderBy: { createdAt: "desc" },
    include: {
      // Check if user has attempted this test
      testAttempts: {
        where: { userId },
        select: { status: true, id: true },
        take: 1, // We only need to know if an attempt exists
        orderBy: { createdAt: 'desc' }
      }
    }
  });

  const formatted = tests.map(test => {
    const lastAttempt = test.testAttempts[0];
    let attemptStatus = "NOT_STARTED";
    
    if (lastAttempt) {
      attemptStatus = lastAttempt.status; // IN_PROGRESS, SUBMITTED, etc.
    }

    return {
      id: test.id,
      name: test.name,
      description: test.description,
      totalQuestions: test.totalQuestions,
      durationMinutes: test.durationMinutes,
      isPaid: test.isPaid,
      attemptStatus, // Frontend uses this to show "Start", "Resume", or "View Result"
      lastAttemptId: lastAttempt?.id || null
    };
  });

  return res.status(200).json(new ApiResponse(200, formatted, "Tests fetched successfully"));
});

// 3. Get Popular / Recommended Tests
export const getPopularTests = asyncHandler(async (req: Request, res: Response) => {
  // Logic: Fetch top 5 tests with most attempts (simplified here as fetching any active tests)
  // In production, you might sort by 'attempts count' if you add that field.
  const tests = await prisma.test.findMany({
    where: { isActive: true },
    take: 5,
    orderBy: { createdAt: "desc" }, // Or order by popularity logic
    select: {
      id: true,
      name: true,
      totalQuestions: true,
      durationMinutes: true,
      isPaid: true,
      category: {
        select: { name: true }
      }
    }
  });

  return res.status(200).json(new ApiResponse(200, tests, "Popular tests fetched"));
});

// 4. Get Attempt History
export const getAttemptHistory = asyncHandler(async (req: Request, res: Response) => {
  const userId = (req as any).user.userId;

  const attempts = await prisma.testAttempt.findMany({
    where: { 
      userId,
      status: "SUBMITTED" 
    },
    orderBy: { submittedAt: "desc" },
    include: {
      test: {
        select: { name: true, totalQuestions: true }
      }
    }
  });

  const formatted = attempts.map(a => ({
    attemptId: a.id,
    testName: a.test.name,
    score: Number(a.totalMarks),
    percentage: Number(a.percentage),
    submittedAt: a.submittedAt,
    accuracy: a.attemptedCount > 0 
      ? Math.round((a.correctCount / a.attemptedCount) * 100) 
      : 0
  }));

  return res.status(200).json(new ApiResponse(200, formatted, "History fetched"));
});


// 1. Get Test Instructions (Meta)
export const getTestInstructions = asyncHandler(async (req: Request, res: Response) => {
  const { testId } = req.params;

  const test = await prisma.test.findUnique({
    where: { id: testId.toString() },
    select: {
      id: true,
      name: true,
      description: true,
      durationMinutes: true,
      totalQuestions: true,
      positiveMarks: true,
      negativeMarks: true,
      isPaid: true
    }
  });

  if (!test) throw new ApiError(404, "Test not found");

  return res.status(200).json(new ApiResponse(200, test, "Instructions fetched"));
});

// 2. Start Test Attempt
export const startTestAttempt = asyncHandler(async (req: Request, res: Response) => {
  const { testId } = req.params;
  const userId = (req as any).user.userId;

  if (!testId) throw new ApiError(400, "Test ID is required");

  /* --------------------------------------------------
     1. Resume existing IN_PROGRESS attempt
  -------------------------------------------------- */
  const existingAttempt = await prisma.testAttempt.findFirst({
    where: {
      userId,
      testId: testId.toString(),
      status: TestStatus.IN_PROGRESS,
    },
  });

  if (existingAttempt) {
    return res.status(200).json(
      new ApiResponse(
        200,
        { attemptId: existingAttempt.id },
        "Resuming test",
      ),
    );
  }

  /* --------------------------------------------------
     2. Fetch Test
  -------------------------------------------------- */
  const test = await prisma.test.findUnique({
    where: { id: testId.toString() },
  });

  if (!test) throw new ApiError(404, "Test not found");

  /* --------------------------------------------------
     3. Calculate NEXT attemptNumber (🔥 CRITICAL FIX)
  -------------------------------------------------- */
  const lastAttempt = await prisma.testAttempt.findFirst({
    where: { userId, testId: testId.toString() },
    orderBy: { attemptNumber: "desc" },
    select: { attemptNumber: true },
  });

  const nextAttemptNumber = (lastAttempt?.attemptNumber || 0) + 1;

  /* --------------------------------------------------
     4. Fetch Questions
  -------------------------------------------------- */
  const questions = await prisma.question.findMany({
    where: {
      topic: {
        subject: {
          categorySubjects: {
            some: { categoryId: test.categoryId },
          },
        },
      },
      isActive: true,
    },
    take: test.totalQuestions,
    select: { id: true },
  });

  if (questions.length === 0) {
    throw new ApiError(400, "No questions available for this test");
  }

  const questionIds = questions.map((q) => q.id);

  /* --------------------------------------------------
     5. Create NEW attempt (SAFE)
  -------------------------------------------------- */
  const newAttempt = await prisma.testAttempt.create({
    data: {
      userId: userId.toString(),
      testId: testId.toString(),
      attemptNumber: nextAttemptNumber,
      totalQuestions: test.totalQuestions,
      status: TestStatus.IN_PROGRESS,
      questionIds,
      questionSetSeed: Date.now().toString(),
    },
  });

  return res.status(201).json(
    new ApiResponse(
      201,
      { attemptId: newAttempt.id },
      "Test started",
    ),
  );
});

// 3. Get Questions for Attempt
export const getAttemptQuestions = asyncHandler(async (req: Request, res: Response) => {
  const { attemptId } = req.params;
  const userId = (req as any).user.userId;

  const attempt = await prisma.testAttempt.findUnique({
    where: { id: attemptId.toString(), userId },
    include: { test: true }
  });

  if (!attempt || attempt.status !== "IN_PROGRESS") {
    throw new ApiError(400, "Invalid attempt or test already submitted");
  }

  // Calculate Time Left
  const now = new Date();
  const startTime = new Date(attempt.startedAt);
  const durationMs = attempt.test.durationMinutes * 60 * 1000;
  const expiryTime = new Date(startTime.getTime() + durationMs);
  
  let timeLeftSeconds = Math.floor((expiryTime.getTime() - now.getTime()) / 1000);
  if (timeLeftSeconds < 0) timeLeftSeconds = 0;

  // Fetch Full Question Details based on stored IDs
  const questionIds = attempt.questionIds as string[];
  const questions = await prisma.question.findMany({
    where: { id: { in: questionIds } },
    select: {
      id: true,
      questionText: true,
      option1: true,
      option2: true,
      option3: true,
      option4: true,
      questionImageUrl: true,
      difficultyLevel: true
    }
  });

  // Order them according to the stored ID array order
  const orderedQuestions = questionIds.map(id => questions.find(q => q.id === id));

  return res.status(200).json(new ApiResponse(200, {
    questions: orderedQuestions,
    timeLeftSeconds
  }, "Questions fetched"));
});

// 4. Save Answer (Auto-save)
export const saveAnswer = asyncHandler(async (req: Request, res: Response) => {
  const { attemptId } = req.params;
  const { questionId, selectedOption, timeSpent } = req.body; // option: 1,2,3,4 or null to clear

  // Security check: ensure attempt is still in progress
  const attempt = await prisma.testAttempt.findUnique({ where: { id: attemptId.toString() } });
  if (!attempt || attempt.status !== "IN_PROGRESS") {
    throw new ApiError(400, "Cannot save answer. Test is not in progress.");
  }

  // Find existing answer or create new
  const existingAnswer = await prisma.testAttemptAnswer.findFirst({
    where: { attemptId:attemptId.toString(), questionId }
  });

  if (existingAnswer) {
    await prisma.testAttemptAnswer.update({
      where: { id: existingAnswer.id },
      data: { selectedOption: selectedOption ? Number(selectedOption) : null, timeSpent }
    });
  } else {
    await prisma.testAttemptAnswer.create({
      data: {
        attemptId:attemptId.toString(),
        questionId,
        selectedOption: selectedOption ? Number(selectedOption) : null,
        timeSpent: timeSpent || 0
      }
    });
  }

  return res.status(200).json(new ApiResponse(200, null, "Saved"));
});

// 5. Submit Test & Calculate Result
export const submitTest = asyncHandler(async (req: Request, res: Response) => {
  const { attemptId } = req.params;

  const attempt = await prisma.testAttempt.findUnique({
    where: { id: attemptId.toString() },
    include: { test: true }
  });

  if (!attempt || attempt.status === "SUBMITTED") {
    throw new ApiError(400, "Invalid attempt or already submitted");
  }

  // Fetch all user answers
  const userAnswers = await prisma.testAttemptAnswer.findMany({
    where: { attemptId:attemptId.toString() },
    include: { question: true }
  });

  let correct = 0;
  let incorrect = 0;
  let unattempted = attempt.totalQuestions - userAnswers.length;

  const posMarks = Number(attempt.test.positiveMarks);
  const negMarks = Number(attempt.test.negativeMarks);

  // Score Calculation
  for (const ans of userAnswers) {
    if (ans.selectedOption === null) {
      unattempted++;
      continue;
    }

    const isCorrect = ans.selectedOption === ans.question.correctOption;
    
    // Update individual answer correctness in DB
    await prisma.testAttemptAnswer.update({
      where: { id: ans.id },
      data: {
        isCorrect,
        marksObtained: isCorrect ? posMarks : -negMarks
      }
    });

    if (isCorrect) correct++;
    else incorrect++;
  }

  const totalMarks = (correct * posMarks) - (incorrect * negMarks);
  const percentage = (totalMarks / (attempt.totalQuestions * posMarks)) * 100;

  // Update Attempt with final stats
  await prisma.testAttempt.update({
    where: { id: attemptId.toString() },
    data: {
      status: "SUBMITTED",
      submittedAt: new Date(),
      correctCount: correct,
      incorrectCount: incorrect,
      attemptedCount: correct + incorrect,
      totalMarks,
      percentage
    }
  });

  return res.status(200).json(new ApiResponse(200, { attemptId }, "Test submitted successfully"));
});

// 6. Get Result Report
export const getTestResult = asyncHandler(async (req: Request, res: Response) => {
  const { attemptId } = req.params;

  const attempt = await prisma.testAttempt.findUnique({
    where: { id: attemptId.toString() },
    include: { 
      test: { select: { name: true, totalQuestions: true, positiveMarks: true } }
    }
  });

  if (!attempt || attempt.status !== "SUBMITTED") {
    throw new ApiError(400, "Result not available");
  }

  const data = {
    testName: attempt.test.name,
    score: Number(attempt.totalMarks),
    totalScore: attempt.test.totalQuestions * Number(attempt.test.positiveMarks),
    percentage: Number(attempt.percentage),
    correct: attempt.correctCount,
    incorrect: attempt.incorrectCount,
    unattempted: attempt.totalQuestions - attempt.attemptedCount,
    accuracy: attempt.attemptedCount > 0 
      ? ((attempt.correctCount / attempt.attemptedCount) * 100).toFixed(1) 
      : 0,
    timeTaken: "25m 30s" // You can calculate actual time difference if needed
  };

  return res.status(200).json(new ApiResponse(200, data, "Result fetched"));
});

export const viewTestSolution = asyncHandler(async (req: Request, res: Response) => {
  const userId = (req as any).user.id; // Or .userId depending on your middleware
  const { attemptId } = req.params;

  if (!attemptId) {
    throw new ApiError(400, "Attempt ID is required");
  }

  // 1. Fetch Attempt with deep nested relations
  // We need: Test Info -> Answers -> Linked Question (with correct option & explanation)
  const attempt = await prisma.testAttempt.findUnique({
    where: { id: attemptId.toString() },
    include: {
      test: {
        select: {
          name: true,
          totalQuestions: true,
          positiveMarks: true,
          negativeMarks: true,
        },
      },
      answers: {
        orderBy: { question: { id: 'asc' } }, // Keep consistent order
        include: {
          question: {
            select: {
              id: true,
              questionText: true,
              questionImageUrl: true,
              option1: true,
              option2: true,
              option3: true,
              option4: true,
              correctOption: true,       // Critical for solution
              explanation: true,         // Critical for solution
              explanationImageUrl: true, // Critical for solution
              difficultyLevel: true,
              topicId: true,
            },
          },
        },
      },
    },
  });

  // 2. Validations
  if (!attempt) {
    throw new ApiError(404, "Test attempt not found");
  }

  // Security: Ensure the requesting user owns this attempt
  if (attempt.userId !== userId) {
    throw new ApiError(403, "You do not have permission to view this solution");
  }

  // Logic: Solutions are only visible AFTER submission
  if (attempt.status !== "SUBMITTED") {
    throw new ApiError(400, "Test is still in progress. Submit it to view solutions.");
  }

  // 3. Format Data for Frontend
  // We transform the DB structure into a clean UI-ready format
  const formattedSolutions = attempt.answers.map((ans) => {
    const q = ans.question;
    
    // Determine status
    let status = "UNATTEMPTED";
    if (ans.selectedOption !== null) {
      status = ans.selectedOption === q.correctOption ? "CORRECT" : "INCORRECT";
    }

    return {
      id: q.id,
      questionText: q.questionText,
      questionImage: q.questionImageUrl,
      options: [q.option1, q.option2, q.option3, q.option4],
      
      // The Answer Key
      userSelectedOption: ans.selectedOption, // 1, 2, 3, 4 or null
      correctOption: q.correctOption,         // 1, 2, 3, 4
      
      // The Explanation
      explanation: q.explanation,
      explanationImage: q.explanationImageUrl,
      
      // Metadata
      status: status, // CORRECT | INCORRECT | UNATTEMPTED
      marks: ans.marksObtained,
      timeSpent: ans.timeSpent, // in seconds
      difficulty: q.difficultyLevel
    };
  });

  // 4. Calculate Summary Stats
  const summary = {
    testName: attempt.test.name,
    totalScore: attempt.totalMarks,
    maxScore: attempt.test.totalQuestions * Number(attempt.test.positiveMarks),
    accuracy: attempt.attemptedCount > 0 
      ? Math.round((attempt.correctCount / attempt.attemptedCount) * 100) 
      : 0,
    timeTakenSeconds: Math.floor((new Date(attempt.submittedAt!).getTime() - new Date(attempt.startedAt).getTime()) / 1000),
    correctCount: attempt.correctCount,
    incorrectCount: attempt.incorrectCount,
    unattemptedCount: attempt.test.totalQuestions - attempt.attemptedCount
  };

  return res.status(200).json(
    new ApiResponse(200, { summary, questions: formattedSolutions }, "Solutions fetched successfully")
  );
});