// src/index.ts
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { z } from 'zod';
import { zValidator } from '@hono/zod-validator';
import { BUSINESS_RULES } from './constants';
import { hashPassword, constantTimeCompare } from './auth';
import { generateBotResponse, VehicleInfo } from './chatbot';

export type Bindings = {
  DB: D1Database;
  AI?: any;
};

const GOOGLE_CLIENT_ID = '714003657905-jqohf796ii1n4u51arnv4cskish9vd4r.apps.googleusercontent.com';
const ADMIN_EMAIL = 'seree999@gmail.com';

const app = new Hono<{ Bindings: Bindings }>();

// Enable CORS
app.use('*', cors());

// =============================================================================
// Helper: HTML Web UI Template with Google Sign-In
// =============================================================================
function renderPortalHtml(): string {
  return `<!DOCTYPE html>
<html lang="th">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>ระบบจองรถของเล่นไฟฟ้า | Toy Car Booking & Fleet</title>
  <script src="https://cdn.tailwindcss.com"></script>
  <script src="https://accounts.google.com/gsi/client" async defer></script>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Kanit:wght@300;400;500;600;700&display=swap" rel="stylesheet">
  <style>
    body { font-family: 'Kanit', sans-serif; }
  </style>
</head>
<body class="bg-slate-50 text-slate-800 min-h-screen">
  <!-- Top Navigation -->
  <header class="bg-indigo-600 text-white shadow-md sticky top-0 z-50">
    <div class="max-w-6xl mx-auto px-4 py-3 flex flex-wrap justify-between items-center gap-3">
      <div class="flex items-center gap-2">
        <span class="text-2xl">🏎️</span>
        <div>
          <h1 class="font-bold text-lg leading-tight">Toy Car Booking & Fleet</h1>
          <p class="text-xs text-indigo-200">Cloudflare Workers & D1 Edge</p>
        </div>
      </div>

      <!-- Navigation Tabs -->
      <div class="flex bg-indigo-800/60 p-1 rounded-lg text-xs font-medium gap-1">
        <button id="tabCustomerBtn" onclick="switchTab('customer')" class="px-3 py-1.5 rounded-md bg-white text-indigo-900 shadow">สำหรับลูกค้า (จองรถ)</button>
        <button id="tabStaffBtn" onclick="switchTab('staff')" class="px-3 py-1.5 rounded-md text-indigo-200 hover:text-white">ระบบพนักงาน (Check-in/Out)</button>
        <button id="tabAdminBtn" onclick="switchTab('admin')" class="px-3 py-1.5 rounded-md text-indigo-200 hover:text-white flex items-center gap-1">
          <span>แดชบอร์ดรายได้ (Admin)</span>
          <span id="adminLockIcon" class="text-amber-300 text-xs">🔒</span>
        </button>
      </div>

      <!-- Auth Header Area -->
      <div class="flex items-center gap-2">
        <!-- Logged Out Area -->
        <div id="loggedOutArea" class="flex items-center gap-2">
          <button onclick="openAuthModal('login')" class="bg-white/10 hover:bg-white/20 text-white text-xs font-semibold px-3 py-1.5 rounded-lg border border-white/20 transition flex items-center gap-1.5">
            <span>🔑</span> เข้าสู่ระบบ / สมัคร
          </button>
          <div id="googleSignInWrapper" class="flex items-center">
            <div id="g_id_onload"
                 data-client_id="${GOOGLE_CLIENT_ID}"
                 data-callback="handleGoogleCredentialResponse"
                 data-auto_prompt="false">
            </div>
            <div class="g_id_signin"
                 data-type="standard"
                 data-size="medium"
                 data-theme="outline"
                 data-text="signin_with"
                 data-shape="pill"
                 data-logo_alignment="left">
            </div>
          </div>
        </div>

        <!-- Logged In User Profile -->
        <div id="userProfileArea" class="hidden flex items-center gap-2 bg-indigo-700/80 px-2.5 py-1 rounded-full border border-indigo-500/50">
          <div id="userAvatarPlaceholder" class="w-6 h-6 rounded-full bg-indigo-400 text-white font-bold flex items-center justify-center text-xs">U</div>
          <img id="userAvatarImg" src="" alt="avatar" class="w-6 h-6 rounded-full border border-white/50 object-cover hidden">
          <div class="text-left text-xs leading-none">
            <div id="userNameDisplay" class="font-semibold text-white truncate max-w-[120px]"></div>
            <div id="userRoleBadge" class="text-[10px] text-indigo-200 font-mono mt-0.5"></div>
          </div>
          <button onclick="handleLogout()" title="ออกจากระบบ" class="text-indigo-200 hover:text-white text-sm ml-1 font-bold">✕</button>
        </div>
      </div>
    </div>
  </header>

  <main class="max-w-6xl mx-auto px-4 py-6">
    <!-- ===================================================================== -->
    <!-- CUSTOMER TAB -->
    <!-- ===================================================================== -->
    <section id="customerView" class="space-y-6">
      <div class="bg-gradient-to-r from-indigo-500 to-purple-600 text-white p-6 rounded-2xl shadow-sm flex flex-col md:flex-row justify-between items-center gap-4">
        <div>
          <h2 class="text-2xl font-bold mb-1">เลือกรถของเล่นไฟฟ้าที่บุตรหลานชื่นชอบ</h2>
          <p class="text-sm text-indigo-100">จองรอบเวลาล่วงหน้าง่ายๆ ใน 3 นาที ไม่ต้องยืนรอคิวหน้าบูธ</p>
        </div>
        <button onclick="loadVehicles()" class="bg-white/20 hover:bg-white/30 text-white px-4 py-2 rounded-xl text-sm font-medium transition backdrop-blur-sm">
          🔄 รีเฟรชสถานะรถ
        </button>
      </div>

      <!-- Vehicle Catalog Grid -->
      <div>
        <h3 class="text-lg font-bold mb-3 flex items-center gap-2">
          <span>🚗</span> รถของเล่นที่พร้อมให้บริการ (<span id="availableCount">0</span> คัน)
        </h3>
        <div id="vehicleGrid" class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          <div class="text-center py-12 text-slate-400 col-span-3">กำลังโหลดข้อมูลรถจาก Cloudflare D1...</div>
        </div>
      </div>
    </section>

    <!-- ===================================================================== -->
    <!-- STAFF TAB -->
    <!-- ===================================================================== -->
    <section id="staffView" class="hidden space-y-6">
      <!-- Quick Check-in Bar -->
      <div class="bg-white p-5 rounded-2xl shadow-sm border border-slate-200">
        <h3 class="font-bold text-base mb-2 text-slate-700 flex items-center gap-2">
          <span>📲</span> สแกนหรือค้นหารหัสการจองเพื่อปล่อยรถ (Check-in)
        </h3>
        <div class="flex gap-2 max-w-lg">
          <input type="text" id="scanBookingCode" placeholder="เช่น BK-20260930-7907" class="border border-slate-300 px-3 py-2 rounded-xl text-sm w-full font-mono uppercase focus:ring-2 focus:ring-indigo-500 focus:outline-none">
          <button onclick="lookupBooking()" class="bg-indigo-600 hover:bg-indigo-700 text-white px-5 py-2 rounded-xl text-sm font-medium transition shrink-0">
            ตรวจสอบตั๋ว
          </button>
        </div>
        <div id="bookingLookupResult" class="mt-3 hidden"></div>
      </div>

      <!-- Active Sessions Monitor -->
      <div class="bg-white p-5 rounded-2xl shadow-sm border border-slate-200">
        <div class="flex justify-between items-center mb-4">
          <div>
            <h3 class="font-bold text-lg text-slate-800 flex items-center gap-2">
              <span>⏱️</span> รถที่กำลังวิ่งอยู่ในสนาม (Active Sessions)
            </h3>
            <p class="text-xs text-slate-500">ระบบจับเวลากลางบนเซิร์ฟเวอร์ คำนวณเวลาที่เหลือและค่าปรับ Real-time</p>
          </div>
          <button onclick="loadActiveSessions()" class="text-xs bg-slate-100 hover:bg-slate-200 text-slate-700 px-3 py-1.5 rounded-lg font-medium">
            🔄 อัปเดตเวลา
          </button>
        </div>
        <div id="activeSessionsList" class="space-y-3">
          <div class="text-center py-8 text-slate-400 text-sm">ไม่มีรถที่กำลังเล่นในขณะนี้</div>
        </div>
      </div>

      <!-- Fleet Charging & Maintenance -->
      <div class="bg-white p-5 rounded-2xl shadow-sm border border-slate-200">
        <h3 class="font-bold text-base mb-3 text-slate-800 flex items-center gap-2">
          <span>🔋</span> การจัดการแบตเตอรี่รถ (Battery & Charging Control)
        </h3>
        <div id="fleetChargingList" class="grid grid-cols-1 md:grid-cols-2 gap-3">
          <!-- Filled by JS -->
        </div>
      </div>
    </section>

    <!-- ===================================================================== -->
    <!-- ADMIN TAB -->
    <!-- ===================================================================== -->
    <section id="adminView" class="hidden space-y-6">
      <!-- Admin Access Restricted Notice -->
      <div id="adminLockedNotice" class="bg-amber-50 border border-amber-200 p-8 rounded-2xl text-center space-y-3 hidden">
        <div class="w-16 h-16 bg-amber-100 text-amber-600 rounded-full flex items-center justify-center mx-auto text-3xl">🔒</div>
        <h3 class="text-xl font-bold text-amber-900">พื้นที่เฉพาะผู้ดูแลระบบ (Admin Only)</h3>
        <p class="text-sm text-amber-700 max-w-md mx-auto">
          กรุณาเข้าสู่ระบบด้วยบัญชี Google ของผู้ดูแลระบบ (<span class="font-mono font-bold text-amber-950">${ADMIN_EMAIL}</span>) เพื่อดูรายงานรายได้และข้อมูลทางการเงิน
        </p>
      </div>

      <!-- Admin Dashboard Content -->
      <div id="adminUnlockedContent" class="space-y-6 hidden">
        <div class="flex justify-between items-center bg-indigo-50 border border-indigo-200 p-4 rounded-2xl">
          <div class="flex items-center gap-2">
            <span class="text-xl">🛡️</span>
            <div>
              <span class="text-xs font-semibold text-indigo-700 uppercase tracking-wider block">Admin Mode</span>
              <span class="text-sm font-bold text-slate-800">ยินดีต้อนรับ คุณเสรี (Admin: ${ADMIN_EMAIL})</span>
            </div>
          </div>
          <button onclick="loadAdminMetrics()" class="text-xs bg-indigo-600 hover:bg-indigo-700 text-white px-3 py-1.5 rounded-lg font-medium shadow-sm transition">
            🔄 รีเฟรชยอดเงิน
          </button>
        </div>

        <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div class="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
            <span class="text-xs text-slate-500">รายได้รวมจากการเช่า</span>
            <div id="metricRentalRevenue" class="text-2xl font-bold text-indigo-600 mt-1">0 บาท</div>
          </div>
          <div class="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
            <span class="text-xs text-slate-500">ค่าปรับ Overtime ที่เก็บได้</span>
            <div id="metricPenaltyRevenue" class="text-2xl font-bold text-amber-600 mt-1">0 บาท</div>
          </div>
          <div class="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
            <span class="text-xs text-slate-500">จำนวนการจองทั้งหมด</span>
            <div id="metricTotalBookings" class="text-2xl font-bold text-slate-800 mt-1">0 รายการ</div>
          </div>
          <div class="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
            <span class="text-xs text-slate-500">รถพร้อมใช้งานในฝูง</span>
            <div id="metricActiveVehicles" class="text-2xl font-bold text-emerald-600 mt-1">0 คัน</div>
          </div>
        </div>

        <div class="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
          <h3 class="font-bold text-base mb-3 text-slate-800">ประวัติธุรกรรมและการเงินล่าสุด (Audit Trail)</h3>
          <div id="adminTxList" class="space-y-2 text-xs text-slate-600">
            <div class="text-center py-6 text-slate-400">กำลังดึงข้อมูลธุรกรรม...</div>
          </div>
        </div>
      </div>
    </section>
  </main>

  <!-- Auth Modal (Login / Register) -->
  <div id="authModal" class="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4 hidden">
    <div class="bg-white rounded-2xl shadow-xl max-w-sm w-full p-6 space-y-4">
      <div class="flex justify-between items-center border-b pb-3">
        <div class="flex gap-4">
          <button id="authTabLoginBtn" onclick="switchAuthTab('login')" class="font-bold text-sm text-indigo-600 pb-1 border-b-2 border-indigo-600">เข้าสู่ระบบ</button>
          <button id="authTabRegisterBtn" onclick="switchAuthTab('register')" class="font-semibold text-sm text-slate-400 hover:text-slate-600 pb-1">สมัครสมาชิก</button>
        </div>
        <button onclick="closeAuthModal()" class="text-slate-400 hover:text-slate-600 text-xl font-bold">&times;</button>
      </div>

      <!-- Login Form -->
      <form id="loginForm" onsubmit="handleLoginSubmit(event)" class="space-y-3">
        <div>
          <label class="block text-xs font-semibold text-slate-600 mb-1">อีเมล *</label>
          <input type="email" id="loginEmail" required placeholder="seree999@gmail.com หรืออีเมลของคุณ" class="border border-slate-300 w-full px-3 py-2 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500 focus:outline-none">
        </div>
        <div>
          <label class="block text-xs font-semibold text-slate-600 mb-1">รหัสผ่าน *</label>
          <input type="password" id="loginPassword" required placeholder="••••••••" class="border border-slate-300 w-full px-3 py-2 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500 focus:outline-none">
        </div>
        <div id="loginError" class="p-2.5 rounded-xl bg-red-50 border border-red-200 text-red-600 text-xs hidden"></div>
        <button type="submit" id="loginSubmitBtn" class="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-semibold py-2.5 rounded-xl text-sm transition shadow-sm">
          เข้าสู่ระบบ
        </button>
        <div class="text-center text-xs text-slate-500 pt-2">
          ยังไม่มีบัญชี? <a href="javascript:void(0)" onclick="switchAuthTab('register')" class="text-indigo-600 font-semibold hover:underline">สมัครสมาชิกที่นี่</a>
        </div>
      </form>

      <!-- Register Form -->
      <form id="registerForm" onsubmit="handleRegisterSubmit(event)" class="space-y-3 hidden">
        <div>
          <label class="block text-xs font-semibold text-slate-600 mb-1">ชื่อ - นามสกุล *</label>
          <input type="text" id="regName" required placeholder="สมชาย ใจดี" class="border border-slate-300 w-full px-3 py-2 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500 focus:outline-none">
        </div>
        <div>
          <label class="block text-xs font-semibold text-slate-600 mb-1">อีเมล *</label>
          <input type="email" id="regEmail" required placeholder="name@example.com" class="border border-slate-300 w-full px-3 py-2 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500 focus:outline-none">
        </div>
        <div>
          <label class="block text-xs font-semibold text-slate-600 mb-1">รหัสผ่าน (อย่างน้อย 6 ตัวอักษร) *</label>
          <input type="password" id="regPassword" minlength="6" required placeholder="อย่างน้อย 6 ตัวอักษร" class="border border-slate-300 w-full px-3 py-2 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500 focus:outline-none">
        </div>
        <div>
          <label class="block text-xs font-semibold text-slate-600 mb-1">ยืนยันรหัสผ่าน *</label>
          <input type="password" id="regConfirmPassword" minlength="6" required placeholder="กรอกรหัสผ่านซ้ำอีกครั้ง" class="border border-slate-300 w-full px-3 py-2 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500 focus:outline-none">
        </div>
        <div id="registerError" class="p-2.5 rounded-xl bg-red-50 border border-red-200 text-red-600 text-xs hidden"></div>
        <button type="submit" id="registerSubmitBtn" class="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-semibold py-2.5 rounded-xl text-sm transition shadow-sm">
          ยืนยันการสมัครสมาชิก
        </button>
        <div class="text-center text-xs text-slate-500 pt-2">
          มีบัญชีอยู่แล้ว? <a href="javascript:void(0)" onclick="switchAuthTab('login')" class="text-indigo-600 font-semibold hover:underline">เข้าสู่ระบบ</a>
        </div>
      </form>
    </div>
  </div>

  <!-- Booking Modal -->
  <div id="bookingModal" class="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4 hidden">
    <div class="bg-white rounded-2xl shadow-xl max-w-md w-full p-6 space-y-4">
      <div class="flex justify-between items-center border-b pb-3">
        <h3 class="font-bold text-lg text-slate-800">จองรอบเวลารถ</h3>
        <button onclick="closeBookingModal()" class="text-slate-400 hover:text-slate-600 text-xl font-bold">&times;</button>
      </div>
      <form id="bookingForm" onsubmit="submitBooking(event)" class="space-y-3">
        <input type="hidden" id="modalVehicleId">
        <div>
          <label class="block text-xs font-semibold text-slate-600 mb-1">รถที่เลือก</label>
          <div id="modalVehicleName" class="p-2.5 bg-slate-100 rounded-xl text-sm font-medium text-slate-800"></div>
        </div>
        <div>
          <label class="block text-xs font-semibold text-slate-600 mb-1">ชื่อผู้ปกครอง *</label>
          <input type="text" id="customerName" required placeholder="สมชาย ใจดี" class="border border-slate-300 w-full px-3 py-2 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500 focus:outline-none">
        </div>
        <div>
          <label class="block text-xs font-semibold text-slate-600 mb-1">เบอร์โทรศัพท์ (10 หลัก) *</label>
          <input type="tel" id="customerPhone" required placeholder="0812345678" class="border border-slate-300 w-full px-3 py-2 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500 focus:outline-none">
        </div>
        <div class="grid grid-cols-2 gap-2">
          <div>
            <label class="block text-xs font-semibold text-slate-600 mb-1">วันที่เล่น *</label>
            <input type="date" id="slotDate" required class="border border-slate-300 w-full px-3 py-2 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500 focus:outline-none">
          </div>
          <div>
            <label class="block text-xs font-semibold text-slate-600 mb-1">เวลาเริ่ม (HH:MM) *</label>
            <input type="time" id="slotStartTime" required class="border border-slate-300 w-full px-3 py-2 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500 focus:outline-none">
          </div>
        </div>
        <div>
          <label class="block text-xs font-semibold text-slate-600 mb-1">แพ็กเกจเวลาเช่า *</label>
          <select id="durationMinutes" onchange="updatePricePreview()" class="border border-slate-300 w-full px-3 py-2 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500 focus:outline-none bg-white">
            <option value="15">15 นาที (80 บาท)</option>
            <option value="30" selected>30 นาที (150 บาท) - แนะนำ</option>
            <option value="60">60 นาที (250 บาท)</option>
          </select>
        </div>
        <div class="p-3 bg-amber-50 border border-amber-200 rounded-xl text-xs space-y-1 text-amber-900">
          <div class="flex justify-between"><span>ค่าเช่ารถ:</span><span id="previewRent">150 บาท</span></div>
          <div class="flex justify-between"><span>เงินมัดจำกุญแจ/รีโมท (คืนเมื่อจบรอบ):</span><span>100 บาท</span></div>
          <div class="flex justify-between font-bold text-sm border-t border-amber-200 pt-1">
            <span>ยอดชำระสุทธิ:</span><span id="previewTotal" class="text-indigo-700">250 บาท</span>
          </div>
        </div>
        <button type="submit" id="submitBookingBtn" class="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-medium py-2.5 rounded-xl text-sm transition shadow-sm">
          ยืนยันการกักสิทธิ์ 5 นาที
        </button>
      </form>
    </div>
  </div>

  <!-- QR / Ticket Success Modal -->
  <div id="ticketModal" class="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4 hidden">
    <div class="bg-white rounded-2xl shadow-xl max-w-sm w-full p-6 text-center space-y-4">
      <div class="w-12 h-12 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center mx-auto text-2xl">
        ✓
      </div>
      <div>
        <h3 class="font-bold text-xl text-slate-800">กักสิทธิ์สำเร็จ!</h3>
        <p class="text-xs text-slate-500">กรุณาสแกนจ่ายเงินหรือนำรหัสนี้มาแสดงหน้าร้าน</p>
      </div>

      <!-- Real Scannable QR Code -->
      <div class="flex justify-center p-2 bg-white rounded-xl shadow-inner border border-slate-200 inline-block mx-auto">
        <img id="qrImageElement" src="" alt="PromptPay QR" class="w-36 h-36 rounded-lg">
      </div>

      <div class="p-2.5 bg-slate-50 border-2 border-dashed border-slate-300 rounded-xl">
        <span class="text-xs text-slate-400 block mb-0.5">รหัสตั๋วของคุณ (Booking Code)</span>
        <span id="ticketCodeDisplay" class="font-mono text-xl font-bold text-indigo-700 tracking-wider"></span>
      </div>
      <div class="text-xs text-slate-600 space-y-1 text-left bg-indigo-50/50 p-3 rounded-xl border border-indigo-100">
        <div class="flex justify-between"><span>รอบเวลา:</span><span id="ticketTimeDisplay" class="font-semibold text-slate-800"></span></div>
        <div class="flex justify-between"><span>รถ:</span><span id="ticketVehicleDisplay" class="font-semibold text-slate-800"></span></div>
        <div class="flex justify-between"><span>ยอดที่ต้องจ่าย:</span><span id="ticketPriceDisplay" class="font-bold text-emerald-700"></span></div>
      </div>
      <div class="flex gap-2">
        <button onclick="simulatePay()" id="simPayBtn" class="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold py-2.5 rounded-xl transition">
          จำลองการจ่ายเงิน (PromptPay)
        </button>
        <button onclick="closeTicketModal()" class="px-4 bg-slate-200 hover:bg-slate-300 text-slate-700 text-xs font-semibold py-2.5 rounded-xl transition">
          ปิด
        </button>
      </div>
    </div>
  </div>

  <!-- ===================================================================== -->
  <!-- FLOATING AI CHATBOT WIDGET (น้องรถด่วน AI) -->
  <!-- ===================================================================== -->
  <div id="aiChatbotContainer" class="fixed bottom-5 right-5 z-50 flex flex-col items-end">
    <!-- Chat Window Box -->
    <div id="aiChatWindow" class="hidden mb-3 w-[360px] sm:w-[400px] h-[520px] max-h-[82vh] bg-white rounded-3xl shadow-2xl border border-indigo-100 flex flex-col overflow-hidden transition-all duration-300 origin-bottom-right">
      <!-- Header -->
      <div class="bg-gradient-to-r from-indigo-600 via-indigo-700 to-purple-600 text-white p-3.5 flex justify-between items-center shadow-sm shrink-0">
        <div class="flex items-center gap-2.5">
          <div class="relative">
            <div class="w-9 h-9 rounded-full bg-white/20 backdrop-blur-sm flex items-center justify-center text-xl shadow-inner">
              🤖
            </div>
            <span class="absolute bottom-0 right-0 w-2.5 h-2.5 bg-emerald-400 border-2 border-indigo-700 rounded-full animate-pulse"></span>
          </div>
          <div>
            <div class="font-bold text-sm leading-tight flex items-center gap-1.5">
              <span>น้องรถด่วน AI</span>
              <span class="bg-emerald-400/20 text-emerald-300 text-[10px] px-1.5 py-0.5 rounded-full font-medium">ออนไลน์</span>
            </div>
            <div class="text-[11px] text-indigo-200">ผู้ช่วยอัจฉริยะสนามรถของเล่น 24 ชม.</div>
          </div>
        </div>
        <div class="flex items-center gap-1">
          <button onclick="clearChatHistory()" title="ล้างบทสนทนา" class="text-indigo-200 hover:text-white p-1 rounded-lg text-xs transition">
            🧹
          </button>
          <button onclick="toggleChatWindow()" title="ย่อหน้าต่าง" class="text-indigo-200 hover:text-white p-1 rounded-lg text-sm font-bold transition">
            ✕
          </button>
        </div>
      </div>

      <!-- Message Container -->
      <div id="aiChatMessages" class="flex-1 p-3.5 overflow-y-auto space-y-3 bg-slate-50/80 text-xs">
        <!-- Default Welcome Message -->
        <div class="flex gap-2 items-start">
          <div class="w-7 h-7 rounded-full bg-indigo-100 text-indigo-700 flex items-center justify-center text-sm shrink-0 shadow-xs">
            🤖
          </div>
          <div class="bg-white p-3 rounded-2xl rounded-tl-none border border-slate-200 shadow-sm text-slate-700 leading-relaxed max-w-[85%] space-y-1.5">
            <div>👋 สวัสดีครับ! ผมคือ <b>น้องรถด่วน AI</b> ยินดีต้อนรับสู่สนามรถของเล่นไฟฟ้าครับ 🏎️✨</div>
            <div class="text-slate-500 text-[11px]">สามารถสอบถามผมได้ทุกเรื่องเลยครับ เช่น รถที่ว่างตอนนี้, ราคาเช่า, กฎผ่อนผัน หรือคำแนะนำสำหรับน้องๆ ครับ</div>
          </div>
        </div>

        <!-- Quick Suggestion Chips -->
        <div id="aiQuickChips" class="space-y-1.5 pt-1">
          <div class="text-[10px] text-slate-400 font-semibold uppercase tracking-wider pl-9">คำถามที่พบบ่อย:</div>
          <div class="flex flex-wrap gap-1.5 pl-9">
            <button onclick="sendQuickPrompt('ตอนนี้มีรถว่างกี่คันครับ?')" class="bg-indigo-50 hover:bg-indigo-100 text-indigo-700 px-2.5 py-1 rounded-full text-[11px] border border-indigo-200 transition">
              🚗 รถว่างตอนนี้มีกี่คัน?
            </button>
            <button onclick="sendQuickPrompt('ค่าเช่าและเงินมัดจำคิดยังไง?')" class="bg-indigo-50 hover:bg-indigo-100 text-indigo-700 px-2.5 py-1 rounded-full text-[11px] border border-indigo-200 transition">
              💰 ค่าเช่า & เงินมัดจำ
            </button>
            <button onclick="sendQuickPrompt('คืนรถช้ามีค่าปรับไหม มีเวลาผ่อนผันไหม?')" class="bg-indigo-50 hover:bg-indigo-100 text-indigo-700 px-2.5 py-1 rounded-full text-[11px] border border-indigo-200 transition">
              ⏱️ ค่าปรับ & ผ่อนผัน
            </button>
            <button onclick="sendQuickPrompt('เด็ก 3 ขวบ แนะนำรุ่นไหนดีครับ?')" class="bg-indigo-50 hover:bg-indigo-100 text-indigo-700 px-2.5 py-1 rounded-full text-[11px] border border-indigo-200 transition">
              👶 แนะนำรถตามวัยเด็ก
            </button>
          </div>
        </div>
      </div>

      <!-- Typing Indicator -->
      <div id="aiTypingIndicator" class="hidden px-4 py-2 bg-slate-50 border-t border-slate-100 flex items-center gap-2 text-slate-400 text-xs shrink-0">
        <div class="flex gap-1 items-center">
          <span class="w-1.5 h-1.5 bg-indigo-500 rounded-full animate-bounce"></span>
          <span class="w-1.5 h-1.5 bg-indigo-500 rounded-full animate-bounce [animation-delay:0.2s]"></span>
          <span class="w-1.5 h-1.5 bg-indigo-500 rounded-full animate-bounce [animation-delay:0.4s]"></span>
        </div>
        <span class="text-[11px] text-indigo-600 font-medium">น้องรถด่วนกำลังค้นหาข้อมูล...</span>
      </div>

      <!-- Chat Input Area -->
      <form onsubmit="handleSendChat(event)" class="p-2.5 bg-white border-t border-slate-200 flex gap-2 items-center shrink-0">
        <input type="text" id="aiChatInput" autocomplete="off" placeholder="พิมพ์ถามน้องรถด่วนได้เลย..." class="flex-1 border border-slate-300 rounded-xl px-3 py-2 text-xs focus:ring-2 focus:ring-indigo-500 focus:outline-none">
        <button type="submit" id="aiChatSendBtn" class="bg-indigo-600 hover:bg-indigo-700 text-white px-3.5 py-2 rounded-xl text-xs font-semibold transition shrink-0 flex items-center gap-1 shadow-sm">
          <span>ส่ง</span> 🚀
        </button>
      </form>
    </div>

    <!-- Floating Trigger Bubble Button -->
    <button onclick="toggleChatWindow()" id="aiChatToggleBtn" class="bg-gradient-to-r from-indigo-600 via-indigo-700 to-purple-600 hover:from-indigo-700 hover:to-purple-700 text-white px-4 py-3 rounded-full shadow-2xl flex items-center gap-2.5 transition transform hover:scale-105 group border-2 border-white/60">
      <span class="text-xl group-hover:rotate-12 transition transform">🤖</span>
      <span class="text-xs font-bold tracking-wide">ถามน้องรถด่วน AI</span>
      <span class="relative flex h-2.5 w-2.5">
        <span class="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
        <span class="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500"></span>
      </span>
    </button>
  </div>

  <script>
    let currentTab = 'customer';
    let currentBookingData = null;
    let currentUser = null;

    // --- Authentication Handlers (Google + Email/Password) ---
    function openAuthModal(tab) {
      switchAuthTab(tab || 'login');
      document.getElementById('authModal').classList.remove('hidden');
    }

    function closeAuthModal() {
      document.getElementById('authModal').classList.add('hidden');
      document.getElementById('loginError').classList.add('hidden');
      document.getElementById('registerError').classList.add('hidden');
    }

    function switchAuthTab(tab) {
      const loginBtn = document.getElementById('authTabLoginBtn');
      const regBtn = document.getElementById('authTabRegisterBtn');
      const loginForm = document.getElementById('loginForm');
      const regForm = document.getElementById('registerForm');
      const loginErr = document.getElementById('loginError');
      const regErr = document.getElementById('registerError');

      loginErr.classList.add('hidden');
      regErr.classList.add('hidden');

      if (tab === 'register') {
        loginBtn.className = 'font-semibold text-sm text-slate-400 hover:text-slate-600 pb-1';
        regBtn.className = 'font-bold text-sm text-emerald-600 pb-1 border-b-2 border-emerald-600';
        loginForm.classList.add('hidden');
        regForm.classList.remove('hidden');
      } else {
        loginBtn.className = 'font-bold text-sm text-indigo-600 pb-1 border-b-2 border-indigo-600';
        regBtn.className = 'font-semibold text-sm text-slate-400 hover:text-slate-600 pb-1';
        loginForm.classList.remove('hidden');
        regForm.classList.add('hidden');
      }
    }

    async function handleLoginSubmit(e) {
      e.preventDefault();
      const email = document.getElementById('loginEmail').value.trim();
      const password = document.getElementById('loginPassword').value;
      const btn = document.getElementById('loginSubmitBtn');
      const errBox = document.getElementById('loginError');

      btn.disabled = true;
      btn.textContent = 'กำลังเข้าสู่ระบบ...';
      errBox.classList.add('hidden');

      try {
        const res = await fetch('/api/v1/auth/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email, password })
        });
        const json = await res.json();
        if (json.success) {
          currentUser = json.user;
          localStorage.setItem('toy_car_user', JSON.stringify(currentUser));
          updateAuthUI();
          closeAuthModal();
          alert('👋 ยินดีต้อนรับ ' + currentUser.name + (currentUser.role === 'ADMIN' ? ' (สิทธิ์แอดมิน)' : ''));
        } else {
          errBox.textContent = json.error?.message || 'เข้าสู่ระบบไม่สำเร็จ';
          errBox.classList.remove('hidden');
        }
      } catch (err) {
        errBox.textContent = 'เกิดข้อผิดพลาดในการเชื่อมต่อเซิร์ฟเวอร์';
        errBox.classList.remove('hidden');
      } finally {
        btn.disabled = false;
        btn.textContent = 'เข้าสู่ระบบ';
      }
    }

    async function handleRegisterSubmit(e) {
      e.preventDefault();
      const name = document.getElementById('regName').value.trim();
      const email = document.getElementById('regEmail').value.trim();
      const password = document.getElementById('regPassword').value;
      const confirmPassword = document.getElementById('regConfirmPassword').value;
      const btn = document.getElementById('registerSubmitBtn');
      const errBox = document.getElementById('registerError');

      errBox.classList.add('hidden');

      if (password !== confirmPassword) {
        errBox.textContent = 'รหัสผ่านและยืนยันรหัสผ่านไม่ตรงกัน';
        errBox.classList.remove('hidden');
        return;
      }

      btn.disabled = true;
      btn.textContent = 'กำลังสมัครสมาชิก...';

      try {
        const res = await fetch('/api/v1/auth/register', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name, email, password })
        });
        const json = await res.json();
        if (json.success) {
          currentUser = json.user;
          localStorage.setItem('toy_car_user', JSON.stringify(currentUser));
          updateAuthUI();
          closeAuthModal();
          alert('🎉 สมัครสมาชิกสำเร็จ! ยินดีต้อนรับ ' + currentUser.name + (currentUser.role === 'ADMIN' ? ' (สิทธิ์แอดมิน)' : ''));
        } else {
          errBox.textContent = json.error?.message || 'สมัครสมาชิกไม่สำเร็จ';
          errBox.classList.remove('hidden');
        }
      } catch (err) {
        errBox.textContent = 'เกิดข้อผิดพลาดในการเชื่อมต่อเซิร์ฟเวอร์';
        errBox.classList.remove('hidden');
      } finally {
        btn.disabled = false;
        btn.textContent = 'ยืนยันการสมัครสมาชิก';
      }
    }

    async function handleGoogleCredentialResponse(response) {
      try {
        const idToken = response.credential;
        const res = await fetch('/api/v1/auth/google', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ credential: idToken })
        });
        const json = await res.json();
        if (json.success) {
          currentUser = json.user;
          localStorage.setItem('toy_car_user', JSON.stringify(currentUser));
          updateAuthUI();
          alert('👋 เข้าสู่ระบบสำเร็จ: ' + currentUser.name + (currentUser.role === 'ADMIN' ? ' (สิทธิ์แอดมิน)' : ''));
        } else {
          alert('❌ เข้าสู่ระบบล้มเหลว: ' + json.error?.message);
        }
      } catch (err) {
        alert('เกิดข้อผิดพลาดในการเชื่อมต่อ Google Auth');
      }
    }

    function updateAuthUI() {
      const loggedOutArea = document.getElementById('loggedOutArea');
      const profileArea = document.getElementById('userProfileArea');
      const adminLockIcon = document.getElementById('adminLockIcon');
      const avatarImg = document.getElementById('userAvatarImg');
      const avatarPlaceholder = document.getElementById('userAvatarPlaceholder');

      if (currentUser) {
        if (loggedOutArea) loggedOutArea.classList.add('hidden');
        if (profileArea) profileArea.classList.remove('hidden');

        if (currentUser.picture) {
          avatarImg.src = currentUser.picture;
          avatarImg.classList.remove('hidden');
          avatarPlaceholder.classList.add('hidden');
        } else {
          avatarImg.classList.add('hidden');
          avatarPlaceholder.classList.remove('hidden');
          avatarPlaceholder.textContent = (currentUser.name || 'U').charAt(0).toUpperCase();
        }

        document.getElementById('userNameDisplay').textContent = currentUser.name || currentUser.email;
        
        let roleText = 'ลูกค้า (CUSTOMER)';
        if (currentUser.role === 'ADMIN') {
          roleText = '⭐ แอดมิน (ADMIN)';
          adminLockIcon.textContent = '🔓';
        } else if (currentUser.role === 'STAFF') {
          roleText = '👷 พนักงาน (STAFF)';
          adminLockIcon.textContent = '🔒';
        } else {
          adminLockIcon.textContent = '🔒';
        }
        document.getElementById('userRoleBadge').textContent = roleText;

        // Auto-fill customer name in booking modal
        const nameInput = document.getElementById('customerName');
        if (nameInput && !nameInput.value) {
          nameInput.value = currentUser.name;
        }
      } else {
        if (loggedOutArea) loggedOutArea.classList.remove('hidden');
        if (profileArea) profileArea.classList.add('hidden');
        adminLockIcon.textContent = '🔒';
      }

      // If currently on admin tab, refresh view
      if (currentTab === 'admin') {
        renderAdminTabState();
      }
    }

    function handleLogout() {
      currentUser = null;
      localStorage.removeItem('toy_car_user');
      updateAuthUI();
      if (currentTab === 'admin') {
        switchTab('customer');
      }
      alert('ออกจากระบบเรียบร้อยแล้ว');
    }

    function checkSavedUser() {
      const saved = localStorage.getItem('toy_car_user');
      if (saved) {
        try {
          currentUser = JSON.parse(saved);
          updateAuthUI();
        } catch (e) {
          localStorage.removeItem('toy_car_user');
        }
      }
    }

    function renderAdminTabState() {
      const locked = document.getElementById('adminLockedNotice');
      const unlocked = document.getElementById('adminUnlockedContent');
      if (currentUser && currentUser.role === 'ADMIN') {
        locked.classList.add('hidden');
        unlocked.classList.remove('hidden');
        loadAdminMetrics();
      } else {
        locked.classList.remove('hidden');
        unlocked.classList.add('hidden');
      }
    }

    function switchTab(tab) {
      currentTab = tab;
      document.getElementById('customerView').classList.add('hidden');
      document.getElementById('staffView').classList.add('hidden');
      document.getElementById('adminView').classList.add('hidden');

      document.getElementById('tabCustomerBtn').className = 'px-3 py-1.5 rounded-md text-indigo-200 hover:text-white';
      document.getElementById('tabStaffBtn').className = 'px-3 py-1.5 rounded-md text-indigo-200 hover:text-white';
      document.getElementById('tabAdminBtn').className = 'px-3 py-1.5 rounded-md text-indigo-200 hover:text-white flex items-center gap-1';

      if (tab === 'customer') {
        document.getElementById('customerView').classList.remove('hidden');
        document.getElementById('tabCustomerBtn').className = 'px-3 py-1.5 rounded-md bg-white text-indigo-900 shadow';
        loadVehicles();
      } else if (tab === 'staff') {
        document.getElementById('staffView').classList.remove('hidden');
        document.getElementById('tabStaffBtn').className = 'px-3 py-1.5 rounded-md bg-white text-indigo-900 shadow';
        loadActiveSessions();
        loadFleetCharging();
      } else if (tab === 'admin') {
        document.getElementById('adminView').classList.remove('hidden');
        document.getElementById('tabAdminBtn').className = 'px-3 py-1.5 rounded-md bg-white text-indigo-900 shadow flex items-center gap-1';
        renderAdminTabState();
      }
    }

    async function loadVehicles() {
      try {
        const res = await fetch('/api/v1/vehicles?status=ALL');
        const json = await res.json();
        const grid = document.getElementById('vehicleGrid');
        grid.innerHTML = '';
        
        let availableCount = 0;
        json.data.forEach(v => {
          if (v.status === 'AVAILABLE') availableCount++;
          const card = document.createElement('div');
          card.className = 'bg-white rounded-2xl p-5 border border-slate-200 shadow-sm flex flex-col justify-between hover:shadow-md transition';
          
          let statusBadge = '';
          if (v.status === 'AVAILABLE') {
            statusBadge = '<span class="bg-emerald-100 text-emerald-700 text-xs font-semibold px-2.5 py-0.5 rounded-full">พร้อมใช้งาน</span>';
          } else if (v.status === 'IN_USE') {
            statusBadge = '<span class="bg-amber-100 text-amber-700 text-xs font-semibold px-2.5 py-0.5 rounded-full">กำลังเล่น</span>';
          } else if (v.status === 'CHARGING') {
            statusBadge = '<span class="bg-purple-100 text-purple-700 text-xs font-semibold px-2.5 py-0.5 rounded-full">กำลังชาร์จไฟ</span>';
          } else {
            statusBadge = '<span class="bg-red-100 text-red-700 text-xs font-semibold px-2.5 py-0.5 rounded-full">' + v.status + '</span>';
          }

          card.innerHTML = \`
            <div>
              <div class="flex justify-between items-start mb-2">
                <span class="text-xs font-mono font-bold bg-slate-100 text-slate-600 px-2 py-0.5 rounded">\${v.code}</span>
                \${statusBadge}
              </div>
              <h4 class="font-bold text-base text-slate-800 mb-1">\${v.name}</h4>
              <div class="text-xs text-slate-500 space-y-1 mb-4">
                <div>🏷️ หมวดหมู่: <span class="font-medium text-slate-700">\${v.category}</span></div>
                <div>⚖️ รับน้ำหนักได้: <span class="font-medium text-slate-700">สูงสุด \${v.max_weight_kg} กก.</span></div>
                <div>🎮 รีโมทคุม: <span class="font-medium text-slate-700">\${v.has_remote ? 'มีรีโมทผู้ปกครอง' : 'ขับเอง'}</span></div>
                <div>🔋 รอบสะสม: <span class="font-medium text-slate-700">\${v.cycle_count}/3 รอบ</span></div>
              </div>
            </div>
            <div>
              \${v.status === 'AVAILABLE' 
                ? \`<button onclick="openBookingModal('\${v.id}', '\${v.name}')" class="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-medium py-2 rounded-xl text-xs transition">จองรถคันนี้</button>\`
                : \`<button disabled class="w-full bg-slate-100 text-slate-400 font-medium py-2 rounded-xl text-xs cursor-not-allowed">ไม่พร้อมให้บริการ</button>\`
              }
            </div>
          \`;
          grid.appendChild(card);
        });
        document.getElementById('availableCount').textContent = availableCount;
      } catch (err) {
        alert('เกิดข้อผิดพลาดในการโหลดข้อมูลรถ');
      }
    }

    function openBookingModal(id, name) {
      document.getElementById('modalVehicleId').value = id;
      document.getElementById('modalVehicleName').textContent = name;
      
      const today = new Date().toISOString().split('T')[0];
      document.getElementById('slotDate').value = today;
      
      const now = new Date();
      now.setMinutes(now.getMinutes() + 10);
      const hours = String(now.getHours()).padStart(2, '0');
      const mins = String(now.getMinutes()).padStart(2, '0');
      document.getElementById('slotStartTime').value = \`\${hours}:\${mins}\`;
      
      if (currentUser && currentUser.name) {
        document.getElementById('customerName').value = currentUser.name;
      }

      updatePricePreview();
      document.getElementById('bookingModal').classList.remove('hidden');
    }

    function closeBookingModal() {
      document.getElementById('bookingModal').classList.add('hidden');
    }

    function updatePricePreview() {
      const duration = parseInt(document.getElementById('durationMinutes').value);
      const rates = { 15: 80, 30: 150, 60: 250 };
      const rent = rates[duration] || 150;
      document.getElementById('previewRent').textContent = rent + ' บาท';
      document.getElementById('previewTotal').textContent = (rent + 100) + ' บาท';
    }

    async function submitBooking(e) {
      e.preventDefault();
      const btn = document.getElementById('submitBookingBtn');
      btn.disabled = true;
      btn.textContent = 'กำลังกักสิทธิ์บน Cloudflare D1...';

      const payload = {
        vehicle_id: document.getElementById('modalVehicleId').value,
        customer_name: document.getElementById('customerName').value,
        customer_phone: document.getElementById('customerPhone').value,
        slot_date: document.getElementById('slotDate').value,
        slot_start_time: document.getElementById('slotStartTime').value,
        duration_minutes: parseInt(document.getElementById('durationMinutes').value)
      };

      try {
        const res = await fetch('/api/v1/bookings/hold', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
        const json = await res.json();
        if (!json.success) {
          alert('❌ ' + (json.error?.message || 'การจองล้มเหลว'));
          return;
        }
        
        currentBookingData = json.data;
        closeBookingModal();
        showTicketModal(json.data);
      } catch (err) {
        alert('เกิดข้อผิดพลาดในการเชื่อมต่อเซิร์ฟเวอร์');
      } finally {
        btn.disabled = false;
        btn.textContent = 'ยืนยันการกักสิทธิ์ 5 นาที';
      }
    }

    function showTicketModal(data) {
      document.getElementById('ticketCodeDisplay').textContent = data.booking_code;
      document.getElementById('ticketTimeDisplay').textContent = data.slot_date + ' (' + data.slot_time + ')';
      document.getElementById('ticketVehicleDisplay').textContent = data.vehicle_name;
      document.getElementById('ticketPriceDisplay').textContent = (data.pricing.total_cents / 100) + ' บาท';
      
      const qrData = encodeURIComponent('PROMPTPAY|TOYCAR|' + data.booking_code + '|' + (data.pricing.total_cents / 100));
      document.getElementById('qrImageElement').src = 'https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=' + qrData;

      document.getElementById('ticketModal').classList.remove('hidden');
    }

    function closeTicketModal() {
      document.getElementById('ticketModal').classList.add('hidden');
      loadVehicles();
    }

    async function simulatePay() {
      if (!currentBookingData) return;
      const btn = document.getElementById('simPayBtn');
      btn.disabled = true;
      btn.textContent = 'กำลังยืนยันยอดเงิน...';

      try {
        const res = await fetch('/api/v1/bookings/' + currentBookingData.booking_code + '/confirm', {
          method: 'POST'
        });
        const json = await res.json();
        if (json.success) {
          alert('✅ ชำระเงินสำเร็จ! ตั๋วสถานะ CONFIRMED พร้อมนำไป Check-in หน้าร้านแล้ว');
          closeTicketModal();
        } else {
          alert('❌ ' + json.error?.message);
        }
      } catch (err) {
        alert('การชำระเงินจำลองล้มเหลว');
      } finally {
        btn.disabled = false;
        btn.textContent = 'จำลองการจ่ายเงิน (PromptPay)';
      }
    }

    // --- Staff Logic ---
    async function lookupBooking() {
      const code = document.getElementById('scanBookingCode').value.trim();
      if (!code) return;
      const container = document.getElementById('bookingLookupResult');
      container.classList.remove('hidden');
      container.innerHTML = '<span class="text-xs text-slate-400">กำลังตรวจสอบข้อมูลตั๋ว...</span>';

      try {
        const res = await fetch('/api/v1/bookings/' + encodeURIComponent(code));
        const json = await res.json();
        if (!json.success) {
          container.innerHTML = '<div class="p-3 bg-red-50 text-red-700 text-xs rounded-xl">' + json.error.message + '</div>';
          return;
        }
        const b = json.data;
        container.innerHTML = \`
          <div class="p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-2 text-xs">
            <div class="flex justify-between font-bold text-sm text-slate-800">
              <span>\${b.booking_code}</span>
              <span class="px-2 py-0.5 rounded \${b.status === 'CONFIRMED' ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}">\${b.status}</span>
            </div>
            <div>ลูกค้า: <b>\${b.customer_name}</b> (\${b.customer_phone})</div>
            <div>รถ: <b>\${b.vehicle_name}</b> (\${b.vehicle_code})</div>
            <div>รอบเวลา: \${b.slot_date} \${b.slot_start_time} - \${b.slot_end_time} (\${b.duration_minutes} นาที)</div>
            \${b.status === 'CONFIRMED' 
              ? \`<button onclick="checkinBooking('\${b.booking_code}')" class="mt-2 w-full bg-emerald-600 hover:bg-emerald-700 text-white font-medium py-2 rounded-lg text-xs">🚀 ปล่อยรถและเริ่มจับเวลา (Check-in)</button>\`
              : \`<button disabled class="mt-2 w-full bg-slate-200 text-slate-500 font-medium py-2 rounded-lg text-xs">ตั๋วยังไม่ได้รับการชำระเงิน</button>\`
            }
          </div>
        \`;
      } catch (err) {
        container.innerHTML = '<div class="p-3 bg-red-50 text-red-700 text-xs rounded-xl">ไม่สามารถเชื่อมต่อเซิร์ฟเวอร์ได้</div>';
      }
    }

    async function checkinBooking(bookingCode) {
      if (!confirm('ยืนยันสภาพรถปกติ และปล่อยรถเริ่มจับเวลา?')) return;
      try {
        const res = await fetch('/api/v1/rental-sessions/checkin', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ booking_code: bookingCode })
        });
        const json = await res.json();
        if (json.success) {
          alert('✅ เริ่มจับเวลาเรียบร้อย! รถเข้าสู่สนามแล้ว');
          document.getElementById('bookingLookupResult').classList.add('hidden');
          document.getElementById('scanBookingCode').value = '';
          loadActiveSessions();
        } else {
          alert('❌ ' + json.error.message);
        }
      } catch (err) {
        alert('Check-in ล้มเหลว');
      }
    }

    async function loadActiveSessions() {
      const list = document.getElementById('activeSessionsList');
      try {
        const res = await fetch('/api/v1/rental-sessions/active');
        const json = await res.json();
        if (!json.success || json.data.length === 0) {
          list.innerHTML = '<div class="text-center py-8 text-slate-400 text-sm">ไม่มีรถที่กำลังเล่นในขณะนี้</div>';
          return;
        }

        list.innerHTML = '';
        json.data.forEach(s => {
          const item = document.createElement('div');
          item.className = 'p-4 rounded-xl border border-slate-200 bg-slate-50 flex flex-col md:flex-row justify-between items-start md:items-center gap-3';
          
          let timerBadge = '';
          if (s.is_overdue) {
            timerBadge = \`<span class="bg-red-500 text-white font-bold text-xs px-2.5 py-1 rounded-md animate-pulse">เกินเวลา +\${s.overtime_minutes} นาที</span>\`;
          } else if (s.remaining_minutes <= 5) {
            timerBadge = \`<span class="bg-amber-500 text-white font-bold text-xs px-2.5 py-1 rounded-md">เหลือ \${s.remaining_minutes} นาที (ใกล้หมด)</span>\`;
          } else {
            timerBadge = \`<span class="bg-emerald-600 text-white font-bold text-xs px-2.5 py-1 rounded-md">เหลือ \${s.remaining_minutes} นาที</span>\`;
          }

          item.innerHTML = \`
            <div>
              <div class="flex items-center gap-2 mb-1">
                <span class="font-bold text-sm text-slate-800">\${s.vehicle_code} - \${s.vehicle_name}</span>
                \${timerBadge}
              </div>
              <div class="text-xs text-slate-500">
                ตั๋ว: <span class="font-mono">\${s.booking_code}</span> | ลูกค้า: \${s.customer_name} (\${s.customer_phone})
              </div>
            </div>
            <button onclick="checkoutPreview('\${s.session_id}')" class="bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold px-4 py-2 rounded-xl transition shrink-0">
              รับคืนรถ (Check-out)
            </button>
          \`;
          list.appendChild(item);
        });
      } catch (err) {
        list.innerHTML = '<div class="text-center py-4 text-red-500 text-xs">เกิดข้อผิดพลาดในการโหลดรายการ</div>';
      }
    }

    async function loadFleetCharging() {
      const container = document.getElementById('fleetChargingList');
      try {
        const res = await fetch('/api/v1/vehicles?status=ALL');
        const json = await res.json();
        container.innerHTML = '';

        json.data.forEach(v => {
          const item = document.createElement('div');
          item.className = 'p-3 rounded-xl border border-slate-200 bg-slate-50 flex justify-between items-center text-xs';
          
          let cycleColor = 'text-slate-700';
          if (v.cycle_count >= 3) cycleColor = 'text-red-600 font-bold';
          else if (v.cycle_count === 2) cycleColor = 'text-amber-600 font-semibold';

          item.innerHTML = \`
            <div>
              <span class="font-bold text-slate-800">\${v.code}</span> - \${v.name}
              <div class="text-slate-500 mt-0.5">สถานะ: \${v.status} | รอบเล่น: <span class="\${cycleColor}">\${v.cycle_count}/3 รอบ</span></div>
            </div>
            <div>
              \${v.cycle_count > 0 || v.status === 'CHARGING'
                ? \`<button onclick="rechargeVehicle('\${v.id}')" class="bg-purple-600 hover:bg-purple-700 text-white px-3 py-1.5 rounded-lg font-medium transition">⚡ ชาร์จเต็มแล้ว</button>\`
                : \`<span class="text-emerald-600 font-medium">แบตเต็ม</span>\`
              }
            </div>
          \`;
          container.appendChild(item);
        });
      } catch (err) {}
    }

    async function rechargeVehicle(id) {
      if (!confirm('ยืนยันว่ารถคันนี้ชาร์จแบตเตอรี่เต็มพร้อมใช้งานแล้ว?')) return;
      try {
        const res = await fetch('/api/v1/fleet/' + id + '/recharge', { method: 'POST' });
        const json = await res.json();
        if (json.success) {
          alert('✅ รีเซ็ตรอบแบตเตอรี่และเปิดให้จองใหม่แล้ว!');
          loadFleetCharging();
          loadVehicles();
        }
      } catch (err) {
        alert('เกิดข้อผิดพลาดในการบันทึกการชาร์จ');
      }
    }

    async function checkoutPreview(sessionId) {
      try {
        const res = await fetch('/api/v1/rental-sessions/' + sessionId + '/checkout-preview', { method: 'POST' });
        const json = await res.json();
        if (!json.success) {
          alert('❌ ' + json.error.message);
          return;
        }

        const d = json.data;
        let message = '📋 สรุปรายการรับคืนรถ:\\n\\n';
        message += '• เวลาเล่นทั้งหมด: ' + d.elapsed_minutes + ' นาที (กำหนด: ' + d.duration_minutes + ' นาที)\\n';
        message += '• เวลาคืนช้ากว่ากำหนด: ' + d.overtime_raw_minutes + ' นาที (ผ่อนผัน Grace Period ' + d.grace_period_minutes + ' นาที)\\n';
        message += '• จำนวนนาทีที่คิดค่าปรับ: ' + d.settlement.billable_overtime_minutes + ' นาที\\n';
        message += '• ค่าปรับ: ' + (d.settlement.penalty_cents / 100) + ' บาท\\n';
        message += '-------------------------------------\\n';
        message += '💰 ยอดคืนเงินมัดจำสุทธิ: ' + (d.settlement.net_deposit_refund_cents / 100) + ' บาท\\n\\n';
        message += 'ต้องการยืนยัน Check-out ปิดรอบนี้เลยหรือไม่?';

        if (confirm(message)) {
          const completeRes = await fetch('/api/v1/rental-sessions/' + sessionId + '/complete', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ penalty_cents: d.settlement.penalty_cents })
          });
          const completeJson = await completeRes.json();
          if (completeJson.success) {
            alert('✅ ปิดรอบ Check-out สำเร็จ! รถพร้อมให้บริการหรือตัดเข้ารอบชาร์จเรียบร้อย');
            loadActiveSessions();
          } else {
            alert('❌ ' + completeJson.error.message);
          }
        }
      } catch (err) {
        alert('เกิดข้อผิดพลาดในการ Preview Check-out');
      }
    }

    // --- Admin Logic ---
    async function loadAdminMetrics() {
      try {
        const res = await fetch('/api/v1/admin/metrics');
        const json = await res.json();
        if (!json.success) return;
        const m = json.data;
        document.getElementById('metricRentalRevenue').textContent = (m.rental_revenue_cents / 100) + ' บาท';
        document.getElementById('metricPenaltyRevenue').textContent = (m.penalty_revenue_cents / 100) + ' บาท';
        document.getElementById('metricTotalBookings').textContent = m.total_bookings + ' รายการ';
        document.getElementById('metricActiveVehicles').textContent = m.available_vehicles + ' คัน';

        const txList = document.getElementById('adminTxList');
        txList.innerHTML = '';
        if (m.recent_transactions.length === 0) {
          txList.innerHTML = '<div class="text-center py-6 text-slate-400">ยังไม่มีรายการธุรกรรมในระบบ</div>';
          return;
        }

        m.recent_transactions.forEach(t => {
          const div = document.createElement('div');
          div.className = 'p-3 bg-slate-50 border border-slate-200 rounded-xl flex justify-between items-center';
          div.innerHTML = \`
            <div>
              <span class="font-bold text-slate-800">\${t.transaction_type}</span>
              <span class="text-slate-400 text-xs ml-2">\${t.created_at}</span>
              <div class="text-slate-500 text-xs">ตั๋ว: \${t.booking_code || '-'} | ช่องทาง: \${t.payment_method}</div>
            </div>
            <div class="font-bold \${t.transaction_type === 'DEPOSIT_REFUND' ? 'text-slate-600' : 'text-emerald-600'}">
              \${t.transaction_type === 'DEPOSIT_REFUND' ? '-' : '+'}\${t.amount_cents / 100} บาท
            </div>
          \`;
          txList.appendChild(div);
        });
      } catch (err) {}
    }

    // --- AI Chatbot Floating Assistant Logic ---
    let chatHistory = [];

    function toggleChatWindow() {
      const win = document.getElementById('aiChatWindow');
      if (!win) return;
      const isHidden = win.classList.contains('hidden');
      if (isHidden) {
        win.classList.remove('hidden');
        document.getElementById('aiChatInput').focus();
        scrollChatToBottom();
      } else {
        win.classList.add('hidden');
      }
    }

    function scrollChatToBottom() {
      const container = document.getElementById('aiChatMessages');
      if (container) {
        container.scrollTop = container.scrollHeight;
      }
    }

    function sendQuickPrompt(promptText) {
      document.getElementById('aiChatInput').value = promptText;
      handleSendChat();
    }

    function clearChatHistory() {
      chatHistory = [];
      const messagesContainer = document.getElementById('aiChatMessages');
      if (!messagesContainer) return;
      messagesContainer.innerHTML = \`
        <div class="flex gap-2 items-start">
          <div class="w-7 h-7 rounded-full bg-indigo-100 text-indigo-700 flex items-center justify-center text-sm shrink-0 shadow-xs">
            🤖
          </div>
          <div class="bg-white p-3 rounded-2xl rounded-tl-none border border-slate-200 shadow-sm text-slate-700 leading-relaxed max-w-[85%] space-y-1.5">
            <div>ล้างบทสนทนาเรียบร้อยครับ! มีอะไรให้น้องรถด่วนช่วยแนะนำอีกไหมครับ 🏎️✨</div>
          </div>
        </div>
        <div id="aiQuickChips" class="space-y-1.5 pt-1">
          <div class="text-[10px] text-slate-400 font-semibold uppercase tracking-wider pl-9">คำถามที่พบบ่อย:</div>
          <div class="flex flex-wrap gap-1.5 pl-9">
            <button onclick="sendQuickPrompt('ตอนนี้มีรถว่างกี่คันครับ?')" class="bg-indigo-50 hover:bg-indigo-100 text-indigo-700 px-2.5 py-1 rounded-full text-[11px] border border-indigo-200 transition">
              🚗 รถว่างตอนนี้มีกี่คัน?
            </button>
            <button onclick="sendQuickPrompt('ค่าเช่าและเงินมัดจำคิดยังไง?')" class="bg-indigo-50 hover:bg-indigo-100 text-indigo-700 px-2.5 py-1 rounded-full text-[11px] border border-indigo-200 transition">
              💰 ค่าเช่า & เงินมัดจำ
            </button>
            <button onclick="sendQuickPrompt('คืนรถช้ามีค่าปรับไหม มีเวลาผ่อนผันไหม?')" class="bg-indigo-50 hover:bg-indigo-100 text-indigo-700 px-2.5 py-1 rounded-full text-[11px] border border-indigo-200 transition">
              ⏱️ ค่าปรับ & ผ่อนผัน
            </button>
            <button onclick="sendQuickPrompt('เด็ก 3 ขวบ แนะนำรุ่นไหนดีครับ?')" class="bg-indigo-50 hover:bg-indigo-100 text-indigo-700 px-2.5 py-1 rounded-full text-[11px] border border-indigo-200 transition">
              👶 แนะนำรถตามวัยเด็ก
            </button>
          </div>
        </div>
      \`;
    }

    function formatMarkdown(text) {
      if (!text) return '';
      let escaped = text
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
      
      escaped = escaped.replace(/\\*\\*(.*?)\\*\\*/g, '<b>$1</b>');
      escaped = escaped.replace(/\\*(.*?)\\*/g, '<i>$1</i>');
      escaped = escaped.replace(/\\n/g, '<br>');
      return escaped;
    }

    async function handleSendChat(e) {
      if (e) e.preventDefault();
      const input = document.getElementById('aiChatInput');
      const message = input.value.trim();
      if (!message) return;

      input.value = '';
      const messagesContainer = document.getElementById('aiChatMessages');
      if (!messagesContainer) return;

      // Append User Bubble
      const userBubble = document.createElement('div');
      userBubble.className = 'flex justify-end';
      userBubble.innerHTML = \`
        <div class="bg-indigo-600 text-white p-3 rounded-2xl rounded-tr-none shadow-sm leading-relaxed max-w-[85%]">
          \${formatMarkdown(message)}
        </div>
      \`;
      messagesContainer.appendChild(userBubble);
      scrollChatToBottom();

      // Show typing indicator
      const typingIndicator = document.getElementById('aiTypingIndicator');
      if (typingIndicator) typingIndicator.classList.remove('hidden');
      scrollChatToBottom();

      chatHistory.push({ role: 'user', content: message });

      try {
        const res = await fetch('/api/v1/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            message: message,
            history: chatHistory.slice(-4)
          })
        });

        const json = await res.json();
        if (typingIndicator) typingIndicator.classList.add('hidden');

        let botReply = '';
        if (json.success && json.reply) {
          botReply = json.reply;
        } else {
          botReply = 'ขออภัยครับ เกิดข้อผิดพลาดในการประมวลผลข้อความ กรุณาลองใหม่อีกครั้งครับ';
        }

        chatHistory.push({ role: 'assistant', content: botReply });

        // Append Bot Bubble
        const botBubble = document.createElement('div');
        botBubble.className = 'flex gap-2 items-start';
        botBubble.innerHTML = \`
          <div class="w-7 h-7 rounded-full bg-indigo-100 text-indigo-700 flex items-center justify-center text-sm shrink-0 shadow-xs">
            🤖
          </div>
          <div class="bg-white p-3 rounded-2xl rounded-tl-none border border-slate-200 shadow-sm text-slate-700 leading-relaxed max-w-[85%]">
            \${formatMarkdown(botReply)}
          </div>
        \`;
        messagesContainer.appendChild(botBubble);
        scrollChatToBottom();
      } catch (err) {
        if (typingIndicator) typingIndicator.classList.add('hidden');
        const errBubble = document.createElement('div');
        errBubble.className = 'flex gap-2 items-start';
        errBubble.innerHTML = \`
          <div class="w-7 h-7 rounded-full bg-red-100 text-red-600 flex items-center justify-center text-sm shrink-0">
            ⚠️
          </div>
          <div class="bg-red-50 border border-red-200 text-red-700 p-3 rounded-2xl rounded-tl-none leading-relaxed max-w-[85%]">
            ขออภัยครับ ไม่สามารถเชื่อมต่อกับเซิร์ฟเวอร์ AI ได้ในขณะนี้ กรุณาลองใหม่อีกครั้งครับ
          </div>
        \`;
        messagesContainer.appendChild(errBubble);
        scrollChatToBottom();
      }
    }

    // Auto-init on page load
    checkSavedUser();
    loadVehicles();
  </script>
</body>
</html>`;
}

