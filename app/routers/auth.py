from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy.orm import Session
from app.database import get_db
from app.models import User
from app.schemas import UserCreate, UserResponse, Token
from app.security import hash_password, verify_password, create_access_token

router = APIRouter(prefix="/api/auth", tags=["Auth"])

from pydantic import BaseModel

class LoginRequest(BaseModel):
    username: str
    password: str

@router.post("/register", response_model=UserResponse, status_code=status.HTTP_201_CREATED)
def register_user(user_data: UserCreate, db: Session = Depends(get_db)):
    # Проверяем, передан ли хотя бы email или телефон
    if not user_data.email and not user_data.phone:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Необходимо указать либо email, либо телефон."
        )

    # Проверка на существование пользователя с таким email
    if user_data.email:
        existing_user_email = db.query(User).filter(User.email == user_data.email).first()
        if existing_user_email:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Пользователь с таким email уже зарегистрирован."
            )

    # Проверка на существование пользователя с таким телефоном
    if user_data.phone:
        existing_user_phone = db.query(User).filter(User.phone == user_data.phone).first()
        if existing_user_phone:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Пользователь с таким телефоном уже зарегистрирован."
            )

    # Создание нового пользователя
    new_user = User(
        email=user_data.email,
        phone=user_data.phone,
        password_hash=hash_password(user_data.password)
    )

    db.add(new_user)
    db.commit()
    db.refresh(new_user)

    return new_user

@router.post("/login", response_model=Token)
def login_for_access_token(
    login_data: LoginRequest,
    db: Session = Depends(get_db)
):
    # Поиск пользователя по email или телефону
    user = db.query(User).filter(
        (User.email == login_data.username) | (User.phone == login_data.username)
    ).first()

    if not user or not user.password_hash or not verify_password(login_data.password, user.password_hash):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Неверный email/телефон или пароль",
            headers={"WWW-Authenticate": "Bearer"},
        )

    # Создание JWT токена
    access_token = create_access_token(data={"sub": str(user.id)})
    return {"access_token": access_token, "token_type": "bearer"}