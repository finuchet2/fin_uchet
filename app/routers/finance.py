from datetime import date
from decimal import Decimal
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy import func
from sqlalchemy.orm import Session
from app.database import get_db
from app.deps import get_current_user
from app.models import User, Transaction, BusinessProject, Category, CategoryPreference, TransactionType

router = APIRouter(tags=["Finance"])

class CategorySeed(BaseModel):
    name: str = Field(min_length=2, max_length=48)
    type: TransactionType

class ProjectIn(BaseModel):
    name: str = Field(min_length=2, max_length=60)
    description: str | None = Field(default=None, max_length=120)
    is_active: bool = True
    categories: list[CategorySeed] = Field(default_factory=list)

class CategoryIn(BaseModel):
    name: str = Field(min_length=2, max_length=48)
    type: TransactionType
    is_active: bool = True

class CategoryUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=2, max_length=48)
    is_active: bool | None = None

class TransactionIn(BaseModel):
    project_id: int
    category_id: int
    type: TransactionType
    amount: Decimal = Field(gt=0, lt=Decimal("1000000000000"))
    date_fact: date
    date_period: date
    comment: str | None = Field(default=None, max_length=255)
    attachment_url: str | None = Field(default=None, max_length=500)

def project_dto(x):
    return {"id": x.id, "name": x.name, "description": x.description, "is_active": x.is_active}

def category_dto(x, is_active=None):
    return {"id": x.id, "name": x.name, "type": x.type.value, "is_system": x.is_system,
            "is_active": x.is_active if is_active is None else is_active, "project_id": x.project_id}

def effective_category_active(db: Session, category: Category, user: User) -> bool:
    if category.is_system:
        preference = db.query(CategoryPreference).filter_by(user_id=user.id, category_id=category.id).first()
        return preference.is_active if preference else category.is_active
    return category.is_active

def transaction_dto(x):
    return {"id": x.id, "user_id": x.user_id, "project_id": x.project_id, "category_id": x.category_id,
            "type": x.type.value, "amount": float(x.amount), "date_fact": x.date_fact.isoformat(),
            "date_period": x.date_period.isoformat(), "comment": x.comment,
            "attachment_url": x.attachment_url, "created_at": x.created_at.isoformat() if x.created_at else None}

