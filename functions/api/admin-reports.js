// functions/api/admin-reports.js

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
    if (type === 'all-skills') {
      const skills = await env.DB.prepare(
        "SELECT slug, title, category, display_order FROM skills ORDER BY display_order ASC"
      ).all();
      return new Response(JSON.stringify(skills.results || []), { headers: corsHeaders });
    }

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

    // داشبورد تحلیلی و آماری (کل مدرسه یا منتخبین مهارت)
    if (type === 'analytics-dashboard') {
      const selectedSkill = url.searchParams.get('skill');

      const KNOWN_SLUG_MAP = {
        coding: 'investigative',
        ai: 'investigative',
        robotics: 'investigative',
        carpentry: 'realistic',
        gardening: 'realistic',
        theater: 'artistic',
        comedy: 'artistic',
        public_speaking: 'enterprising'
      };

      const countRow = await env.DB.prepare("SELECT COUNT(*) as total FROM students").first();
      const totalStudents = countRow ? countRow.total : 0;

      const skillsRes = await env.DB.prepare("SELECT slug, category FROM skills").all();
      const skillCategories = {};
      (skillsRes.results || []).forEach(s => {
        const directCat = String(s.category || '').toLowerCase().trim();
        if (['realistic', 'investigative', 'artistic', 'social', 'enterprising', 'conventional'].includes(directCat)) {
          skillCategories[s.slug] = directCat;
        } else if (KNOWN_SLUG_MAP[s.slug]) {
          skillCategories[s.slug] = KNOWN_SLUG_MAP[s.slug];
        } else {
          skillCategories[s.slug] = 'investigative';
        }
      });

      let targetStudentIds = null;
      if (selectedSkill) {
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

      // ساختار ذخیره نمرات تفکیکی هر دانش‌آموز به تفکیک دسته‌ها (جهت محاسبه میانگین وزنی)
      const studentCategoryData = {};

      allResponses.forEach(r => {
        const cat = skillCategories[r.skill_slug] || 'investigative';
        if (!['realistic', 'investigative', 'artistic', 'social', 'enterprising', 'conventional'].includes(cat)) return;

        if (!studentCategoryData[r.student_id]) {
          studentCategoryData[r.student_id] = {
            realistic: { sum: 0, count: 0 },
            investigative: { sum: 0, count: 0 },
            artistic: { sum: 0, count: 0 },
            social: { sum: 0, count: 0 },
            enterprising: { sum: 0, count: 0 },
            conventional: { sum: 0, count: 0 }
          };
        }

        studentCategoryData[r.student_id][cat].sum += r.total_score;
        studentCategoryData[r.student_id][cat].count += 1;
      });

      const gardnerSums = { linguistic: 0, logical: 0, spatial: 0, musical: 0, bodily: 0, interpersonal: 0, intrapersonal: 0, naturalistic: 0 };
      const gardnerCounts = { linguistic: 0, logical: 0, spatial: 0, musical: 0, bodily: 0, interpersonal: 0, intrapersonal: 0, naturalistic: 0 };
      const hollandDistribution = { realistic: 0, investigative: 0, artistic: 0, social: 0, enterprising: 0, conventional: 0 };

      // محاسبه میانگین هر دسته برای هر دانش‌آموز و تعیین تیپ غالب واقعی او
      Object.values(studentCategoryData).forEach(categories => {
        let studentCategoryAverages = {};

        Object.entries(categories).forEach(([cat, data]) => {
          if (data.count > 0) {
            const avgScore = data.sum / data.count;
            studentCategoryAverages[cat] = avgScore;

            // مشارکت در میانگین گاردنر
            const gKey = HOLLAND_TO_GARDNER[cat];
            if (gKey) {
              gardnerSums[gKey] += avgScore;
              gardnerCounts[gKey] += 1;
            }
          }
        });

        // پیدا کردن تیپ غالب واقعی با بیشترین میانگین (نه مجموع خام)
        let maxCat = '';
        let maxVal = -1;
        Object.entries(studentCategoryAverages).forEach(([cat, avg]) => {
          if (avg > maxVal) {
            maxVal = avg;
            maxCat = cat;
          }
        });

        if (maxCat && maxVal > 0) {
          hollandDistribution[maxCat] = (hollandDistribution[maxCat] || 0) + 1;
        }
      });

      const gardnerAverages = {};
      Object.keys(gardnerSums).forEach(k => {
        const count = gardnerCounts[k];
        gardnerAverages[k] = count > 0 ? Math.round((gardnerSums[k] / count / 60) * 100) : 0;
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
    const { action, slug, title, category } = body;

    if (action === 'add-skill') {
      if (!slug || !title) {
        return new Response(JSON.stringify({ error: 'شناسه و عنوان مهارت الزامی است.' }), { status: 400 });
      }

      const validCat = ['realistic', 'investigative', 'artistic', 'social', 'enterprising', 'conventional'].includes(category) 
        ? category 
        : 'investigative';

      await env.DB.prepare(
        "INSERT INTO skills (slug, title, category, display_order) VALUES (?, ?, ?, 99)"
      ).bind(String(slug).trim().toLowerCase(), String(title).trim(), validCat).run();

      return new Response(JSON.stringify({ success: true, message: 'مهارت جدید با دسته‌بندی هالند ثبت شد.' }), {
        headers: { 'Content-Type': 'application/json' }
      });
    }

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
