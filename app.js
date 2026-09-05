let currentStudent = null;
const currentSkill = 'coding';

// گویه‌های مهارت اول (برنامه‌نویسی)
const questions = [
  "وقتی بازی فکری یا کامپیوتری جدیدی شروع می‌کند، اول قواعد و مقررات بازی را دقیق می‌پرسد.",
  "پازل‌ها، جدول‌ها یا بازی‌های ساختنی مرحله‌به‌مرحله را با حوصله تا انتها دنبال می‌کند.",
  "در مکالمات روزمره از جملات شرطی استفاده می‌کند (مثلاً: اگر این کار رو بکنی، پس منم اون کار رو انجام میدم).",
  "اگر وسیله‌ای درست کار نکند، خودش مرحله‌به‌مرحله بررسی می‌کند تا ببیند اشکال از کجاست.",
  "به مرتب‌کردن اشیاء بر اساس یک قاعده خاص (رنگ، اندازه، شکل) علاقه نشان می‌دهد.",
  "دستورات چندمرحله‌ای پشت سر هم را بدون جا انداختن انجام می‌دهد.",
  "بازی‌های فکری استراتژیک را به بازی‌های کاملاً اتفاقی و شانسی ترجیح می‌دهد.",
  "در اتفاقات اطراف، روابط علت و معلولی را کشف و بیان می‌کند.",
  "تغییرات ناگهانی در قوانینِ یک بازی او را اذیت می‌کند و به حفظ چهارچوب اصرار دارد.",
  "وقتی اشتباهی انجام می‌دهد، سعی می‌کند علت آن را بفهمد و خودش اصلاح کند.",
  "از تکرار فرآیندهای منظم و زنجیره‌ای (مانند چیدن دومینو) لذت می‌برد.",
  "می‌تواند بیش از ۱۰ تا ۱۵ دقیقه روی یک مسئله فکری متمرکز بماند.",
  "سریعاً تفاوت‌ها یا شباهت‌های جزئی بین دو تصویر یا الگو را تشخیص می‌دهد.",
  "وقایع یا خاطرات را به‌صورت ترتیبی و گام‌به‌گام (اول، بعد، درنهایت) تعریف می‌کند.",
  "هنگام مواجهه با یک مشکل، خودش آن را به چند بخش کوچک‌تر تقسیم می‌کند."
];

async function login() {
  const code = document.getElementById('student-code').value.trim();
  const errorEl = document.getElementById('login-error');
  errorEl.classList.add('hidden');

  if (!code) return;

  try {
    const res = await fetch(`/api/student?id=${encodeURIComponent(code)}`);
    const data = await res.json();

    if (!res.ok) throw new Error(data.error || 'خطا در ورود');

    currentStudent = data;
    document.getElementById('login-box').classList.add('hidden');
    document.getElementById('quiz-box').classList.remove('hidden');
    document.getElementById('student-display').innerText = currentStudent.student_name;
    renderQuestions();
  } catch (err) {
    errorEl.innerText = err.message;
    errorEl.classList.remove('hidden');
  }
}

function renderQuestions() {
  const container = document.getElementById('questions-container');
  container.innerHTML = questions.map((q, idx) => `
    <div class="border-b pb-4 last:border-0">
      <p class="text-sm font-medium mb-3 text-slate-700">${idx + 1}. ${q}</p>
      <div class="grid grid-cols-2 md:grid-cols-4 gap-2 text-xs">
        <label class="flex items-center gap-1.5 p-2 border rounded-lg cursor-pointer hover:bg-slate-50">
          <input type="radio" name="q_${idx}" value="4" required class="text-indigo-600">
          <span>همیشگی (۴)</span>
        </label>
        <label class="flex items-center gap-1.5 p-2 border rounded-lg cursor-pointer hover:bg-slate-50">
          <input type="radio" name="q_${idx}" value="3" class="text-indigo-600">
          <span>اغلب (۳)</span>
        </label>
        <label class="flex items-center gap-1.5 p-2 border rounded-lg cursor-pointer hover:bg-slate-50">
          <input type="radio" name="q_${idx}" value="2" class="text-indigo-600">
          <span>گاهی (۲)</span>
        </label>
        <label class="flex items-center gap-1.5 p-2 border rounded-lg cursor-pointer hover:bg-slate-50">
          <input type="radio" name="q_${idx}" value="1" class="text-indigo-600">
          <span>به‌ندرت (۱)</span>
        </label>
      </div>
    </div>
  `).join('');
}

async function submitQuiz() {
  const answers = [];
  let totalScore = 0;

  for (let i = 0; i < questions.length; i++) {
    const selected = document.querySelector(`input[name="q_${i}"]:checked`);
    if (!selected) {
      alert(`لطفاً به سؤال شماره ${i + 1} پاسخ دهید.`);
      return;
    }
    const val = parseInt(selected.value);
    answers.push(val);
    totalScore += val;
  }

  const payload = {
    studentId: currentStudent.id,
    skillSlug: currentSkill,
    answers: answers,
    totalScore: totalScore
  };

  try {
    const res = await fetch('/api/submit', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    if (res.ok) {
      document.getElementById('quiz-box').classList.add('hidden');
      document.getElementById('success-box').classList.remove('hidden');
    } else {
      alert('خطا در ثبت نهایی اطلاعات');
    }
  } catch (err) {
    alert('عدم برقراری ارتباط با سرور');
  }
}