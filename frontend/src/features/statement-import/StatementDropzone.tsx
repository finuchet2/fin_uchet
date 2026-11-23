import { useRef, type DragEvent } from "react"
import {
  AlertCircle,
  ArrowRight,
  CloudUpload,
  FileSpreadsheet,
  LoaderCircle,
  Trash2,
} from "lucide-react"

export type DropzoneStatus = "default" | "dragging" | "error" | "loading" | "ready"

interface StatementDropzoneProps {
  file: { name: string; size: number } | null
  status: DropzoneStatus
  errorMessage: string
  onFileSelect: (file: File) => void
  onRemoveFile: () => void
  onProceed: () => void
  onDraggingChange: (dragging: boolean) => void
}

function formatFileSize(size: number): string {
  if (size < 1024 * 1024) return `${Math.max(1, Math.round(size / 1024))} КБ`
  return `${(size / (1024 * 1024)).toFixed(1).replace(".", ",")} МБ`
}

export default function StatementDropzone({
  file,
  status,
  errorMessage,
  onFileSelect,
  onRemoveFile,
  onProceed,
  onDraggingChange,
}: StatementDropzoneProps) {
  const inputRef = useRef<HTMLInputElement>(null)

  const handleDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault()
    onDraggingChange(false)
    const droppedFile = event.dataTransfer.files[0]
    if (droppedFile) onFileSelect(droppedFile)
  }

  if (status === "ready" || status === "loading") {
    return (
      <div className={`statement-file ${status === "loading" ? "is-loading" : ""}`}>
        <div className="statement-file__icon">
          <FileSpreadsheet size={25} strokeWidth={1.8} />
        </div>
        <div className="statement-file__details">
          <strong title={file?.name}>{file?.name}</strong>
          <span>
            {file ? formatFileSize(file.size) : ""} <i />{" "}
            {status === "loading" ? "Обработка файла..." : "Готов к проверке"}
          </span>
          {status === "loading" && (
            <div className="statement-progress">
              <span />
            </div>
          )}
        </div>
        {status === "loading" ? (
          <LoaderCircle className="statement-file__spinner" size={20} aria-label="Загрузка" />
        ) : (
          <button
            className="statement-icon-button"
            type="button"
            aria-label="Удалить файл"
            onClick={() => {
              if (inputRef.current) inputRef.current.value = ""
              onRemoveFile()
            }}
          >
            <Trash2 size={17} />
          </button>
        )}
        {status === "ready" && (
          <button type="button" className="statement-continue" onClick={onProceed}>
            Перейти к проверке операций <ArrowRight size={17} />
          </button>
        )}
      </div>
    )
  }

  return (
    <div
      className={`statement-dropzone ${status === "dragging" ? "is-dragging" : ""} ${status === "error" ? "is-error" : ""}`}
      onDragEnter={(event) => {
        event.preventDefault()
        onDraggingChange(true)
      }}
      onDragOver={(event) => {
        event.preventDefault()
        onDraggingChange(true)
      }}
      onDragLeave={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
          onDraggingChange(false)
        }
      }}
      onDrop={handleDrop}
    >
      <div className="statement-dropzone__icon">
        {status === "error" ? (
          <AlertCircle size={28} />
        ) : (
          <CloudUpload size={30} strokeWidth={1.7} />
        )}
      </div>
      <h4>
        {status === "error"
          ? "Не удалось загрузить файл"
          : status === "dragging"
            ? "Отпустите файл, чтобы загрузить"
            : "Перетащите файл сюда"}
      </h4>
      <p>
        {status === "error"
          ? errorMessage || "Этот формат не поддерживается. Выберите файл CSV или XLSX."
          : "Перетащите файл сюда или выберите на компьютере. Поддерживаются форматы .CSV и .XLSX"}
      </p>
      <input
        ref={inputRef}
        className="statement-file-input"
        type="file"
        accept=".csv,.xlsx"
        aria-label="Выбрать файл банковской выписки"
        onChange={(event) => {
          const selectedFile = event.currentTarget.files?.[0]
          if (selectedFile) onFileSelect(selectedFile)
          event.currentTarget.value = ""
        }}
      />
      <button
        type="button"
        className="statement-choose"
        onClick={() => inputRef.current?.click()}
      >
        Выбрать файл
      </button>
      {status === "error" && (
        <span className="statement-error-note" role="alert">
          <AlertCircle size={14} /> {errorMessage || "Поддерживаются только файлы .CSV и .XLSX"}
        </span>
      )}
    </div>
  )
}
