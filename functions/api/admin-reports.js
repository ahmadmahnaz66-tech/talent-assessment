export async function onRequestGet(context) {
  const { request, env } = context;
  const url = new URL(request.url);
  const type = url.searchParams.get('type');

  const corsHeaders = {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*'
  };

  try {
    // اطمینان از وجود جدول student_roadmaps برای جلوگیری از کرش
    await env.DB.prepare(`
      CREATE TABLE IF NOT EXISTS student_roadmaps (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        student_id TEXT NOT NULL,
        version INTEGER NOT NULL DEFAULT 1,
        analysis TEXT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `).run();

    // دریافت فهرست مهارت‌ها
    if (type === 'all-skills') {
      const { results } = await env.DB.prepare(
        'SELECT slug, title, display_order FROM skills ORDER BY display_order ASC, rowid ASC'
      ).all();
      return new Response(JSON.stringify(results || []), { headers: corsHeaders });
    }

    // دریافت فهرست دانش‌آموزان
    if (type === 'all-students') {
      const { results } = await env.DB.prepare(
        'SELECT id, student_name, grade FROM students'
      ).all();
      return new Response(JSON.stringify(results || []), { headers: corsHeaders });
    }

    // [اصلاح‌شده] دریافت تاریخچه اسناد و تحلیل‌های صادرشده یک پرونده
    if (type === 'reports') {
      const nationalId = url.searchParams.get('nationalId') || url.searchParams.get('studentId');
      if (!nationalId) {
        return new Response(JSON.stringify({ reports: [] }), { headers: corsHeaders });
      }

      const { results } = await env.DB.prepare(`
        SELECT id, version, created_at, analysis 
        FROM student_roadmaps 
        WHERE student_id = ? 
        ORDER BY created_at DESC
      `).bind(nationalId).all();

      return new Response(JSON.stringify({ reports: results || [] }), { headers: corsHeaders });
    }

    // گزارش گروهی بر اساس مهارت
    if (type === 'by-skill') {
      const skill = url.searchParams.get('skill');
      if (!skill) {
        return new Response(JSON.stringify({ error: 'مهارت مشخص نشده است.' }), { status: 400, headers: corsHeaders });
      }

      const { results } = await env.DB.prepare(`
        SELECT s.id, s.student_name, s.grade, r.total_score
        FROM responses r
        JOIN students s ON r.student_id = s.id
        WHERE r.skill_slug = ? AND r.total_score > 0
        ORDER BY r.total_score DESC
      `).bind(skill).all();

      return new Response(JSON.stringify(results || []), { headers: corsHeaders });
    }

    // کارنامه فردی دانش‌آموز
    if (type === 'by-student') {
      const studentId = url.searchParams.get('studentId');
      if (!studentId) {
        return new Response(JSON.stringify({ error: 'کد دانش‌آموز مشخص نشده است.' }), { status: 400, headers: corsHeaders });
      }

      const { results } = await env.DB.prepare(`
        SELECT 
          r.skill_slug, 
          r.total_score, 
          r.answers,
          r.created_at,
          COALESCE(s.title, r.skill_slug) AS skill_title
        FROM responses r
        LEFT JOIN skills s ON r.skill_slug = s.slug
        WHERE r.student_id = ? AND r.total_score > 0
        ORDER BY r.total_score DESC
      `).bind(studentId).all();

      return new Response(JSON.stringify(results || []), { headers: corsHeaders });
    }

    // داشبورد تحلیلی هوش‌های گاردنر و تیپ‌های هالند
    if (type === 'analytics-dashboard') {
      const query = `
        SELECT sr.analysis 
        FROM student_roadmaps sr
        INNER JOIN (
          SELECT student_id, MAX(created_at) as max_gen
          FROM student_roadmaps
          GROUP BY student_id
        ) latest ON sr.student_id = latest.student_id AND sr.created_at = latest.max_gen
      `;

      const { results } = await env.DB.prepare(query).all();

      const keyMapping = {
        linguistic: 'linguistic',
        logical_mathematical: 'logical',
        spatial_visual: 'spatial',
        musical_rhythmic: 'musical',
        bodily_kinesthetic: 'bodily',
        interpersonal: 'interpersonal',
        intrapersonal: 'intrapersonal',
        naturalist: 'naturalistic'
      };

      const gardnerTotals = {
        linguistic: 0,
        logical: 0,
        spatial: 0,
        musical: 0,
        bodily: 0,
        interpersonal: 0,
        intrapersonal: 0,
        naturalistic: 0
      };
      const gardnerCounts = { ...gardnerTotals };

      const hollandTotals = {
        realistic: 0,
        investigative: 0,
        artistic: 0,
        social: 0,
        enterprising: 0,
        conventional: 0
      };

      let totalValidProfiles = 0;

      if (results && results.length > 0) {
        for (const row of results) {
          try {
            const data = typeof row.analysis === 'string' ? JSON.parse(row.analysis) : row.analysis;
            if (!data) continue;

            let hasGardner = false;

            if (Array.isArray(data.gardner)) {
              for (const item of data.gardner) {
                const rawKey = item.gardner_intelligence || '';
                const mappedKey = keyMapping[rawKey] || rawKey.replace('_', '');
                const score = Number(item.percentage);

                if (!isNaN(score) && gardnerTotals.hasOwnProperty(mappedKey)) {
                  gardnerTotals[mappedKey] += score;
                  gardnerCounts[mappedKey]++;
                  hasGardner = true;
                }
              }
            }

            if (hasGardner) {
              totalValidProfiles++;
            }

            if (data.holland_profile && data.holland_profile.dominant_type) {
              const domType = data.holland_profile.dominant_type.toLowerCase();
              if (hollandTotals.hasOwnProperty(domType)) {
                hollandTotals[domType]++;
              }
            } else {
              const logicalScore = data.gardner?.find(g => g.gardner_intelligence === 'logical_mathematical')?.percentage || 0;
              const spatialScore = data.gardner?.find(g => g.gardner_intelligence === 'spatial_visual')?.percentage || 0;
              const socialScore = data.gardner?.find(g => g.gardner_intelligence === 'interpersonal')?.percentage || 0;
              const artisticScore = data.gardner?.find(g => g.gardner_intelligence === 'musical_rhythmic')?.percentage || 0;

              if (logicalScore >= 80) hollandTotals.investigative++;
              else if (socialScore >= 80) hollandTotals.social++;
              else if (artisticScore >= 75) hollandTotals.artistic++;
              else if (spatialScore >= 75) hollandTotals.realistic++;
              else hollandTotals.enterprising++;
            }

          } catch (e) {
            // رد کردن داده‌های نامعتبر
          }
        }
      }

      const gardnerAverages = {};
      for (const key of Object.keys(gardnerTotals)) {
        gardnerAverages[key] = gardnerCounts[key] > 0 
          ? Math.round((gardnerTotals[key] / gardnerCounts[key]) * 10) / 10 
          : 0;
      }

      return new Response(JSON.stringify({
        success: true,
        total_students: totalValidProfiles,
        gardner_averages: gardnerAverages,
        holland_distribution: hollandTotals
      }), { headers: corsHeaders });
    }

    return new Response(JSON.stringify({ error: 'نوع درخواست نامعتبر است.' }), { status: 400, headers: corsHeaders });

  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: corsHeaders });
  }
}