// =============================================================================
// Route: Web UI Portal
// =============================================================================
app.get('/', (c) => {
  return c.html(renderPortalHtml());
});

// =============================================================================
// Route: AI Chatbot Assistant (น้องรถด่วน AI)
// =============================================================================
app.post('/api/v1/chat', async (c) => {
  try {
    const body = await c.req.json<{ message?: string; history?: any[] }>().catch(() => ({ message: '', history: [] }));
    const userMessage = body?.message?.trim();
    if (!userMessage) {
      return c.json({ success: false, error: { message: 'กรุณาระบุข้อความสำหรับสนทนากับ AI' } }, 400);
    }

    // ดึงข้อมูลสถานะรถล่าสุดจาก Cloudflare D1
    const { results: fleet } = await c.env.DB.prepare('SELECT * FROM vehicles').all<VehicleInfo>();

    // ประมวลผลคำตอบผ่าน AI Assistant
    const reply = await generateBotResponse(userMessage, fleet || [], body.history || [], c.env.AI);

    return c.json({
      success: true,
      reply,
      timestamp: new Date().toISOString()
    });
  } catch (err: any) {
    return c.json({
      success: false,
      error: { message: 'เกิดข้อผิดพลาดในการประมวลผลของ AI: ' + err.message }
    }, 500);
  }
});

