// functions/api/sync-missing-questions.js

export async function onRequestPost(context) {
  const { env } = context;

  try {
    const { results: skills } = await env.DB.prepare("SELECT slug, title, category FROM skills").all();

    if (!skills || skills.length === 0) {
      return new Response(JSON.stringify({ success: true, updatedCount: 0, message: 'هیچ مهارتی یافت نشد.' }), {
        headers: { 'Content-Type': 'application/json' }
      });
    }

    let targetSkill = null;
    let missingInfo = '';

    for (const skill of skills) {
      const { results: qList } = await env.DB.prepare("SELECT question_text FROM questions WHERE skill_slug = ?").bind(skill.slug).all();
      
      const studentCount = qList.filter(q => q.question_text.startsWith('[student]')).length;
      const coachCount = qList.filter(q => q.question_text.startsWith('[coach]')).length;
      
      if (studentCount < 15 || coachCount < 10) {
        targetSkill = skill;
        missingInfo = `مهارت "${skill.title}" دارای ${studentCount} گویه والدین (نیاز به ۱۵) و ${coachCount} گویه مربی (نیاز به ۱۰) است.`;
        break;
      }
    }

    if (!targetSkill) {
      return new Response(JSON.stringify({
        success: true,
        updatedCount: 0,
        completed: true,
        message: 'تمام مهارت‌ها بررسی شدند و استانداردهای ۱۵ گویه والدین و ۱۰ گویه مربی در آن‌ها کاملاً برقرار است.'
      }), {
        headers: { 'Content-Type': 'application/json' }
      });
    }

    return new Response(JSON.stringify({
      success: true,
      updatedCount: 0,
      completed: false,
      targetSlug: targetSkill.slug,
      message: `یافت شد: ${missingInfo}`
    }), {
      headers: { 'Content-Type': 'application/json' }
    });

  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500 });
  }
}
