if (type === 'by-student') {
      const studentId = url.searchParams.get('studentId');
      if (!studentId) {
        return new Response(JSON.stringify({ error: 'کد دانش‌آموز مشخص نشده است.' }), { status: 400 });
      }

      const { results } = await env.DB.prepare(`
        SELECT 
          r.skill_slug, 
          r.total_score, 
          r.q1, r.q2, r.q3, r.q4,
          r.created_at,
          COALESCE(s.title, r.skill_slug) AS skill_title
        FROM responses r
        LEFT JOIN skills s ON r.skill_slug = s.slug
        WHERE r.student_id = ? AND r.total_score > 0
        ORDER BY r.total_score DESC
      `).bind(studentId).all();

      return new Response(JSON.stringify(results || []), {
        headers: { 
          'Content-Type': 'application/json; charset=utf-8',
          'Access-Control-Allow-Origin': '*'
        }
      });
    }