@router.get("/api/projects")
def list_projects(db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    return [project_dto(x) for x in db.query(BusinessProject).filter(BusinessProject.user_id == user.id).order_by(BusinessProject.id).all()]

@router.post("/api/projects", status_code=status.HTTP_201_CREATED)
def create_project(payload: ProjectIn, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    item = BusinessProject(
        user_id=user.id,
        name=payload.name.strip(),
        description=payload.description,
        is_active=payload.is_active,
    )
    db.add(item)
    db.flush()
    # Категории шаблона создаются в области нового проекта и не смешиваются
    # с категориями других направлений пользователя.
    for seed in payload.categories:
        clean_name = seed.name.strip()
        if not clean_name:
            continue
        exists = db.query(Category.id).filter(
            Category.user_id == user.id,
            Category.project_id == item.id,
            Category.type == seed.type,
            func.lower(Category.name) == clean_name.lower(),
        ).first()
        if not exists:
            db.add(Category(
                user_id=user.id,
                project_id=item.id,
                name=clean_name,
                type=seed.type,
                is_system=False,
                is_active=True,
            ))
    try:
        db.commit()
    except Exception:
        db.rollback()
        raise
    db.refresh(item)
    return project_dto(item)

@router.patch("/api/projects/{project_id}")
def update_project(project_id: int, payload: ProjectIn, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    item = db.query(BusinessProject).filter_by(id=project_id, user_id=user.id).first()
    if not item: raise HTTPException(404, "Проект не найден")
    item.name, item.description, item.is_active = payload.name.strip(), payload.description, payload.is_active
    db.commit(); db.refresh(item)
    return project_dto(item)

@router.delete("/api/projects/{project_id}", status_code=204)
def delete_project(project_id: int, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    item = db.query(BusinessProject).filter_by(id=project_id, user_id=user.id).first()
    if not item: raise HTTPException(404, "Проект не найден")
    if db.query(Transaction.id).filter_by(project_id=project_id, user_id=user.id).first():
        raise HTTPException(409, "Нельзя удалить проект, в котором уже есть операции")
    db.delete(item); db.commit()

@router.get("/api/categories")
def list_categories(project_id: int | None = None, include_inactive: bool = False, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    query = db.query(Category).filter((Category.user_id == user.id) | (Category.user_id.is_(None)))
    if project_id is not None:
        project = db.query(BusinessProject).filter_by(id=project_id, user_id=user.id).first()
        if not project:
            raise HTTPException(404, "Проект не найден")
        query = query.filter((Category.project_id == project_id) | (Category.project_id.is_(None)))
    rows = query.order_by(Category.type, Category.name).all()
    preferences = {row.category_id: row.is_active for row in db.query(CategoryPreference).filter_by(user_id=user.id).all()}
    result = []
    for item in rows:
        active = preferences.get(item.id, item.is_active) if item.is_system else item.is_active
        if include_inactive or active:
            result.append(category_dto(item, active))
    return result

@router.post("/api/projects/{project_id}/categories", status_code=201)
def create_project_category(project_id: int, payload: CategoryIn, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    project = db.query(BusinessProject).filter_by(id=project_id, user_id=user.id).first()
    if not project:
        raise HTTPException(404, "Проект не найден")
    item = Category(user_id=user.id, project_id=project_id, name=payload.name.strip(), type=payload.type, is_system=False, is_active=payload.is_active)
    db.add(item)
    try:
        db.commit()
    except Exception:
        db.rollback()
        raise HTTPException(409, "Категория с таким названием уже существует в проекте")
    db.refresh(item)
    return category_dto(item)

@router.patch("/api/projects/{project_id}/categories/{category_id}")
def update_project_category(project_id: int, category_id: int, payload: CategoryUpdate, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    item = db.query(Category).filter_by(id=category_id, user_id=user.id, project_id=project_id, is_system=False).first()
    if not item:
        raise HTTPException(404, "Категория проекта не найдена")
    if payload.name is not None:
        item.name = payload.name.strip()
    if payload.is_active is not None:
        item.is_active = payload.is_active
    try:
        db.commit()
    except Exception:
        db.rollback()
        raise HTTPException(409, "Категория с таким названием уже существует в проекте")
    db.refresh(item)
    return category_dto(item)

@router.delete("/api/projects/{project_id}/categories/{category_id}", status_code=204)
def delete_project_category(project_id: int, category_id: int, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    item = db.query(Category).filter_by(id=category_id, user_id=user.id, project_id=project_id, is_system=False).first()
    if not item:
        raise HTTPException(404, "Категория проекта не найдена")
    used = db.query(Transaction.id).filter_by(project_id=project_id, category_id=category_id).first()
    if used:
        item.is_active = False
    else:
        db.delete(item)
    db.commit()

@router.post("/api/categories", status_code=201)
def create_category(payload: CategoryIn, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    clean_name = payload.name.strip()
    if len(clean_name) < 2:
        raise HTTPException(422, "Название категории должно содержать не менее 2 символов")
    exists = db.query(Category.id).filter(Category.user_id == user.id, Category.project_id.is_(None),
        Category.type == payload.type, func.lower(Category.name) == clean_name.lower()).first()
    if exists:
        raise HTTPException(409, "Такая категория уже существует")
    item = Category(user_id=user.id, project_id=None, name=clean_name, type=payload.type, is_system=False, is_active=payload.is_active)
    db.add(item)
    try:
        db.commit()
    except Exception:
        db.rollback()
        raise HTTPException(409, "Не удалось сохранить категорию: возможно, такое название уже существует")
    db.refresh(item)
    return category_dto(item)

@router.patch("/api/categories/{category_id}")
def update_category(category_id: int, payload: CategoryUpdate, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    item = db.query(Category).filter(Category.id == category_id, Category.project_id.is_(None),
        ((Category.user_id == user.id) | (Category.user_id.is_(None)))).first()
    if not item:
        raise HTTPException(404, "Категория не найдена")
    if item.is_system:
        if payload.name is not None:
            raise HTTPException(403, "Системную категорию нельзя переименовать")
        if payload.is_active is not None:
            preference = db.query(CategoryPreference).filter_by(user_id=user.id, category_id=item.id).first()
            if preference is None:
                preference = CategoryPreference(user_id=user.id, category_id=item.id, is_active=payload.is_active)
                db.add(preference)
            else:
                preference.is_active = payload.is_active
    else:
        if item.user_id != user.id:
            raise HTTPException(403, "Недостаточно прав")
        if payload.name is not None:
            clean_name = payload.name.strip()
            if len(clean_name) < 2:
                raise HTTPException(422, "Название категории должно содержать не менее 2 символов")
            duplicate = db.query(Category.id).filter(Category.user_id == user.id, Category.project_id.is_(None),
                Category.type == item.type, func.lower(Category.name) == clean_name.lower(), Category.id != item.id).first()
            if duplicate:
                raise HTTPException(409, "Такая категория уже существует")
            item.name = clean_name
        if payload.is_active is not None:
            item.is_active = payload.is_active
    db.commit()
    db.refresh(item)
    return category_dto(item, effective_category_active(db, item, user))

@router.delete("/api/categories/{category_id}", status_code=204)
def delete_category(category_id: int, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    item = db.query(Category).filter_by(id=category_id, user_id=user.id, project_id=None, is_system=False).first()
    if not item:
        raise HTTPException(404, "Пользовательская категория не найдена")
    used = db.query(Transaction.id).filter_by(user_id=user.id, category_id=item.id).first()
    if used:
        item.is_active = False
    else:
        db.delete(item)
    db.commit()

@router.get("/api/transactions")
def list_transactions(db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    rows = db.query(Transaction).filter(Transaction.user_id == user.id).order_by(Transaction.date_fact.desc(), Transaction.id.desc()).all()
    return [transaction_dto(x) for x in rows]

@router.post("/api/transactions", status_code=201)
def create_transaction(payload: TransactionIn, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    project = db.query(BusinessProject).filter_by(id=payload.project_id, user_id=user.id).first()
    if not project: raise HTTPException(422, "Проект не найден или не принадлежит пользователю")
    category = db.query(Category).filter(Category.id == payload.category_id,
        Category.type == payload.type, ((Category.user_id == user.id) | (Category.user_id.is_(None))), ((Category.project_id == payload.project_id) | (Category.project_id.is_(None)))).first()
    if not category or not effective_category_active(db, category, user):
        raise HTTPException(422, "Категория не найдена, неактивна или имеет другой тип")
    item = Transaction(user_id=user.id, **payload.model_dump())
    db.add(item); db.commit(); db.refresh(item)
    return transaction_dto(item)

@router.patch("/api/transactions/{transaction_id}")
def update_transaction(transaction_id: int, payload: TransactionIn, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    item = db.query(Transaction).filter_by(id=transaction_id, user_id=user.id).first()
    if not item: raise HTTPException(404, "Операция не найдена")
    project = db.query(BusinessProject).filter_by(id=payload.project_id, user_id=user.id).first()
    category = db.query(Category).filter(Category.id == payload.category_id, Category.type == payload.type,
        ((Category.user_id == user.id) | (Category.user_id.is_(None))), ((Category.project_id == payload.project_id) | (Category.project_id.is_(None)))).first()
    if not project or not category or not effective_category_active(db, category, user):
        raise HTTPException(422, "Проверьте проект и активную категорию операции")
    for key, value in payload.model_dump().items(): setattr(item, key, value)
    db.commit(); db.refresh(item)
    return transaction_dto(item)

@router.delete("/api/transactions/{transaction_id}", status_code=204)
def delete_transaction(transaction_id: int, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    item = db.query(Transaction).filter_by(id=transaction_id, user_id=user.id).first()
    if not item: raise HTTPException(404, "Операция не найдена")
    db.delete(item); db.commit()

@router.get("/api/dashboard")
def dashboard(db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    rows = db.query(Transaction.type, func.sum(Transaction.amount)).filter(Transaction.user_id == user.id).group_by(Transaction.type).all()
    totals = {getattr(t, "value", t): float(amount or 0) for t, amount in rows}
    income, expense, tax = totals.get("INCOME", 0), totals.get("EXPENSE", 0), totals.get("TAX", 0)
    return {"income": income, "expense": expense, "tax": tax, "net": income-expense-tax}
