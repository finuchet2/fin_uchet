import {
  Fragment,
  createContext,
  Dispatch,
  FormEvent,
  KeyboardEvent,
  ReactNode,
  SetStateAction,
  useContext,
  useEffect,
  useId,
  useRef,
  useState,
} from "react";
import FinancialDashboard from "./FinancialDashboard";
import CustomSelect from "./CustomSelect";
import TruncatedValue from "./TruncatedValue";
import { currencyTruncationThreshold, formatThresholdCurrency } from "./currency";
import { usePersistentState } from "./hooks/usePersistentState";
import { apiRequest } from "./api/client";

type Screen = "home" | "register" | "login" | "recover" | "new-password" | "app";

type AppUser = { name: string };
type RegistrationMethod = "email" | "phone";
type RegistrationField = "name" | "contact" | "password" | "confirmation";
type RegistrationValues = Record<RegistrationField, string>;
type RegistrationErrors = Partial<Record<RegistrationField, string>>;

const initialRegistration: RegistrationValues = {
  name: "",
  contact: "",
  password: "",
  confirmation: "",
};

function formatPhone(value: string) {
  const digits = value.replace(/\D/g, "");
  if (digits === "7" || digits === "8") return "+7";
  const normalized =
    digits.startsWith("7") || digits.startsWith("8")
      ? digits.slice(1, 11)
      : digits.slice(0, 10);
  if (!normalized) return "";
  let result = "+7";
  if (normalized.length > 0) result += ` (${normalized.slice(0, 3)}`;
  if (normalized.length >= 3) result += ")";
  if (normalized.length > 3) result += ` ${normalized.slice(3, 6)}`;
  if (normalized.length > 6) result += `-${normalized.slice(6, 8)}`;
  if (normalized.length > 8) result += `-${normalized.slice(8, 10)}`;
  return result;
}

function hasStrongPassword(password: string) {
  return password.length >= 8 && /[A-Za-zА-Яа-яЁё]/.test(password) && /\d/.test(password);
}

function validateRegistration(
  values: RegistrationValues,
  method: RegistrationMethod,
): RegistrationErrors {
  const errors: RegistrationErrors = {};
  if (values.name.trim().length < 2 || values.name.trim().length > 50) {
    errors.name = "Имя должно содержать от 2 до 50 символов";
  }
  if (method === "email") {
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(values.contact.trim())) {
      errors.contact = "Введите корректный email";
    }
  } else if (!/^\+7 \(\d{3}\) \d{3}-\d{2}-\d{2}$/.test(values.contact)) {
    errors.contact = "Введите телефон в формате +7 (XXX) XXX-XX-XX";
  }
  if (!hasStrongPassword(values.password)) {
    errors.password =
      "Пароль должен содержать минимум 8 символов, минимум 1 букву и 1 цифру";
  }
  if (values.confirmation !== values.password || !values.confirmation) {
    errors.confirmation = "Пароли должны совпадать";
  }
  return errors;
}

const AppUserContext = createContext<{ user: AppUser; setUser: (u: AppUser) => void }>({
  user: { name: "Гость" },
  setUser: () => {},
});

function useAppUser() {
  return useContext(AppUserContext);
}

function Logo({ compact = false, onClick }: { compact?: boolean; onClick?: () => void }) {
  return (
    <button className="logo" type="button" aria-label="Finzentra — на главную" onClick={onClick}>
      <svg className="logo__mark" viewBox="0 0 40 40" aria-hidden="true">
        <path d="M8 27.5c6.2-1 10.4-4.7 12.7-11.2 2.7 4.3 6.5 6.8 11.3 7.5" />
        <path d="m26 18 6 5.8-7.4 3" />
        <path d="M8 12.5h8.5" />
      </svg>
      {!compact && <span>Finzentra</span>}
    </button>
  );
}

function Icon({ name }: { name: "spark" | "control" | "time" | "arrow" }) {
  const paths = {
    spark: (
      <>
        <path d="M12 3v3M12 18v3M3 12h3M18 12h3" />
        <path d="M7 17c1.2-5.2 4.2-8.2 10-10-1.3 5.3-4.3 8.3-10 10Z" />
      </>
    ),
    control: (
      <>
        <circle cx="12" cy="12" r="8" />
        <path d="M12 8v4l2.8 2M7 5l1.2 1.5M17 5l-1.2 1.5" />
      </>
    ),
    time: (
      <>
        <path d="M5 18.5V12a7 7 0 0 1 14 0v6.5" />
        <path d="M8 18.5h8M9 12l2 2 4-4" />
      </>
    ),
    arrow: <path d="M5 12h14M14 7l5 5-5 5" />,
  };
  return (
    <svg className="icon" viewBox="0 0 24 24" aria-hidden="true">
      {paths[name]}
    </svg>
  );
}

interface FieldProps {
  label: string;
  placeholder: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
  error?: string;
  helper?: string;
  autoComplete?: string;
  onBlur?: () => void;
  onKeyDown?: (event: KeyboardEvent<HTMLInputElement>) => void;
  passwordToggle?: boolean;
}

function Field({
  label,
  placeholder,
  value,
  onChange,
  type = "text",
  error,
  helper,
  autoComplete,
  onBlur,
  onKeyDown,
  passwordToggle,
}: FieldProps) {
  const id = useId();
  const [visible, setVisible] = useState(false);
  const inputType = passwordToggle ? (visible ? "text" : "password") : type;
  return (
    <div className={`field ${error ? "field--error" : ""}`}>
      <label className="field__label" htmlFor={id}>
        {label}
      </label>
      <div className="field__input-wrap">
        <input
          id={id}
          className="field__control"
          type={inputType}
          value={value}
          placeholder={placeholder}
          autoComplete={autoComplete}
          aria-invalid={Boolean(error)}
          onChange={(event) => onChange(event.target.value)}
          onBlur={onBlur}
          onKeyDown={onKeyDown}
        />
        {passwordToggle && (
          <button
            className="password-toggle"
            type="button"
            onClick={() => setVisible((current) => !current)}
            aria-label={visible ? "Скрыть пароль" : "Показать пароль"}
          >
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M2.8 12s3.3-5 9.2-5 9.2 5 9.2 5-3.3 5-9.2 5-9.2-5-9.2-5Z" />
              <circle cx="12" cy="12" r="2.5" />
              {visible && <path d="m4 4 16 16" />}
            </svg>
          </button>
        )}
      </div>
      {(error || helper) && (
        <p className={error ? "field__message field__message--error" : "field__message"}>
          {error || helper}
        </p>
      )}
    </div>
  );
}

function PrimaryButton({
  children,
  loading,
  type = "button",
  onClick,
}: {
  children: ReactNode;
  loading?: boolean;
  type?: "button" | "submit";
  onClick?: () => void;
}) {
  return (
    <button
      className="primary-button"
      type={type}
      disabled={loading}
      aria-busy={loading}
      onClick={onClick}
    >
      {loading && <span className="spinner" aria-hidden="true" />}
      {children}
    </button>
  );
}

function Home({ navigate }: { navigate: (screen: Screen) => void }) {
  return (
    <main className="home">
      <div className="home__glow home__glow--one" />
      <div className="home__glow home__glow--two" />
      <header className="nav shell">
        <div onClick={() => navigate("home")}>
          <Logo />
        </div>
        <nav className="nav__actions" aria-label="Навигация">
          <button className="button button--ghost" onClick={() => navigate("login")}>
            Войти
          </button>
          <button className="button button--primary" onClick={() => navigate("register")}>
            Зарегистрироваться
          </button>
        </nav>
      </header>

      <section className="hero shell">
        <div className="hero__copy">
          <p className="eyebrow">Финансовый учёт без лишней рутины</p>
          <h1>
            Не создавайте себе <span>вторую работу</span>
          </h1>
          <p className="hero__text">
            Finzentra помогает держать финансы бизнеса под контролем, чтобы вы меньше
            времени тратили на учёт и больше — на развитие своего дела.
          </p>
          <button className="button button--primary button--large" onClick={() => navigate("register")}>
            Зарегистрироваться
            <Icon name="arrow" />
          </button>
        </div>
        <div className="brand-art" aria-label="Абстрактная графика Finzentra">
          <div className="brand-art__orb" />
          <svg viewBox="0 0 620 500" aria-hidden="true">
            <defs>
              <linearGradient id="flow" x1="0" y1="1" x2="1" y2="0">
                <stop offset="0" stopColor="#8ebce9" />
                <stop offset="1" stopColor="#2f70b7" />
              </linearGradient>
            </defs>
            <path className="brand-art__line brand-art__line--soft" d="M46 376C176 380 201 196 322 196c77 0 92 86 182 52" />
            <path className="brand-art__line" d="M34 414c153-7 182-232 327-232 94 0 116 87 198 32" />
            <path className="brand-art__arrow" d="m500 150 60 64-82 29" />
            <circle cx="123" cy="358" r="16" />
            <circle cx="361" cy="182" r="11" />
          </svg>
          <div className="brand-art__monogram">F</div>
        </div>
      </section>

      <section className="benefits shell" aria-labelledby="benefits-title">
        <div className="section-heading">
          <p className="eyebrow">Простота в основе</p>
          <h2 id="benefits-title">Финансы без второй смены</h2>
        </div>
        <div className="benefits__grid">
          <article className="benefit">
            <div className="benefit__icon"><Icon name="spark" /></div>
            <h3>Меньше рутины</h3>
            <p>Тратьте меньше времени на повседневный финансовый учёт.</p>
          </article>
          <article className="benefit">
            <div className="benefit__icon"><Icon name="control" /></div>
            <h3>Финансы под контролем</h3>
            <p>Сохраняйте ясное представление о доходах и расходах бизнеса.</p>
          </article>
          <article className="benefit">
            <div className="benefit__icon"><Icon name="time" /></div>
            <h3>Больше времени на своё дело</h3>
            <p>Сосредоточьтесь на развитии бизнеса, а не на бесконечных таблицах.</p>
          </article>
        </div>
      </section>

      <section className="cta shell">
        <div>
          <p className="eyebrow eyebrow--light">Начните сегодня</p>
          <h2>Пора освободить время для главного</h2>
          <p>Начните вести финансовый учёт с Finzentra — проще, понятнее и без лишней рутины.</p>
        </div>
        <button className="button button--white button--large" onClick={() => navigate("register")}>
          Зарегистрироваться
          <Icon name="arrow" />
        </button>
      </section>

      <footer className="footer shell">
        <div>
          <div onClick={() => navigate("home")}><Logo /></div>
          <p>Финансовый учёт без лишней рутины</p>
        </div>
        <nav>
          <button onClick={() => navigate("login")}>Войти</button>
          <button onClick={() => navigate("register")}>Зарегистрироваться</button>
        </nav>
      </footer>
    </main>
  );
}

function AuthLayout({
  children,
  navigate,
}: {
  children: ReactNode;
  navigate: (screen: Screen) => void;
}) {
  return (
    <main className="auth-page">
      <div className="auth-page__top" onClick={() => navigate("home")}>
        <Logo />
      </div>
      <div className="ambient ambient--top" />
      <div className="ambient ambient--bottom" />
      {children}
    </main>
  );
}

