🛠️ Требования
Python 3.10+
PostgreSQL 

Быстрый старт
1. Установка зависимостей
Создай виртуальное окружение и установи пакеты:
```
python -m venv venv
source venv/bin/activate  # Linux/Mac
# venv\Scripts\activate   # Windows
pip install -r requirements.tx
```
2. Настройка переменных окружения
Создай файл .env в корне проекта (рядом с requirements.txt) и заполни его:
```
# Подключение к PostgreSQL
DB_USER=postgres
DB_PASSWORD=mysecretpassword
DB_HOST=localhost
DB_PORT=5432
DB_NAME=postgres

# Строка подключения для Alembic/FastAPI (синхронный драйвер для миграций)
DATABASE_URL=postgresql+psycopg2://postgres:mysecretpassword@localhost:5432/postgres
```

(вместо mysecretpassword вставить пароль от вашей бд)

3. Применение миграций
Перейди в папку с конфигурацией Alembic и примени изменения:
```
cd database
alembic upgrade head
```

📂 Структура проекта
app/models.py — SQLAlchemy модели (описание таблиц).
database/alembic/ — конфигурация и скрипты миграций.
database/alembic.ini — настройки Alembic.
.env — секреты и конфиги (не в Git!).
