// js/admin/students.js

async function loadStudentsList() {
  const grade = document.getElementById('filter-grade').value;
  const classroom = document.getElementById('filter-classroom').value;

  try {
    const res = await fetch(`/api/students?grade=${encodeURIComponent(grade)}&classroom=${encodeURIComponent(classroom)}`);
    const data = await res.json();
    loadedStudents = data.students || [];

    if (data.stats) updateFilterDropdowns(data.stats);

    const tbody = document.getElementById('students-table-body');
    document.getElementById('students-count-badge').innerText = `تعداد: ${loadedStudents.length}`;

    if (loadedStudents.length === 0) {
      tbody.innerHTML = '<tr><td colspan="8" class="p-4 text-center text-slate-400">دانش‌آموزی یافت نشد.</td></tr>';
      return;
    }

    const isSuperAdmin = currentStaffUser && (currentStaffUser.role === 'super_admin' || currentStaffUser.role === 'principal');

    tbody.innerHTML = loadedStudents.map(s => {
      const fName = s.first_name || (s.student_name ? s.student_name.split(' ')[0] : '-');
      const lName = s.last_name || (s.student_name ? s.student_name.split(' ').slice(1).join(' ') : '-');
      return `
        <tr class="hover:bg-slate-50 transition">
          <td class="p-3 font-bold text-slate-600 font-mono">${s.id}</td>
          <td class="p-3 font-bold text-slate-800">${fName}</td>
          <td class="p-3 font-bold text-slate-800">${lName}</td>
          <td class="p-3"><span class="bg-slate-100 text-slate-700 px-2 py-0.5 rounded-md text-[11px]">${s.grade}</span></td>
          <td class="p-3 text-slate-600">${s.classroom || '-'}</td>
          <td class="p-3 text-slate-500 font-mono">${s.father_phone || s.parent_phone || '-'}</td>
          <td class="p-3 text-slate-500 font-mono">${s.mother_phone || '-'}</td>
          <td class="p-3 text-left space-x-1.5 space-x-reverse whitespace-nowrap">
            ${isSuperAdmin ? `
              <button onclick="editStudentInfo('${s.id}')" class="text-blue-600 hover:text-blue-800 text-xs font-bold bg-blue-50 px-2 py-1 rounded-lg">ویرایش 📝</button>
              <button onclick="setCustomStudentPass('${s.id}')" class="text-indigo-600 hover:text-indigo-800 text-xs font-bold bg-indigo-50 px-2 py-1 rounded-lg">رمز ✏️</button>
              <button onclick="resetStudentPass('${s.id}')" class="text-amber-600 hover:text-amber-800 text-xs font-bold bg-amber-50 px-2 py-1 rounded-lg">ریست</button>
              <button onclick="deleteStudent('${s.id}')" class="text-red-500 hover:text-red-700 text-xs font-bold bg-red-50 px-2 py-1 rounded-lg">حذف</button>
            ` : '<span class="text-slate-400 text-[11px]">-</span>'}
          </td>
        </tr>
      `;
    }).join('');

  } catch (err) {
    console.error('خطا در لیست دانش‌آموزان:', err);
  }
}

function updateFilterDropdowns(stats) {
  allSchoolStats = stats || [];
  const gradeSelect = document.getElementById('filter-grade');
  const currentGrade = gradeSelect.value;
  const grades = [...new Set(allSchoolStats.map(s => s.grade).filter(Boolean))];

  gradeSelect.innerHTML = '<option value="">همه پایه‌ها</option>' + 
    grades.map(g => `<option value="${g}" ${g === currentGrade ? 'selected' : ''}>${g}</option>`).join('');

  updateClassDropdown();
}

function updateClassDropdown() {
  const selectedGrade = document.getElementById('filter-grade').value;
  const classSelect = document.getElementById('filter-classroom');
  const currentClass = classSelect.value;

  const filteredStats = selectedGrade ? allSchoolStats.filter(s => s.grade === selectedGrade) : allSchoolStats;
  const availableClasses = [...new Set(filteredStats.map(s => s.classroom).filter(Boolean))];
  const isCurrentStillValid = availableClasses.includes(currentClass);

  classSelect.innerHTML = '<option value="">همه کلاس‌ها</option>' + 
    availableClasses.map(c => `<option value="${c}" ${c === (isCurrentStillValid ? currentClass : '') ? 'selected' : ''}>${c}</option>`).join('');
}

function onGradeFilterChanged() {
  updateClassDropdown();
  loadStudentsList();
}

async function saveSingleStudent() {
  const id = document.getElementById('std-id').value.trim();
  const first_name = document.getElementById('std-first-name').value.trim();
  const last_name = document.getElementById('std-last-name').value.trim();
  const grade = document.getElementById('std-grade').value;
  const classNum = document.getElementById('std-class').value;

  if (!id || !first_name || !last_name || !grade || !classNum) {
    return alert('تکمیل تمامی فیلدهای اصلی دانش‌آموز الزامی است.');
  }

  const res = await fetch('/api/students', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      action: 'save-single',
      id, first_name, last_name, grade,
      classroom: `${grade}ِ ${classNum}`,
      father_phone: document.getElementById('std-father-phone').value.trim(),
      mother_phone: document.getElementById('std-mother-phone').value.trim()
    })
  });

  if (res.ok) {
    document.getElementById('std-id').value = '';
    document.getElementById('std-first-name').value = '';
    document.getElementById('std-last-name').value = '';
    await loadStudentsList();
  } else {
    alert('خطا در ذخیره پرونده.');
  }
}

async function deleteStudent(id) {
  if (!confirm(`آیا از حذف کامل پرونده ${id} اطمینان دارید؟`)) return;
  const res = await fetch('/api/students', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'delete', id })
  });
  if (res.ok) await loadStudentsList();
}
