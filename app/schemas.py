from pydantic import BaseModel, EmailStr, Field
from typing import Optional
from datetime import datetime

class UserCreate(BaseModel):
    email: Optional[EmailStr] = None
    phone: Optional[str] = Field(None, max_length=20)
    password: str = Field(..., min_length=6)

class UserResponse(BaseModel):
    id: int
    email: Optional[EmailStr] = None
    phone: Optional[str] = None
    created_at: datetime

    class Config:
        from_attributes = True

class Token(BaseModel):
    access_token: str
    token_type: str