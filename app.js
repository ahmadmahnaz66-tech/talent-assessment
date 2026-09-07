async function saveSkillToBackend(slug, answers, score) {
  const payload = {
    studentId: currentStudent.id,
    skillSlug: slug,
    answers: answers,
    totalScore: score
  };

  try {
    const res = await fetch('/api/submit', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    
    if (!res.ok) {
      const errData = await res.json();
      console.error('خطای سرور در ثبت:', errData);
    }
  } catch (err) {
    console.error('خطای ارتباط با سرور:', err);
  }
}

async function submitCurrentSkill(isSkip = false) {
  const currentSkill = skillsData[currentSkillIndex];
  const isLast = (currentSkillIndex === skillsData.length - 1);
  let answers = [];
  let totalScore = 0;

  if (!isSkip) {
    for (let i = 0; i < currentSkill.questions.length; i++) {
      const selected = document.querySelector(`input[name="q_${i}"]:checked`);
      if (!selected) {
        alert(`لطفاً به سؤال شماره ${i + 1} پاسخ دهید یا در صورت عدم تمایل، دکمه «رد کردن این مهارت» را بزنید.`);
        return;
      }
      const val = parseInt(selected.value);
      answers.push(val);
      totalScore += val;
    }
  } else {
    answers = new Array(currentSkill.questions.length).fill(0);
    totalScore = 0;
  }

  // ثبت در حافظه محلی
  userResponses[currentSkill.slug] = {
    answers: answers,
    totalScore: totalScore,
    skipped: isSkip
  };

  // ارسال و ذخیره در دیتابیس
  await saveSkillToBackend(currentSkill.slug, answers, totalScore);

  // تغییر مرحله
  if (!isLast) {
    currentSkillIndex++;
    renderCurrentSkill();
  } else {
    showSuccessScreen();
  }
}

function showSuccessScreen() {
  const quizBox = document.getElementById('quiz-box');
  const successBox = document.getElementById('success-box');
  
  if (quizBox) quizBox.classList.add('hidden');
  if (successBox) successBox.classList.remove('hidden');
  
  window.scrollTo({ top: 0, behavior: 'smooth' });
}
