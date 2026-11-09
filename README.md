# NearExpiry

NearExpiry is an inventory and product expiry-date management application for supermarket and grocery store owners.

## Deployment

For full production deployment instructions using **Vercel** (Frontend), **Render** (Backend), and **MongoDB Atlas** (Database), see [`DEPLOYMENT.md`](./DEPLOYMENT.md).

## Tech Stack
- **Frontend:** React.js, Vite, Tailwind CSS, React Router, Axios, Recharts, Lucide React
- **Backend:** Node.js (>=18), Express.js, Mongoose, Helmet, JWT, bcryptjs, Zod, Resend
- **Database:** MongoDB (Local or MongoDB Atlas)

## Project Structure
```
NearExpiry/
  client/       # React + Vite frontend
  server/       # Node.js + Express backend
  .gitignore
  README.md
```

## 👥 Contributors

This project was developed collaboratively by:

| Name | Role | GitHub |
|---|---|---|
| Shubham Kumar | Project Developer | [Shubham](https://github.com/TheShubhamCodes) |
| Ganguly Kumar | Project Contributor | [Ganguly Kumar](https://github.com/Gangulikumar) |
| Rajat Kumar | Project Contributor | [Rajat](https://github.com/vu241fa04d29-rajat) |

Special thanks to all contributors for their valuable efforts, ideas, collaboration, and support in building NearExpiry.


## Getting Started

### 1. Prerequisites
- Node.js (v18+)
- MongoDB running locally or a MongoDB Atlas connection string

### 2. Backend Setup
```bash
cd server
npm install
cp .env.example .env
npm run dev
```

### 3. Frontend Setup
```bash
cd client
npm install
cp .env.example .env
npm run dev
```

