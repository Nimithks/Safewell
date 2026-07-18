# SafeWell Backend (FastAPI)

Run the API locally from the project root (`proj`):

```bash
python -m pip install -r backend/requirements.txt
python -m uvicorn backend.app.main:app --reload --port 8001
```

If you are using npm from the project root, you can also run:

```bash
npm run dev:api
```

The API endpoints mirror the previous Next.js routes:

- `GET /api/profiles` — list profiles
- `POST /api/profiles` — create profile
- `GET /api/profiles/{id}` — get profile
- `PUT /api/profiles/{id}` — update profile
- `DELETE /api/profiles/{id}` — delete profile
- `GET /api/library` — list curated recommendations
