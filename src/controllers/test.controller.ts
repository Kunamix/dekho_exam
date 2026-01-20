import { prisma } from "@/database/db";
import { SubscriptionType, TestStatus } from "@/generated/prisma/enums";
import { ApiError } from "@/utils/ApiError";
import { ApiResponse } from "@/utils/ApiResponse";
import { asyncHandler } from "@/utils/asyncHandler";
import { Request, Response } from "express";

export const getTestsBySubject = asyncHandler(async (req:Request, res:Response) => {
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
        subjectId
      }
    }
  });

  if (!validLink) {
    throw new ApiError(404, "This subject does not belong to the selected category");
  }

  // 2. Fetch Tests specifically linked to this Subject
  const tests = await prisma.test.findMany({
    where: {
      categoryId: categoryId,
      subjectId:subjectId,
      isActive: true
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
        where: { userId: (req as any).user?.id },
        select: { status: true, totalMarks: true }
      }
    },
    orderBy: {
      testNumber: 'asc'
    }
  });

  return res
    .status(200)
    .json(new ApiResponse(200, tests, "Subject tests fetched successfully"));
});

export const getTestDetails = asyncHandler(async (req: Request, res: Response) => {
  const { testId } = req.params;

  const test = await prisma.test.findUnique({
    where: { id: testId.toString() },
    include: {
      category: { select: { name: true } },
      subject: { select: { name: true } }
    }
  });

  if (!test) {
    throw new ApiError(404, "Test not found");
  }

  return res
    .status(200)
    .json(new ApiResponse(200, test, "Test details fetched"));
});

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
  if (!test.isActive) throw new ApiError(400, "This test is currently inactive");
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
    } 
    else {
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
              categoryId: test.categoryId 
            }
          ]
        }
      });

      if (!activeSubscription) {
        throw new ApiError(403, "You have used your free attempts. Please purchase a subscription to access this test.");
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
      select: { id: true }
    });
    const topicIds = topics.map(t => t.id);

    // 2. Fetch random questions
    // (In production with millions of rows, use raw query. For now, this is efficient enough)
    const allQuestionIds = await prisma.question.findMany({
      where: { topicId: { in: topicIds }, isActive: true },
      select: { id: true }
    });

    // Shuffle and slice
    const shuffled = allQuestionIds.sort(() => 0.5 - Math.random());
    const selectedIds = shuffled.slice(0, test.totalQuestions).map(q => q.id);

    selectedQuestions = await prisma.question.findMany({
      where: { id: { in: selectedIds } },
      select: { id: true, questionText: true, option1: true, option2: true, option3: true, option4: true, questionImageUrl: true }
    });

  } else {
    // SCENARIO B: Full Mock Test (Category Level)
    // We need to fetch questions based on the blueprint defined in CategorySubject
    // (e.g., 25 Math, 25 English, 25 GK, 25 Reasoning)

    const blueprint = await prisma.categorySubject.findMany({
      where: { categoryId: test.categoryId },
      include: { subject: { include: { topics: { select: { id: true } } } } }
    });

    for (const item of blueprint) {
      const questionsNeeded = item.questionsPerTest;
      const subjectTopicIds = item.subject.topics.map(t => t.id);

      // Fetch potential question IDs for this subject
      const subjectQuestionIds = await prisma.question.findMany({
        where: { topicId: { in: subjectTopicIds }, isActive: true },
        select: { id: true }
      });

      // Shuffle and take required amount
      const shuffled = subjectQuestionIds.sort(() => 0.5 - Math.random());
      const selectedIds = shuffled.slice(0, questionsNeeded).map(q => q.id);

      const subjectQuestions = await prisma.question.findMany({
        where: { id: { in: selectedIds } },
        select: { id: true, questionText: true, option1: true, option2: true, option3: true, option4: true, questionImageUrl: true }
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
        userId,
        testId,
        totalQuestions: selectedQuestions.length,
        questionIds: selectedQuestions.map(q => q.id), // Store the exact order
        questionSetSeed: Date.now().toString(), // Simple seed reference
        status: "IN_PROGRESS"
      }
    });

    // B. If this was a free attempt, increment the counter
    if (consumeFreeAttempt) {
      await tx.user.update({
        where: { id: userId },
        data: { freeTestsUsed: { increment: 1 } }
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
        isFreeAttempt: consumeFreeAttempt
      }, 
      "Test started successfully"
    )
  );
});

