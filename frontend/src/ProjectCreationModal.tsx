import { useEffect, useState } from "react"
import { ArrowLeft, Check, Layers, SlidersHorizontal, Sparkles, X } from "lucide-react"
import { INDUSTRY_PROJECT_TEMPLATES } from "./data/projectTemplates"
import type { IndustryProjectTemplate } from "./types/templates"

type WizardStep = "mode" | "select-template" | "preview-template" | "manual"

interface ProjectCreationModalProps {
  existingProjectNames: string[]
  inline?: boolean
  onClose: () => void
  onConfirm: (payload: {
    name: string
    description: string
    template: IndustryProjectTemplate | null
  }) => void | Promise<void>
}

export default function ProjectCreationModal({
  existingProjectNames,
  inline = false,
  onClose,
  onConfirm,
}: ProjectCreationModalProps) {
  const [step, setStep] = useState<WizardStep>("mode")
  const [selectedTemplate, setSelectedTemplate] = useState<IndustryProjectTemplate>(
    INDUSTRY_PROJECT_TEMPLATES[0],
  )
  const [name, setName] = useState("")
  const [description, setDescription] = useState("")
  const [error, setError] = useState("")
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.stopPropagation()
        onClose()
      }
    }
    document.addEventListener("keydown", onKeyDown, true)
    return () => document.removeEventListener("keydown", onKeyDown, true)
  }, [onClose])

  const validateAndSubmit = async (template: IndustryProjectTemplate | null) => {
    const cleanName = name.trim()
    if (cleanName.length < 2) {
      setError("Название проекта должно содержать минимум 2 символа")
      return
    }
    if (
      existingProjectNames.some(
        (existing) => existing.trim().toLowerCase() === cleanName.toLowerCase(),
      )
    ) {
      setError("Проект с таким названием уже существует")
      return
    }

    const cleanDescription =
      description.trim() || (template ? template.shortDescription.slice(0, 120) : "Своя настройка")
    setSubmitting(true)
    try {
      await onConfirm({
        name: cleanName,
        description: cleanDescription,
        template,
      })
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Не удалось создать проект")
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div
      className={`directory-modal${inline ? " directory-modal--inline" : ""} project-wizard-backdrop`}
      role="dialog"
      aria-modal="true"
      aria-labelledby="project-wizard-title"
      onClick={onClose}
    >
      <div
        className="directory-modal__card project-wizard"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="project-wizard__head">
          <div>
            <p className="auth-kicker">
              {step === "mode" && "Шаг 1 • Настройка проекта"}
              {step === "select-template" && "Шаг 2 • Отраслевой пресет"}
              {step === "preview-template" && "Шаг 3 • Предпросмотр категорий"}
              {step === "manual" && "Шаг 2 • Самостоятельная настройка"}
            </p>
            <h3 id="project-wizard-title">
              {step === "mode" && "Как настроить новый проект?"}
              {step === "select-template" && "Выберите отраслевой шаблон"}
              {step === "preview-template" && selectedTemplate.name}
              {step === "manual" && "Самостоятельная настройка проекта"}
            </h3>
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

        <div className="project-wizard__body">
          {step === "mode" && (
            <>
              <p className="project-wizard__lead">
                Выберите готовый бизнес-пресет, чтобы сразу получить подходящие статьи доходов, расходов и налогов, или создайте проект с нуля.
              </p>

              <div className="wizard-mode-grid">
                <button
                  type="button"
                  className="wizard-mode-card wizard-mode-card--primary"
                  onClick={() => {
                    setError("")
                    setStep("select-template")
                  }}
                >
                  <div className="wizard-mode-card__top">
                    <span className="wizard-mode-card__icon">
                      <Sparkles size={20} aria-hidden="true" />
                    </span>
                    <span className="wizard-mode-card__badge">Быстрый старт</span>
                  </div>
                  <strong>Использовать готовый шаблон</strong>
                  <p>
                    Выберите ваш вид бизнеса — система автоматически наполнит проект категориями доходов, расходов и налогов.
                  </p>
                </button>

                <button
                  type="button"
                  className="wizard-mode-card"
                  onClick={() => {
                    setError("")
                    setStep("manual")
                  }}
                >
                  <div className="wizard-mode-card__top">
                    <span className="wizard-mode-card__icon">
                      <SlidersHorizontal size={20} aria-hidden="true" />
                    </span>
                  </div>
                  <strong>Настроить проект самостоятельно</strong>
                  <p>
                    Создайте проект без готового набора статей и добавьте собственные категории под ваши задачи.
                  </p>
                </button>
              </div>
            </>
          )}

          {step === "select-template" && (
            <>
              <p className="project-wizard__lead">
                Выберите отраслевой шаблон — на следующем экране вы увидите его категории перед созданием проекта.
              </p>

              <div className="wizard-template-grid">
                {INDUSTRY_PROJECT_TEMPLATES.map((template) => {
                  const isSelected = selectedTemplate.id === template.id
                  return (
                    <button
                      key={template.id}
                      type="button"
                      className={`wizard-template-card${isSelected ? " is-selected" : ""}`}
                      onClick={() => {
                        setSelectedTemplate(template)
                        setError("")
                        setStep("preview-template")
                      }}
                    >
                      <div className="wizard-template-card__head">
                        <span
                          className="wizard-template-card__dot"
                          style={{ background: template.accentColor }}
                          aria-hidden="true"
                        />
                        <strong>{template.name}</strong>
                      </div>
                      <p className="wizard-template-card__desc">{template.shortDescription}</p>
                      <span className="wizard-template-card__area">
                        Сфера: {template.applicationArea}
                      </span>
                      <div className="wizard-template-card__counts">
                        <span>Доходы: {template.categories.income.length}</span>
                        <span>Расходы: {template.categories.expenses.length}</span>
                        <span>Налоги: {template.categories.taxes.length}</span>
                      </div>
                    </button>
                  )
                })}
              </div>
            </>
          )}

          {step === "preview-template" && (
            <>
              <div className="wizard-template-summary">
                <div>
                  <strong>Сфера применения:</strong> {selectedTemplate.applicationArea}
                </div>
                <p>{selectedTemplate.shortDescription}</p>
              </div>

              <div className="wizard-project-fields">
                <label>
                  Название проекта <span className="drawer-field__required">*</span>
                  <input
                    value={name}
                    onChange={(event) => {
                      setName(event.target.value)
                      setError("")
                    }}
                    placeholder={selectedTemplate.defaultProjectPlaceholder}
                    maxLength={60}
                    autoFocus
                  />
                </label>
                <label>
                  Описание проекта
                  <input
                    value={description}
                    onChange={(event) => setDescription(event.target.value)}
                    placeholder={selectedTemplate.defaultDescriptionPlaceholder}
                    maxLength={120}
                  />
                </label>
                {error && <p className="directory-error">{error}</p>}
              </div>

              <div className="wizard-preview-block">
                <div className="wizard-preview-block__head">
                  <h4>Предварительный список категорий</h4>
                  <span>Редактирование будет доступно после создания проекта</span>
                </div>

                <div className="wizard-preview-groups">
                  <section className="wizard-preview-group">
                    <header>
                      <strong>Доходы</strong>
                      <span className="wizard-type-pill wizard-type-pill--income">INCOME</span>
                    </header>
                    <ul>
                      {selectedTemplate.categories.income.map((item) => (
                        <li key={item.name}>{item.name}</li>
                      ))}
                    </ul>
                  </section>

                  <section className="wizard-preview-group">
                    <header>
                      <strong>Расходы</strong>
                      <span className="wizard-type-pill wizard-type-pill--expense">EXPENSE</span>
                    </header>
                    <ul>
                      {selectedTemplate.categories.expenses.map((item) => (
                        <li key={item.name}>{item.name}</li>
                      ))}
                    </ul>
                  </section>

                  <section className="wizard-preview-group">
                    <header>
                      <strong>Налоги</strong>
                      <span className="wizard-type-pill wizard-type-pill--tax">TAX</span>
                    </header>
                    <ul>
                      {selectedTemplate.categories.taxes.map((item) => (
                        <li key={item.name}>{item.name}</li>
                      ))}
                    </ul>
                  </section>
                </div>
              </div>
            </>
          )}

          {step === "manual" && (
            <>
              <div className="wizard-project-fields">
                <label>
                  Название проекта <span className="drawer-field__required">*</span>
                  <input
                    value={name}
                    onChange={(event) => {
                      setName(event.target.value)
                      setError("")
                    }}
                    placeholder="Например, Консалтинговые услуги"
                    maxLength={60}
                    autoFocus
                  />
                </label>
                <label>
                  Описание проекта
                  <input
                    value={description}
                    onChange={(event) => setDescription(event.target.value)}
                    placeholder="Кратко опишите направление"
                    maxLength={120}
                  />
                </label>
                {error && <p className="directory-error">{error}</p>}
              </div>

              <div className="directory-hint wizard-manual-hint">
                <Layers size={18} aria-hidden="true" />
                <p>
                  Проект будет создан с собственным пустым набором категорий — вы сможете добавить нужные статьи доходов, расходов и налогов сразу после создания.
                </p>
              </div>
            </>
          )}
        </div>

        <div className="project-wizard__footer">
          {step === "mode" && (
            <button type="button" className="directory-btn directory-btn--ghost" onClick={onClose}>
              Отмена
            </button>
          )}

          {step === "select-template" && (
            <>
              <button
                type="button"
                className="directory-btn directory-btn--ghost"
                onClick={() => setStep("mode")}
              >
                <ArrowLeft size={15} aria-hidden="true" />
                <span>Назад</span>
              </button>
              <button
                type="button"
                className="directory-btn directory-btn--soft"
                onClick={() => {
                  setError("")
                  setStep("manual")
                }}
              >
                Настроить самостоятельно
              </button>
            </>
          )}

          {step === "preview-template" && (
            <>
              <button
                type="button"
                className="directory-btn directory-btn--ghost"
                onClick={() => {
                  setError("")
                  setStep("select-template")
                }}
              >
                <ArrowLeft size={15} aria-hidden="true" />
                <span>Выбрать другой шаблон</span>
              </button>
              <button
                type="button"
                className="directory-btn directory-btn--soft"
                onClick={() => {
                  setError("")
                  setStep("manual")
                }}
              >
                Настроить самостоятельно
              </button>
              <button
                type="button"
                className="directory-btn directory-btn--primary"
                disabled={submitting}
                onClick={() => void validateAndSubmit(selectedTemplate)}
              >
                <Check size={15} aria-hidden="true" />
                <span>Подтвердить и создать проект</span>
              </button>
            </>
          )}

          {step === "manual" && (
            <>
              <button
                type="button"
                className="directory-btn directory-btn--ghost"
                onClick={() => {
                  setError("")
                  setStep("mode")
                }}
              >
                <ArrowLeft size={15} aria-hidden="true" />
                <span>Назад</span>
              </button>
              <button
                type="button"
                className="directory-btn directory-btn--soft"
                onClick={() => {
                  setError("")
                  setStep("select-template")
                }}
              >
                Выбрать готовый шаблон
              </button>
              <button
                type="button"
                className="directory-btn directory-btn--primary"
                disabled={submitting}
                onClick={() => void validateAndSubmit(null)}
              >
                <Check size={15} aria-hidden="true" />
                <span>Создать проект</span>
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
