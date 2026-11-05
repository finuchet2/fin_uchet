from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.routers import auth
from app.database import engine, Base

# Создание таблиц в БД при запуске
Base.metadata.create_all(bind=engine)

app = FastAPI(title="Self-Employed Finance API", version="1.0")

# Настройка CORS (разрешаем запросы от фронтенда)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # В продакшене лучше указать конкретный адрес, но для разработки ["*"] идеально
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Подключаем роутер авторизации
app.include_router(auth.router)

@app.get("/")
def root():
    return {"message": "API работает успешно! Перейдите на /docs для тестирования."}