// =============================================================================
// Route: Google Authentication
// =============================================================================
app.post('/api/v1/auth/google', async (c) => {
  try {
    const body = await c.req.json<{ credential?: string }>().catch(() => ({ credential: undefined }));
    const credential = body?.credential;
    if (!credential) {
      return c.json({ success: false, error: { message: 'Missing credential token' } }, 400);
    }

    // ตรวจสอบ Google ID Token กับ Google TokenInfo Endpoint
    const gResp = await fetch('https://oauth2.googleapis.com/tokeninfo?id_token=' + encodeURIComponent(credential));
    if (!gResp.ok) {
      return c.json({ success: false, error: { message: 'Google Token Verification Failed' } }, 401);
    }
    const payload = await gResp.json<any>();

    const email = payload.email?.toLowerCase();
    const name = payload.name || payload.given_name || 'ผู้ใช้งาน Google';
    const picture = payload.picture || '';
    const userId = 'usr_' + (payload.sub || Math.random().toString(36).substring(2, 10));

    // กำหนดบทบาท: อีเมล seree999@gmail.com ได้รับสิทธิ์ ADMIN เสมอ
    const role = (email === ADMIN_EMAIL.toLowerCase()) ? 'ADMIN' : 'CUSTOMER';
    const nowIso = new Date().toISOString();

    // บันทึกลงตาราง users ใน Cloudflare D1
    await c.env.DB.prepare(`
      INSERT INTO users (id, email, name, picture, role, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(email) DO UPDATE SET
        name = excluded.name,
        picture = excluded.picture,
        role = CASE WHEN excluded.email = '${ADMIN_EMAIL.toLowerCase()}' THEN 'ADMIN' ELSE users.role END,
        updated_at = excluded.updated_at
    `).bind(userId, email, name, picture, role, nowIso, nowIso).run();

    // ดึงข้อมูล User ล่าสุดจาก Database
    const user = await c.env.DB.prepare('SELECT id, email, name, picture, role FROM users WHERE email = ?').bind(email).first();

    return c.json({
      success: true,
      user
    });
  } catch (err: any) {
    return c.json({ success: false, error: { message: 'Authentication error: ' + err.message } }, 500);
  }
});

