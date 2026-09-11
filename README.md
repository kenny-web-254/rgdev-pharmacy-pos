# PharmaPOS - Modern Pharmacy Point of Sale & Inventory System

An offline-first, production-ready Progressive Web Application (PWA) designed for retail pharmacies, clinics, and medical dispensaries. Built with React 19, Vite 6, Tailwind CSS v4, and optional Supabase cloud synchronization.

---

## 🌟 Key Features

### 1. Point of Sale (POS) Checkout Terminal
- **Fast Barcode Scanning & Item Lookup**: Instant barcode entry, category filters, and live search across medications and generic names.
- **Cart Management**: Real-time quantity adjustments, stock availability enforcement, and discount options.
- **Tender & Payment Processing**: Multi-payment support including Cash, M-Pesa / Mobile Money, Debit/Credit Cards, and Insurance Billing.
- **Change Calculation**: Automatic change tender calculation to minimize cashier calculation errors.
- **Persistent Cart**: Active checkout state is preserved in local storage across browser refreshes.

### 2. Barcode & Prescription Scanner
- **Camera-Based & Manual Scanning**: Integrated camera scanner modal with audio beep feedback (`playScanSuccessBeep`).
- **Prescription Barcode Verification**: Direct detection of Rx barcodes that auto-loads prescribed medications and patient details straight into checkout.

### 3. Prescriptions Management
- Track doctor information, patient details, dosage directions, and refills remaining.
- Status management (`Pending`, `Dispensed`, `Completed`).
- Direct prescription dispensation linking medication stock deduction to the patient record.

### 4. Inventory & Stock Control
- **Stock Tracking**: Live inventory counts, minimum threshold indicators, and automated low-stock warnings.
- **Batch & Expiry Monitoring**: Batch numbers, expiration dates, manufacturer records, and refrigeration flags.
- **Admin Inventory Controls**: Restricted editing, price adjustments, cost tracking, and stock deletion (protected by role authorization).

### 5. Offline-First Resilience & Sync
- **Seamless Offline Operation**: Continues processing sales transactions even when internet connectivity drops.
- **Offline Transaction Queue**: Queues offline sales locally and automatically synchronizes them when connectivity is re-established.
- **Simulated Offline Mode**: Built-in toggle to test offline resilience directly in the UI.

### 6. Thermal Receipt Printing & Customization
- **Clean Receipt Modal**: Printable 80mm thermal receipt layout with printable CSS styles (`@media print`).
- **Store Customization**: Configurable pharmacy header, address, phone, KRA/Tax PIN, VAT percentages, and receipt footers.
- **Standardized Currency**: Pre-configured formatting in Kenyan Shilling (`KSh`) or customizable denominations.

### 7. Role-Based Access Control (RBAC) & Audit Trails
- **Multi-Role System**:
  - `Admin`: Full access to POS, Inventory editing, Reports, User Management, Audit Logs, and System Settings.
  - `Staff` / `Cashier`: Streamlined access focused on POS checkout and Prescriptions.
- **Comprehensive Audit Logs**: Automatic activity recording for logins, stock modifications, catalog deletions, and transaction cancellations.

### 8. Analytics & Financial Reporting
- Interactive sales performance charts powered by **Recharts**.
- Daily, weekly, and monthly revenue breakdowns, payment method distributions, and top-moving medications.

### 9. Progressive Web App (PWA)
- Installable on desktop, tablet, and mobile devices (Chrome, Safari, Edge).
- Service worker caching with Workbox for instant launch times and offline caching.

---

## 🛠️ Technology Stack

| Layer | Technology |
|---|---|
| **Frontend Framework** | [React 19](https://react.dev/) + [TypeScript](https://www.typescriptlang.org/) |
| **Build Tooling** | [Vite 6](https://vite.dev/) |
| **Styling** | [Tailwind CSS v4](https://tailwindcss.com/) |
| **Icons** | [Lucide React](https://lucide.dev/) |
| **Animations** | [Motion](https://motion.dev/) (Framer Motion) |
| **Data Visualization** | [Recharts](https://recharts.org/) |
| **Storage & Sync** | Offline-First LocalStorage + Optional [Supabase](https://supabase.com/) (PostgreSQL) |
| **PWA Support** | `vite-plugin-pwa` + Workbox |

---

## 🚀 Getting Started & Installation

### Prerequisites
- **Node.js**: Version 20.x or 22.x LTS
- **npm**: Version 10.x or higher

### 1. Clone the Repository
```bash
git clone https://github.com/kenny-web-254/rgdev-pharmacy-pos.git
cd rgdev-pharmacy-pos
```

### 2. Install Dependencies
```bash
npm install
```

### 3. Configure Environment Variables
Copy the sample environment file:
```bash
cp .env.example .env
```

Edit `.env` if you want to connect to a remote Supabase database:
```env
VITE_SUPABASE_URL=https://your-project-id.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key-here
```
*(Note: The application operates fully offline out of the box using client storage even if Supabase variables are left unset).*

### 4. Run the Development Server
```bash
npm run dev
```
Open your browser and navigate to `http://localhost:3000`.

---

## 🗄️ Supabase Cloud Database Setup (Optional)

If you wish to enable persistent cloud backup and multi-device synchronization:

1. Create a project at [supabase.com](https://supabase.com).
2. Go to your Supabase Project Dashboard -> **SQL Editor** -> **New Query**.
3. Copy the contents of [`supabase/schema.sql`](./supabase/schema.sql) and execute the query.
   This script creates:
   - `pharmacy_users`
   - `medications`
   - `prescriptions`
   - `sale_transactions` & `sale_items`
   - `receipt_settings`
   - `audit_logs`
   along with Row Level Security (RLS) policies and indexes.
4. Obtain your Project URL and Anon Public Key from **Project Settings -> API**.
5. You can enter them in `.env` or navigate to **Settings -> Supabase Database Settings** in the app to configure and test the live connection.

---

## 🔑 Demo User Accounts

The application ships with sample credentials ready for instant demonstration:

| Role | Username | Password | Full Name |
|---|---|---|---|
| **Admin** | `admin` | `admin` | Dr. Sarah Jenkins, PharmD |
| **Staff / Cashier** | `cashier` | `cashier` | Marcus Vance, CPhT |
| **Staff** | `amina` | `staff` | Amina Mohamed |

---

## 📦 Production Build & Deployment

### Build the Static Assets
```bash
npm run build
```
This produces optimized production assets inside the `dist/` directory.

### Preview Production Build
```bash
npm run preview
```

### Deployment Targets
The app is fully static and PWA-ready:
- **Cloud Run / Docker**: Configured to serve via standard Node/Nginx static servers on port `3000`.
- **Vercel / Netlify / Cloudflare Pages**: Connect the repository and set build command to `npm run build` and output directory to `dist`.

---

## 📄 License & Attribution

Distributed under the Apache-2.0 License. See source headers for details.