function Registration({ navigate }: { navigate: (screen: Screen) => void }) {
  const registeredContacts = useRef(new Set<string>());
  const [method, setMethod] = useState<RegistrationMethod>("email");
  const [values, setValues] = useState(initialRegistration);
  const [errors, setErrors] = useState<RegistrationErrors>({});
  const [touched, setTouched] = useState<Partial<Record<RegistrationField, boolean>>>({});
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const { setUser } = useAppUser();

  const update = (field: RegistrationField, raw: string) => {
    const value = field === "contact" && method === "phone" ? formatPhone(raw) : raw;
    const next = { ...values, [field]: value };
    setValues(next);
    setSuccess(false);
    if (touched[field]) {
      setErrors((current) => ({
        ...current,
        [field]: validateRegistration(next, method)[field],
      }));
    }
  };

  const blur = (field: RegistrationField) => {
    setTouched((current) => ({ ...current, [field]: true }));
    setErrors((current) => ({
      ...current,
      [field]: validateRegistration(values, method)[field],
    }));
  };

  const handlePhoneKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key !== "Backspace" || method !== "phone") return;
    const start = event.currentTarget.selectionStart ?? values.contact.length;
    const end = event.currentTarget.selectionEnd ?? start;
    if (start !== end) return;
    const digitsBefore = values.contact.slice(0, start).replace(/\D/g, "").length;
    const userDigits = values.contact.replace(/\D/g, "").slice(1);
    const removeIndex = digitsBefore - 2;
    event.preventDefault();
    if (removeIndex < 0) return update("contact", "");
    update(
      "contact",
      `+7${userDigits.slice(0, removeIndex)}${userDigits.slice(removeIndex + 1)}`,
    );
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const nextErrors = validateRegistration(values, method);
    setTouched({ name: true, contact: true, password: true, confirmation: true });
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length) return;
    const contact =
      method === "email" ? values.contact.trim().toLowerCase() : values.contact;
    if (registeredContacts.current.has(contact)) {
      setErrors({ contact: "Пользователь с таким email/телефоном уже существует" });
      return;
    }
    setLoading(true);
    try {
      // Отправляем запрос на твой бэкенд FastAPI
      await apiRequest("/api/auth/register", {
        method: "POST",
        body: {
          name: values.name.trim(),
          email: method === "email" ? contact : null,
          phone: method === "phone" ? contact : null,
          password: values.password
        }
      });

      setLoading(false);
      setSuccess(true);
      setUser({ name: values.name.trim() });
      window.setTimeout(() => navigate("app"), 800);
      
    } catch (error: any) {
      setLoading(false);
      // Если бэкенд вернул ошибку (например, пользователь уже существует), выводим её на экран
      setErrors({ contact: error.message || "Ошибка регистрации на сервере" });
    }
  };

  return (
    <AuthLayout navigate={navigate}>
      <section className="auth-card auth-card--register">
        <header className="auth-card__header">
          <p className="auth-kicker">Добро пожаловать</p>
          <h1>Регистрация</h1>
          <p>Создайте аккаунт и начните управлять финансами проще.</p>
        </header>
        <form className="auth-form" noValidate onSubmit={submit}>
          <div className="segmented" role="tablist" aria-label="Способ регистрации">
            {(["email", "phone"] as const).map((item) => (
              <button
                key={item}
                className={`segmented__item ${method === item ? "segmented__item--active" : ""}`}
                type="button"
                role="tab"
                aria-selected={method === item}
                onClick={() => {
                  setMethod(item);
                  setValues((current) => ({ ...current, contact: "" }));
                  setErrors((current) => ({ ...current, contact: undefined }));
                }}
              >
                {item === "email" ? "Email" : "Телефон"}
              </button>
            ))}
          </div>
          <div className="auth-form__fields">
            <Field label="Имя" placeholder="Введите имя" value={values.name} error={errors.name} autoComplete="name" onChange={(value) => update("name", value)} onBlur={() => blur("name")} />
            <Field label={method === "email" ? "Email" : "Телефон"} placeholder={method === "email" ? "Введите email" : "Введите номер телефона"} value={values.contact} error={errors.contact} type={method === "email" ? "email" : "tel"} autoComplete={method === "email" ? "email" : "tel"} onChange={(value) => update("contact", value)} onBlur={() => blur("contact")} onKeyDown={method === "phone" ? handlePhoneKeyDown : undefined} />
            <Field label="Пароль" placeholder="Введите пароль" value={values.password} error={errors.password} helper="Минимум 8 символов, минимум 1 буква и 1 цифра" autoComplete="new-password" passwordToggle onChange={(value) => update("password", value)} onBlur={() => blur("password")} />
            <Field label="Подтверждение пароля" placeholder="Повторите пароль" value={values.confirmation} error={errors.confirmation} autoComplete="new-password" passwordToggle onChange={(value) => update("confirmation", value)} onBlur={() => blur("confirmation")} />
          </div>
          <PrimaryButton type="submit" loading={loading}>
            {loading ? "Создание аккаунта..." : "Зарегистрироваться"}
          </PrimaryButton>
        </form>
        <div className={`transition-note ${success ? "transition-note--active" : ""}`}>
          <span />
          <p>{success ? "Аккаунт создан. Переходим в Finzentra…" : "После регистрации вы автоматически перейдёте на главный экран"}</p>
        </div>
        <p className="auth-switch">
          Уже есть аккаунт?{" "}
          <button type="button" onClick={() => navigate("login")}>Войти</button>
        </p>
      </section>
    </AuthLayout>
  );
}

function Login({ navigate }: { navigate: (screen: Screen) => void }) {
  const [contact, setContact] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handlePhoneKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (
      !contact.startsWith("+7") ||
      (event.key !== "Backspace" && event.key !== "Delete")
    ) {
      return;
    }

    const input = event.currentTarget;
    const selectionStart = input.selectionStart ?? contact.length;
    const selectionEnd = input.selectionEnd ?? selectionStart;
    if (selectionStart !== selectionEnd) return;

    const digitsBeforeCursor = contact
      .slice(0, selectionStart)
      .replace(/\D/g, "").length;
    const userDigits = contact.replace(/\D/g, "").slice(1);
    const digitToRemove =
      event.key === "Backspace" ? digitsBeforeCursor - 2 : digitsBeforeCursor - 1;

    if (digitToRemove < 0 || digitToRemove >= userDigits.length) return;

    event.preventDefault();
    const nextDigits =
      userDigits.slice(0, digitToRemove) + userDigits.slice(digitToRemove + 1);
    setContact(nextDigits ? formatPhone(`+7${nextDigits}`) : "");
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setError("");

    if (!contact.trim() || !password) {
      setError("Заполните все поля");
      return;
    }

    setLoading(true);

    try {
      // Отправляем обычный JSON, который ожидает клиент.ts
      const data = await apiRequest<{ access_token: string }>("/api/auth/login", {
        method: "POST",
        body: {
          username: contact.trim(),
          password: password
        }
      });

      // Сохраняем JWT-токен
      localStorage.setItem("token", data.access_token);

      setLoading(false);
      navigate("app");

    } catch (err: any) {
      setLoading(false);
      setError("Неверный логин или пароль");
    }
  };

  return (
    <AuthLayout navigate={navigate}>
      <section className="auth-card">
        <header className="auth-card__header">
          <p className="auth-kicker">С возвращением</p>
          <h1>Вход в Finzentra</h1>
          <p>Войдите в свой аккаунт, чтобы продолжить.</p>
        </header>
        {error && <div className="form-alert" role="alert">{error}</div>}
        <form className="auth-form" noValidate onSubmit={submit}>
          <div className="auth-form__fields">
            <Field label="Email или телефон" placeholder="Введите email или номер телефона" value={contact} autoComplete="username" onChange={(value) => setContact(value.startsWith("+") || /^\d/.test(value) ? formatPhone(value) : value)} onKeyDown={handlePhoneKeyDown} />
            <div>
              <Field label="Пароль" placeholder="Введите пароль" value={password} autoComplete="current-password" passwordToggle onChange={setPassword} />
              <button className="forgot-link" type="button" onClick={() => navigate("recover")}>Забыли пароль?</button>
            </div>
          </div>
          <PrimaryButton type="submit" loading={loading}>
            {loading ? "Входим..." : "Войти"}
          </PrimaryButton>
        </form>
        <p className="auth-switch">
          Нет аккаунта?{" "}
          <button type="button" onClick={() => navigate("register")}>Зарегистрироваться</button>
        </p>
      </section>
    </AuthLayout>
  );
}

function Recovery({ navigate }: { navigate: (screen: Screen) => void }) {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [loading, setLoading] = useState(false);
  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!email) return;
    setLoading(true);
    window.setTimeout(() => {
      setLoading(false);
      setSent(true);
    }, 900);
  };
  return (
    <AuthLayout navigate={navigate}>
      <section className="auth-card">
        {sent ? (
          <div className="success-state">
            <div className="success-state__mark">✓</div>
            <p className="auth-kicker">Инструкция отправлена</p>
            <h1>Проверьте почту</h1>
            <p>Если аккаунт существует, мы отправили инструкцию на вашу почту.</p>
            <PrimaryButton onClick={() => navigate("new-password")}>Показать следующий шаг</PrimaryButton>
            <button className="text-link" onClick={() => navigate("login")}>Вернуться ко входу</button>
          </div>
        ) : (
          <>
            <header className="auth-card__header">
              <p className="auth-kicker">Доступ к аккаунту</p>
              <h1>Восстановление пароля</h1>
              <p>Введите email, указанный при регистрации. Мы отправим инструкцию по восстановлению доступа.</p>
            </header>
            <form className="auth-form" onSubmit={submit}>
              <Field label="Email" placeholder="Введите email" value={email} type="email" autoComplete="email" onChange={setEmail} />
              <PrimaryButton type="submit" loading={loading}>{loading ? "Отправляем..." : "Отправить инструкцию"}</PrimaryButton>
            </form>
            <button className="text-link" onClick={() => navigate("login")}>Вернуться ко входу</button>
          </>
        )}
      </section>
    </AuthLayout>
  );
}

function NewPassword({ navigate }: { navigate: (screen: Screen) => void }) {
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState("");
  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!hasStrongPassword(password) || password !== confirmation) {
      setError("Пароли должны совпадать и содержать минимум 8 символов, минимум 1 букву и 1 цифру");
      return;
    }
    setSuccess(true);
  };
  return (
    <AuthLayout navigate={navigate}>
      <section className="auth-card">
        {success ? (
          <div className="success-state">
            <div className="success-state__mark">✓</div>
            <p className="auth-kicker">Готово</p>
            <h1>Пароль изменён</h1>
            <p>Теперь вы можете войти в Finzentra с новым паролем.</p>
            <PrimaryButton onClick={() => navigate("login")}>Перейти ко входу</PrimaryButton>
          </div>
        ) : (
          <>
            <header className="auth-card__header">
              <p className="auth-kicker">Последний шаг</p>
              <h1>Создайте новый пароль</h1>
              <p>Придумайте надёжный пароль, который вы не используете в других сервисах.</p>
            </header>
            {error && <div className="form-alert" role="alert">{error}</div>}
            <form className="auth-form" onSubmit={submit}>
              <div className="auth-form__fields">
                <Field label="Новый пароль" placeholder="Введите новый пароль" value={password} passwordToggle onChange={setPassword} />
                <Field label="Подтверждение пароля" placeholder="Повторите новый пароль" value={confirmation} passwordToggle onChange={setConfirmation} />
              </div>
              <PrimaryButton type="submit">Сохранить новый пароль</PrimaryButton>
            </form>
          </>
        )}
      </section>
    </AuthLayout>
  );
}

