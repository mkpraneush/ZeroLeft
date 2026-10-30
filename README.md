<<<<<<< HEAD
# ZeroLeft - Surplus Produce Marketplace

ZeroLeft connects local vendors selling surplus produce with nearby customers at discount prices to prevent food waste.

---

## Quick Start (Run Everything Together)

### Option 1: One-Click Launcher (Windows)
Double-click or run:
```cmd
start-all.bat
```
This script automatically checks and starts:
1. **MongoDB** on `localhost:27017`
2. **FastAPI Backend** on `http://localhost:8000`
3. **Vite React Frontend** on `http://localhost:5173`
4. Automatically opens `http://localhost:5173` in your default browser.

---

### Option 2: Using NPM
From the project root:
```bash
# Starts both Backend and Frontend concurrently
npm start
```
*(or `npm run dev:all`)*

---

## Running Services Individually

### 1. Backend & Database
```bash
# Option A: Start MongoDB and backend via batch script
start-backend.bat

# Option B: Start FastAPI via npm script
npm run backend
```
- API Root: [http://localhost:8000](http://localhost:8000)
- Interactive Swagger Docs: [http://localhost:8000/docs](http://localhost:8000/docs)
- Health Check: [http://localhost:8000/health](http://localhost:8000/health)

### 2. Frontend
```bash
npm run dev
```
- Web Application: [http://localhost:5173](http://localhost:5173)

---

## Architecture & Configuration

- **Frontend**: React 19 + TypeScript + Vite + Zustand + TanStack Query + Leaflet
- **Backend**: FastAPI + Motor (Async MongoDB) + Pydantic v2 + Jose (JWT)
- **Database**: MongoDB (Local `mongodb://localhost:27017/zeroleft`)

### Environment Files:
- Root `.env`:
  ```env
  VITE_API_URL=http://localhost:8000
  ```
- Backend `.env` (`backend/.env`):
  ```env
  MONGODB_URL=mongodb://localhost:27017
  MONGODB_DB_NAME=zeroleft
  FRONTEND_URL=http://localhost:5173
  BACKEND_URL=http://localhost:8000
  ENVIRONMENT=development
  ```
- **Vite Proxy**: Configured in `vite.config.ts` to forward `/auth`, `/customer`, `/vendor`, `/products`, `/reservations`, `/media`, `/health`, and `/ws` to `http://127.0.0.1:8000`.

=======
# ZeroLeft
Smart Web-Based Surplus-Selling System for Street Vendors
>>>>>>> 9484c46185f1eaa051d97464211d614219d359d7
