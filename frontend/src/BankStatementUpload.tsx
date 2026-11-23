import { useEffect, useRef, useState } from "react"
import { CheckCircle2, FileSpreadsheet, ShieldCheck } from "lucide-react"
import BankStatementReview from "./BankStatementReview"
import { importApi } from "./api/importApi"
import StatementDropzone, {
  type DropzoneStatus,
} from "./features/statement-import/StatementDropzone"
import { validateStatementFile } from "./services/statementParser"
import type {
  ExistingLedgerOperation,
  ImportBatch,
  ImportCategoryBuckets,
  ImportProjectOption,
  LedgerOperationInput,
} from "./types/import"

interface BankStatementUploadProps {
  projects: ImportProjectOption[]
  categories: ImportCategoryBuckets
  existingOperations: ExistingLedgerOperation[]
  onImportConfirmed: (ops: LedgerOperationInput[]) => void
  onReviewStateChange: (fileName: string | null) => void
  onNavigateToOperations: () => void
}

export default function BankStatementUpload({
  projects,
  categories,
  existingOperations,
  onImportConfirmed,
  onReviewStateChange,
  onNavigateToOperations,
}: BankStatementUploadProps) {
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [dropzoneStatus, setDropzoneStatus] = useState<DropzoneStatus>("default")
  const [errorMessage, setErrorMessage] = useState("")
  const [preparedBatch, setPreparedBatch] = useState<ImportBatch | null>(null)
  const [isReviewing, setIsReviewing] = useState(false)
  const requestIdRef = useRef(0)
  const abortControllerRef = useRef<AbortController | null>(null)

  useEffect(() => {
    return () => {
      abortControllerRef.current?.abort()
    }
  }, [])

  const handleFileSelect = async (file: File) => {
    abortControllerRef.current?.abort()
    const requestId = requestIdRef.current + 1
    requestIdRef.current = requestId

    const validationError = validateStatementFile(file)
    if (validationError) {
      setSelectedFile(null)
      setPreparedBatch(null)
      setErrorMessage(validationError)
      setDropzoneStatus("error")
      return
    }

    const controller = new AbortController()
    abortControllerRef.current = controller
    setSelectedFile(file)
    setPreparedBatch(null)
    setErrorMessage("")
    setDropzoneStatus("loading")

    try {
      const batch = await importApi.uploadStatement({
        file,
        projects,
        categories,
        existingOperations,
        signal: controller.signal,
      })
      if (requestIdRef.current !== requestId) return
      setPreparedBatch(batch)
      setDropzoneStatus("ready")
    } catch (error) {
      if (controller.signal.aborted || requestIdRef.current !== requestId) return
      const message =
        error instanceof Error
          ? error.message
          : typeof error === "object" &&
              error !== null &&
              "message" in error &&
              typeof (error as { message: unknown }).message === "string"
            ? (error as { message: string }).message
            : "Не удалось распознать выписку. Проверьте формат столбцов."
      setSelectedFile(null)
      setPreparedBatch(null)
      setErrorMessage(message)
      setDropzoneStatus("error")
    }
  }

  const removeFile = () => {
    abortControllerRef.current?.abort()
    requestIdRef.current += 1
    setSelectedFile(null)
    setPreparedBatch(null)
    setErrorMessage("")
    setDropzoneStatus("default")
  }

  const startAnotherUpload = () => {
    removeFile()
    setIsReviewing(false)
    onReviewStateChange(null)
  }

  if (isReviewing && preparedBatch) {
    return (
      <BankStatementReview
        key={preparedBatch.id}
        batch={preparedBatch}
        projects={projects}
        categories={categories}
        onImportConfirmed={onImportConfirmed}
        onUploadAnother={startAnotherUpload}
        onNavigateToOperations={onNavigateToOperations}
        onBack={() => {
          setIsReviewing(false)
          onReviewStateChange(null)
        }}
      />
    )
  }

  return (
    <section className="statement-page" aria-labelledby="statement-title">
      <header className="statement-page__intro">
        <div>
          <p className="statement-eyebrow">Импорт данных</p>
          <h2 id="statement-title">Загрузите банковскую выписку</h2>
          <p>Добавьте выписку, чтобы подготовить операции к проверке и учёту.</p>
        </div>
      </header>

      <div className="statement-layout">
        <div className="statement-upload-card">
          <div className="statement-upload-card__top">
            <div>
              <span className="statement-step">ШАГ 01</span>
              <h3>Файл выписки</h3>
            </div>
            <span className="statement-format-badge">
              <ShieldCheck size={15} /> Безопасная загрузка
            </span>
          </div>

          <StatementDropzone
            file={selectedFile ? { name: selectedFile.name, size: selectedFile.size } : null}
            status={dropzoneStatus}
            errorMessage={errorMessage}
            onFileSelect={handleFileSelect}
            onRemoveFile={removeFile}
            onProceed={() => {
              if (!preparedBatch) return
              setIsReviewing(true)
              onReviewStateChange(preparedBatch.fileName)
            }}
            onDraggingChange={(dragging) => {
              if (dragging) {
                setDropzoneStatus("dragging")
              } else {
                setDropzoneStatus(errorMessage ? "error" : "default")
              }
            }}
          />

          <div className="statement-upload-card__foot">
            <span>
              <CheckCircle2 size={16} /> Поддерживаются выписки любых банков в форматах CSV и XLSX
            </span>
            <span>
              CSV <i /> XLSX
            </span>
          </div>
        </div>

        <aside className="statement-aside">
          <div className="statement-aside__art">
            <div className="statement-aside__glow" />
            <div className="statement-aside__sheet">
              <div className="statement-aside__sheet-mark">
                <FileSpreadsheet size={25} />
              </div>
              <div className="statement-aside__line statement-aside__line--wide" />
              <div className="statement-aside__line" />
              <div className="statement-aside__row">
                <i />
                <i />
                <i />
              </div>
              <div className="statement-aside__row">
                <i />
                <i />
                <i />
              </div>
              <div className="statement-aside__row">
                <i />
                <i />
                <i />
              </div>
            </div>
            <span className="statement-aside__check">
              <CheckCircle2 size={20} />
            </span>
          </div>
          <div className="statement-aside__copy">
            <span className="statement-step">ВСЁ ПРОСТО</span>
            <h3>От выписки к учёту</h3>
            <p>Загрузите файл, проверьте распознанные операции и добавьте их в финансовый учёт.</p>
          </div>
          <div className="statement-aside__privacy">
            <ShieldCheck size={17} />
            <span>
              <strong>Ваши данные под контролем</strong>
              <small>
                Операции попадут в финансовую отчётность только после вашей проверки и подтверждения
              </small>
            </span>
          </div>
        </aside>
      </div>
    </section>
  )
}
