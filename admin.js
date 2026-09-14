async function loadStaffList() {
  try {
    const res = await fetch('/api/auth?type=school');
    const staffList = await res.json();
    const tbody = document.getElementById('staff-table-body');

    if (!staffList || staffList.length === 0) {
      tbody.innerHTML = '<tr><td colspan="4" class="p-4 text-center text-slate-400">هیچ پرسنلی برای مدرسه یافت نشد.</td></tr>';
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
