# SafeWell — Weight & Trajectory Safety Web Platform

SafeWell is a full-stack health web application designed to compute personalized metabolic profiles using the Mifflin-St Jeor equation and track weight progression within evidence-based physiological safety boundaries.

## 🚀 Key Features

- **Metabolic Profile Calculation**: BMR (Basal Metabolic Rate), TDEE (Total Daily Energy Expenditure), and macronutrient recommendations (Protein, Carbs, Fats) tailored by age, gender, height, weight, and target trajectory.
- **Safety Trajectory & Rate Capping**: Automatic rate limiting on weight gain/loss targets (max 1.0% body weight/week for loss, 0.5 kg/week for gain) to ensure health safety.
- **Interactive Check-In Tracking**: Log historical weigh-ins, monitor progress against calculated reference targets, and visualize trajectory boundaries.
- **Data Privacy & Encryption**: Password hashing using PBKDF2 with SHA-256 and client data protection using AES (Fernet) field encryption.
- **CSV Data Export**: Export comprehensive check-in logs and metabolic summaries for reporting.
- **Dockerized Architecture**: Standardized containerization for streamlined local development and production deployment.

---

## 🛠️ Technology Stack

- **Frontend**: React + Vite, Tailwind CSS, Lucide Icons, Recharts / HTML5 Canvas.
- **Backend**: FastAPI (Python 3.11+), SQLite (WAL mode), Pydantic v2, `cryptography` (Fernet AES).
- **Authentication**: Token-based bearer authentication with PBKDF2 password security.
- **Containerization**: Docker & Docker Compose.

---

## 📁 Repository Structure

```text
.
├── backend/
│   ├── app/
│   │   ├── engine.py          # Mifflin-St Jeor & Metabolic Engine logic
│   │   └── main.py            # FastAPI endpoints, Auth, & SQLite CRUD
│   ├── data/                  # SQLite Database storage
│   ├── tests/                 # Backend test suite
│   └── requirements.txt       # Python dependencies
├── frontend/
│   ├── src/                   # React components & UI logic
│   ├── package.json           # React & Vite configuration
│   └── vite.config.js
├── Dockerfile                 # Docker configuration
├── .gitignore                 # Environment & build ignores
└── README.md
```

---

## ⚡ Quick Start

### Running with Docker

```bash
docker build -t safewell .
docker run -p 8000:8000 safewell
```
Access the application at `http://localhost:8000`.

### Local Manual Development

#### Backend Setup:
```bash
cd backend
python -m venv .venv
# On Windows PowerShell: .venv\Scripts\Activate.ps1
# On Linux/macOS: source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```

#### Frontend Setup:
```bash
cd frontend
npm install
npm run dev
```
Access the frontend at `http://localhost:5173`.

---

## 📄 License

MIT License. See `LICENSE` for details.
