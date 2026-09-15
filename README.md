# MyMemoryPics 📸⚡

> **World-class, AI-powered autonomous photo management and smart triage platform.**
> Built with FastAPI, Next.js, Tailwind CSS, SQLite, and 100% containerized with Docker Compose.

---

## 🌟 Key Features

1. **Smart Triage & Clutter Sweep ("Inbox Zero" for Photos)**:
   - **Ephemeral Screenshots**: Automatically flagged with a 30-day countdown timer. 1-click snooze for another month or sweep to trash.
   - **Documents & Bills Vault**: Invoices, receipts, and paper documents are separated from family memories.
   - **Burst / Duplicate Detection**: Identifies near-duplicate photos using perceptual hashing (`pHash`) to keep only the best shot.
   - **Blurry Shot Detection**: Automated sharpness scoring (Laplacian variance) to clean accidental camera rolls.
2. **Infinite Timeline (Google Photos Style)**:
   - Grouped chronologically by day, month, and year.
   - Multi-tier WebP thumbnailing (256px ultra-fast grid thumbnails + 1080px modal lightbox previews).
3. **People & Face Recognition**:
   - Face detection and clustering into person profiles with custom name tagging and merging.
4. **Dual Sync Engine**:
   - **Local Storage**: Mounts any host folder or NAS into `/data/originals`.
   - **Google Drive & Photos**: Seamless OAuth 2.0 integration for incremental cloud backups and downloads.
5. **Zero Host Pollution**:
   - 100% Docker-based container stack.

---

## 🚀 Quick Start with Docker Compose

### 1. Configure Environment
```bash
cp .env.example .env
```

*(Optional: Fill in `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` in `.env` if you wish to connect Google Drive).*

### 2. Start the Stack
```bash
docker compose up --build -d
```

### 3. Access Services
- **Web Application**: [http://localhost:3000](http://localhost:3000)
- **Interactive API Documentation (Swagger)**: [http://localhost:8000/docs](http://localhost:8000/docs)
- **Backend Health Check**: [http://localhost:8000/api/v1/health](http://localhost:8000/api/v1/health)

---

## 📁 Directory Structure & Storage Volumes

```
mymemorypics/
├── docker-compose.yml          # Container orchestration
├── project.md                  # Master roadmap and progress tracker
├── .env.example                # Sample environment variables
├── data/                       # Persistent volume storage
│   ├── originals/              # Place photos here or mount host library
│   ├── thumbnails/             # High-performance WebP cache
│   └── db/                     # SQLite database with WAL mode
├── backend/                    # FastAPI, Image processing & AI engine
│   ├── Dockerfile
│   ├── requirements.txt
│   └── app/
└── frontend/                   # Next.js 14, Tailwind CSS, Lucide UI
    ├── Dockerfile
    ├── package.json
    └── app/
```

---

## 🔄 Adding Photos

1. **Via UI**: Click **"Upload Photo"** on the top navigation bar.
2. **Via Local Folder**: Drop photos directly into `./data/originals`, then open the **"Sync & Sources"** tab and click **"Scan Local Library Now"**.
3. **Via Google Drive**: Connect your Google Account from the **"Sync & Sources"** tab to import cloud photos.
