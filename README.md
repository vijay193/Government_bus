<!-- PROJECT TITLE -->
<h1 align="center">🚌 Government Bus Booking System</h1>

<p align="center">
  <img src="https://img.shields.io/badge/Frontend-React%20%2B%20TypeScript-61DAFB?style=flat-square&logo=react" />
  <img src="https://img.shields.io/badge/Backend-Node.js%20%2B%20Express-43853D?style=flat-square&logo=node.js" />
  <img src="https://img.shields.io/badge/Database-MySQL-4479A1?style=flat-square&logo=mysql" />
  <img src="https://img.shields.io/badge/Styling-TailwindCSS-38B2AC?style=flat-square&logo=tailwind-css" />
  <img src="https://img.shields.io/badge/License-MIT-yellow?style=flat-square" />
</p>

---

## ✨ Features  

| 👤 User Features | 📊 Admin Features |
|------------------|------------------|
| 🔑 Login via Password & OTP | 📈 Revenue analytics dashboard |
| 🚌 Browse bus schedules | 🕒 Bus schedule management |
| 💺 Seat booking & fare calc | 🧾 Pass card management |
| 🆓 Free ticket eligibility | 🚌 District-wise routes |
| 🎟️ Child & Senior discounts | ✅ Booking cancellation rules |

---

## 🛠 Tech Stack  

**Frontend** 🎨  
- ⚛️ React + TypeScript  
- ⚡ Vite bundler  
- 🎨 TailwindCSS  

**Backend** ⚙️  
- 🌐 Node.js + Express  
- 🗄️ MySQL  
- 🆔 UUID for unique IDs  
- 🔐 dotenv for configuration  
- 🔄 CORS for API access  

---

## 📂 Project Structure
📦 bus-booking-system 

┣ 📂 backend        ← Node.js + Express APIs ┃

┣ 📂 routes ┃

┣ 📂 models ┃ ┗ 📂 controllers

┣ 📂 frontend       ← React + TypeScript app ┃

┣ 📂 components ┃ 

┣ 📂 pages ┃ ┗ 📂 utils 

┣ 📜 README.md      ← Documentation 

┣ 📜 package.json   ← Dependencies 

📜 .env.example   ← Environment config

---

## 🛣 Workflow Overview  

```text
[ User ]
   ⬇️
[ Frontend UI (React + TS) ]
   ⬇️
[ Backend API (Express) ]
   ⬇️
[ Mybus-booking-system
```
## ⚡ Quick Start
```text
# Clone the repo
git clone "repo Url"

# Install dependencies
cd backend && npm install
cd frontend && npm install

# Run backend
npm run dev

# Run frontend
npm run dev