export const submitTest = asyncHandler(async (req: Request, res: Response) => {
  const userId = (req as any).user.id;
  const { attemptId, answers } = req.body; 
  // answers format: [{ questionId: "...", selectedOption: 1, timeSpent: 30 }, ...]

  if (!attemptId) throw new ApiError(400, "Attempt ID is required");

  // 1. Fetch Attempt & Test Rules
  const attempt = await prisma.testAttempt.findUnique({
    where: { id: attemptId },
    include: { test: true }
  });

  if (!attempt) throw new ApiError(404, "Test attempt not found");
  if (attempt.userId !== userId) throw new ApiError(403, "Unauthorized");
  if (attempt.status === TestStatus.SUBMITTED) throw new ApiError(400, "Test already submitted");

  // 2. Fetch all questions involved in this attempt to check answers
  // We use the questionIds stored in the attempt to ensure we check the right questions
  // (Assuming questionIds is stored as string[] in JSON)
  const questionIds = attempt.questionIds as string[];

  const questions = await prisma.question.findMany({
    where: { id: { in: questionIds } },
    select: { id: true, correctOption: true }
  });

  // Create a Map for O(1) lookup: questionId -> correctOption
  const questionMap = new Map(questions.map(q => [q.id, q.correctOption]));

  // 3. Calculate Scores
  let correctCount = 0;
  let incorrectCount = 0;
  let attemptedCount = 0;
  let totalScore = 0;
  const positiveMarks = Number(attempt.test.positiveMarks);
  const negativeMarks = Number(attempt.test.negativeMarks);

  const processedAnswers = [];

  // Iterate through the user's submitted answers
  for (const ans of answers) {
    const correctOption = questionMap.get(ans.questionId);
    
    // Skip if user sent an ID not in the test
    if (correctOption === undefined) continue; 

    let isCorrect = false;
    let marksObtained = 0;

    // If user selected an option (1-4)
    if (ans.selectedOption && ans.selectedOption > 0) {
      attemptedCount++;
      
      if (ans.selectedOption === correctOption) {
        correctCount++;
        isCorrect = true;
        marksObtained = positiveMarks;
      } else {
        incorrectCount++;
        isCorrect = false;
        marksObtained = -negativeMarks; // Subtract marks
      }
    }

    totalScore += marksObtained;

    // Prepare data for bulk insertion
    processedAnswers.push({
      attemptId: attemptId,
      questionId: ans.questionId,
      selectedOption: ans.selectedOption || null,
      isCorrect: ans.selectedOption ? isCorrect : null,
      marksObtained: marksObtained,
      timeSpent: ans.timeSpent || 0
    });
  }

  // Calculate Percentage
  const maxMarks = attempt.totalQuestions * positiveMarks;
  const percentage = maxMarks > 0 ? (totalScore / maxMarks) * 100 : 0;

  // 4. Transaction: Save everything
  await prisma.$transaction(async (tx) => {
    // A. Update the Attempt Header
    await tx.testAttempt.update({
      where: { id: attemptId },
      data: {
        status: TestStatus.SUBMITTED,
        submittedAt: new Date(),
        attemptedCount,
        correctCount,
        incorrectCount,
        totalMarks: totalScore,
        percentage: percentage,
      }
    });

    // B. Save detailed answers
    // Note: createMany is supported in Postgres
    if (processedAnswers.length > 0) {
      await tx.testAttemptAnswer.createMany({
        data: processedAnswers
      });
    }
  });

  // 5. Return Summary
  return res.status(200).json(
    new ApiResponse(200, {
      totalScore,
      correctCount,
      incorrectCount,
      unattemptedCount: attempt.totalQuestions - attemptedCount,
      percentage: parseFloat(percentage.toFixed(2)),
      accuracy: attemptedCount > 0 ? ((correctCount / attemptedCount) * 100).toFixed(2) : 0
    }, "Test submitted successfully")
  );
});

export const viewTestSolution = asyncHandler(async (req: Request, res: Response) => {
  const userId = (req as any).user.id;
  const { attemptId } = req.params;

  // 1. Fetch Attempt with detailed answers and question data
  const attempt = await prisma.testAttempt.findUnique({
    where: { id: attemptId.toString() },
    include: {
      test: {
        select: { name: true, totalQuestions: true, positiveMarks: true, negativeMarks: true }
      },
      answers: {
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
              correctOption: true,      // The right answer
              explanation: true,        // The solution text
              explanationImageUrl: true,
              difficultyLevel: true
            }
          }
        },
        orderBy: { createdAt: 'asc' } // Or however you want to order them
      }
    }
  });

  if (!attempt) throw new ApiError(404, "Attempt not found");
  
  // Security: Only allow the user who took the test (or an admin) to view it
  if (attempt.userId !== userId) {
     throw new ApiError(403, "You are not authorized to view this solution");
  }

  // Optional: Only allow viewing solution if submitted
  if (attempt.status !== TestStatus.SUBMITTED) {
    throw new ApiError(400, "Test is not yet submitted");
  }

  // 2. Format Response
  const formattedSolutions = attempt.answers.map(ans => ({
    questionId: ans.questionId,
    questionText: ans.question.questionText,
    images: {
      question: ans.question.questionImageUrl,
      explanation: ans.question.explanationImageUrl
    },
    options: [
      ans.question.option1, 
      ans.question.option2, 
      ans.question.option3, 
      ans.question.option4
    ],
    correctOption: ans.question.correctOption,     // 1-4
    userSelectedOption: ans.selectedOption,        // 1-4 or null
    status: !ans.selectedOption 
      ? 'UNATTEMPTED' 
      : ans.isCorrect 
        ? 'CORRECT' 
        : 'INCORRECT',
    marksObtained: ans.marksObtained,
    timeSpent: ans.timeSpent,
    explanation: ans.question.explanation,
    difficulty: ans.question.difficultyLevel
  }));

  return res.status(200).json(
    new ApiResponse(200, {
      testName: attempt.test.name,
      stats: {
        score: attempt.totalMarks,
        rank: attempt.rank, // Populated via background job usually, or null
        percentage: attempt.percentage
      },
      solutions: formattedSolutions
    }, "Solutions fetched successfully")
  );
});

export const reportIssue = asyncHandler(async (req: Request, res: Response) => {
  const userId = (req as any).user.id;
  const { type, entityId, description } = req.body;

  if (!type || !description) {
    throw new ApiError(400, "Type and Description are required");
  }

  // Basic validation based on type
  if (type === 'QUESTION' || type === 'TEST') {
    if (!entityId) throw new ApiError(400, "Entity ID is required for Question/Test reports");
  }

  // Create Report
  const report = await prisma.report.create({
    data: {
      userId,
      type,       // e.g., "QUESTION"
      entityId,   // e.g., Question ID
      description, // e.g., "Option 2 is incorrect, it should be 150 not 100"
      status: "PENDING"
    }
  });

  // Optional: Trigger Notification for Admins here
  // await notifyAdmins(report);

  return res.status(201).json(
    new ApiResponse(201, {}, "Report submitted successfully. We will review it shortly.")
  );
});