// =============================================================================
// Validation Schemas for Email/Password Auth
// =============================================================================
const RegisterSchema = z.object({
  email: z.string().email('รูปแบบอีเมลไม่ถูกต้อง'),
  password: z.string().min(6, 'รหัสผ่านต้องมีความยาวอย่างน้อย 6 ตัวอักษร'),
  name: z.string().min(2, 'กรุณาระบุชื่อ-นามสกุลอย่างน้อย 2 ตัวอักษร')
});

const LoginSchema = z.object({
  email: z.string().email('รูปแบบอีเมลไม่ถูกต้อง'),
  password: z.string().min(1, 'กรุณาระบุรหัสผ่าน')
});

// =============================================================================
// Route: Register with Email & Password
// =============================================================================
app.post('/api/v1/auth/register', zValidator('json', RegisterSchema), async (c) => {
  const { email, password, name } = c.req.valid('json');
  const normalizedEmail = email.toLowerCase().trim();
  const db = c.env.DB;

  try {
    const existing = await db.prepare('SELECT id, email, password_hash, role FROM users WHERE email = ?').bind(normalizedEmail).first<any>();
    const { hash, salt } = await hashPassword(password);
    const nowIso = new Date().toISOString();
    const role = (normalizedEmail === ADMIN_EMAIL.toLowerCase()) ? 'ADMIN' : 'CUSTOMER';

    if (existing) {
      if (existing.password_hash) {
        return c.json({ success: false, error: { message: 'อีเมลนี้ถูกลงทะเบียนไว้แล้ว กรุณาเข้าสู่ระบบ' } }, 409);
      }
      // เคยเข้าผ่าน Google แต่เพิ่มรหัสผ่าน
      await db.prepare(`
        UPDATE users 
        SET password_hash = ?, password_salt = ?, name = COALESCE(NULLIF(name, ''), ?), updated_at = ?
        WHERE email = ?
      `).bind(hash, salt, name.trim(), nowIso, normalizedEmail).run();

      const updated = await db.prepare('SELECT id, email, name, picture, role FROM users WHERE email = ?').bind(normalizedEmail).first<any>();
      return c.json({ success: true, message: 'ตั้งรหัสผ่านสำเร็จ', user: updated });
    }

    const userId = 'usr_' + Math.random().toString(36).substring(2, 10);
    await db.prepare(`
      INSERT INTO users (id, email, name, picture, role, password_hash, password_salt, created_at, updated_at)
      VALUES (?, ?, ?, '', ?, ?, ?, ?, ?)
    `).bind(userId, normalizedEmail, name.trim(), role, hash, salt, nowIso, nowIso).run();

    const newUser = await db.prepare('SELECT id, email, name, picture, role FROM users WHERE id = ?').bind(userId).first<any>();
    return c.json({ success: true, message: 'สมัครสมาชิกสำเร็จ', user: newUser });
  } catch (err: any) {
    return c.json({ success: false, error: { message: 'เกิดข้อผิดพลาดในการสมัครสมาชิก: ' + err.message } }, 500);
  }
});