type CabinetSection = "dashboard" | "operations" | "projects" | "settings";
type CabinetIconName =
  | CabinetSection
  | "plus"
  | "bell"
  | "calendar"
  | "chevron"
  | "trend"
  | "wallet"
  | "download"
  | "more"
  | "arrow-up"
  | "arrow-down"
  | "lock"
  | "trash"
  | "info"
  | "edit"
  | "archive"
  | "restore"
  | "x"
  | "check";

function CabinetIcon({ name }: { name: CabinetIconName }) {
  const paths: Record<CabinetIconName, ReactNode> = {
    dashboard: (
      <>
        <rect x="3" y="3" width="7" height="7" rx="2" />
        <rect x="14" y="3" width="7" height="7" rx="2" />
        <rect x="3" y="14" width="7" height="7" rx="2" />
        <rect x="14" y="14" width="7" height="7" rx="2" />
      </>
    ),
    operations: (
      <>
        <path d="M7 7h12M15 3l4 4-4 4M17 17H5M9 13l-4 4 4 4" />
      </>
    ),
    projects: (
      <>
        <path d="M4 7.5h6l2 2h8v9.5a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V7.5Z" />
        <path d="M4 8V6a2 2 0 0 1 2-2h4l2 2h5" />
      </>
    ),
    settings: (
      <>
        <circle cx="12" cy="12" r="3" />
        <path d="M19.4 15a1.7 1.7 0 0 0 .34 1.88l.06.06-2.86 2.86-.06-.06A1.7 1.7 0 0 0 15 19.4a1.7 1.7 0 0 0-1 .6 1.7 1.7 0 0 0-.4 1.1V21H9.5v-.1A1.7 1.7 0 0 0 8.4 19.4a1.7 1.7 0 0 0-1.88.34l-.06.06-2.86-2.86.06-.06A1.7 1.7 0 0 0 4 15a1.7 1.7 0 0 0-1.5-1H2.4V10h.1A1.7 1.7 0 0 0 4 9a1.7 1.7 0 0 0-.34-1.88l-.06-.06L6.46 4.2l.06.06A1.7 1.7 0 0 0 8.4 4 1.7 1.7 0 0 0 9.5 2.5v-.1h4.1v.1A1.7 1.7 0 0 0 15 4a1.7 1.7 0 0 0 1.88.26l.06-.06 2.86 2.86-.06.06A1.7 1.7 0 0 0 19.4 9a1.7 1.7 0 0 0 1.5 1h.1v4h-.1a1.7 1.7 0 0 0-1.5 1Z" />
      </>
    ),
    plus: <path d="M12 5v14M5 12h14" />,
    bell: (
      <>
        <path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9" />
        <path d="M10 21h4" />
      </>
    ),
    calendar: (
      <>
        <rect x="3" y="5" width="18" height="16" rx="3" />
        <path d="M8 3v4M16 3v4M3 10h18" />
      </>
    ),
    chevron: <path d="m9 7 5 5-5 5" />,
    trend: <path d="m4 17 5-6 4 3 7-9M16 5h4v4" />,
    wallet: (
      <>
        <path d="M4 6.5A2.5 2.5 0 0 1 6.5 4H18a2 2 0 0 1 2 2v14H6a2 2 0 0 1-2-2V6.5Z" />
        <path d="M4 7h14M15 12h6v5h-6a2.5 2.5 0 0 1 0-5Z" />
      </>
    ),
    download: <path d="M12 3v12M7 10l5 5 5-5M4 21h16" />,
    more: (
      <>
        <circle cx="5" cy="12" r="1" />
        <circle cx="12" cy="12" r="1" />
        <circle cx="19" cy="12" r="1" />
      </>
    ),
    "arrow-up": <path d="M12 19V5M7 10l5-5 5 5" />,
    "arrow-down": <path d="M12 5v14M7 14l5 5 5-5" />,
    lock: (
      <>
        <rect x="4" y="10" width="16" height="11" rx="2.5" />
        <path d="M8 10V7a4 4 0 0 1 8 0v3" />
      </>
    ),
    trash: (
      <>
        <path d="M4 7h16M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2M6 7l1 13a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1l1-13" />
        <path d="M10 11v6M14 11v6" />
      </>
    ),
    info: (
      <>
        <circle cx="12" cy="12" r="9" />
        <path d="M12 11v6M12 7.5v.5" />
      </>
    ),
    edit: (
      <>
        <path d="M4 20h4L19.5 8.5a2.1 2.1 0 0 0-3-3L5 17l-1 3Z" />
        <path d="m13.5 6.5 3 3" />
      </>
    ),
    archive: (
      <>
        <rect x="3" y="4" width="18" height="5" rx="1.5" />
        <path d="M5 9v10a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V9M10 13h4" />
      </>
    ),
    restore: (
      <>
        <path d="M4 10a8 8 0 1 1 2.3 6.3M4 10V4m0 6h6" />
      </>
    ),
    x: <path d="M6 6l12 12M18 6 6 18" />,
    check: <path d="m5 12 5 5 9-11" />,
  };
  return (
    <svg className="cabinet-icon" viewBox="0 0 24 24" aria-hidden="true">
      {paths[name]}
    </svg>
  );
}

const cabinetNavigation: { id: CabinetSection; label: string }[] = [
  { id: "dashboard", label: "Дашборд" },
  { id: "operations", label: "Операции" },
  { id: "projects", label: "Проекты" },
  { id: "settings", label: "Настройки" },
];

type OperationType = "income" | "expense" | "tax";
type ReportingPeriodType = "month" | "quarter" | "year";
type OperationPeriodFilter = "all" | "global" | "month" | "quarter" | "year" | "custom";

type Operation = {
  id: string;
  type: OperationType;
  category: string;
  project: string;
  date: string;
  periodDate: string;
  comment: string;
  amount: number;
};

function formatDateInput(value: string) {
  const digits = value.replace(/\D/g, "").slice(0, 8);
  if (digits.length <= 2) return digits;
  if (digits.length <= 4) return `${digits.slice(0, 2)}.${digits.slice(2)}`;
  return `${digits.slice(0, 2)}.${digits.slice(2, 4)}.${digits.slice(4)}`;
}

function isValidDateInput(value: string) {
  const match = /^(\d{2})\.(\d{2})\.(\d{4})$/.exec(value);
  if (!match) return false;
  const [, dayValue, monthValue, yearValue] = match;
  const day = Number(dayValue);
  const month = Number(monthValue);
  const year = Number(yearValue);
  if (year < 1000 || month < 1 || month > 12 || day < 1) return false;
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return day <= daysInMonth;
}

function parseDateInput(value: string) {
  if (!isValidDateInput(value)) return null;
  const [day, month, year] = value.split(".").map(Number);
  return new Date(year, month - 1, day);
}

function formatDateValue(date: Date) {
  return `${String(date.getDate()).padStart(2, "0")}.${String(date.getMonth() + 1).padStart(2, "0")}.${date.getFullYear()}`;
}

function getCalendarDays(month: Date) {
  const firstDay = new Date(month.getFullYear(), month.getMonth(), 1);
  const mondayOffset = (firstDay.getDay() + 6) % 7;
  const firstCalendarDay = new Date(month.getFullYear(), month.getMonth(), 1 - mondayOffset);
  return Array.from({ length: 42 }, (_, index) => new Date(firstCalendarDay.getFullYear(), firstCalendarDay.getMonth(), firstCalendarDay.getDate() + index));
}

type DropdownOption = { value: string; label: string };

