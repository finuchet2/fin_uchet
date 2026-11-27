import os
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.routers import auth, reports
from app.routers.finance import router as finance_router
from app.routers.statement_import import router as statement_import_router

app = FastAPI(title="Finzentra API", version="1.0.0")
origins = [x.strip() for x in os.getenv("CORS_ORIGINS", "http://localhost:5173").split(",") if x.strip()]
app.add_middleware(CORSMiddleware, allow_origins=origins, allow_credentials=True,
                   allow_methods=["GET", "POST", "PATCH", "PUT", "DELETE", "OPTIONS"],
                   allow_headers=["Authorization", "Content-Type", "Accept"])
app.include_router(auth.router)
app.include_router(finance_router)
app.include_router(statement_import_router)
app.include_router(reports.router)

@app.get("/")
def root():
    return {"name": "Finzentra API", "status": "ok", "docs": "/docs"}

@app.get("/health")
def health():
    return {"status": "ok"}
