// js/admin/group.js

async function fetchSkillGroupReport(skillSlug) {
  const container = document.getElementById('skill-group-results');
  const chartsContainer = document.getElementById('skill-charts-container');

  if (!skillSlug) {
    if (container) container.innerHTML = '';
    if (chartsContainer) chartsContainer.classList.add('hidden');
    return;
  }

  container.innerHTML = '<p class="text-xs text-slate-400 text-center py-4">در حال رتبه‌بندی...</p>';

  try {
    const res = await fetch(`/api/admin-reports?type=by-skill&skill=${encodeURIComponent(skillSlug)}`);
    const records = await res.json();

    if (!records || records.length === 0) {
      container.innerHTML = '<p class="p-4 text-xs text-amber-600 text-center">داده‌ای برای این مهارت ثبت نشده است.</p>';
    } else {
      container.innerHTML = `
        <table class="w-full text-right text-xs">
          <thead class="bg-slate-50 text-slate-500 border-b">
            <tr>
              <th class="p-3">رتبه</th>
              <th class="p-3">کد ملی</th>
              <th class="p-3">نام دانش‌آموز</th>
              <th class="p-3">پایه</th>
              <th class="p-3 text-left">امتیاز</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-slate-100">
            ${records.map((r, i) => `
              <tr class="hover:bg-slate-50 transition">
                <td class="p-3 font-bold ${i < 3 ? 'text-indigo-600' : 'text-slate-400'}">${i + 1}</td>
                <td class="p-3 font-mono">${r.id}</td>
                <td class="p-3 font-bold text-slate-700">${r.student_name}</td>
                <td class="p-3">${r.grade || '-'}</td>
                <td class="p-3 text-left font-black text-indigo-600">${r.total_score}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      `;
    }
  } catch (e) {
    container.innerHTML = '<p class="text-xs text-red-500 text-center py-4">خطا در دریافت گزارش.</p>';
  }

  if (chartsContainer) {
    chartsContainer.classList.remove('hidden');
    renderSkillSpecificCharts(skillSlug);
  }
}

async function renderSkillSpecificCharts(skillSlug) {
  try {
    const res = await fetch(`/api/admin-reports?type=analytics-dashboard&skill=${encodeURIComponent(skillSlug)}`);
    const data = await res.json();
    if (!data || !data.success) return;

    const gBadge = document.getElementById('skill-gardner-badge');
    const hBadge = document.getElementById('skill-holland-badge');
    if (gBadge) gBadge.textContent = `${data.total_students} پرونده منتخب این مهارت`;
    if (hBadge) hBadge.textContent = `${data.total_students} پرونده منتخب این مهارت`;

    const canvasG = document.getElementById('skillGardnerBarChart');
    if (canvasG) {
      const ctxG = canvasG.getContext('2d');
      if (skillGardnerChartInstance) skillGardnerChartInstance.destroy();

      const labels = ['زبانی-کلامی', 'منطقی-ریاضی', 'فضایی-دیداری', 'موسیقیایی', 'بدنی-جنبشی', 'بین‌فردی', 'درون‌فردی', 'طبیعت‌گرا'];
      const gAvg = data.gardner_averages || {};
      const scores = [
        gAvg.linguistic || 0, gAvg.logical || 0, gAvg.spatial || 0, 
        gAvg.musical || 0, gAvg.bodily || 0, gAvg.interpersonal || 0, 
        gAvg.intrapersonal || 0, gAvg.naturalistic || 0
      ];

      skillGardnerChartInstance = new Chart(ctxG, {
        type: 'bar',
        data: {
          labels: labels,
          datasets: [{
            label: 'میانگین نمره منتخبین',
            data: scores,
            backgroundColor: 'rgba(99, 102, 241, 0.8)',
            borderColor: 'rgb(79, 70, 229)',
            borderWidth: 1.5,
            borderRadius: 6
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          indexAxis: 'y',
          scales: { x: { beginAtZero: true, max: 100 } },
          plugins: { legend: { display: false } }
        }
      });
    }

    const canvasH = document.getElementById('skillHollandRadarChart');
    if (canvasH) {
      const ctxH = canvasH.getContext('2d');
      if (skillHollandChartInstance) skillHollandChartInstance.destroy();

      const hLabels = ['واقع‌گرا (R)', 'کاوشگر (I)', 'هنری (A)', 'اجتماعی (S)', 'متهور (E)', 'قراردادی (C)'];
      const hDist = data.holland_distribution || {};
      const hData = [
        hDist.realistic || 0, hDist.investigative || 0, hDist.artistic || 0,
        hDist.social || 0, hDist.enterprising || 0, hDist.conventional || 0
      ];

      skillHollandChartInstance = new Chart(ctxH, {
        type: 'radar',
        data: {
          labels: hLabels,
          datasets: [{
            label: 'فراوانی تیپ غالب در منتخبین',
            data: hData,
            backgroundColor: 'rgba(16, 185, 129, 0.25)',
            borderColor: 'rgb(16, 185, 129)',
            borderWidth: 2,
            pointBackgroundColor: 'rgb(5, 150, 105)',
            pointRadius: 4
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          scales: { r: { beginAtZero: true, ticks: { precision: 0 } } }
        }
      });
    }

  } catch (err) {
    console.error("خطا در رسم نمودارهای اختصاصی مهارت:", err);
  }
}

async function loadAnalyticsDashboard() {
  try {
    const res = await fetch('/api/admin-reports?type=analytics-dashboard');
    const data = await res.json();

    if (!data || !data.success) return;

    const gBadge = document.getElementById('gardner-total-badge');
    const hBadge = document.getElementById('holland-total-badge');
    const totalCount = data.total_students || 0;
    if (gBadge) gBadge.textContent = `${totalCount} پرونده ثبت‌شده`;
    if (hBadge) hBadge.textContent = `${totalCount} پرونده ثبت‌شده`;

    const gardnerCanvas = document.getElementById('gardnerBarChart');
    if (gardnerCanvas) {
      const gardnerCtx = gardnerCanvas.getContext('2d');
      if (schoolGardnerChartInstance) schoolGardnerChartInstance.destroy();

      const labels = [
        'زبانی-کلامی', 'منطقی-ریاضی', 'فضایی-دیداری', 
        'موسیقیایی', 'بدنی-جنبشی', 'بین‌فردی', 
        'درون‌فردی', 'طبیعت‌گرا'
      ];
      const gAvg = data.gardner_averages || {};
      const scores = [
        gAvg.linguistic || 0, gAvg.logical || 0, gAvg.spatial || 0, 
        gAvg.musical || 0, gAvg.bodily || 0, gAvg.interpersonal || 0, 
        gAvg.intrapersonal || 0, gAvg.naturalistic || 0
      ];

      schoolGardnerChartInstance = new Chart(gardnerCtx, {
        type: 'bar',
        data: {
          labels: labels,
          datasets: [{
            label: 'میانگین نمره مدرسه',
            data: scores,
            backgroundColor: 'rgba(99, 102, 241, 0.75)',
            borderColor: 'rgb(79, 70, 229)',
            borderWidth: 1.5,
            borderRadius: 6
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          indexAxis: 'y',
          scales: { x: { beginAtZero: true, max: 100 } },
          plugins: { legend: { display: false } }
        }
      });
    }

    const hollandCanvas = document.getElementById('hollandRadarChart');
    if (hollandCanvas) {
      const hollandCtx = hollandCanvas.getContext('2d');
      if (hollandChartInstance) hollandChartInstance.destroy();

      const hLabels = ['واقع‌گرا (R)', 'کاوشگر (I)', 'هنری (A)', 'اجتماعی (S)', 'متهور (E)', 'قراردادی (C)'];
      const hDist = data.holland_distribution || {};
      const hData = [
        hDist.realistic || 0, hDist.investigative || 0, hDist.artistic || 0,
        hDist.social || 0, hDist.enterprising || 0, hDist.conventional || 0
      ];

      hollandChartInstance = new Chart(hollandCtx, {
        type: 'radar',
        data: {
          labels: hLabels,
          datasets: [{
            label: 'تعداد دانش‌آموزان با تیپ غالب',
            data: hData,
            backgroundColor: 'rgba(16, 185, 129, 0.25)',
            borderColor: 'rgb(16, 185, 129)',
            borderWidth: 2,
            pointBackgroundColor: 'rgb(5, 150, 105)',
            pointRadius: 4
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          scales: { r: { beginAtZero: true, ticks: { precision: 0 } } }
        }
      });
    }

  } catch (err) {
    console.error("خطا در بارگذاری داشبورد تحلیلی:", err);
  }
}
