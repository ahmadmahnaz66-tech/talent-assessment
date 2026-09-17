// functions/api/admin-reports.js

// نگاشت کدهای هالند به ابعاد هوش گاردنر
const HOLLAND_TO_GARDNER = {
  realistic: 'bodily',
  investigative: 'logical',
  artistic: 'spatial',
  social: 'interpersonal',
  enterprising: 'linguistic',
  conventional: 'intrapersonal'
};

export async function onRequestGet(context) {
  const { request, env } = context;
  const url = new URL(request.url);
  const type = url.searchParams.get('type');

  const corsHeaders = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*'
  };

  try {
    // ۱. لیست تمام مهارت‌ها
    if (type === 'all-skills') {
      const skills = await env.DB.prepare(
        "SELECT slug, title, category, display_order FROM skills ORDER BY display_order ASC"
      ).all();
      return new Response(JSON.stringify(skills.results || []), { headers: corsHeaders });
    }

    // ۲. کارنامه و نمرات تفکیکی یک دانش‌آموز
    if (type === 'by-student') {
      const studentId = url.searchParams.get('studentId');
      if (!studentId) {
        return new Response(JSON.stringify([]), { headers: corsHeaders });
      }

      const query = `
        SELECT 
          s.slug AS skill_slug,
          s.title AS skill_title,
          s.category,
          COALESCE(r.total_score, 0) AS total_score,
          COALESCE(r.is_default, 0) AS is_default
        FROM skills s
        LEFT JOIN responses r ON s.slug = r.skill_slug AND r.student_id = ?
        ORDER BY s.display_order ASC
      `;
      const records = await env.DB.prepare(query).bind(String(studentId).trim()).all();
      return new Response(JSON.stringify(records.results || []), { headers: corsHeaders });
    }

    // ۳. رتبه‌بندی دانش‌آموزان در یک مهارت خاص
    if (type === 'by-skill') {
      const skill = url.searchParams.get('skill');
      if (!skill) {
        return new Response(JSON.stringify([]), { headers: corsHeaders });
      }

      const query = `
        SELECT 
          st.id,
          st.student_name,
          st.grade,
          r.total_score
        FROM responses r
        JOIN students st ON r.student_id = st.id
        WHERE r.skill_slug = ?
        ORDER BY r.total_score DESC
      `;
      const records = await env.DB.prepare(query).bind(String(skill).trim()).all();
      return new Response(JSON.stringify(records.results || []), { headers: corsHeaders });
    }

    // ۴. تاریخچه کارنامه‌های صادرشده هوش مصنوعی
    if (type === 'reports') {
      const nationalId = url.searchParams.get('nationalId');
      if (!nationalId) {
        return new Response(JSON.stringify([]), { headers: corsHeaders });
      }

      const reports = await env.DB.prepare(
        "SELECT id, version, analysis, created_at FROM roadmaps WHERE student_id = ? ORDER BY version DESC, id DESC"
      ).bind(String(nationalId).trim()).all();

      return new Response(JSON.stringify(reports.results || []), { headers: corsHeaders });
    }

    // ۵. داشبورد تحلیلی و آماری کل مدرسه / منتخبین مهارت خاص
    if (type === 'analytics-dashboard') {
      const selectedSkill = url.searchParams.get('skill');

      const countRow = await env.DB.prepare("SELECT COUNT(*) as total FROM students").first();
      const totalStudents = countRow ? countRow.total : 0;

      const skillsRes = await env.DB.prepare("SELECT slug, category FROM skills").all();
      const skillCategories = {};
      (skillsRes.results || []).forEach(s => {
        skillCategories[s.slug] = s.category || 'realistic';
      });

      let targetStudentIds = null;
      if (selectedSkill) {
        // انتخاب دانش‌آموزانی که در این مهارت نمره رشد کسب کرده‌اند (بیشتر از ۳۰)
        const topStudentsRes = await env.DB.prepare(
          "SELECT DISTINCT student_id FROM responses WHERE skill_slug = ? AND total_score > 30"
        ).bind(selectedSkill).all();
        targetStudentIds = new Set((topStudentsRes.results || []).map(r => String(r.student_id)));
      }

      const responsesRes = await env.DB.prepare("SELECT student_id, skill_slug, total_score FROM responses").all();
      let allResponses = responsesRes.results || [];

      if (targetStudentIds !== null) {
        allResponses = allResponses.filter(r => targetStudentIds.has(String(r.student_id)));
      }

      const countForThisView = targetStudentIds !== null ? targetStudentIds.size : totalStudents;

      const gardnerSums = { linguistic: 0, logical: 0, spatial: 0, musical: 0, bodily: 0, interpersonal: 0, intrapersonal: 0, naturalistic: 0 };
      const gardnerCounts = { linguistic: 0, logical: 0, spatial: 0, musical: 0, bodily: 0, interpersonal: 0, intrapersonal: 0, naturalistic: 0 };
      const studentHollandScores = {};

      allResponses.forEach(r => {
        const cat = skillCategories[r.skill_slug] || 'realistic';
        const gKey = HOLLAND_TO_GARDNER[cat] || 'logical';

        gardnerSums[gKey] += r.total_score;
        gardnerCounts[gKey] += 1;

        if (!studentHollandScores[r.student_id]) {
          studentHollandScores[r.student_id] = { realistic: 0, investigative: 0, artistic: 0, social: 0, enterprising: 0, conventional: 0 };
        }
        if (studentHollandScores[r.student_id][cat] !== undefined) {
          studentHollandScores[r.student_id][cat] += r.total_score;
        }
      });

      const gardnerAverages = {};
      Object.keys(gardnerSums).forEach(k => {
        const count = gardnerCounts[k];
        gardnerAverages[k] = count > 0 ? Math.round((gardnerSums[k] / (count * 60)) * 100) : 0;
      });

      const hollandDistribution = { realistic: 0, investigative: 0, artistic: 0, social: 0, enterprising: 0, conventional: 0 };
      Object.values(studentHollandScores).forEach(scores => {
        let maxCat = 'realistic';
        let maxVal = -1;
        Object.entries(scores).forEach(([cat, val]) => {
          if (val > maxVal) {
            maxVal = val;
            maxCat = cat;
          }
        });
        if (maxVal > 0) {
          hollandDistribution[maxCat] = (hollandDistribution[maxCat] || 0) + 1;
        }
      });

      return new Response(JSON.stringify({
        success: true,
        total_students: countForThisView,
        gardner_averages: gardnerAverages,
        holland_distribution: hollandDistribution
      }), { headers: corsHeaders });
    }

    return new Response(JSON.stringify({ error: 'نوع درخواست نامعتبر است.' }), { status: 400, headers: corsHeaders });

  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: corsHeaders });
  }
}