// =============================================================================
// Route: Login with Email & Password
// =============================================================================
app.post('/api/v1/auth/login', zValidator('json', LoginSchema), async (c) => {
  const { email, password } = c.req.valid('json');
  const normalizedEmail = email.toLowerCase().trim();
  const db = c.env.DB;

  try {
    const user = await db.prepare('SELECT * FROM users WHERE email = ?').bind(normalizedEmail).first<any>();
    if (!user || !user.password_hash || !user.password_salt) {
      return c.json({ success: false, error: { message: 'อีเมลหรือรหัสผ่านไม่ถูกต้อง หรือยังไม่ได้ตั้งรหัสผ่าน' } }, 401);
    }

    const { hash: computedHash } = await hashPassword(password, user.password_salt);
    if (!constantTimeCompare(user.password_hash, computedHash)) {
      return c.json({ success: false, error: { message: 'อีเมลหรือรหัสผ่านไม่ถูกต้อง' } }, 401);
    }

    // กำหนดสิทธิ์ ADMIN เสมอสำหรับ ADMIN_EMAIL
    let role = user.role;
    if (normalizedEmail === ADMIN_EMAIL.toLowerCase() && role !== 'ADMIN') {
      role = 'ADMIN';
      await db.prepare("UPDATE users SET role = 'ADMIN' WHERE email = ?").bind(normalizedEmail).run();
    }

    return c.json({
      success: true,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        picture: user.picture || '',
        role: role
      }
    });
  } catch (err: any) {
    return c.json({ success: false, error: { message: 'เกิดข้อผิดพลาดในการเข้าสู่ระบบ: ' + err.message } }, 500);
  }
});