export async function onRequestPost(context) {
  const { request, env } = context;
  const corsHeaders = {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*'
  };

  try {
    const data = await request.json();
    const { action, slug, title, displayOrder } = data;

    if (action === 'add-skill') {
      if (!slug || !title) {
        return new Response(JSON.stringify({ error: 'شناسه و عنوان الزامی است.' }), { status: 400, headers: corsHeaders });
      }
      await env.DB.prepare(
        'INSERT INTO skills (slug, title, display_order) VALUES (?, ?, ?)'
      ).bind(slug.trim().toLowerCase(), title.trim(), Number(displayOrder) || 0).run();

      return new Response(JSON.stringify({ success: true }), { headers: corsHeaders });
    }

    if (action === 'delete-skill') {
      if (!slug) {
        return new Response(JSON.stringify({ error: 'شناسه مهارت الزامی است.' }), { status: 400, headers: corsHeaders });
      }
      await env.DB.prepare('DELETE FROM questions WHERE skill_slug = ?').bind(slug).run();
      await env.DB.prepare('DELETE FROM skills WHERE slug = ?').bind(slug).run();

      return new Response(JSON.stringify({ success: true }), { headers: corsHeaders });
    }

    return new Response(JSON.stringify({ error: 'عملیات نامعتبر است.' }), { status: 400, headers: corsHeaders });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: corsHeaders });
  }
}
