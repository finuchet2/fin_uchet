from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.database import engine, Base
from app import models
from app.routers import auth, statement_import, statement_reports

Base.metadata.create_all(bind=engine)

app = FastAPI(title="Self-Employed Finance API", version="1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router)
app.include_router(statement_import.router)
app.include_router(statement_reports.router)

@app.get("/")
def root():
    return {"message": "API работает успешно! Перейдите на /docs для тестирования."}