export async function onRequestPost(context) {
  const { request, env } = context;

  try {
    const body = await request.json();
    const { action, slug, title } = body;

    // تعریف مهارت جدید
    if (action === 'add-skill') {
      if (!slug || !title) {
        return new Response(JSON.stringify({ error: 'شناسه و عنوان مهارت الزامی است.' }), { status: 400 });
      }

      await env.DB.prepare(
        "INSERT INTO skills (slug, title, category, display_order) VALUES (?, ?, 'عمومی', 99)"
      ).bind(String(slug).trim().toLowerCase(), String(title).trim()).run();

      return new Response(JSON.stringify({ success: true, message: 'مهارت جدید با موفقیت اضافه شد.' }), {
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // حذف مهارت و سوالات وابسته
    if (action === 'delete-skill') {
      if (!slug) {
        return new Response(JSON.stringify({ error: 'شناسه مهارت الزامی است.' }), { status: 400 });
      }

      const cleanSlug = String(slug).trim().toLowerCase();
      await env.DB.prepare("DELETE FROM questions WHERE skill_slug = ?").bind(cleanSlug).run();
      await env.DB.prepare("DELETE FROM skills WHERE slug = ?").bind(cleanSlug).run();

      return new Response(JSON.stringify({ success: true, message: 'مهارت و گویه‌های آن حذف شدند.' }), {
        headers: { 'Content-Type': 'application/json' }
      });
    }

    return new Response(JSON.stringify({ error: 'عملیات نامعتبر است.' }), { status: 400 });

  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500 });
  }
}
