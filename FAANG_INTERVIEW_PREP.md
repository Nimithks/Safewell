# SafeWell Project Interview Prep

## 1. One-Sentence Pitch

SafeWell is a safety-first full-stack weight planning and progress-tracking application that lets users create a profile, set a goal, track checkpoints, save scale checks and notes, and receive personalized food, exercise, recovery, and safety recommendations based on BMI, trend, and plan duration.

## 2. What Problem The Project Solves

The core problem this project solves is that most weight-management apps are either too generic or too aggressive. They give static advice without checking whether the target is actually safe for the user’s body measurements or current weight trend.

SafeWell addresses that by:

- validating the user’s goal against BMI-based guardrails,
- adjusting recommendations when the pace is too fast,
- supporting both loss and maintenance planning,
- storing the user’s progress in a database,
- and updating guidance based on actual saved check-in data.

This makes the app more realistic and more responsible than a simple tracker.

## 3. How I Would Explain The Project In An Interview

If I were presenting this project in an interview, I would say:

I built SafeWell as a full-stack wellness planner focused on safe weight management. The frontend is built with Next.js and React, the backend is built with FastAPI, and persistence is handled with SQLite. Users can sign up, log in, create one or more profiles, enter height, current weight, goal weight, and tracking duration, and then get a personalized plan made of checkpoints, recommendations, and progress history.

What makes the project meaningful is that it does not blindly accept every target. It checks whether the goal is reasonable using BMI and weight-loss pace rules. If the plan is too aggressive, it softens the recommendation or blocks it. The app also stores scale checks and notes, and uses the latest saved progress to update recommendations. In other words, it is not just a static tracker, but an adaptive recommendation system.

## 4. High-Level Architecture

### Frontend

The frontend is built with React and Next.js. It is responsible for:

- login and onboarding UI,
- profile creation and editing,
- plan analysis display,
- checkpoint cards,
- check-in inputs for weight, notes, and completion,
- and rendering recommendation cards and progress history.

### Backend

The backend is built with FastAPI. It handles:

- signup and login,
- session creation and validation,
- onboarding updates,
- profile CRUD operations,
- library recommendation generation,
- and returning data in a structured format for the frontend.

### Database

SQLite stores the persistent data:

- `users` for login identity and onboarding info,
- `sessions` for authentication tokens,
- `profiles` for plan setup,
- `checkins` for checkpoint state,
- `history` for saved progress snapshots,
- and `library` for seeded recommendation content.

## 5. Core Data Flow

The application flow is:

1. The user signs up with a name and password.
2. The backend hashes the password before storing it.
3. The user logs in and receives a session token.
4. The user creates or loads a profile.
5. The app analyzes height, current weight, goal weight, and duration.
6. The app creates a tracking structure such as day-by-day, week-by-week, or milestone-based checkpoints.
7. The user enters scale checks, notes, and completion status.
8. The frontend saves the changes to the backend.
9. The backend stores check-ins and history in SQLite.
10. The recommendation engine reads the saved history and regenerates guidance.

## 6. How Recommendations Are Generated

This is one of the most important parts of the project.

The recommendation system is not random. It uses a combination of:

- height,
- current weight,
- goal weight,
- BMI,
- duration window,
- profile state,
- and recent weight trend from saved history.

The backend derives a trend context from history, then classifies the user into categories such as:

- underweight,
- healthy,
- overweight,
- or higher-risk.

It also determines whether the plan is effectively:

- `loss`,
- or `maintenance`.

Then it scores recommendation categories such as:

- exercise,
- food,
- recovery,
- safety.

The score changes depending on the user context. For example:

- underweight users get more food and safety emphasis,
- healthy users get balanced exercise and food guidance,
- overweight users get more sustainable deficit and movement guidance,
- and if the trend is too fast, safety and recovery get boosted.

The actual title and tips shown in the UI also change depending on the user state. So recommendations are personalized, not static.

