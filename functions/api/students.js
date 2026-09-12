export async function onRequestGet(context) {
  const { request, env } = context;
  const url = new URL(request.url);
  const grade = url.searchParams.get('grade') || '';
  const classroom = url.searchParams.get('classroom') || '';

  try {
    let query = `
      SELECT id, first_name, last_name, student_name, grade, classroom, father_phone, mother_phone, parent_phone, created_at 
      FROM students WHERE 1=1
    `;
    const params = [];

    if (grade) {
      query += " AND grade = ?";
      params.push(grade);
    }
    if (classroom) {
      query += " AND classroom = ?";
      params.push(classroom);
    }

    query += " ORDER BY id ASC";

    const { results: students } = await env.DB.prepare(query).bind(...params).all();

    const { results: stats } = await env.DB.prepare(
      "SELECT DISTINCT grade, classroom FROM students ORDER BY grade ASC, classroom ASC"
    ).all();

    return new Response(JSON.stringify({ students: students || [], stats: stats || [] }), {
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500 });
  }
}

export async function onRequestPost(context) {
  try {
    const { request, env } = context;
    const body = await request.json();
    const { action } = body;

    // ۱. ثبت یا ویرایش تکی پرونده
    if (action === 'save-single') {
      const { id, first_name, last_name, grade, classroom, father_phone, mother_phone } = body;
      
      const cleanId = String(id).trim();
      const fName = String(first_name || '').trim();
      const lName = String(last_name || '').trim();
      const fullName = `${fName} ${lName}`.trim() || fName || cleanId;
      const fPhone = String(father_phone || '').trim();
      const mPhone = String(mother_phone || '').trim();
      const pPhone = fPhone || mPhone;

      if (!cleanId || !fName || !lName || !grade) {
        return new Response(JSON.stringify({ error: 'کد ملی، نام، نام خانوادگی و پایه الزامی هستند.' }), { status: 400 });
      }

      await env.DB.prepare(`
        INSERT INTO students (id, first_name, last_name, student_name, grade, classroom, father_phone, mother_phone, parent_phone, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
        ON CONFLICT(id) DO UPDATE SET
          first_name = excluded.first_name,
          last_name = excluded.last_name,
          student_name = excluded.student_name,
          grade = excluded.grade,
          classroom = excluded.classroom,
          father_phone = excluded.father_phone,
          mother_phone = excluded.mother_phone,
          parent_phone = excluded.parent_phone
      `).bind(cleanId, fName, lName, fullName, grade, classroom, fPhone, mPhone, pPhone).run();

      return new Response(JSON.stringify({ success: true }), { headers: { 'Content-Type': 'application/json' } });
    }

    // ۲. وارد کردن گروهی اکسل / CSV
    if (action === 'import-batch') {
      const { list } = body;
      if (!Array.isArray(list) || list.length === 0) {
        return new Response(JSON.stringify({ error: 'داده‌ای دریافت نشد.' }), { status: 400 });
      }

      let count = 0;
      for (const row of list) {
        // پشتیبانی از هدرهای انگلیسی و فارسی
        const rawId = row.id || row['کد ملی'] || row['کدملی'];
        if (!rawId) continue;

        const cleanId = String(rawId).trim();
        let fName = String(row.first_name || row['نام'] || '').trim();
        let lName = String(row.last_name || row['نام خانوادگی'] || row['فامیل'] || '').trim();
        
        // اگر نام و فامیل در یک ستون بود
        if (!fName && !lName && (row.student_name || row['نام و نام خانوادگی'])) {
          const parts = String(row.student_name || row['نام و نام خانوادگی']).trim().split(' ');
          fName = parts[0] || '';
          lName = parts.slice(1).join(' ') || '';
        }

        const fullName = `${fName} ${lName}`.trim() || fName || cleanId;
        const grade = String(row.grade || row['پایه'] || '').trim();
        const classroom = String(row.classroom || row['کلاس'] || '').trim();
        const fPhone = String(row.father_phone || row['شماره تماس پدر'] || row['تماس پدر'] || '').trim();
        const mPhone = String(row.mother_phone || row['شماره تماس مادر'] || row['تماس مادر'] || '').trim();
        const pPhone = fPhone || mPhone || String(row.parent_phone || row['شماره تماس ولی'] || '').trim();

        await env.DB.prepare(`
          INSERT INTO students (id, first_name, last_name, student_name, grade, classroom, father_phone, mother_phone, parent_phone, created_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
          ON CONFLICT(id) DO UPDATE SET
            first_name = excluded.first_name,
            last_name = excluded.last_name,
            student_name = excluded.student_name,
            grade = excluded.grade,
            classroom = excluded.classroom,
            father_phone = excluded.father_phone,
            mother_phone = excluded.mother_phone,
            parent_phone = excluded.parent_phone
        `).bind(cleanId, fName, lName, fullName, grade, classroom, fPhone, mPhone, pPhone).run();

        count++;
      }

      return new Response(JSON.stringify({ success: true, count }), { headers: { 'Content-Type': 'application/json' } });
    }

    // ۳. حذف دانش‌آموز
    if (action === 'delete') {
      const { id } = body;
      await env.DB.prepare("DELETE FROM students WHERE id = ?").bind(String(id).trim()).run();
      return new Response(JSON.stringify({ success: true }), { headers: { 'Content-Type': 'application/json' } });
    }

    return new Response(JSON.stringify({ error: 'عملیات نامعتبر است.' }), { status: 400 });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500 });
  }
}
