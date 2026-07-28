<div align="center">

<img src="public/waferlogo.png" alt="CareFlow Logo" width="80" />

# CareFlow — Hospital Management System

**A modern, full-stack patient onboarding and clinic management platform built for real-world hospital workflows.**

[![Next.js](https://img.shields.io/badge/Next.js-16-black?style=flat-square&logo=next.js)](https://nextjs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5-blue?style=flat-square&logo=typescript)](https://www.typescriptlang.org/)
[![Prisma](https://img.shields.io/badge/Prisma-7-2D3748?style=flat-square&logo=prisma)](https://prisma.io/)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-Neon-4169E1?style=flat-square&logo=postgresql)](https://neon.tech/)
[![License](https://img.shields.io/badge/License-MIT-green?style=flat-square)](LICENSE)

</div>

---

## Overview

CareFlow streamlines end-to-end patient management — from first-time walk-in registration to consultation completion. It supports three distinct roles (**Admin / Doctor / Patient**), a live queue system with real-time updates, appointment scheduling, and voice-powered clinical notes — all in a clean, responsive interface.

---

## ✨ Features

### 👥 Three-Role System

| Role | Capabilities |
|------|-------------|
| **Admin** | Register walk-in patients, manage the live queue, cancel visits, oversee doctors & patients |
| **Doctor** | View and manage their queue, conduct consultations with mandatory notes & prescription, voice dictation |
| **Patient** | Self-register, complete health profile, join the walk-in queue, book future appointments, view history |

---

### 🏥 Patient Onboarding

- **Self-Registration** → guided **Health Profile Setup** (Step 2 of 2) before accessing the patient portal
- **Walk-In Registration** by admin/reception — no login account required; patient record is created independently
- **Aadhaar Duplicate Detection** — stored as a SHA-256 hash (never in plain text); prevents multiple records under the same Aadhaar
- **Returning Patient Lookup** — search by PRN or Aadhaar to re-queue an existing patient instantly
- Walk-in patients skip health setup (marked complete automatically)

### 📋 Queue Management

- Tokens auto-assigned (`A001`, `A002`, …) and doctors auto-assigned on queue entry
- **Live Queue** visible to admin with patient name, PRN, token, doctor, status, and position
- Admin can **cancel any visit** with an optional reason via a modal; the doctor's slot is freed immediately
- Doctor calls next patient with one click; status flows: `WAITING → ASSIGNED → IN_CONSULTATION → COMPLETED`

### 📅 Appointment Booking

- Patients book **future-date appointments** from their dashboard (past dates rejected)
- Appointments activate automatically on the day — converted to `WAITING` when the patient's dashboard loads
- Upcoming appointments shown in a dedicated **Appointments tab** with visit ID, date, and status badge

### 🩺 Doctor Consultation

- Mandatory **Health Notes** and **Prescription** before completing a consultation (validated on both client and server)
- **🎤 Voice Dictation** powered by the Web Speech API:
  - Real-time transcript as you speak
  - 🎤 Dictate → ■ Stop toggle per field
  - ✕ Clear button to reset
  - Output is fully editable after stopping
- **Patient History** modal — view all past consultations for the current patient with one click

### ⚡ Real-Time Updates (SSE)

Server-Sent Events keep all three portals in sync without page refreshes:

- Admin sees queue changes the moment a patient joins or is called
- Doctor's queue updates when a patient is added or a visit is cancelled
- Patient receives a notification when their token is called

### 🔒 Security

- JWT-based authentication with role enforcement in middleware
- Route protection: `/admin`, `/doctor`, `/patient`, `/walk-in`, `/health-setup` — each gated by role
- Aadhaar numbers hashed with SHA-256 before storage (UIDAI compliance)
- Passwords hashed with bcrypt

### 🕐 IST Timezone Support

All date queries use Indian Standard Time (UTC+5:30) so today's queue and visits are always correct regardless of server timezone.

---

## 🛠️ Tech Stack

| Layer | Technology |
|-------|-----------|
| **Framework** | Next.js 16 (App Router, Turbopack) |
| **Language** | TypeScript 5 |
| **Database** | PostgreSQL via [Neon](https://neon.tech/) |
| **ORM** | Prisma 7 with `@prisma/adapter-pg` |
| **Auth** | JWT (`jose`) + bcrypt |
| **Real-time** | Server-Sent Events (Node.js EventEmitter) |
| **Voice** | Web Speech API (browser-native, Chrome/Edge) |
| **Styling** | Inline React styles (no CSS framework dependency) |
| **Toasts** | `react-hot-toast` |

---

## 🗂️ Project Structure

```
src/
├── app/
│   ├── admin/                  # Admin dashboard, patients, doctors pages
│   ├── doctor/                 # Doctor dashboard with queue & consultation
│   ├── patient/                # Patient portal with tabs & appointment booking
│   ├── walk-in/                # Walk-in registration & returning patient lookup
│   ├── health-setup/           # Post-registration health profile setup
│   ├── login/ & register/      # Auth pages
│   └── api/
│       ├── admin/              # Stats, patient/doctor CRUD, visit cancellation
│       ├── doctor/             # Dashboard, consultation, availability, next-patient
│       ├── patient/            # Dashboard, join-queue, appointments, health-setup
│       ├── auth/               # Login, register, logout
│       ├── sse/                # Server-Sent Events stream
│       ├── visits/             # Visit creation
│       ├── queue/              # Queue listing
│       └── walk-in/            # Aadhaar/PRN lookup
├── components/
│   └── admin/AdminHeader.tsx   # Shared tab navigation for admin pages
├── lib/
│   ├── auth.ts                 # JWT helpers
│   ├── prisma.ts               # Prisma client singleton
│   ├── queue.ts                # Token & PRN generation
│   ├── counters.ts             # Daily counters
│   ├── sse.ts                  # EventEmitter singleton for SSE
│   └── timezone.ts             # IST date helpers
└── proxy.ts                    # Auth middleware logic
prisma/
├── schema.prisma               # Data model
└── seed.ts                     # Development seed data
```

---

## 🚀 Getting Started

### Prerequisites

- Node.js 18+
- A [Neon](https://neon.tech/) PostgreSQL database (or any PostgreSQL instance)

### Installation

```bash
# 1. Clone the repository
git clone https://github.com/shivangi-wafer19/Patient-registration.git
cd Patient-registration

# 2. Install dependencies
npm install

# 3. Set up environment variables
cp .env.example .env
# Edit .env — add your DATABASE_URL and JWT_SECRET

# 4. Push schema to database
npx prisma db push

# 5. (Optional) Seed with sample data
npx prisma db seed

# 6. Start the development server
npm run dev
```

Open [http://localhost:3000](http://localhost:3000)

### Environment Variables

```env
DATABASE_URL="postgresql://..."
JWT_SECRET="your-secret-key"
```

---

## 👤 Default Seed Accounts

| Role | Email | Password |
|------|-------|----------|
| Admin | `sys.admin@hospital.com` | `admin123` |
| Doctor | `dr.patel@hospital.com` | `doctor123` |
| Doctor | `dr.sarah@hospital.com` | `doctor123` |
| Patient | `john.smith@gmail.com` | `patient123` |

> ⚠️ Change all default credentials before any production deployment.

---

## 📊 Data Model (Key Entities)

```
User ──── Patient   (userId nullable — walk-in patients have no User account)
               └── aadhaarHash        (SHA-256, unique)
               └── healthSetupComplete (Boolean)
               └── healthIssues        (free text summary)

Doctor ──── User
               └── availability  (AVAILABLE / ENGAGED / OFFLINE)
               └── specialization, licenseNumber

Visit ──── Patient + Doctor
               └── token         (A001, A002 …)
               └── visitId       (VIS-YYYYMMDD-XXXXX)
               └── status        (WAITING → ASSIGNED → IN_CONSULTATION → COMPLETED)
               └── appointmentDate (for future bookings)

ConsultationHistory ──── Visit
               └── healthNotes, prescription
               └── consultationStart / End / duration
```

---

## 🔄 Key User Flows

```
Self-Registration
  /register → /health-setup (Step 2 of 2) → /patient dashboard

Walk-In — New Patient
  Admin: Walk-In → Onboard New Patient → fill form → Register & Add to Queue → token issued

Walk-In — Returning Patient
  Admin: Walk-In → Returning Patient → search PRN or Aadhaar → confirm → Add to Queue

Consultation
  Doctor: Call Next Patient → fill Health Notes + Prescription → Complete & Next Patient →

Appointment
  Patient: Appointments tab → Book → select future date → SCHEDULED
  On appointment day: dashboard load activates it → WAITING → joins queue
```

---

## 🎤 Voice Dictation

The doctor consultation page uses the browser's native **Web Speech API** (Chrome / Edge) for hands-free clinical note entry:

1. Click **🎤 Dictate** next to Health Notes or Prescription
2. Speak — transcript appears in the field in real time
3. Click **■ Stop** when done
4. Edit the text freely before saving

Starting dictation on one field automatically stops the other. Use **✕ Clear** to reset a field at any time.

---

## 📄 License

MIT © [Wafer Technologies](https://wafertech.in)

---

<div align="center">
  Built with ❤️ by the Wafer Technologies team
</div>
