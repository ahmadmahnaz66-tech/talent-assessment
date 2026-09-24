// js/admin/admin.js - نسخه سبک‌شده و هماهنگ‌کننده مرکزی

let currentStaffUser = null;

const ROLE_NAMES = {
  super_admin: 'مدیر ارشد سامانه',
  counselor: 'مشاور تخصصی',
  principal: 'مدیر مدرسه',
  vice_principal: 'معاون مدرسه',
  expose_coach: 'مربی مجاورت‌سازی'
};

window.addEventListener('DOMContentLoaded', async () => {
  checkAuthSession();
});

function checkAuthSession() {
  const savedUser = sessionStorage.getItem('staffUser');
  if (savedUser) {
    try {
      currentStaffUser = JSON.parse(savedUser);
      showDashboard();
      return;
    } catch (e) {
      sessionStorage.removeItem('staffUser');
    }
  }
  showLoginForm();
}

function showLoginForm() {
  const loginModal = document.getElementById('login-modal');
  const adminDashboard = document.getElementById('admin-dashboard');
  if (loginModal) loginModal.classList.remove('hidden');
  if (adminDashboard) adminDashboard.classList.add('hidden');
}

function showDashboard() {
  const loginModal = document.getElementById('login-modal');
  const adminDashboard = document.getElementById('admin-dashboard');
  if (loginModal) loginModal.classList.add('hidden');
  if (adminDashboard) adminDashboard.classList.remove('hidden');

  const nameEl = document.getElementById('user-display-name');
  const roleEl = document.getElementById('user-display-role');
  if (nameEl) nameEl.innerText = currentStaffUser.fullName || currentStaffUser.username;
  if (roleEl) roleEl.innerText = ROLE_NAMES[currentStaffUser.role] || currentStaffUser.role;

  // ۱. اعمال محدودیت اختصاصی و قفل کردن تب برای مربی مجاورت‌سازی
  if (currentStaffUser.role === 'expose_coach') {
    const tabs = ['students', 'individual', 'exposure', 'group', 'manage', 'staff'];
    tabs.forEach(t => {
      const btn = document.getElementById(`tab-btn-${t}`);
      if (btn) {
        btn.style.display = (t === 'exposure') ? '' : 'none';
      }
    });

    switchTab('exposure');
    if (typeof loadInitialMetadata === 'function') loadInitialMetadata();
    if (typeof loadStudentsList === 'function') loadStudentsList();
    return;
  }

  // ۲. نمایش کامل تب‌ها برای ادمین و سایر کادر مدرسه
  const tabs = ['students', 'individual', 'exposure', 'group', 'manage', 'staff'];
  tabs.forEach(t => {
    const btn = document.getElementById(`tab-btn-${t}`);
    if (btn) btn.style.display = '';
  });

  // مدیریت نمایش دسترسی‌های ویژه مدیر ارشد
  const testAiBtn = document.getElementById('btn-test-ai');
  if (testAiBtn) {
    testAiBtn.classList.toggle('hidden', currentStaffUser.role !== 'super_admin');
  }

  const addStaffBox = document.getElementById('add-staff-container');
  if (addStaffBox) {
    addStaffBox.classList.toggle('hidden', currentStaffUser.role !== 'super_admin');
  }

  if (typeof loadInitialMetadata === 'function') loadInitialMetadata();
  if (typeof loadStudentsList === 'function') loadStudentsList();
}

async function handleStaffLogin() {
  const usernameInput = document.getElementById('login-username');
  const passwordInput = document.getElementById('login-password');
  const errBox = document.getElementById('login-error');
  
  if (!usernameInput || !passwordInput) return;
  const username = usernameInput.value.trim();
  const password = passwordInput.value.trim();

  if (errBox) errBox.classList.add('hidden');

  if (!username || !password) {
    if (errBox) {
      errBox.innerText = 'نام کاربری و رمز عبور را وارد کنید.';
      errBox.classList.remove('hidden');
    }
    return;
  }

  try {
    const res = await fetch('/api/auth', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'staff-login', username, password })
    });

    const data = await res.json();
    if (!res.ok || !data.success) {
      if (errBox) {
        errBox.innerText = data.error || 'نام کاربری یا رمز نادرست است.';
        errBox.classList.remove('hidden');
      }
      return;
    }

    sessionStorage.setItem('staffUser', JSON.stringify(data.user));
    currentStaffUser = data.user;
    showDashboard();

  } catch (err) {
    if (errBox) {
      errBox.innerText = 'خطا در ارتباط با سرور.';
      errBox.classList.remove('hidden');
    }
  }
}

function handleStaffLogout() {
  sessionStorage.removeItem('staffUser');
  currentStaffUser = null;
  location.reload();
}

function switchTab(tabId) {
  if (currentStaffUser && currentStaffUser.role === 'expose_coach' && tabId !== 'exposure') {
    alert('شما فقط به تب مجاورت‌سازی دسترسی دارید.');
    return;
  }

  document.querySelectorAll('.tab-content').forEach(el => el.classList.add('hidden'));
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.className = 'tab-btn px-4 py-2 rounded-xl text-xs font-bold bg-white text-slate-600 hover:bg-slate-50 border border-slate-200 transition';
  });

  if (tabId === 'group' && typeof loadAnalyticsDashboard === 'function') {
    loadAnalyticsDashboard();
  }

  const activeContent = document.getElementById(`tab-content-${tabId}`);
  const activeBtn = document.getElementById(`tab-btn-${tabId}`);

  if (activeContent) activeContent.classList.remove('hidden');
  if (activeBtn) activeBtn.className = 'tab-btn px-4 py-2 rounded-xl text-xs font-bold bg-indigo-600 text-white transition';

  if (tabId === 'manage' && typeof loadQuestionsForAdmin === 'function') {
    const manageSelect = document.getElementById('manage-skill-select');
    if (manageSelect && manageSelect.value) loadQuestionsForAdmin(manageSelect.value);
  } else if (tabId === 'staff' && typeof loadStaffList === 'function') {
    loadStaffList();
  }
}
