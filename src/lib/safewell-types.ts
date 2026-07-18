type PlanMode = "loss" | "maintenance";
type DurationBucket = "short" | "medium" | "long";

export type ProfileRecord = {
  id: string;
  userId: string;
  name: string;
  heightCm: number;
  currentWeightKg: number;
  goalWeightKg: number;
  durationDays: number;
  createdAt: string;
  updatedAt: string;
};

export type CheckInRecord = {
  checkpointId: string;
  checkpointLabel: string;
  checkpointWindow: string;
  sortIndex: number;
  completed: boolean;
  note: string;
  weightKg: number | null;
  updatedAt: string;
};

export type HistoryRecord = CheckInRecord & {
  id: string;
  loggedAt: string;
};

export type LibraryItem = {
  id: string;
  category: string;
  title: string;
  source: string;
  planMode: PlanMode;
  durationBucket: DurationBucket;
  sortIndex: number;
  tips: string[];
};
