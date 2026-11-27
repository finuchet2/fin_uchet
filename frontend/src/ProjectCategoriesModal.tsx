import { useEffect, useState } from "react"
import { Check, Info, Pencil, Plus, Trash2, X } from "lucide-react"
import type {
  ProjectCategoryBuckets,
  ProjectCategoryItem,
  ProjectCategoryTab,
} from "./types/templates"

interface ProjectCategoriesModalProps {
  projectName: string
  templateName?: string
  categories: ProjectCategoryBuckets
  operations: Array<{ type: "income" | "expense" | "tax"; category: string; project: string }>
  onClose: () => void
  onAddCategory: (tab: ProjectCategoryTab, name: string) => boolean | Promise<boolean>
  onRenameCategory: (tab: ProjectCategoryTab, categoryId: string, nextName: string) => boolean | Promise<boolean>
  onToggleCategory: (tab: ProjectCategoryTab, categoryId: string, active: boolean) => void | Promise<void>
  onDeleteCategory: (tab: ProjectCategoryTab, categoryId: string) => void | Promise<void>
}

const TAB_LABELS: Record<ProjectCategoryTab, { title: string; badge: string }> = {
  expenses: { title: "Расходы", badge: "EXPENSE" },
  income: { title: "Доходы", badge: "INCOME" },
  taxes: { title: "Налоги", badge: "TAX" },
}

