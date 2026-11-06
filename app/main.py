from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.routers import auth, reports


app = FastAPI(
    title="Self-Employed Finance API",
    version="1.0"
)

# Настройка CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Подключение роутеров
app.include_router(auth.router)
app.include_router(reports.router)


@app.get("/")
def root():
    return {
        "message": "API работает успешно! Перейдите на /docs для тестирования."
    }