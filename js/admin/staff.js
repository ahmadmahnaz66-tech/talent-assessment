// js/admin/staff.js

async function handleStaffLogin() {
  const username = document.getElementById('login-username').value.trim();
  const password = document.getElementById('login-password').value.trim();
  const errBox = document.getElementById('login-error');
  errBox.classList.add('hidden');

  if (!username || !password) {
    errBox.innerText = 'نام کاربری و رمز عبور را وارد کنید.';
    errBox.classList.remove('hidden');
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
      errBox.innerText = data.error || 'نام کاربری یا رمز نادرست است.';
      errBox.classList.remove('hidden');
      return;
    }

    sessionStorage.setItem('staffUser', JSON.stringify(data.user));
    currentStaffUser = data.user;
    showDashboard();

  } catch (err) {
    errBox.innerText = 'خطا در ارتباط با سرور.';
    errBox.classList.remove('hidden');
  }
}

function handleStaffLogout() {
  sessionStorage.removeItem('staffUser');
  currentStaffUser = null;
  location.reload();
}

async function loadStaffList() {
  try {
    const res = await fetch('/api/auth?type=school');
    const staffList = await res.json();
    const tbody = document.getElementById('staff-table-body');

    if (!staffList || staffList.length === 0) {
      tbody.innerHTML = '<tr><td colspan="4" class="p-4 text-center text-slate-400">هیچ پرسنلی یافت نشد.</td></tr>';
      return;
    }

    const isSuperAdmin = currentStaffUser && currentStaffUser.role === 'super_admin';

    tbody.innerHTML = staffList.map(s => `
      <tr class="hover:bg-slate-50 transition">
        <td class="p-3 font-bold text-slate-800">${s.full_name}</td>
        <td class="p-3 text-slate-600 font-mono">${s.username}</td>
        <td class="p-3"><span class="bg-purple-50 text-purple-700 px-2.5 py-1 rounded-lg text-[11px] font-bold">${ROLE_NAMES[s.role] || s.role}</span></td>
        <td class="p-3 text-left">
          ${(isSuperAdmin && s.role !== 'super_admin') 
            ? `<button onclick="deleteStaff(${s.id})" class="text-red-500 hover:text-red-700 text-xs font-bold bg-red-50 px-2 py-1 rounded-lg">حذف دسترسی</button>` 
            : '<span class="text-slate-400 text-[11px]">-</span>'}
        </td>
      </tr>
    `).join('');
  } catch (e) {
    console.error('خطا در لیست پرسنل:', e);
  }
}

async function handleCreateStaff() {
  const full_name = document.getElementById('staff-name').value.trim();
  const username = document.getElementById('staff-username').value.trim();
  const password = document.getElementById('staff-password').value.trim();
  const role = document.getElementById('staff-role').value;

  if (!full_name || !username || !password) return alert('تمام فیلدها را پر کنید.');
  if (password.length < 5) return alert('رمز عبور باید حداقل ۵ رقم باشد.');

  const res = await fetch('/api/auth', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      action: 'add-staff',
      requesterRole: currentStaffUser.role,
      full_name,
      username,
      password,
      role
    })
  });

  if (res.ok) {
    alert(`حساب کاربری برای ${full_name} ساخته شد.`);
    document.getElementById('staff-name').value = '';
    document.getElementById('staff-username').value = '';
    document.getElementById('staff-password').value = '';
    loadStaffList();
  } else {
    const d = await res.json();
    alert(d.error || 'خطا در ثبت کادر جدید.');
  }
}

async function deleteStaff(staffId) {
  if (!confirm('آیا از حذف کامل دسترسی این کاربر اطمینان دارید؟')) return;

  try {
    const res = await fetch('/api/auth', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'delete-staff',
        requesterRole: currentStaffUser?.role || 'super_admin',
        staffId: Number(staffId)
      })
    });

    const data = await res.json();

    if (res.ok && data.success) {
      alert('دسترسی کاربر با موفقیت حذف شد.');
      await loadStaffList();
    } else {
      alert(data.error || 'خطا در حذف دسترسی کاربر.');
    }
  } catch (err) {
    alert('خطا در برقراری ارتباط با سرور: ' + err.message);
  }
}