function CustomDropdown({ value, options, onChange, ariaLabel }: {
  value: string;
  options: DropdownOption[];
  onChange: (value: string) => void;
  ariaLabel: string;
}) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const selectedOption = options.find((option) => option.value === value);

  useEffect(() => {
    if (!open) return;
    const closeOnOutsideClick = (event: MouseEvent) => {
      if (event.target instanceof Node && !containerRef.current?.contains(event.target)) setOpen(false);
    };
    const closeOnEscape = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", closeOnOutsideClick);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("mousedown", closeOnOutsideClick);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [open]);

  return (
    <div className="custom-dropdown" ref={containerRef}>
      <button
        type="button"
        className="custom-dropdown__trigger"
        aria-label={ariaLabel}
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
      >
        <span>{selectedOption?.label ?? options[0]?.label ?? "Нет вариантов"}</span>
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m7 10 5 5 5-5" /></svg>
      </button>
      {open && (
        <div className="custom-dropdown__menu" role="listbox" aria-label={ariaLabel}>
          {options.map((option) => (
            <button
              key={option.value}
              type="button"
              role="option"
              aria-selected={option.value === value}
              className={option.value === value ? "is-selected" : ""}
              onClick={() => { onChange(option.value); setOpen(false); }}
            >
              {option.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function currentPeriodKey(type: ReportingPeriodType) {
  const now = new Date();
  if (type === "year") return String(now.getFullYear());
  if (type === "quarter") return `${now.getFullYear()}-Q${Math.floor(now.getMonth() / 3) + 1}`;
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

function DateField({ label, value, onChange, hint, onInvalid, error, alignCalendarRight = false }: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  hint: string;
  onInvalid: () => void;
  error: string;
  alignCalendarRight?: boolean;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [visibleMonth, setVisibleMonth] = useState(() => {
    const selectedDate = parseDateInput(value) ?? new Date();
    return new Date(selectedDate.getFullYear(), selectedDate.getMonth(), 1);
  });
  const inputId = useId();
  const today = new Date();
  const selectedDate = parseDateInput(value);
  const calendarDays = getCalendarDays(visibleMonth);
  const monthTitle = new Intl.DateTimeFormat("ru-RU", { month: "long", year: "numeric" }).format(visibleMonth);
  const openCalendar = () => {
    const date = parseDateInput(value) ?? new Date();
    setVisibleMonth(new Date(date.getFullYear(), date.getMonth(), 1));
    setIsOpen(true);
  };
  const selectDate = (date: Date) => {
    onChange(formatDateValue(date));
    setIsOpen(false);
  };

  useEffect(() => {
    if (!isOpen) return;
    const closeOnOutsideClick = (event: MouseEvent) => {
      if (event.target instanceof Node && !containerRef.current?.contains(event.target)) setIsOpen(false);
    };
    const closeOnEscape = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape") setIsOpen(false);
    };
    document.addEventListener("pointerdown", closeOnOutsideClick);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOnOutsideClick);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [isOpen]);

  return (
    <div className="drawer-field">
      <label className="drawer-field__label" htmlFor={inputId}>{label} <span className="drawer-field__required" aria-hidden="true">*</span></label>
      <div className="date-input" ref={containerRef}>
        <input
          id={inputId}
          type="text"
          inputMode="numeric"
          value={value}
          onChange={(event) => onChange(formatDateInput(event.target.value))}
          onBlur={() => { if (value && !isValidDateInput(value)) onInvalid(); }}
          onClick={openCalendar}
          onKeyDown={(event) => { if (event.key === "ArrowDown") setIsOpen(true); }}
          placeholder="ДД.ММ.ГГГГ"
          maxLength={10}
          aria-label={label}
          aria-invalid={Boolean(error || (value && !isValidDateInput(value)))}
          aria-required="true"
          aria-haspopup="dialog"
          aria-expanded={isOpen}
        />
        <button type="button" className="date-input__calendar" aria-label={`Открыть календарь: ${label}`} aria-expanded={isOpen} onClick={openCalendar}>
          <CabinetIcon name="calendar" />
        </button>
        {isOpen && (
          <div className={`date-picker${alignCalendarRight ? " date-picker--align-right" : ""}`} role="dialog" aria-label={`Выбор даты: ${label}`}>
            <div className="date-picker__header">
              <button type="button" aria-label="Предыдущий месяц" onClick={() => setVisibleMonth((month) => new Date(month.getFullYear(), month.getMonth() - 1, 1))}>
                <svg viewBox="0 0 20 20" aria-hidden="true"><path d="m12.5 4.5-5 5 5 5" /></svg>
              </button>
              <strong>{monthTitle.charAt(0).toLocaleUpperCase("ru-RU") + monthTitle.slice(1)}</strong>
              <button type="button" aria-label="Следующий месяц" onClick={() => setVisibleMonth((month) => new Date(month.getFullYear(), month.getMonth() + 1, 1))}>
                <svg viewBox="0 0 20 20" aria-hidden="true"><path d="m7.5 4.5 5 5-5 5" /></svg>
              </button>
            </div>
            <div className="date-picker__grid">
              {["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"].map((day) => (
                <span key={day} className="date-picker__weekday" aria-hidden="true">{day}</span>
              ))}
              {calendarDays.map((date) => {
                const dateValue = formatDateValue(date);
                const isSelected = selectedDate?.getTime() === date.getTime();
                const isToday = today.getFullYear() === date.getFullYear() && today.getMonth() === date.getMonth() && today.getDate() === date.getDate();
                const isOutsideMonth = date.getMonth() !== visibleMonth.getMonth();
                return (
                  <button
                    key={dateValue}
                    type="button"
                    aria-label={date.toLocaleDateString("ru-RU", { day: "numeric", month: "long", year: "numeric" })}
                    aria-pressed={isSelected}
                    className={[
                      "date-picker__day",
                      isSelected ? "is-selected" : "",
                      isToday && !isSelected ? "is-today" : "",
                      isOutsideMonth ? "is-outside" : "",
                    ].filter(Boolean).join(" ")}
                    onClick={() => selectDate(date)}
                  >
                    {date.getDate()}
                  </button>
                );
              })}
            </div>
            <div className="date-picker__footer">
              <button type="button" onClick={() => onChange("")}>Очистить</button>
              <button type="button" onClick={() => selectDate(today)}>Сегодня</button>
            </div>
          </div>
        )}
      </div>
      {error && <p className="drawer-field__error">{error}</p>}
      <p className="drawer-field__hint">{hint}</p>
    </div>
  );
}

function formatAmount(amount: number) {
  return formatThresholdCurrency(amount, true).display;
}

function DashboardContent({ projects, operations, periodType, selectedPeriod, onPeriodChange, selectedProjects, onSelectedProjectsChange }: {
  projects: DirectoryProject[];
  operations: Operation[];
  periodType: ReportingPeriodType;
  selectedPeriod: string;
  onPeriodChange: (type: ReportingPeriodType, period: string) => void;
  selectedProjects: string[];
  onSelectedProjectsChange: (names: string[]) => void;
}) {
  return <FinancialDashboard projects={projects} operations={operations} periodType={periodType} selectedPeriod={selectedPeriod} onPeriodChange={onPeriodChange} selectedProjects={selectedProjects} onSelectedProjectsChange={onSelectedProjectsChange} />;
}

type OperationFilter = "all" | OperationType;

function OperationsContent({ operations, projects, onAdd, onDelete, onEdit, periodType, selectedPeriod }: {
  operations: Operation[];
  projects: DirectoryProject[];
  onAdd: () => void;
  onDelete: (operation: Operation) => void;
  onEdit: (operation: Operation) => void;
  periodType: ReportingPeriodType;
  selectedPeriod: string;
}) {
  const [query, setQuery] = useState("");
  const [selectedProjects, setSelectedProjects] = useState<string[]>([]);
  const [filter, setFilter] = useState<OperationFilter>("all");
  const [periodFilter, setPeriodFilter] = useState<OperationPeriodFilter>("global");
  const [selectedMonth, setSelectedMonth] = useState(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  });
  const [selectedYear, setSelectedYear] = useState(String(new Date().getFullYear()));
  const [selectedQuarter, setSelectedQuarter] = useState("1");
  const [rangeStart, setRangeStart] = useState("");
  const [rangeEnd, setRangeEnd] = useState("");
  const [dateSortDirection, setDateSortDirection] = useState<"desc" | "asc">("desc");

  const matches = operations.map((operation, index) => ({ operation, index })).filter(({ operation: op }) => {
    if (filter !== "all" && op.type !== filter) return false;
    if (selectedProjects.length > 0 && !selectedProjects.includes(op.project)) return false;
    if (query.trim()) {
      const q = query.trim().toLowerCase();
      if (!op.comment.toLowerCase().includes(q) && !op.category.toLowerCase().includes(q) && !op.project.toLowerCase().includes(q)) return false;
    }
    const date = parseDateInput(op.date);
    if (periodFilter !== "all" && !date) return false;
    if (periodFilter === "global" && date) {
      const operationPeriod = periodType === "year"
        ? String(date.getFullYear())
        : periodType === "quarter"
          ? `${date.getFullYear()}-Q${Math.floor(date.getMonth() / 3) + 1}`
          : `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
      if (operationPeriod !== selectedPeriod) return false;
    }
    if (periodFilter === "month" && date
      && `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}` !== selectedMonth) return false;
    if (periodFilter === "quarter" && date
      && (date.getFullYear() !== Number(selectedYear) || Math.floor(date.getMonth() / 3) + 1 !== Number(selectedQuarter))) return false;
    if (periodFilter === "year" && date && date.getFullYear() !== Number(selectedYear)) return false;
    if (periodFilter === "custom" && date) {
      const dateTime = new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
      const start = rangeStart ? new Date(`${rangeStart}T00:00:00`).getTime() : null;
      const end = rangeEnd ? new Date(`${rangeEnd}T23:59:59.999`).getTime() : null;
      if (start !== null && dateTime < start) return false;
      if (end !== null && dateTime > end) return false;
    }
    return true;
  }).sort((a, b) => {
    const dateA = parseDateInput(a.operation.date)?.getTime() ?? 0;
    const dateB = parseDateInput(b.operation.date)?.getTime() ?? 0;
    const dateOrder = dateSortDirection === "desc" ? dateB - dateA : dateA - dateB;
    return dateOrder || b.index - a.index;
  });

  const counts: Record<OperationFilter, number> = {
    all: operations.length,
    income: operations.filter((o) => o.type === "income").length,
    expense: operations.filter((o) => o.type === "expense").length,
    tax: operations.filter((o) => o.type === "tax").length,
  };

  const toggleProject = (projectName: string) => {
    setSelectedProjects((current) => current.includes(projectName)
      ? current.filter((name) => name !== projectName)
      : [...current, projectName]);
  };

  return (
    <section className="section-page operations-page">
      <div className="operations-toolbar">
        <div className="operations-search">
          <svg className="operations-search__icon" viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="7" /><path d="m20 20-4-4" /></svg>
          <input className="operations-search__input" type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Поиск по операциям…" aria-label="Поиск по операциям" />
        </div>
        <div className="operations-filter-group">
          <details className="operations-project-filter">
            <summary><CabinetIcon name="projects" />{selectedProjects.length ? `Проекты: ${selectedProjects.length}` : "Все проекты"}</summary>
            <div className="operations-project-filter__options">
              <button type="button" onClick={() => setSelectedProjects([])}>Сбросить выбор</button>
              {projects.map((item) => (
                <label key={item.id}>
                  <input type="checkbox" checked={selectedProjects.includes(item.name)} onChange={() => toggleProject(item.name)} />
                  <span>{item.name}{item.archived ? " (архив)" : ""}</span>
                </label>
              ))}
              {projects.length === 0 && <span className="operations-project-filter__empty">Нет проектов</span>}
            </div>
          </details>
          <div className="operations-period-filter">
            <CustomSelect
              ariaLabel="Период фильтрации"
              value={periodFilter}
              onChange={(value) => setPeriodFilter(value as OperationPeriodFilter)}
              options={[
                { value: "global", label: "Период кабинета" },
                { value: "all", label: "Все даты" },
                { value: "month", label: "Месяц" },
                { value: "quarter", label: "Квартал" },
                { value: "year", label: "Год" },
                { value: "custom", label: "Произвольный диапазон" },
              ]}
            />
            {periodFilter === "month" && <input aria-label="Месяц" type="month" value={selectedMonth} onChange={(event) => setSelectedMonth(event.target.value)} />}
            {(periodFilter === "quarter" || periodFilter === "year") && (
              <input aria-label="Год" type="number" min="1000" max="9999" value={selectedYear} onChange={(event) => setSelectedYear(event.target.value)} />
            )}
            {periodFilter === "quarter" && (
              <CustomSelect
                ariaLabel="Квартал"
                value={selectedQuarter}
                onChange={setSelectedQuarter}
                options={[
                  { value: "1", label: "I квартал" },
                  { value: "2", label: "II квартал" },
                  { value: "3", label: "III квартал" },
                  { value: "4", label: "IV квартал" },
                ]}
              />
            )}
            {periodFilter === "custom" && (
              <div className="operations-period-filter__range">
                <input aria-label="Начало периода" type="date" value={rangeStart} onChange={(event) => setRangeStart(event.target.value)} />
                <span>—</span>
                <input aria-label="Конец периода" type="date" value={rangeEnd} onChange={(event) => setRangeEnd(event.target.value)} />
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="operation-type-tabs" role="tablist" aria-label="Тип операции">
        {(["all", "income", "expense", "tax"] as const).map((t) => (
          <button key={t} role="tab" aria-selected={filter === t} className={filter === t ? "is-active" : ""} onClick={() => setFilter(t)}>
            {t === "all" ? "Все" : t === "income" ? "Доходы" : t === "expense" ? "Расходы" : "Налоги"}
            <i>{counts[t]}</i>
          </button>
        ))}
      </div>

      {operations.length === 0 ? (
        <div className="operations-empty-state">
          <div className="operations-empty-state__card">
            <div className="operations-empty-state__icon">
              <CabinetIcon name="operations" />
            </div>
            <h2>Здесь появятся ваши операции</h2>
            <p>Добавьте первую операцию дохода или расхода, чтобы начать учёт</p>
            <button type="button" className="dashboard-empty__button" onClick={onAdd}>
              <CabinetIcon name="plus" />
              <span>Добавить операцию</span>
            </button>
          </div>
        </div>
      ) : (
        <div className="operations-table-card">
          <div className="operations-table-scroll">
          <table className="operations-table" aria-label="Список операций" style={{ width: "100%", boxSizing: "border-box", tableLayout: "fixed", borderCollapse: "collapse" }}>
            <colgroup>
              <col style={{ width: "13%" }} />
              <col style={{ width: "13%" }} />
              <col style={{ width: "15%" }} />
              <col style={{ width: "11%" }} />
              <col style={{ width: "17%" }} />
              <col style={{ width: "19%" }} />
              <col style={{ width: "12%" }} />
            </colgroup>
            <thead>
              <tr className="operations-table__head">
                <th scope="col" className="operations-table__date-head" aria-sort={dateSortDirection === "desc" ? "descending" : "ascending"}>
                  <button type="button" className="operations-sort-button" aria-label="Сортировать по дате факта" onClick={() => setDateSortDirection((direction) => direction === "desc" ? "asc" : "desc")}>
                    Дата факта
                  </button>
                </th>
                <th scope="col" className="operations-table__date-head">Дата периода</th>
                <th scope="col">Категория</th>
                <th scope="col">Проект</th>
                <th scope="col" className="operations-table__comment-head">Комментарий</th>
                <th scope="col" className="operations-table__sum-head">Сумма</th>
                <th scope="col" className="operations-table__actions-head">ДЕЙСТВИЯ</th>
              </tr>
            </thead>
            <tbody>
              {matches.length === 0 ? (
                <tr><td className="operations-empty" colSpan={7}>Ничего не найдено по заданным фильтрам</td></tr>
              ) : (
                matches.map(({ operation: op }) => (
                  <Fragment key={op.id}>
                    <tr className="operations-table__row">
                      <td className="operations-table__date"><TruncatedValue value={op.date} className="operations-table__date-value" /></td>
                      <td className="operations-table__date"><TruncatedValue value={op.periodDate} className="operations-table__date-value" /></td>
                      <td className="operations-table__category"><TruncatedValue value={op.category} className="operations-table__category-value" /></td>
                      <td className="operations-table__project"><TruncatedValue value={op.project} className="project-badge" /></td>
                      <td className="operations-table__comment"><TruncatedValue value={op.comment} className="operations-table__comment-value" /></td>
                      <td className={`operations-table__sum operations-table__sum--${op.type === "income" ? "income" : "expense"}${Math.abs(op.amount) >= 1_000_000 ? " operations-table__sum--large" : ""}`}>
                        <TruncatedValue value={formatAmount(op.amount)} tooltipValue={formatThresholdCurrency(op.amount, true).exact} className="operations-table__sum-value" showTooltip={Math.abs(op.amount) >= currencyTruncationThreshold} />
                      </td>
                      <td className="operations-table__actions">
                        <div className="operations-table__actions-content">
                          <button type="button" className="operation-edit-button" aria-label={`Редактировать операцию: ${op.comment}`} onClick={() => onEdit(op)}>
                            <CabinetIcon name="edit" />
                          </button>
                          <button type="button" className="operation-delete-button" aria-label={`Удалить операцию: ${op.comment}`} onClick={() => onDelete(op)}>
                            <CabinetIcon name="trash" />
                          </button>
                        </div>
                      </td>
                    </tr>
                    <tr className="operations-table__mobile-row">
                      <td colSpan={7}>
                        <div className="operation-mobile-card">
                          <div className="operation-mobile-card__top">
                            <div className="operation-mobile-card__main">
                              <strong>{op.category}</strong>
                              <time>Факт: {op.date}</time>
                              <time>Период: {op.periodDate}</time>
                            </div>
                            <div className="operation-mobile-card__amount">
                              <strong className={`operations-table__sum--${op.type === "income" ? "income" : "expense"}${Math.abs(op.amount) >= 1_000_000 ? " operations-table__sum--large" : ""}`}>
                                <TruncatedValue value={formatAmount(op.amount)} tooltipValue={formatThresholdCurrency(op.amount, true).exact} className="operation-mobile-card__sum-value" showTooltip={Math.abs(op.amount) >= currencyTruncationThreshold} />
                              </strong>
                              <button type="button" className="operation-edit-button" aria-label={`Редактировать операцию: ${op.comment}`} onClick={() => onEdit(op)}>
                                <CabinetIcon name="edit" />
                              </button>
                              <button type="button" className="operation-delete-button" aria-label={`Удалить операцию: ${op.comment}`} onClick={() => onDelete(op)}>
                                <CabinetIcon name="trash" />
                              </button>
                            </div>
                          </div>
                          <div className="operation-mobile-card__bottom">
                            <span className="project-badge">{op.project}</span>
                            <TruncatedValue value={op.comment} className="operation-mobile-card__comment" />
                          </div>
                        </div>
                      </td>
                    </tr>
                  </Fragment>
                ))
              )}
            </tbody>
          </table>
          </div>
        </div>
      )}
    </section>
  );
}

type OperationDrawerType = "expense" | "income" | "tax";

function OperationDrawer({ operation, projects, categories, onClose, onSaved, onCreateProject }: {
  operation: Operation | null;
  projects: DirectoryProject[];
  categories: Record<OperationType, string[]>;
  onClose: () => void;
  onSaved: (op: Operation) => void;
  onCreateProject: (name: string, description: string) => DirectoryProject;
}) {
  const activeProjects = projects.filter((p) => !p.archived);
  const [type, setType] = useState<OperationDrawerType>(operation?.type ?? "expense");
  const [amount, setAmount] = useState(operation ? Math.abs(operation.amount).toFixed(2).replace(".", ",") : "");
  const initialFactDate = operation?.date ?? formatDateValue(new Date());
  const [factDate, setFactDate] = useState(initialFactDate);
  const [periodDate, setPeriodDate] = useState(operation?.periodDate ?? initialFactDate);
  const [periodDateManuallyEdited, setPeriodDateManuallyEdited] = useState(Boolean(operation?.periodDate));
  const [project, setProject] = useState(operation?.project ?? activeProjects[0]?.name ?? "");
  const [category, setCategory] = useState(operation?.category ?? categories.expense[0] ?? "");
  const [comment, setComment] = useState(operation?.comment ?? "");
  const [error, setError] = useState("");
  const [fieldErrors, setFieldErrors] = useState({ amount: "", category: "", factDate: "", periodDate: "" });
  const [projectModalOpen, setProjectModalOpen] = useState(false);
  const [newProjectName, setNewProjectName] = useState("");
  const [newProjectDescription, setNewProjectDescription] = useState("");
  const [newProjectError, setNewProjectError] = useState("");

  const typeCategories = operation?.type === type && !categories[type].includes(operation.category)
    ? [operation.category, ...categories[type]]
    : categories[type];
  const commentLimit = 255;

  const switchType = (next: OperationDrawerType) => {
    setType(next);
    setCategory(categories[next][0] ?? "");
    setFieldErrors((current) => ({ ...current, category: "" }));
  };

  const formatAmountInput = (raw: string) => {
    return raw.replace(/[^\d,.]/g, "").replace(/\./g, ",");
  };

  const save = () => {
    const nextFieldErrors = {
      amount: !amount
        ? "Введите сумму"
        : !/^\d{1,12}([.,]\d{1,2})?$/.test(amount)
          ? "Введите сумму не более 12 цифр до запятой и 2 после"
        : "",
      category: category ? "" : "Выберите категорию",
      factDate: factDate ? (isValidDateInput(factDate) ? "" : "Введите корректную дату факта в формате ДД.ММ.ГГГГ") : "Укажите дату факта",
      periodDate: periodDate ? (isValidDateInput(periodDate) ? "" : "Введите корректную дату периода в формате ДД.ММ.ГГГГ") : "Укажите дату периода",
    };
    const numeric = parseFloat(amount.replace(",", "."));
    if (!nextFieldErrors.amount && (!Number.isFinite(numeric) || numeric <= 0)) {
      nextFieldErrors.amount = "Введите сумму больше нуля";
    }
    setFieldErrors(nextFieldErrors);
    if (Object.values(nextFieldErrors).some(Boolean)) return;

    if (!project) {
      setError("Выберите проект или создайте новый");
      return;
    }
    const op: Operation = {
      id: operation?.id ?? "o-" + Date.now(),
      type,
      category,
      project,
      date: factDate,
      periodDate,
      comment: comment.trim(),
      amount: type === "income" ? numeric : -numeric,
    };
    onSaved(op);
  };

  const handleCreateProject = () => {
    const clean = newProjectName.trim();
    if (clean.length < 2) {
      setNewProjectError("Название должно содержать минимум 2 символа");
      return;
    }
    if (projects.some((p) => p.name.toLowerCase() === clean.toLowerCase())) {
      setNewProjectError("Проект с таким названием уже существует");
      return;
    }
    const created = onCreateProject(clean, newProjectDescription.trim());
    setProject(created.name);
    setProjectModalOpen(false);
    setNewProjectName("");
    setNewProjectDescription("");
    setNewProjectError("");
  };

  return (
    <div className="drawer-overlay" role="dialog" aria-modal="true" aria-label={operation ? "Редактирование операции" : "Новая операция"} onClick={onClose}>
      <div className="drawer" onClick={(e) => e.stopPropagation()}>
        <div className="drawer__head">
          <div>
            <p className="auth-kicker">{operation ? "Редактирование" : "Создать"}</p>
            <h2>{operation ? "Редактировать операцию" : "Новая операция"}</h2>
          </div>
          <button type="button" className="icon-button" aria-label="Закрыть" onClick={onClose}><CabinetIcon name="x" /></button>
        </div>

        <div className="drawer__body">
          <div className="operation-type-segmented" role="tablist" aria-label="Тип операции">
            {(["expense", "income", "tax"] as const).map((t) => (
              <button key={t} role="tab" aria-selected={type === t} className={type === t ? "is-active" : ""} onClick={() => switchType(t)}>
                <span className="operation-type-dot" data-type={t} />
                {t === "expense" ? "Расход" : t === "income" ? "Доход" : "Налог"}
              </button>
            ))}
          </div>

          <div className="drawer-field drawer-field--amount">
            <label className="drawer-field__label" htmlFor="operation-amount">Сумма <span className="drawer-field__required" aria-hidden="true">*</span></label>
            <div className="amount-input">
              <input id="operation-amount" className="amount-input__control" type="text" inputMode="decimal" maxLength={15} value={amount} onChange={(e) => {
                const nextAmount = formatAmountInput(e.target.value);
                if (nextAmount && !/^\d{1,12}([,.]\d{0,2})?$/.test(nextAmount)) {
                  setFieldErrors((current) => ({ ...current, amount: "Введите сумму не более 12 цифр до запятой и 2 после" }));
                  return;
                }
                setAmount(nextAmount);
                setFieldErrors((current) => ({ ...current, amount: "" }));
                setError("");
              }} placeholder="0,00" aria-label="Сумма операции" aria-required="true" aria-invalid={Boolean(fieldErrors.amount)} />
              <span className="amount-input__currency">₽</span>
            </div>
            {fieldErrors.amount && <p className="drawer-field__error">{fieldErrors.amount}</p>}
          </div>

          <div className="drawer-dates">
            <DateField label="Дата факта" value={factDate} onChange={(value) => {
              setFactDate(value);
              if (!periodDateManuallyEdited) {
                setPeriodDate(value);
                setFieldErrors((current) => ({ ...current, factDate: "", periodDate: "" }));
              } else {
                setFieldErrors((current) => ({ ...current, factDate: "" }));
              }
              setError("");
            }} onInvalid={() => setFieldErrors((current) => ({ ...current, factDate: "Введите реальную дату в формате ДД.ММ.ГГГГ" }))} error={fieldErrors.factDate} hint="Реальное движение денег (для Cash Flow)" />
            <DateField label="Дата периода" value={periodDate} onChange={(value) => {
              setPeriodDate(value);
              setPeriodDateManuallyEdited(true);
              setFieldErrors((current) => ({ ...current, periodDate: "" }));
              setError("");
            }} onInvalid={() => setFieldErrors((current) => ({ ...current, periodDate: "Введите реальную дату в формате ДД.ММ.ГГГГ" }))} error={fieldErrors.periodDate} hint="Период начисления (для отчёта P&L)" alignCalendarRight />
          </div>

          <div className="drawer-field">
            <label className="drawer-field__label">Проект</label>
            <div className="drawer-project-row">
              <div className="dashboard-select">
                <CabinetIcon name="projects" />
                <CustomDropdown
                  value={project}
                  onChange={setProject}
                  ariaLabel="Проект операции"
                  options={activeProjects.length
                    ? activeProjects.map((item) => ({ value: item.name, label: item.name }))
                    : [{ value: "", label: "Нет проектов" }]}
                />
              </div>
              <button type="button" className="directory-btn directory-btn--ghost" onClick={() => setProjectModalOpen(true)}>
                <CabinetIcon name="plus" />
                <span>Новый проект</span>
              </button>
            </div>
          </div>

          <div className="drawer-field">
            <label className="drawer-field__label">Категория <span className="drawer-field__required" aria-hidden="true">*</span></label>
            <div className="dashboard-select">
              <CabinetIcon name={type === "income" ? "arrow-down" : type === "tax" ? "wallet" : "arrow-up"} />
              <CustomDropdown
                value={category}
                onChange={(value) => {
                  setCategory(value);
                  setFieldErrors((current) => ({ ...current, category: "" }));
                }}
                ariaLabel="Категория операции"
                options={typeCategories.map((item) => ({ value: item, label: item }))}
              />
            </div>
            {fieldErrors.category && <p className="drawer-field__error">{fieldErrors.category}</p>}
          </div>

          <div className="drawer-field">
            <label className="drawer-field__label">Комментарий</label>
            <textarea className="drawer-textarea" value={comment} onChange={(e) => setComment(e.target.value)} maxLength={commentLimit} placeholder="Добавьте комментарий…" rows={3} />
            <p className="drawer-field__counter">{comment.length} / {commentLimit}</p>
          </div>

          {error && <p className="directory-error">{error}</p>}
        </div>

        <div className="drawer__footer">
          <button type="button" className="directory-btn directory-btn--ghost" onClick={onClose}>Отмена</button>
          <button type="button" className="directory-btn directory-btn--primary" onClick={save}>
            <CabinetIcon name="check" /><span>Сохранить</span>
          </button>
        </div>

        {projectModalOpen && (
          <div className="directory-modal directory-modal--inline" role="dialog" aria-modal="true" aria-label="Создать проект">
            <div className="directory-modal__card">
              <div className="directory-modal__head">
                <h3>Новый проект</h3>
                <button type="button" className="icon-button" aria-label="Закрыть" onClick={() => setProjectModalOpen(false)}>
                  <CabinetIcon name="x" />
                </button>
              </div>
              <label>Название проекта
                <input value={newProjectName} onChange={(e) => { setNewProjectName(e.target.value); setNewProjectError(""); }} placeholder="Например, ПВЗ Wildberries" maxLength={60} autoFocus />
              </label>
              <label>Описание
                <input value={newProjectDescription} onChange={(e) => setNewProjectDescription(e.target.value)} placeholder="Например, пункт выдачи" maxLength={120} />
              </label>
              {newProjectError && <p className="directory-error">{newProjectError}</p>}
              <div className="directory-modal__actions">
                <button type="button" className="directory-btn directory-btn--ghost" onClick={() => setProjectModalOpen(false)}>Отмена</button>
                <button type="button" className="directory-btn directory-btn--primary" onClick={handleCreateProject}>Создать</button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

type DirectoryProject = {
  id: string;
  name: string;
  description: string;
  archived: boolean;
  operations: number;
  color?: string;
};

const projectColors = ["#2563EB", "#10B981", "#8B5CF6", "#F59E0B", "#EC4899", "#06B6D4", "#6366F1"];

function ProjectsContent({ projects, setProjects, onProjectRenamed }: {
  projects: DirectoryProject[];
  setProjects: Dispatch<SetStateAction<DirectoryProject[]>>;
  onProjectRenamed: (previousName: string, nextName: string) => void;
}) {
  const [formOpen, setFormOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const activeCount = projects.filter((item) => !item.archived).length;
  const archivedCount = projects.length - activeCount;

  const openCreate = () => {
    setEditingId(null);
    setName("");
    setDescription("");
    setError("");
    setFormOpen(true);
  };

  const openEdit = (project: DirectoryProject) => {
    setEditingId(project.id);
    setName(project.name);
    setDescription(project.description);
    setError("");
    setFormOpen(true);
  };

  const flash = (text: string) => {
    setNotice(text);
    window.setTimeout(() => setNotice(""), 3200);
  };
  const saveProject = () => {
    const cleanName = name.trim();
    if (cleanName.length < 2) {
      setError("Название должно содержать минимум 2 символа");
      return;
    }
    if (editingId) {
      const previousName = projects.find((item) => item.id === editingId)?.name;
      setProjects((current) => current.map((item) => (item.id === editingId ? { ...item, name: cleanName, description: description.trim() || "Без описания" } : item)));
      if (previousName && previousName !== cleanName) onProjectRenamed(previousName, cleanName);
      flash("Проект «" + cleanName + "» переименован");
    } else {
      setProjects((current) => [...current, { id: "p-" + Date.now(), name: cleanName, description: description.trim() || "Новый проект", archived: false, operations: 0, color: projectColors[projects.length % projectColors.length] }]);
      flash("Проект «" + cleanName + "» создан");
    }
    setFormOpen(false);
  };

  const archiveProject = (id: string) => {
    setProjects((current) => current.map((item) => (item.id === id ? { ...item, archived: true } : item)));
    flash("Проект отправлен в архив");
  };
  const restoreProject = (id: string) => {
    setProjects((current) => current.map((item) => (item.id === id ? { ...item, archived: false } : item)));
    flash("Проект восстановлен из архива");
  };
  const deleteProject = (project: DirectoryProject) => {
    if (project.operations !== 0) return;
    setProjects((current) => current.filter((item) => item.id !== project.id));
    flash(`Проект «${project.name}» удалён`);
  };

  return (
    <section className="section-page directory">
      <div className="section-page__intro directory__intro">
        <div>
          <h2>Мои проекты</h2>
          <p>{activeCount} активных • {archivedCount} в архиве</p>
        </div>
        <button className="cabinet-primary" type="button" onClick={openCreate}>
          <CabinetIcon name="plus" />
          <span>Создать проект</span>
        </button>
      </div>
      {notice && (
        <div className="directory-toast" role="status">
          <CabinetIcon name="check" />
          <span>{notice}</span>
        </div>
      )}
      {projects.length === 0 ? (
        <div className="projects-empty-state">
          <div className="projects-empty-state__card">
            <div className="projects-empty-state__icon">
              <CabinetIcon name="projects" />
            </div>
            <h2>У вас пока нет проектов</h2>
            <p>Создайте проект, чтобы разделять финансы по направлениям бизнеса и видеть аналитику по каждому отдельно</p>
            <button type="button" className="dashboard-empty__button" onClick={openCreate}>
              <CabinetIcon name="plus" />
              <span>Создать проект</span>
            </button>
          </div>
        </div>
      ) : (
        <>
          <div className="project-directory-grid">
            {projects.map((project) => (
              <article key={project.id} className={project.archived ? "project-card project-card--archived" : "project-card"}>
                <div className="project-card__top">
                  <span className="project-avatar" style={{ background: project.color ?? projectColors[0] }}>{project.name.split(" ").map((word) => word[0]).slice(0, 2).join("")}</span>
                  <span className={project.archived ? "status-badge status-badge--archived" : "status-badge status-badge--active"}>{project.archived ? "В архиве" : "Активен"}</span>
                </div>
                <h3>{project.name}</h3>
                <p className="project-card__description">{project.description}</p>
                <p className="project-card__meta">{project.operations} операций</p>
                <div className="project-card__actions">
                  {!project.archived ? (
                    <>
                      <button type="button" className="directory-btn directory-btn--ghost" onClick={() => openEdit(project)}>
                        <CabinetIcon name="edit" />
                        <span>Редактировать</span>
                      </button>
                      <button type="button" className="directory-btn directory-btn--soft" onClick={() => archiveProject(project.id)}>
                        <CabinetIcon name="archive" />
                        <span>В архив</span>
                      </button>
                      {project.operations === 0 && (
                        <button type="button" className="directory-btn directory-btn--danger" onClick={() => deleteProject(project)}>
                          <CabinetIcon name="trash" />
                          <span>Удалить</span>
                        </button>
                      )}
                    </>
                  ) : (
                    <>
                      <button type="button" className="directory-btn directory-btn--primary" onClick={() => restoreProject(project.id)}>
                        <CabinetIcon name="restore" />
                        <span>Восстановить</span>
                      </button>
                      {project.operations === 0 && (
                        <button type="button" className="directory-btn directory-btn--danger" onClick={() => deleteProject(project)}>
                          <CabinetIcon name="trash" />
                          <span>Удалить</span>
                        </button>
                      )}
                    </>
                  )}
                </div>
              </article>
            ))}
          </div>
          <div className="directory-hint">
            <CabinetIcon name="info" />
            <p>Проекты с существующими операциями нельзя удалить — их можно только переименовать или отправить в архив</p>
          </div>
        </>
      )}
      {formOpen && (
        <div className="directory-modal" role="dialog" aria-modal="true">
          <div className="directory-modal__card">
            <div className="directory-modal__head">
              <h3>{editingId ? "Редактировать проект" : "Новый проект"}</h3>
              <button type="button" className="icon-button" aria-label="Закрыть" onClick={() => setFormOpen(false)}>
                <CabinetIcon name="x" />
              </button>
            </div>
            <label>Название проекта
              <input value={name} onChange={(event) => setName(event.target.value)} placeholder="Например, ПВЗ Wildberries" maxLength={60} autoFocus />
            </label>
            <label>Описание
              <input value={description} onChange={(event) => setDescription(event.target.value)} placeholder="Например, пункт выдачи" maxLength={120} />
            </label>
            {error && <p className="directory-error">{error}</p>}
            <div className="directory-modal__actions">
              <button type="button" className="directory-btn directory-btn--ghost" onClick={() => setFormOpen(false)}>Отмена</button>
              <button type="button" className="directory-btn directory-btn--primary" onClick={saveProject}>Сохранить</button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
type LiveCategory = {
  id: string;
  name: string;
  system: boolean;
  active: boolean;
};

type CategoryTab = "expenses" | "income" | "taxes";

const initialLiveCategories: Record<CategoryTab, LiveCategory[]> = {
  expenses: [
    { id: "rent", name: "Аренда", system: true, active: true },
    { id: "utils", name: "Коммуналка", system: true, active: true },
    { id: "net", name: "Интернет", system: true, active: true },
  ],
  income: [
    { id: "sales", name: "Продажи", system: true, active: true },
    { id: "advance", name: "Авансы", system: true, active: true },
    { id: "other", name: "Прочие поступления", system: true, active: true },
  ],
  taxes: [
    { id: "usn6", name: "УСН 6%", system: true, active: true },
    { id: "usn15", name: "УСН 15%", system: true, active: true },
    { id: "ins", name: "Страховые взносы", system: true, active: true },
    { id: "ndfl", name: "НДФЛ", system: true, active: true },
    { id: "auto", name: "Транспортный налог", system: true, active: true },
  ],
};

function SettingsContent({ categories, setCategories, operations }: {
  categories: Record<CategoryTab, LiveCategory[]>;
  setCategories: Dispatch<SetStateAction<Record<CategoryTab, LiveCategory[]>>>;
  operations: Operation[];
}) {
  const [tab, setTab] = useState<CategoryTab>("expenses");
  const [draft, setDraft] = useState("");
  const [message, setMessage] = useState("");
  const [pendingRemoval, setPendingRemoval] = useState<{ category: LiveCategory; count: number } | null>(null);
  const list = categories[tab];
  const showMessage = (text: string) => {
    setMessage(text);
    window.setTimeout(() => setMessage(""), 3000);
  };

  const addCategory = () => {
    const clean = draft.trim();
    if (clean.length < 2) {
      showMessage("Введите название от 2 символов");
      return;
    }
    if (list.some((item) => item.name.toLowerCase() === clean.toLowerCase())) {
      showMessage("Такая категория уже есть");
      return;
    }
    setCategories((current) => ({ ...current, [tab]: [...current[tab], { id: "c-" + Date.now(), name: clean, system: false, active: true }] }));
    setDraft("");
    showMessage("Категория «" + clean + "» добавлена");
  };
  const toggleCategory = (id: string) => {
    setCategories((current) => ({ ...current, [tab]: current[tab].map((item) => (item.id === id ? { ...item, active: !item.active } : item)) }));
  };

  const removeCategory = (id: string) => {
    const target = list.find((item) => item.id === id);
    if (!target || target.system) return;
    const operationType: OperationType = tab === "expenses" ? "expense" : tab === "income" ? "income" : "tax";
    const count = operations.filter((operation) => operation.type === operationType && operation.category === target.name).length;
    if (count > 0) {
      setPendingRemoval({ category: target, count });
      return;
    }
    setCategories((current) => ({ ...current, [tab]: current[tab].filter((item) => item.id !== id) }));
    showMessage("Категория «" + target.name + "» удалена");
  };

  const confirmCategoryRemoval = () => {
    if (!pendingRemoval) return;
    const target = pendingRemoval.category;
    setCategories((current) => ({ ...current, [tab]: current[tab].filter((item) => item.id !== target.id) }));
    setPendingRemoval(null);
    showMessage("Категория «" + target.name + "» удалена");
  };

  return (
    <section className="section-page directory">
      <div className="section-page__intro directory__intro">
        <div>
          <h2>Живые справочники</h2>
          <p>Управляйте категориями доходов, расходов и налогов</p>
        </div>
      </div>
      <div className="directory-tabs" role="tablist" aria-label="Категории">
        <button type="button" role="tab" aria-selected={tab === "expenses"} className={tab === "expenses" ? "is-active" : ""} onClick={() => setTab("expenses")}>Расходы<i>{categories.expenses.length}</i></button>
        <button type="button" role="tab" aria-selected={tab === "income"} className={tab === "income" ? "is-active" : ""} onClick={() => setTab("income")}>Доходы<i>{categories.income.length}</i></button>
        <button type="button" role="tab" aria-selected={tab === "taxes"} className={tab === "taxes" ? "is-active" : ""} onClick={() => setTab("taxes")}>Налоги<i>{categories.taxes.length}</i></button>
      </div>
      <div className="directory-add">
        <input value={draft} onChange={(event) => setDraft(event.target.value)} placeholder="Название новой категории" aria-label="Название новой категории" maxLength={48} onKeyDown={(e) => { if (e.key === "Enter") addCategory(); }} />
        <button type="button" className="cabinet-primary" onClick={addCategory}>
          <CabinetIcon name="plus" />
          <span>Добавить</span>
        </button>
      </div>
      {message && (
        <div className="directory-toast" role="status">
          <CabinetIcon name="check" />
          <span>{message}</span>
        </div>
      )}
      <div className="category-list">
        {list.map((category) => (
          <div key={category.id} className={category.active ? "category-row" : "category-row category-row--hidden"}>
            <span className="category-row__text">
              <strong>{category.name}</strong>
              <small>{category.system ? "Системная категория" : "Пользовательская категория"}</small>
            </span>
            {category.system && (
              <span className="system-badge">
                <CabinetIcon name="lock" />
                Системная
              </span>
            )}
            <label className="switch">
              <input type="checkbox" checked={category.active} onChange={() => toggleCategory(category.id)} aria-label={`${category.name}: ${category.active ? "Активна" : "Скрыта"}`} />
              <span className="switch__track"><span className="switch__thumb" /></span>
              <em>{category.active ? "Активна" : "Скрыта"}</em>
            </label>
            {category.system ? (
              <span className="category-lock" aria-label="Системную категорию нельзя удалить">
                <CabinetIcon name="lock" />
              </span>
            ) : (
              <button type="button" className="category-delete" aria-label={"Удалить " + category.name} onClick={() => removeCategory(category.id)}>
                <CabinetIcon name="trash" />
                <span>Удалить</span>
              </button>
            )}
          </div>
        ))}
      </div>
      <div className="directory-hint">
        <CabinetIcon name="info" />
        <p>Системные категории можно скрывать тумблером, но нельзя удалять</p>
      </div>
      {pendingRemoval && (
        <div className="directory-modal" role="dialog" aria-modal="true" aria-labelledby="category-delete-title" onClick={() => setPendingRemoval(null)}>
          <div className="directory-modal__card" onClick={(event) => event.stopPropagation()}>
            <div className="directory-modal__head">
              <h3 id="category-delete-title">Удалить категорию?</h3>
              <button type="button" className="icon-button" aria-label="Закрыть" onClick={() => setPendingRemoval(null)}>
                <CabinetIcon name="x" />
              </button>
            </div>
            <p className="operation-delete-modal__message">
              Категория «{pendingRemoval.category.name}» используется в {pendingRemoval.count} {pendingRemoval.count === 1 ? "операции" : "операциях"}.
              При удалении связанные операции потеряют привязку. Вы уверены, что хотите продолжить?
            </p>
            <div className="directory-modal__actions">
              <button type="button" className="directory-btn directory-btn--ghost" onClick={() => setPendingRemoval(null)}>Отмена</button>
              <button type="button" className="directory-btn directory-btn--danger" onClick={confirmCategoryRemoval}>
                <CabinetIcon name="trash" />
                <span>Удалить</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

const STORAGE_KEYS = {
  operations: "finzentra_bolt_operations",
  projects: "finzentra_bolt_projects",
  categories: "finzentra_bolt_categories",
};

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null;

function isOperation(value: unknown): value is Operation {
  return isRecord(value)
    && typeof value.id === "string"
    && (value.type === "income" || value.type === "expense" || value.type === "tax")
    && typeof value.category === "string"
    && typeof value.project === "string"
    && typeof value.date === "string"
    && typeof value.periodDate === "string"
    && typeof value.comment === "string"
    && typeof value.amount === "number" && Number.isFinite(value.amount);
}

function isDirectoryProject(value: unknown): value is DirectoryProject {
  return isRecord(value)
    && typeof value.id === "string"
    && typeof value.name === "string"
    && typeof value.description === "string"
    && typeof value.archived === "boolean"
    && typeof value.operations === "number" && Number.isFinite(value.operations)
    && (value.color === undefined || typeof value.color === "string");
}

function isLiveCategory(value: unknown): value is LiveCategory {
  return isRecord(value)
    && typeof value.id === "string"
    && typeof value.name === "string"
    && typeof value.system === "boolean"
    && typeof value.active === "boolean";
}

const isOperationList = (value: unknown): value is Operation[] => Array.isArray(value) && value.every(isOperation);
const isProjectList = (value: unknown): value is DirectoryProject[] => Array.isArray(value) && value.every(isDirectoryProject);
const isLiveCategories = (value: unknown): value is Record<CategoryTab, LiveCategory[]> =>
  isRecord(value) && (["expenses", "income", "taxes"] as const).every((tab) => {
    const list = value[tab];
    return Array.isArray(list) && list.every(isLiveCategory);
  });

function AppDestination({ navigate }: { navigate: (screen: Screen) => void }) {
  const { user } = useAppUser();
  const userName = user.name;
  const [section, setSection] = useState<CabinetSection>("dashboard");
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editingOperation, setEditingOperation] = useState<Operation | null>(null);
  const [opNotice, setOpNotice] = useState("");
  const [pendingDeletion, setPendingDeletion] = useState<Operation | null>(null);
  const [deletingOperation, setDeletingOperation] = useState(false);
  const [operations, setOperations] = usePersistentState<Operation[]>(STORAGE_KEYS.operations, [], isOperationList);
  const [projects, setProjects] = usePersistentState<DirectoryProject[]>(STORAGE_KEYS.projects, [], isProjectList);
  const [liveCategories, setLiveCategories] = usePersistentState<Record<CategoryTab, LiveCategory[]>>(STORAGE_KEYS.categories, initialLiveCategories, isLiveCategories);
  const [selectedProjectNames, setSelectedProjectNames] = useState<string[]>([]);

  useEffect(() => {
    const available = new Set(projects.filter((project) => !project.archived).map((project) => project.name));
    setSelectedProjectNames((current) => {
      const next = current.filter((name) => available.has(name));
      return next.length === current.length ? current : next;
    });
  }, [projects]);
  const [periodType, setPeriodType] = useState<ReportingPeriodType>("month");
  const [selectedPeriod, setSelectedPeriod] = useState(() => currentPeriodKey("month"));
  const [openHeaderPopover, setOpenHeaderPopover] = useState<"notifications" | null>(null);
  const [helpOpen, setHelpOpen] = useState(false);
  const notificationsPopoverRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!openHeaderPopover && !helpOpen) return;
    const closeOnPointerDown = (event: PointerEvent) => {
      if (event.target instanceof Node
        && !notificationsPopoverRef.current?.contains(event.target)) {
        setOpenHeaderPopover(null);
      }
    };
    const closeOnEscape = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpenHeaderPopover(null);
        setHelpOpen(false);
      }
    };
    document.addEventListener("pointerdown", closeOnPointerDown);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOnPointerDown);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [openHeaderPopover, helpOpen]);

  const activeCategoryNames: Record<OperationType, string[]> = {
    expense: liveCategories.expenses.filter((c) => c.active).map((c) => c.name),
    income: liveCategories.income.filter((c) => c.active).map((c) => c.name),
    tax: liveCategories.taxes.filter((c) => c.active).map((c) => c.name),
  };

  const sectionTitles: Record<CabinetSection, [string, string]> = {
    dashboard: [`Добрый день, ${userName}`, "Вот что происходит с финансами вашего бизнеса"],
    operations: ["Операции", "Контролируйте каждое движение денег"],
    projects: ["Проекты", "Финансы бизнеса по направлениям"],
    settings: ["Настройки", "Справочники и параметры учёта"],
  };

  const createProject = (name: string, description: string): DirectoryProject => {
    const newProject: DirectoryProject = {
      id: "p-" + Date.now(),
      name,
      description: description || "Новый проект",
      archived: false,
      operations: 0,
      color: projectColors[projects.length % projectColors.length],
    };
    setProjects((current) => [...current, newProject]);
    return newProject;
  };

  const openNewOperation = () => {
    setEditingOperation(null);
    setDrawerOpen(true);
  };

  const openEditOperation = (operation: Operation) => {
    setEditingOperation(operation);
    setDrawerOpen(true);
  };

  const confirmOperationDeletion = async () => {
    if (!pendingDeletion || deletingOperation) return;
    setDeletingOperation(true);
    try {
      const deleted = pendingDeletion;
      setOperations((current) => current.filter((operation) => operation.id !== deleted.id));
      setProjects((current) => current.map((project) => project.name === deleted.project
        ? { ...project, operations: Math.max(0, project.operations - 1) }
        : project));
      setPendingDeletion(null);
      setOpNotice("Операция удалена");
    } catch {
      setOpNotice("Не удалось удалить операцию");
    } finally {
      setDeletingOperation(false);
      window.setTimeout(() => setOpNotice(""), 3200);
    }
  };

  return (
    <div className="cabinet">
      <aside className="cabinet-sidebar">
        <div className="cabinet-sidebar__logo"><Logo onClick={() => setSection("dashboard")} /></div>
        <nav className="cabinet-nav" aria-label="Разделы кабинета">
          <p>Рабочее пространство</p>
          {cabinetNavigation.map((item) => (
            <button key={item.id} className={section === item.id ? "is-active" : ""} onClick={() => setSection(item.id)}>
              <CabinetIcon name={item.id} /><span>{item.label}</span>
            </button>
          ))}
        </nav>
        <button type="button" className="sidebar-help" onClick={() => setHelpOpen(true)} aria-haspopup="dialog">
          <span>?</span><div><strong>Нужна помощь?</strong><p>Справка по сервису</p></div><CabinetIcon name="chevron" />
        </button>
        <button className="user-profile" onClick={() => navigate("home")}>
          <span className="user-profile__avatar">{userName.charAt(0).toUpperCase()}</span><span><strong>{userName}</strong></span><CabinetIcon name="more" />
        </button>
      </aside>

      <main className="cabinet-main">
        <header className="cabinet-header">
          <div><p>{sectionTitles[section][1]}</p><h1>{sectionTitles[section][0]}</h1></div>
          <div className="cabinet-header__actions">
            <div className="header-popover-anchor" ref={notificationsPopoverRef}>
              <button
                type="button"
                className="notification-button"
                aria-label="Уведомления"
                aria-haspopup="dialog"
                aria-expanded={openHeaderPopover === "notifications"}
                onClick={() => setOpenHeaderPopover((current) => current === "notifications" ? null : "notifications")}
              >
                <CabinetIcon name="bell" />
              </button>
              {openHeaderPopover === "notifications" && (
                <div className="header-popover notifications-popover" role="dialog" aria-label="Уведомления">
                  <strong>Уведомления</strong>
                  <p role="status">Новых уведомлений нет</p>
                </div>
              )}
            </div>
            <button className="cabinet-primary" onClick={openNewOperation}><CabinetIcon name="plus" /><span>Добавить операцию</span></button>
          </div>
        </header>
        <div className="cabinet-content">
          {section === "dashboard" && <DashboardContent projects={projects} operations={operations} periodType={periodType} selectedPeriod={selectedPeriod} onPeriodChange={(nextType, nextPeriod) => { setPeriodType(nextType); setSelectedPeriod(nextPeriod); }} selectedProjects={selectedProjectNames} onSelectedProjectsChange={setSelectedProjectNames} />}
          {section === "operations" && <OperationsContent operations={operations} projects={projects} onAdd={openNewOperation} onDelete={setPendingDeletion} onEdit={openEditOperation} periodType={periodType} selectedPeriod={selectedPeriod} />}
          {section === "projects" && <ProjectsContent projects={projects} setProjects={setProjects} onProjectRenamed={(previousName, nextName) => {
            setOperations((current) => current.map((operation) => operation.project === previousName ? { ...operation, project: nextName } : operation));
            setSelectedProjectNames((current) => current.map((name) => name === previousName ? nextName : name));
          }} />}
          {section === "settings" && <SettingsContent categories={liveCategories} setCategories={setLiveCategories} operations={operations} />}
          {opNotice && (
            <div className={`directory-toast ${opNotice === "Не удалось удалить операцию" ? "directory-toast--error" : ""}`} role="status"><CabinetIcon name={opNotice === "Не удалось удалить операцию" ? "info" : "check"} /><span>{opNotice}</span></div>
          )}
        </div>
        {pendingDeletion && (
          <div className="directory-modal operation-delete-modal" role="dialog" aria-modal="true" aria-labelledby="operation-delete-title" onClick={() => { if (!deletingOperation) setPendingDeletion(null); }}>
            <div className="directory-modal__card" onClick={(event) => event.stopPropagation()}>
              <div className="directory-modal__head">
                <h3 id="operation-delete-title">Вы уверены?</h3>
                <button type="button" className="icon-button" aria-label="Закрыть" disabled={deletingOperation} onClick={() => setPendingDeletion(null)}>
                  <CabinetIcon name="x" />
                </button>
              </div>
              <p className="operation-delete-modal__message">Операция «{pendingDeletion.comment}» будет удалена.</p>
              <div className="directory-modal__actions">
                <button type="button" className="directory-btn directory-btn--ghost" disabled={deletingOperation} onClick={() => setPendingDeletion(null)}>Отмена</button>
                <button type="button" className="directory-btn directory-btn--danger" disabled={deletingOperation} onClick={confirmOperationDeletion}>
                  <CabinetIcon name="trash" />
                  <span>{deletingOperation ? "Удаление..." : "Удалить"}</span>
                </button>
              </div>
            </div>
          </div>
        )}
        {drawerOpen && (
          <OperationDrawer
            key={editingOperation?.id ?? "new-operation"}
            operation={editingOperation}
            projects={projects}
            categories={activeCategoryNames}
            onClose={() => setDrawerOpen(false)}
            onSaved={(op) => {
              if (editingOperation) {
                setOperations((current) => current.map((operation) => operation.id === op.id ? op : operation));
                setProjects((current) => current.map((project) => {
                  if (project.name === editingOperation.project && project.name !== op.project) {
                    return { ...project, operations: Math.max(0, project.operations - 1) };
                  }
                  if (project.name === op.project && project.name !== editingOperation.project) {
                    return { ...project, operations: project.operations + 1 };
                  }
                  return project;
                }));
                setOpNotice(`Операция «${op.comment}» обновлена`);
              } else {
                setOperations((current) => [...current, op]);
                setProjects((current) => current.map((project) => project.name === op.project ? { ...project, operations: project.operations + 1 } : project));
                setOpNotice(`Операция «${op.comment}» добавлена`);
              }
              setDrawerOpen(false);
              window.setTimeout(() => setOpNotice(""), 3200);
            }}
            onCreateProject={createProject}
          />
        )}
      </main>
      {helpOpen && (
        <div className="directory-modal help-modal" role="dialog" aria-modal="true" aria-labelledby="help-modal-title" onClick={() => setHelpOpen(false)}>
          <div className="directory-modal__card help-modal__card" onClick={(event) => event.stopPropagation()}>
            <div className="directory-modal__head">
              <h3 id="help-modal-title">Как работать с отчётом</h3>
              <button type="button" className="icon-button" aria-label="Закрыть справку" onClick={() => setHelpOpen(false)}><CabinetIcon name="x" /></button>
            </div>
            <div className="help-modal__content">
              <section><strong>Дата факта и дата периода</strong><p>Дата факта — день, когда деньги поступили или были списаны. Дата периода — период, к которому относится доход или расход. Например, оплата в апреле за мартовскую работу отражается в апреле по дате факта и в марте по дате периода.</p></section>
              <section><strong>Кассовый метод</strong><p>Учитывает операции по дате фактического поступления или списания денег.</p></section>
              <section><strong>Метод начисления</strong><p>Учитывает доходы и расходы в периоде, к которому они относятся, независимо от даты оплаты.</p></section>
            </div>
          </div>
        </div>
      )}

      <nav className="bottom-nav" aria-label="Разделы кабинета">
        {cabinetNavigation.map((item) => (
          <button key={item.id} className={section === item.id ? "is-active" : ""} onClick={() => setSection(item.id)}>
            <CabinetIcon name={item.id} /><span>{item.label}</span>
          </button>
        ))}
      </nav>
      <button className="mobile-add" aria-label="Добавить операцию" onClick={openNewOperation}><CabinetIcon name="plus" /></button>
    </div>
  );
}

export default function App() {
  const [screen, setScreen] = useState<Screen>("app");
  const [user, setUser] = useState<AppUser>({ name: "Гость" });
  const navigate = (next: Screen) => {
    setScreen(next);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };
  return (
    <AppUserContext.Provider value={{ user, setUser }}>
      {screen === "register" && <Registration navigate={navigate} />}
      {screen === "login" && <Login navigate={navigate} />}
      {screen === "recover" && <Recovery navigate={navigate} />}
      {screen === "new-password" && <NewPassword navigate={navigate} />}
      {screen === "app" && <AppDestination navigate={navigate} />}
      {screen === "home" && <Home navigate={navigate} />}
    </AppUserContext.Provider>
  );
}