export default function ProjectCategoriesModal({
  projectName,
  templateName,
  categories,
  operations,
  onClose,
  onAddCategory,
  onRenameCategory,
  onToggleCategory,
  onDeleteCategory,
}: ProjectCategoriesModalProps) {
  const [tab, setTab] = useState<ProjectCategoryTab>("expenses")
  const [newName, setNewName] = useState("")
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editingValue, setEditingValue] = useState("")
  const [pendingDelete, setPendingDelete] = useState<{
    item: ProjectCategoryItem
    count: number
  } | null>(null)
  const [feedback, setFeedback] = useState<{ text: string; isError?: boolean } | null>(null)

  const list = categories[tab]

  const flash = (text: string, isError = false) => {
    setFeedback({ text, isError })
    window.setTimeout(() => setFeedback(null), 3200)
  }

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return
      if (pendingDelete) {
        setPendingDelete(null)
      } else if (editingId) {
        setEditingId(null)
      } else {
        onClose()
      }
    }
    document.addEventListener("keydown", onKeyDown)
    return () => document.removeEventListener("keydown", onKeyDown)
  }, [editingId, onClose, pendingDelete])

  const handleAdd = async () => {
    const clean = newName.trim()
    if (clean.length < 2) {
      flash("Название категории должно содержать минимум 2 символа", true)
      return
    }
    if (list.some((item) => item.name.toLowerCase() === clean.toLowerCase())) {
      flash("Такая категория уже есть в этом разделе проекта", true)
      return
    }
    try {
      const added = await onAddCategory(tab, clean)
      if (added) {
        setNewName("")
        flash(`Категория «${clean}» добавлена`)
      }
    } catch (cause) {
      flash(cause instanceof Error ? cause.message : "Не удалось добавить категорию", true)
    }
  }

  const handleSaveRename = async (categoryId: string) => {
    const clean = editingValue.trim()
    if (clean.length < 2) {
      flash("Введите название от 2 символов", true)
      return
    }
    if (
      list.some(
        (item) => item.id !== categoryId && item.name.toLowerCase() === clean.toLowerCase(),
      )
    ) {
      flash("Категория с таким названием уже есть", true)
      return
    }
    try {
      const updated = await onRenameCategory(tab, categoryId, clean)
      if (updated) {
        setEditingId(null)
        setEditingValue("")
        flash(`Категория переименована в «${clean}»`)
      }
    } catch (cause) {
      flash(cause instanceof Error ? cause.message : "Не удалось переименовать категорию", true)
    }
  }

  const handleToggle = async (item: ProjectCategoryItem) => {
    try {
      await onToggleCategory(tab, item.id, !item.active)
    } catch (cause) {
      flash(cause instanceof Error ? cause.message : "Не удалось изменить категорию", true)
    }
  }

  const handleRequestDelete = async (item: ProjectCategoryItem) => {
    const opType = tab === "expenses" ? "expense" : tab === "income" ? "income" : "tax"
    const count = operations.filter(
      (op) => op.project === projectName && op.type === opType && op.category === item.name,
    ).length

    if (count > 0) {
      setPendingDelete({ item, count })
      return
    }
    try {
      await onDeleteCategory(tab, item.id)
      flash(`Категория «${item.name}» удалена или скрыта`)
    } catch (cause) {
      flash(cause instanceof Error ? cause.message : "Не удалось удалить категорию", true)
    }
  }

  return (
    <div
      className="directory-modal project-wizard-backdrop"
      role="dialog"
      aria-modal="true"
      aria-labelledby="project-categories-title"
      onClick={onClose}
    >
      <div
        className="directory-modal__card project-categories-modal"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="project-wizard__head">
          <div>
            <p className="auth-kicker">
              {templateName ? `Шаблон: ${templateName}` : "Своя настройка"}
            </p>
            <h3 id="project-categories-title">Категории проекта «{projectName}»</h3>
          </div>
          <button
            type="button"
            className="icon-button"
            aria-label="Закрыть"
            onClick={onClose}
          >
            <X size={18} aria-hidden="true" />
          </button>
        </div>

        <div className="project-categories-modal__body">
          <div className="directory-tabs" role="tablist" aria-label="Типы категорий проекта">
            {(["expenses", "income", "taxes"] as const).map((key) => (
              <button
                key={key}
                type="button"
                role="tab"
                aria-selected={tab === key}
                className={tab === key ? "is-active" : ""}
                onClick={() => {
                  setTab(key)
                  setEditingId(null)
                  setPendingDelete(null)
                }}
              >
                {TAB_LABELS[key].title}
                <i>{categories[key].length}</i>
              </button>
            ))}
          </div>

          <div className="directory-add">
            <input
              value={newName}
              onChange={(event) => setNewName(event.target.value)}
              placeholder={`Новая категория (${TAB_LABELS[tab].title.toLowerCase()})`}
              aria-label="Название новой категории проекта"
              maxLength={48}
              onKeyDown={(event) => {
                if (event.key === "Enter") handleAdd()
              }}
            />
            <button type="button" className="cabinet-primary" onClick={handleAdd}>
              <Plus size={16} aria-hidden="true" />
              <span>Добавить</span>
            </button>
          </div>

          {feedback && (
            <div
              className={`directory-toast${feedback.isError ? " directory-toast--error" : ""}`}
              role="status"
            >
              {feedback.isError ? (
                <Info size={16} aria-hidden="true" />
              ) : (
                <Check size={16} aria-hidden="true" />
              )}
              <span>{feedback.text}</span>
            </div>
          )}

          {list.length === 0 ? (
            <div className="project-categories-empty">
              <strong>В разделе «{TAB_LABELS[tab].title}» пока нет категорий</strong>
              <p>Добавьте нужные статьи выше — они сразу появятся при создании операций этого проекта.</p>
            </div>
          ) : (
            <div className="category-list">
              {list.map((item) => {
                const isEditing = editingId === item.id
                return (
                  <div
                    key={item.id}
                    className={item.active ? "category-row" : "category-row category-row--hidden"}
                  >
                    {isEditing ? (
                      <div className="category-edit-inline">
                        <input
                          value={editingValue}
                          onChange={(event) => setEditingValue(event.target.value)}
                          maxLength={48}
                          aria-label="Новое название категории"
                          autoFocus
                          onKeyDown={(event) => {
                            if (event.key === "Enter") handleSaveRename(item.id)
                            if (event.key === "Escape") setEditingId(null)
                          }}
                        />
                        <button
                          type="button"
                          className="directory-btn directory-btn--primary"
                          onClick={() => handleSaveRename(item.id)}
                        >
                          Сохранить
                        </button>
                        <button
                          type="button"
                          className="directory-btn directory-btn--ghost"
                          onClick={() => setEditingId(null)}
                        >
                          Отмена
                        </button>
                      </div>
                    ) : (
                      <>
                        <span className="category-row__text">
                          <strong>{item.name}</strong>
                          <small>{TAB_LABELS[tab].badge} • {templateName ? "Из шаблона / проектная" : "Проектная категория"}</small>
                        </span>
                        <label className="switch">
                          <input
                            type="checkbox"
                            checked={item.active}
                            onChange={() => void handleToggle(item)}
                            aria-label={`${item.name}: ${item.active ? "Активна" : "Скрыта"}`}
                          />
                          <span className="switch__track">
                            <span className="switch__thumb" />
                          </span>
                          <em>{item.active ? "Активна" : "Скрыта"}</em>
                        </label>
                        <button
                          type="button"
                          className="directory-btn directory-btn--ghost project-cat-action"
                          aria-label={`Переименовать ${item.name}`}
                          onClick={() => {
                            setEditingId(item.id)
                            setEditingValue(item.name)
                          }}
                        >
                          <Pencil size={14} aria-hidden="true" />
                          <span>Изменить</span>
                        </button>
                        <button
                          type="button"
                          className="category-delete"
                          aria-label={`Удалить ${item.name}`}
                          onClick={() => void handleRequestDelete(item)}
                        >
                          <Trash2 size={14} aria-hidden="true" />
                          <span>Удалить</span>
                        </button>
                      </>
                    )}
                  </div>
                )
              })}
            </div>
          )}

          {pendingDelete && (
            <div className="project-cat-delete-confirm" role="alert">
              <p>
                Категория «{pendingDelete.item.name}» используется в {pendingDelete.count}{" "}
                {pendingDelete.count === 1 ? "операции" : "операциях"} проекта «{projectName}». Удалить её?
              </p>
              <div className="directory-modal__actions">
                <button
                  type="button"
                  className="directory-btn directory-btn--ghost"
                  onClick={() => setPendingDelete(null)}
                >
                  Отмена
                </button>
                <button
                  type="button"
                  className="directory-btn directory-btn--danger"
                  onClick={async () => {
                    try {
                      await onDeleteCategory(tab, pendingDelete.item.id)
                      flash(`Категория «${pendingDelete.item.name}» удалена или скрыта`)
                      setPendingDelete(null)
                    } catch (cause) {
                      flash(cause instanceof Error ? cause.message : "Не удалось удалить категорию", true)
                    }
                  }}
                >
                  Удалить
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
