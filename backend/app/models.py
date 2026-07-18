from pydantic import BaseModel, Field
from typing import Optional, List, Any


class ProfileCreate(BaseModel):
    name: Optional[str]
    heightCm: Optional[float] = Field(default=None, alias="heightCm")
    currentWeightKg: Optional[float] = Field(default=None, alias="currentWeightKg")
    goalWeightKg: Optional[float] = Field(default=None, alias="goalWeightKg")
    planMode: Optional[str] = Field(default=None, alias="planMode")
    durationDays: Optional[int] = Field(default=None, alias="durationDays")

    model_config = {"populate_by_name": True}


class Profile(ProfileCreate):
    id: int


class LibraryItem(BaseModel):
    id: int
    type: str
    title: str
    description: str


class AnalysisResult(BaseModel):
    recommended: bool
    reasons: List[str]
    bmi: Optional[float]
    min_safe_weight: Optional[float]


class SignupRequest(BaseModel):
    name: str
    password: str


class LoginRequest(BaseModel):
    name: str
    password: str


class OnboardingRequest(BaseModel):
    ageYears: int
    gender: Optional[str] = None
    healthConditions: Optional[str] = None
    heightCm: float
    currentWeightKg: float
