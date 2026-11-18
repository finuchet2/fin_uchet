import { useEffect, useRef, useState, type DragEvent } from "react";
import {
  AlertCircle,
  ArrowRight,
  CheckCircle2,
  CloudUpload,
  FileSpreadsheet,
  LoaderCircle,
  ShieldCheck,
  Trash2,
} from "lucide-react";

type UploadState = "default" | "dragging" | "error" | "loading" | "ready";

function formatFileSize(size: number) {
  if (size < 1024 * 1024) return `${Math.max(1, Math.round(size / 1024))} КБ`;
  return `${(size / (1024 * 1024)).toFixed(1).replace(".", ",")} МБ`;
}

export default function BankStatementUpload() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [state, setState] = useState<UploadState>("default");
  const [file, setFile] = useState<{ name: string; size: number } | null>(null);
  const [notice, setNotice] = useState("");

  useEffect(() => {
    if (state !== "loading") return;
    const timer = window.setTimeout(() => setState("ready"), 850);
    return () => window.clearTimeout(timer);
  }, [state]);

  const handleFile = (selectedFile: File) => {
    const extension = selectedFile.name.split(".").pop()?.toLowerCase();
    setNotice("");
    if (extension !== "csv" && extension !== "xlsx") {
      setFile(null);
      setState("error");
      return;
    }
    setFile({ name: selectedFile.name, size: selectedFile.size });
    setState("loading");
  };

  const removeFile = () => {
    setFile(null);
    setNotice("");
    setState("default");
    if (inputRef.current) inputRef.current.value = "";
  };

  const onDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    const droppedFile = event.dataTransfer.files[0];
    if (droppedFile) handleFile(droppedFile);
    else setState("default");
  };

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
            <span className="statement-format-badge"><ShieldCheck size={15} /> Безопасная загрузка</span>
          </div>

          {state === "ready" || state === "loading" ? (
            <div className={`statement-file ${state === "loading" ? "is-loading" : ""}`}>
              <div className="statement-file__icon"><FileSpreadsheet size={25} strokeWidth={1.8} /></div>
              <div className="statement-file__details">
                <strong title={file?.name}>{file?.name}</strong>
                <span>{file ? formatFileSize(file.size) : ""} <i /> {state === "loading" ? "Обработка файла..." : "Готов к проверке"}</span>
                {state === "loading" && <div className="statement-progress"><span /></div>}
              </div>
              {state === "loading" ? (
                <LoaderCircle className="statement-file__spinner" size={20} aria-label="Загрузка" />
              ) : (
                <button className="statement-icon-button" type="button" aria-label="Удалить файл" onClick={removeFile}>
                  <Trash2 size={17} />
                </button>
              )}
              {state === "ready" && (
                <button
                  type="button"
                  className="statement-continue"
                  onClick={() => setNotice("Проверьте операции и подтвердите их, чтобы добавить в финансовую отчётность.")}
                >
                  Перейти к проверке операций <ArrowRight size={17} />
                </button>
              )}
            </div>
          ) : (
            <div
              className={`statement-dropzone ${state === "dragging" ? "is-dragging" : ""} ${state === "error" ? "is-error" : ""}`}
              onDragEnter={(event) => { event.preventDefault(); setState("dragging"); }}
              onDragOver={(event) => { event.preventDefault(); setState("dragging"); }}
              onDragLeave={(event) => {
                if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
                  setState(state === "error" ? "error" : "default");
                }
              }}
              onDrop={onDrop}
            >
              <div className="statement-dropzone__icon">
                {state === "error" ? <AlertCircle size={28} /> : <CloudUpload size={30} strokeWidth={1.7} />}
              </div>
              <h4>{state === "error" ? "Не удалось загрузить файл" : state === "dragging" ? "Отпустите файл, чтобы загрузить" : "Перетащите файл сюда"}</h4>
              <p>
                {state === "error"
                  ? "Этот формат не поддерживается. Выберите файл CSV или XLSX."
                  : "Перетащите файл сюда или выберите на компьютере. Поддерживаются форматы .CSV и .XLSX"}
              </p>
              <input
                ref={inputRef}
                className="statement-file-input"
                type="file"
                accept=".csv,.xlsx"
                aria-label="Выбрать файл банковской выписки"
                onChange={(event) => {
                  const selectedFile = event.currentTarget.files?.[0];
                  if (selectedFile) handleFile(selectedFile);
                  event.currentTarget.value = "";
                }}
              />
              <button type="button" className="statement-choose" onClick={() => inputRef.current?.click()}>
                Выбрать файл
              </button>
              {state === "error" && (
                <span className="statement-error-note" role="alert">
                  <AlertCircle size={14} /> Поддерживаются только файлы .CSV и .XLSX
                </span>
              )}
            </div>
          )}
          {notice && <p className="statement-notice" role="status">{notice}</p>}
          <div className="statement-upload-card__foot">
            <span><CheckCircle2 size={16} /> Поддерживаются выписки любых банков в форматах CSV и XLSX</span>
            <span>CSV <i /> XLSX</span>
          </div>
        </div>

        <aside className="statement-aside">
          <div className="statement-aside__art">
            <div className="statement-aside__glow" />
            <div className="statement-aside__sheet">
              <div className="statement-aside__sheet-mark"><FileSpreadsheet size={25} /></div>
              <div className="statement-aside__line statement-aside__line--wide" />
              <div className="statement-aside__line" />
              <div className="statement-aside__row"><i /><i /><i /></div>
              <div className="statement-aside__row"><i /><i /><i /></div>
              <div className="statement-aside__row"><i /><i /><i /></div>
            </div>
            <span className="statement-aside__check"><CheckCircle2 size={20} /></span>
          </div>
          <div className="statement-aside__copy">
            <span className="statement-step">ВСЁ ПРОСТО</span>
            <h3>От выписки к учёту</h3>
            <p>Загрузите файл, проверьте распознанные операции и добавьте их в финансовый учёт.</p>
          </div>
          <div className="statement-aside__privacy"><ShieldCheck size={17} /><span><strong>Ваши данные под контролем</strong><small>Операции попадут в финансовую отчётность только после вашей проверки и подтверждения</small></span></div>
        </aside>
      </div>
    </section>
  );
}