// =============================================================================
// Route: Health Check
// =============================================================================
app.get('/api/v1/health', async (c) => {
  try {
    const count = await c.env.DB.prepare('SELECT count(*) as total FROM vehicles').first<{ total: number }>();
    return c.json({
      status: 'HEALTHY',
      database: 'CONNECTED',
      total_vehicles: count?.total ?? 0,
      timestamp: new Date().toISOString()
    });
  } catch (err: any) {
    return c.json({
      status: 'UNHEALTHY',
      database: 'ERROR',
      error: err.message,
      timestamp: new Date().toISOString()
    }, 500);
  }
});

// =============================================================================
// Route: Vehicles Catalog
// =============================================================================
app.get('/api/v1/vehicles', async (c) => {
  const category = c.req.query('category');
  const status = c.req.query('status') || 'AVAILABLE';

  let query = 'SELECT * FROM vehicles WHERE 1=1';
  const params: any[] = [];

  if (category) {
    query += ' AND category = ?';
    params.push(category);
  }
  if (status !== 'ALL') {
    query += ' AND status = ?';
    params.push(status);
  }

  const { results } = await c.env.DB.prepare(query).bind(...params).all();
  return c.json({
    success: true,
    count: results.length,
    data: results
  });
});

app.get('/api/v1/vehicles/:id', async (c) => {
  const id = c.req.param('id');
  const vehicle = await c.env.DB.prepare('SELECT * FROM vehicles WHERE id = ? OR code = ?')
    .bind(id, id)
    .first();

  if (!vehicle) {
    return c.json({
      success: false,
      error: { code: 'VEHICLE_NOT_FOUND', message: 'ไม่พบรถหมายเลขนี้ในระบบ' }
    }, 404);
  }

  return c.json({ success: true, data: vehicle });
});