## 7. Tracking Window Logic

The app supports different timeline styles depending on duration:

- 7 days: daily checkpoints,
- 30 days: weekly checkpoints,
- 60 days: weekly progressive blocks,
- 90 days: two-week phases,
- 180 days: monthly milestones,
- 365 days: quarterly checkpoints,
- 730 days: yearly checkpoints.

This gives the app flexibility. A short-term plan should feel different from a long-term plan. A 1-week plan needs tighter daily tracking, while a 3-month plan should feel phased and progressive.

## 8. Safety Logic

The project is built around conservative safety rules.

If the user’s target weight is below the healthy BMI floor, the app blocks the plan.

If the target is too aggressive for the timeframe, the app softens the target and recommends a safer pace.

If the user is not actually asking for loss, the app switches to maintenance mode.

This is important in an interview because it shows that the app is not just a CRUD system. It contains domain logic, guardrails, and decision-making rules.

## 9. Database Design

### Users

Stores:

- user name,
- password hash,
- onboarding fields,
- timestamps.

### Sessions

Stores:

- token,
- user reference,
- creation time,
- expiry time.

### Profiles

Stores:

- user reference,
- plan name,
- height,
- starting weight,
- target weight,
- plan mode,
- duration,
- timestamps.

### Checkins

Stores:

- profile reference,
- checkpoint id,
- checkpoint label,
- checkpoint window,
- sort index,
- completion status,
- note,
- weight,
- update timestamp.

### History

Stores:

- the same checkpoint context,
- plus a saved log timestamp.

This is useful because history gives the recommendation engine real data to work from.

### Library

Stores seeded content for:

- exercise,
- food,
- recovery,
- safety.

## 10. Why The Project Is Interesting

This project is stronger than a basic tracker because it combines:

- authentication,
- profile management,
- stateful UI,
- recommendation logic,
- trend analysis,
- and database persistence.

It also demonstrates that I can work across the stack and connect frontend actions to backend decisions.

## 11. Good Interview Talking Points

When an interviewer asks about this project, I would emphasize the following:

- I separated concerns between UI, API, and database.
- I designed the recommendation engine to be context-aware.
- I used safe defaults instead of hardcoding aggressive assumptions.
- I saved both the latest state and the historical checkpoints.
- I made the app react to actual progress rather than just initial input.

## 12. Important Technical Choices And Tradeoffs

### Why SQLite?

SQLite was a good choice because it is simple, reliable, and enough for a compact project with structured data.

### Why FastAPI?

FastAPI gives clean request handling, strong typing, and a simple way to build API routes quickly.

### Why Next.js?

Next.js made it easy to build a structured frontend with modern React patterns and a clean page-based architecture.

### Why have both `checkins` and `history`?

`checkins` represents the current checkpoint state, while `history` gives a saved timeline of what happened over time. That separation makes it easier to restore the latest state and also analyze trend behavior.

## 13. What I Would Say About The Scale Check Issue

If asked about how scale checks influence the plan, I would say:

The plan does react to scale checks, but only when the latest saved history is available. The backend uses the saved weight trend to influence the recommendation scoring. That means the system is event-driven by persisted check-in data, not just by the form fields currently being typed.

If the interviewer asks for a limitation, I would say that notes are stored and displayed, but they are not yet fully used as recommendation signals. That would be a good follow-up enhancement.

## 14. How I Would Describe The UI Flow

The UI has three layers of interaction:

1. Plan setup: enter height, weight, goal, and duration.
2. Progress tracking: complete checkpoints and enter scale checks or notes.
3. Output feedback: view recommendation cards, safety status, and history.

This makes the interface feel like a planner rather than a simple form.

## 15. Strong Interview Version

Here is a polished version I would use in an interview:

I built SafeWell as a safety-first wellness planning platform. The app allows users to create a profile, set goal weight and duration, and track their progress through checkpoints. The system analyzes BMI, weight-loss pace, and saved history to generate personalized recommendations for exercise, nutrition, recovery, and safety. One of the key goals of the project was to avoid unsafe weight-loss guidance, so the app applies guardrails when the target is too aggressive or below a healthy range. The frontend is built in Next.js and React, the backend is FastAPI, and the data is stored in SQLite. I also structured the app so the plan updates based on saved progress rather than only the initial input, which makes it more dynamic and realistic.

## 16. 30-Second Version

SafeWell is a full-stack weight planning app built with Next.js, FastAPI, and SQLite. It lets users create profiles, track checkpoints, save scale checks and notes, and receive personalized recommendations based on BMI, duration, and progress trend. The app is safety-first, so it blocks or softens unsafe goals instead of blindly accepting them.

## 17. Common Interview Questions And Answers

### Q1. What did you build?

I built a safety-first weight planning app that combines profile management, checkpoint tracking, and personalized recommendations.

### Q2. What was the main objective?

The objective was to create a realistic and safe system that helps users plan weight goals without encouraging extreme or unsafe behavior.

### Q3. What is the backend responsible for?

The backend handles authentication, profile CRUD, check-in persistence, recommendation generation, and history retrieval.

### Q4. What data is stored in SQLite?

Users, sessions, profiles, checkins, history, and recommendation library content are stored in SQLite.

### Q5. How does the app decide whether a plan is safe?

It checks BMI, target weight relative to a healthy floor, and the pace of expected loss across the selected duration.

### Q6. How do recommendations change?

They change based on BMI band, goal state, recent trend, and plan duration. That means food, exercise, recovery, and safety suggestions are personalized.

### Q7. What happens if the user enters an unsafe goal?

The app either softens the goal to a safer recommendation or blocks the plan entirely.

### Q8. Why is the project useful?

Because it is not just a tracker. It gives context-aware guidance and applies safety rules, which makes it more practical and responsible.

### Q9. What is the most interesting part of the system?

The recommendation engine is the most interesting part because it uses actual saved progress, not just fixed templates.

### Q10. What would you improve next?

I would add note-based recommendation rules, better analytics for trend history, and possibly a more advanced database if the app needed to scale.

## 18. Deeper Follow-Up Questions

### Q: Why did you separate `checkins` and `history`?

A: `checkins` stores the current state of a checkpoint, while `history` stores the timeline of saved activity. That separation makes the latest plan easy to reload while preserving past progress for trend analysis.

### Q: Why not use the same table for everything?

A: Combining everything into one table would make it harder to distinguish between current checkpoint state and saved historical events. The separation improves clarity and makes recommendation updates easier.

### Q: What are the limitations of the current recommendation system?

A: The system is strong at handling weight and BMI trends, but notes are not yet deeply interpreted. That means it is context-aware, but not yet fully semantic.

### Q: How would you make it smarter?

A: I would add text-based note analysis, richer trend analytics, and maybe some configurable recommendation rules so the system learns more from user behavior.

### Q: How does the app know whether the user is doing loss or maintenance?

A: It derives the mode from the relationship between current weight and goal weight. If the goal is below current weight, it is treated as loss; otherwise it becomes maintenance.

## 19. If The Interviewer Pushes For System Design

If the interviewer asks about scaling the app, I would say:

At a larger scale, I would move from SQLite to a more robust relational database, add a proper audit trail, add asynchronous recommendation processing if needed, and make the recommendation engine more modular. I would also define a clearer event model for check-in updates so the plan can refresh automatically and support more complex personalization.

## 20. Final Summary

SafeWell is a full-stack, safety-first weight planning application. It shows that I can build a complete product with authentication, profile management, database persistence, plan analysis, dynamic recommendations, and progress tracking. The technical strength of the project is not only that it works, but that it makes domain-aware decisions and avoids unsafe guidance.

This is the version I would present confidently in a strong interview.
