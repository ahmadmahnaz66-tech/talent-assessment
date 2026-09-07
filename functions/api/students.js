export async function onRequestGet(context) {
  const { request, env } = context;
  const url = new URL(request.url);
  const id = url.searchParams.get('id');
  const grade = url.searchParams.get('grade');
  const classroom = url.searchParams.get('classroom');

  const corsHeaders = {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*'
  };

  try {
    // ۱. ورود والد / دریافت پرونده تکی با سوابق
    if (id) {
      const student = await env.DB.prepare(
        'SELECT * FROM students WHERE id = ?'
      ).bind(id).first();

      if (!student) {
        return new Response(JSON.stringify({ error: 'دانش‌آموزی با این کد پرونده یافت نشد.' }), {
          status: 404,
          headers: corsHeaders
        });
      }

      const { results: responses } = await env.DB.prepare(
        'SELECT skill_slug, total_score, answers FROM responses WHERE student_id = ?'
      ).bind(id).all();

      return new Response(JSON.stringify({
        ...student,
        previousResponses: responses || []
      }), { headers: corsHeaders });
    }

    // ۲. لیست فیلترشده برای پنل مدیریت
    let query = 'SELECT * FROM students WHERE 1=1';
    const params = [];

    if (grade) {
      query += ' AND grade = ?';
      params.push(grade);
    }
    if (classroom) {
      query += ' AND classroom = ?';
      params.push(classroom);
    }

    query += ' ORDER BY grade ASC, classroom ASC, student_name ASC';

    const { results } = await env.DB.prepare(query).bind(...params).all();

    // آمار مقاطع و کلاس‌ها جهت دراپ‌داون‌های فیلتر
    const { results: stats } = await env.DB.prepare(
      'SELECT DISTINCT grade, classroom FROM students WHERE grade IS NOT NULL AND grade != ""'
    ).all();

    return new Response(JSON.stringify({ students: results || [], stats: stats || [] }), {
      headers: corsHeaders
    });

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
    const { action } = data;

    // ثبت یا ویرایش تکی
    if (action === 'save-single') {
      const { id, student_name, grade, classroom, parent_phone } = data;
      if (!id || !student_name || !grade) {
        return new Response(JSON.stringify({ error: 'کد پرونده، نام و پایه الزامی هستند.' }), { status: 400, headers: corsHeaders });
      }

      await env.DB.prepare(`
        INSERT INTO students (id, student_name, grade, classroom, parent_phone)
        VALUES (?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          student_name = excluded.student_name,
          grade = excluded.grade,
          classroom = excluded.classroom,
          parent_phone = excluded.parent_phone
      `).bind(id.trim(), student_name.trim(), grade.trim(), (classroom || '').trim(), (parent_phone || '').trim()).run();

      return new Response(JSON.stringify({ success: true }), { headers: corsHeaders });
    }

    // ایمپورت دسته‌جمعی (Batch Import از CSV/Excel)
    if (action === 'import-batch') {
      const { list } = data;
      if (!Array.isArray(list) || list.length === 0) {
        return new Response(JSON.stringify({ error: 'لیست ارسال‌شده خالی است.' }), { status: 400, headers: corsHeaders });
      }

      const stmt = env.DB.prepare(`
        INSERT INTO students (id, student_name, grade, classroom, parent_phone)
        VALUES (?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          student_name = excluded.student_name,
          grade = excluded.grade,
          classroom = excluded.classroom,
          parent_phone = excluded.parent_phone
      `);

      const batchQueries = list
        .filter(item => item.id && item.student_name)
        .map(item => stmt.bind(
          String(item.id).trim(),
          String(item.student_name).trim(),
          String(item.grade || 'عمومی').trim(),
          String(item.classroom || '').trim(),
          String(item.parent_phone || '').trim()
        ));

      await env.DB.batch(batchQueries);

      return new Response(JSON.stringify({ success: true, count: batchQueries.length }), { headers: corsHeaders });
    }

    // حذف دانش‌آموز
    if (action === 'delete') {
      const { id } = data;
      await env.DB.prepare('DELETE FROM responses WHERE student_id = ?').bind(id).run();
      await env.DB.prepare('DELETE FROM students WHERE id = ?').bind(id).run();
      return new Response(JSON.stringify({ success: true }), { headers: corsHeaders });
    }

    return new Response(JSON.stringify({ error: 'عملیات نامعتبر است.' }), { status: 400, headers: corsHeaders });

  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: corsHeaders });
  }
}