// =============================================================================
// Route: Booking Hold
// =============================================================================
const HoldSlotSchema = z.object({
  vehicle_id: z.string().min(1, 'ต้องระบุ vehicle_id'),
  customer_name: z.string().trim().min(2, 'ชื่อต้องมีอย่างน้อย 2 ตัวอักษร'),
  customer_phone: z.string()
    .trim()
    .transform((val) => val.replace(/[\s-]/g, '').replace(/^\+66/, '0'))
    .pipe(z.string().regex(/^0[689]\d{8}$/, 'เบอร์โทรศัพท์ต้องเป็นเบอร์มือถือ 10 หลัก')),
  slot_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'รูปแบบวันที่ต้องเป็น YYYY-MM-DD'),
  slot_start_time: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'รูปแบบเวลาต้องเป็น HH:MM'),
  duration_minutes: z.union([z.literal(15), z.literal(30), z.literal(60)])
});

app.post('/api/v1/bookings/hold', zValidator('json', HoldSlotSchema), async (c) => {
  const body = c.req.valid('json');
  const db = c.env.DB;

  const vehicle = await db.prepare('SELECT * FROM vehicles WHERE id = ?').bind(body.vehicle_id).first<any>();
  if (!vehicle) {
    return c.json({ success: false, error: { code: 'VEHICLE_NOT_FOUND', message: 'ไม่พบรถที่ระบุ' } }, 404);
  }
  if (vehicle.status !== 'AVAILABLE') {
    return c.json({
      success: false,
      error: { code: 'VEHICLE_NOT_AVAILABLE', message: `รถคันนี้อยู่ในสถานะ ${vehicle.status} ยังไม่พร้อมให้บริการ` }
    }, 422);
  }

  const nowIso = new Date().toISOString();
  const holdExpiresAtIso = new Date(Date.now() + BUSINESS_RULES.BOOKING.HOLD_TTL_MS).toISOString();
  const bookingId = 'bk_' + Math.random().toString(36).substring(2, 10);
  const randomSuffix = Math.floor(1000 + Math.random() * 9000);
  const dateStr = body.slot_date.replace(/-/g, '');
  const bookingCode = `BK-${dateStr}-${randomSuffix}`;

  const [startH, startM] = body.slot_start_time.split(':').map(Number);
  const endTotalMinutes = startH * 60 + startM + body.duration_minutes;
  const endH = String(Math.floor(endTotalMinutes / 60) % 24).padStart(2, '0');
  const endM = String(endTotalMinutes % 60).padStart(2, '0');
  const slotEndTime = `${endH}:${endM}`;

  const rentAmountCents = BUSINESS_RULES.PRICING.DURATION_RATES[body.duration_minutes] || 15_000;
  const depositAmountCents = BUSINESS_RULES.PRICING.DEFAULT_DEPOSIT_CENTS;
  const totalAmountCents = rentAmountCents + depositAmountCents;

  try {
    await db.batch([
      // 1. Invalidate expired hold
      db.prepare(`
        UPDATE bookings 
        SET status = 'CANCELLED', updated_at = ?
        WHERE vehicle_id = ? AND slot_date = ? AND slot_start_time = ?
          AND status = 'HOLD' AND hold_expires_at <= ?
      `).bind(nowIso, body.vehicle_id, body.slot_date, body.slot_start_time, nowIso),

      // 2. Insert new hold
      db.prepare(`
        INSERT INTO bookings (
          id, booking_code, vehicle_id, customer_name, customer_phone,
          slot_date, slot_start_time, slot_end_time, duration_minutes,
          status, hold_expires_at, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'HOLD', ?, ?, ?)
      `).bind(
        bookingId, bookingCode, body.vehicle_id, body.customer_name, body.customer_phone,
        body.slot_date, body.slot_start_time, slotEndTime, body.duration_minutes,
        holdExpiresAtIso, nowIso, nowIso
      )
    ]);

    return c.json({
      success: true,
      data: {
        booking_id: bookingId,
        booking_code: bookingCode,
        vehicle_code: vehicle.code,
        vehicle_name: vehicle.name,
        slot_date: body.slot_date,
        slot_time: `${body.slot_start_time} - ${slotEndTime}`,
        duration_minutes: body.duration_minutes,
        status: 'HOLD',
        hold_expires_at: holdExpiresAtIso,
        pricing: {
          rent_cents: rentAmountCents,
          deposit_cents: depositAmountCents,
          total_cents: totalAmountCents,
          currency: 'THB'
        }
      }
    }, 201);
  } catch (err: any) {
    if (err?.message?.includes('UNIQUE constraint failed')) {
      return c.json({
        success: false,
        error: { code: 'SLOT_ALREADY_RESERVED', message: 'รอบเวลานี้ถูกจองหรือมีผู้กักสิทธิ์อยู่แล้ว กรุณาเลือกรอบอื่น' }
      }, 409);
    }
    return c.json({ success: false, error: { code: 'INTERNAL_ERROR', message: err.message } }, 500);
  }
});

// =============================================================================
// Route: Confirm Payment (Simulated PromptPay Payment)
// =============================================================================
app.post('/api/v1/bookings/:bookingCode/confirm', async (c) => {
  const code = c.req.param('bookingCode');
  const db = c.env.DB;

  const booking = await db.prepare('SELECT * FROM bookings WHERE booking_code = ? OR id = ?').bind(code, code).first<any>();
  if (!booking) {
    return c.json({ success: false, error: { code: 'BOOKING_NOT_FOUND', message: 'ไม่พบรายการจองนี้' } }, 404);
  }
  if (booking.status !== 'HOLD') {
    return c.json({ success: false, error: { code: 'INVALID_STATUS', message: `ตั๋วนี้อยู่ในสถานะ ${booking.status} ไม่สามารถยืนยันซ้ำได้` } }, 400);
  }

  const nowIso = new Date().toISOString();
  const txId = 'tx_' + Math.random().toString(36).substring(2, 10);
  const totalCents = (BUSINESS_RULES.PRICING.DURATION_RATES[booking.duration_minutes] || 15000) + BUSINESS_RULES.PRICING.DEFAULT_DEPOSIT_CENTS;

  await db.batch([
    db.prepare("UPDATE bookings SET status = 'CONFIRMED', updated_at = ? WHERE id = ?").bind(nowIso, booking.id),
    db.prepare(`
      INSERT INTO payment_transactions (id, booking_id, transaction_type, amount_cents, payment_method, status, paid_at, created_at)
      VALUES (?, ?, 'RENTAL_FEE', ?, 'PROMPTPAY', 'SUCCESS', ?, ?)
    `).bind(txId, booking.id, totalCents, nowIso, nowIso)
  ]);

  return c.json({
    success: true,
    data: {
      booking_code: booking.booking_code,
      status: 'CONFIRMED',
      paid_at: nowIso,
      amount_paid_cents: totalCents
    }
  });
});

// =============================================================================
// Route: Booking Lookup
// =============================================================================
app.get('/api/v1/bookings/:bookingCode', async (c) => {
  const code = c.req.param('bookingCode');
  const booking = await c.env.DB.prepare(`
    SELECT b.*, v.code as vehicle_code, v.name as vehicle_name
    FROM bookings b
    JOIN vehicles v ON b.vehicle_id = v.id
    WHERE b.booking_code = ? OR b.id = ?
  `).bind(code, code).first();

  if (!booking) {
    return c.json({ success: false, error: { code: 'BOOKING_NOT_FOUND', message: 'ไม่พบรายการจองนี้' } }, 404);
  }

  return c.json({ success: true, data: booking });
});

