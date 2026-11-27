# Frontend ↔ Backend integration

The frontend is connected to the FastAPI backend. Financial records are not stored in a shared browser `localStorage` bucket.

## Data flow

- After login/registration, the JWT is saved as `token` in localStorage.
- `src/api/client.ts` adds `Authorization: Bearer <token>` to API requests.
- `App.tsx` loads projects, categories and transactions from the API when the authenticated cabinet opens.
- Creating/updating/deleting a project calls `/api/projects`.
- Creating/updating/deleting an operation calls `/api/transactions`.
- The backend derives the owner from the JWT and filters all finance queries by that user.
- When a statement import is confirmed, the import endpoint writes reportable transactions to `transactions`; the frontend reloads the ledger from the API rather than posting those rows a second time.

## Frontend environment

Create `frontend/.env` from `.env.example`:

```env
VITE_API_URL=http://localhost:8000
VITE_USE_IMPORT_API=true
```

`VITE_USE_IMPORT_API=true` is required for server-side statement staging and confirmation.

## Important

The old browser-only data keys are no longer used for projects and operations. Old values in a browser's localStorage are not automatically imported into PostgreSQL because their ownership cannot be reliably established. New records are written to the authenticated user's database rows.