// =============================================================================
// Route: Staff Check-in (Start Session & Timer)
// =============================================================================
app.post('/api/v1/rental-sessions/checkin', async (c) => {
  const body = await c.req.json<{ booking_code: string; condition_before?: string }>().catch(() => ({} as any));
  const db = c.env.DB;

  const booking = await db.prepare('SELECT * FROM bookings WHERE booking_code = ?').bind(body.booking_code).first<any>();
  if (!booking) {
    return c.json({ success: false, error: { code: 'BOOKING_NOT_FOUND', message: 'ไม่พบรหัสการจองนี้' } }, 404);
  }
  if (booking.status !== 'CONFIRMED') {
    return c.json({ success: false, error: { code: 'BOOKING_NOT_CONFIRMED', message: `ตั๋วนี้มีสถานะ ${booking.status} ยังไม่พร้อมสำหรับ Check-in` } }, 400);
  }

  const now = new Date();
  const nowIso = now.toISOString();
  const scheduledEnd = new Date(now.getTime() + booking.duration_minutes * 60 * 1000);
  const scheduledEndIso = scheduledEnd.toISOString();
  const sessionId = 'ses_' + Math.random().toString(36).substring(2, 10);

  await db.batch([
    // 1. สร้างรอบการเช่า
    db.prepare(`
      INSERT INTO rental_sessions (
        id, booking_id, vehicle_id, staff_checkin_id, start_time, scheduled_end_time,
        grace_period_minutes, status, condition_before, created_at, updated_at
      ) VALUES (?, ?, ?, 'staff_01', ?, ?, 5, 'ACTIVE', ?, ?, ?)
    `).bind(sessionId, booking.id, booking.vehicle_id, nowIso, scheduledEndIso, body.condition_before || 'ปกติ', nowIso, nowIso),

    // 2. ปรับสถานะตั๋วเป็น COMPLETED
    db.prepare("UPDATE bookings SET status = 'COMPLETED', updated_at = ? WHERE id = ?").bind(nowIso, booking.id),

    // 3. ปรับสถานะรถเป็น IN_USE
    db.prepare("UPDATE vehicles SET status = 'IN_USE', updated_at = ? WHERE id = ?").bind(nowIso, booking.vehicle_id)
  ]);

  return c.json({
    success: true,
    data: {
      session_id: sessionId,
      booking_code: booking.booking_code,
      start_time: nowIso,
      scheduled_end_time: scheduledEndIso,
      duration_minutes: booking.duration_minutes
    }
  });
});

// =============================================================================
// Route: Active Sessions Monitor
// =============================================================================
app.get('/api/v1/rental-sessions/active', async (c) => {
  const { results } = await c.env.DB.prepare(`
    SELECT s.id as session_id, s.start_time, s.scheduled_end_time, s.grace_period_minutes,
           b.booking_code, b.customer_name, b.customer_phone, b.duration_minutes,
           v.code as vehicle_code, v.name as vehicle_name
    FROM rental_sessions s
    JOIN bookings b ON s.booking_id = b.id
    JOIN vehicles v ON s.vehicle_id = v.id
    WHERE s.status = 'ACTIVE'
    ORDER BY s.scheduled_end_time ASC
  `).all<any>();

  const now = Date.now();
  const sessions = results.map(s => {
    const endMs = new Date(s.scheduled_end_time).getTime();
    const remainingSeconds = Math.round((endMs - now) / 1000);
    const isOverdue = remainingSeconds < 0;
    const overtimeMinutes = isOverdue ? Math.ceil(Math.abs(remainingSeconds) / 60) : 0;
    const remainingMinutes = !isOverdue ? Math.ceil(remainingSeconds / 60) : 0;

    return {
      ...s,
      is_overdue: isOverdue,
      overtime_minutes: overtimeMinutes,
      remaining_minutes: remainingMinutes
    };
  });

  return c.json({ success: true, count: sessions.length, data: sessions });
});

// =============================================================================
// Route: Check-out Preview (Calculate Overtime & Penalty)
// =============================================================================
app.post('/api/v1/rental-sessions/:id/checkout-preview', async (c) => {
  const sessionId = c.req.param('id');
  const session = await c.env.DB.prepare(`
    SELECT s.*, b.duration_minutes, v.cycle_count
    FROM rental_sessions s
    JOIN bookings b ON s.booking_id = b.id
    JOIN vehicles v ON s.vehicle_id = v.id
    WHERE s.id = ?
  `).bind(sessionId).first<any>();

  if (!session) {
    return c.json({ success: false, error: { code: 'SESSION_NOT_FOUND', message: 'ไม่พบรอบการเล่นนี้' } }, 404);
  }

  const startMs = new Date(session.start_time).getTime();
  const scheduledEndMs = new Date(session.scheduled_end_time).getTime();
  const nowMs = Date.now();

  const elapsedMinutes = Math.ceil((nowMs - startMs) / 60000);
  const diffSeconds = Math.max(0, (nowMs - scheduledEndMs) / 1000);
  const gracePeriodSeconds = session.grace_period_minutes * 60;

  let billableOvertimeMinutes = 0;
  let penaltyCents = 0;

  if (diffSeconds > gracePeriodSeconds) {
    const excessSeconds = diffSeconds - gracePeriodSeconds;
    billableOvertimeMinutes = Math.ceil(excessSeconds / 60);
    penaltyCents = billableOvertimeMinutes * BUSINESS_RULES.PRICING.PENALTY_PER_MINUTE_CENTS;
  }

  const depositCents = BUSINESS_RULES.PRICING.DEFAULT_DEPOSIT_CENTS;
  const netDepositRefundCents = Math.max(0, depositCents - penaltyCents);
  const additionalPaymentRequiredCents = Math.max(0, penaltyCents - depositCents);

  return c.json({
    success: true,
    data: {
      session_id: sessionId,
      elapsed_minutes: elapsedMinutes,
      duration_minutes: session.duration_minutes,
      overtime_raw_minutes: Math.ceil(diffSeconds / 60),
      grace_period_minutes: session.grace_period_minutes,
      settlement: {
        billable_overtime_minutes: billableOvertimeMinutes,
        penalty_cents: penaltyCents,
        deposit_cents: depositCents,
        net_deposit_refund_cents: netDepositRefundCents,
        additional_payment_required_cents: additionalPaymentRequiredCents
      }
    }
  });
});

// =============================================================================
// Route: Check-out Complete
// =============================================================================
app.post('/api/v1/rental-sessions/:id/complete', async (c) => {
  const sessionId = c.req.param('id');
  const body = await c.req.json<{ penalty_cents?: number; condition_after?: string }>().catch(() => ({} as any));
  const db = c.env.DB;

  const session = await db.prepare('SELECT * FROM rental_sessions WHERE id = ?').bind(sessionId).first<any>();
  if (!session) {
    return c.json({ success: false, error: { code: 'SESSION_NOT_FOUND', message: 'ไม่พบรอบการเล่นนี้' } }, 404);
  }

  const nowIso = new Date().toISOString();
  const vehicle = await db.prepare('SELECT * FROM vehicles WHERE id = ?').bind(session.vehicle_id).first<any>();
  const newCycleCount = (vehicle?.cycle_count || 0) + 1;
  const newStatus = newCycleCount >= BUSINESS_RULES.FLEET.MAX_CYCLES_BEFORE_CHARGING ? 'CHARGING' : 'AVAILABLE';

  const penaltyCents = body.penalty_cents || 0;
  const refundTxId = 'tx_' + Math.random().toString(36).substring(2, 10);
  const depositCents = BUSINESS_RULES.PRICING.DEFAULT_DEPOSIT_CENTS;
  const netRefundCents = Math.max(0, depositCents - penaltyCents);

  const statements = [
    // 1. ปิด Session
    db.prepare(`
      UPDATE rental_sessions 
      SET status = 'COMPLETED', actual_return_time = ?, penalty_amount_cents = ?, 
          condition_after = ?, updated_at = ?
      WHERE id = ?
    `).bind(nowIso, penaltyCents, body.condition_after || 'ปกติ', nowIso, sessionId),

    // 2. ปรับรอบสะสมรถ และสถานะ (ถ้าครบ 3 รอบ ตัดเป็น CHARGING)
    db.prepare(`
      UPDATE vehicles 
      SET status = ?, cycle_count = ?, updated_at = ?
      WHERE id = ?
    `).bind(newStatus, newCycleCount, nowIso, session.vehicle_id)
  ];

  // 3. บันทึก Transaction คืนมัดจำ (ถ้ามียอดคืน)
  if (netRefundCents > 0) {
    statements.push(
      db.prepare(`
        INSERT INTO payment_transactions (id, booking_id, session_id, transaction_type, amount_cents, payment_method, status, paid_at, created_at)
        VALUES (?, ?, ?, 'DEPOSIT_REFUND', ?, 'PROMPTPAY', 'SUCCESS', ?, ?)
      `).bind(refundTxId, session.booking_id, sessionId, netRefundCents, nowIso, nowIso)
    );
  }

  await db.batch(statements);

  return c.json({
    success: true,
    data: {
      session_id: sessionId,
      status: 'COMPLETED',
      vehicle_status: newStatus,
      vehicle_cycle_count: newCycleCount,
      net_deposit_refund_cents: netRefundCents
    }
  });
});

// =============================================================================
// Route: Fleet Recharge Battery
// =============================================================================
app.post('/api/v1/fleet/:id/recharge', async (c) => {
  const id = c.req.param('id');
  const db = c.env.DB;

  const vehicle = await db.prepare('SELECT * FROM vehicles WHERE id = ?').bind(id).first<any>();
  if (!vehicle) {
    return c.json({ success: false, error: { code: 'VEHICLE_NOT_FOUND', message: 'ไม่พบรถคันนี้' } }, 404);
  }

  const nowIso = new Date().toISOString();
  const logId = 'bat_' + Math.random().toString(36).substring(2, 10);

  await db.batch([
    db.prepare("UPDATE vehicles SET status = 'AVAILABLE', cycle_count = 0, updated_at = ? WHERE id = ?").bind(nowIso, id),
    db.prepare(`
      INSERT INTO battery_logs (id, vehicle_id, cycle_count_at_charge, staff_id, started_at, completed_at, status)
      VALUES (?, ?, ?, 'staff_01', ?, ?, 'COMPLETED')
    `).bind(logId, id, vehicle.cycle_count, nowIso, nowIso)
  ]);

  return c.json({
    success: true,
    data: {
      vehicle_id: id,
      status: 'AVAILABLE',
      cycle_count: 0,
      recharged_at: nowIso
    }
  });
});

// =============================================================================
// Route: Admin Metrics
// =============================================================================
app.get('/api/v1/admin/metrics', async (c) => {
  const db = c.env.DB;

  const totalBookings = await db.prepare('SELECT count(*) as count FROM bookings').first<{ count: number }>();
  const availableVehicles = await db.prepare("SELECT count(*) as count FROM vehicles WHERE status = 'AVAILABLE'").first<{ count: number }>();
  
  const rentRevenue = await db.prepare(`
    SELECT coalesce(sum(amount_cents), 0) as total 
    FROM payment_transactions 
    WHERE transaction_type = 'RENTAL_FEE' AND status = 'SUCCESS'
  `).first<{ total: number }>();

  const penaltyRevenue = await db.prepare(`
    SELECT coalesce(sum(penalty_amount_cents), 0) as total 
    FROM rental_sessions 
    WHERE status = 'COMPLETED'
  `).first<{ total: number }>();

  const { results: recentTx } = await db.prepare(`
    SELECT t.*, b.booking_code 
    FROM payment_transactions t
    LEFT JOIN bookings b ON t.booking_id = b.id
    ORDER BY t.created_at DESC LIMIT 10
  `).all();

  return c.json({
    success: true,
    data: {
      total_bookings: totalBookings?.count ?? 0,
      available_vehicles: availableVehicles?.count ?? 0,
      rental_revenue_cents: rentRevenue?.total ?? 0,
      penalty_revenue_cents: penaltyRevenue?.total ?? 0,
      recent_transactions: recentTx
    }
  });
});

export default app;
