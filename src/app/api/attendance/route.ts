import { NextResponse } from 'next/server';
import connectToDatabase from '@/lib/db';
import { getActiveStoreContext } from '@/lib/store';
import { unauthorizedResponse } from '@/lib/auth';
import { Employee, EmployeeCounter, AttendanceRecord, Shift, FestivalSchedule } from '@/models/Attendance';
import { personalIdFrom, festivalShift, attendanceToday, attendanceDates, attendanceCsv } from '@/lib/attendance';
import { isValidObjectId } from '@/lib/validation';
import { canManageAttendance } from '@/lib/attendance-access';

export const dynamic = 'force-dynamic';
const reply = (message: string, status = 400) => NextResponse.json({ message }, { status });

export async function GET(request: Request) {
  try {
    await connectToDatabase();
    const context = await getActiveStoreContext(request);
    if (!context) return unauthorizedResponse();
    const { storeId } = context;
    const params = new URL(request.url).searchParams;
    if (params.get('mode') === 'active') {
      const [records, employees] = await Promise.all([
        AttendanceRecord.find({ storeId, clockOut: null }).sort({ clockIn: 1 }).lean(),
        Employee.find({ storeId }).lean(),
      ]);
      return NextResponse.json(records.map(record => ({ ...record, name: employees.find(e => e.personalId === record.personalId)?.name || '' })));
    }
    if (params.has('personalId')) {
      const personalId = personalIdFrom(params.get('personalId'));
      if (!personalId) return reply('個人IDを正しく入力してください');
      const employee = await Employee.findOne({ storeId, personalId, archivedAt: null });
      if (!employee) return reply('このIDのスタッフは登録されていません', 404);
      const active = await AttendanceRecord.findOne({ storeId, personalId, clockOut: null });
      return NextResponse.json({ employee, active });
    }
    if (params.get('mode') === 'reminders') {
      const now = new Date();
      const today = attendanceToday();
      const festival = await FestivalSchedule.findById(storeId);
      if (!festival?.notificationDay || festival.notificationDate !== today) return NextResponse.json([]);
      const scheduled = await Shift.find({ storeId, festivalDay: festival.notificationDay }).sort({ startTime: 1 }).lean();
      const shifts = scheduled.map(s => ({ ...s, personalId: Number(s.personalId), start: new Date(`${today}T${s.startTime}:00+09:00`) })).filter(s => s.start.getTime() >= now.getTime() - 60000 && s.start.getTime() <= now.getTime() + 15 * 60000);
      const ids = shifts.map(s => s.personalId);
      const [employees, active] = await Promise.all([
        Employee.find({ storeId, personalId: { $in: ids } }).lean(),
        AttendanceRecord.find({ storeId, personalId: { $in: ids }, clockOut: null }).lean(),
      ]);
      return NextResponse.json(shifts.filter(s => !active.some(a => a.personalId === s.personalId)).map(s => ({ ...s, name: employees.find(e => e.personalId === s.personalId)?.name || '' })));
    }
    if (!await canManageAttendance(request, context.userId)) return reply('店舗アカウントのパスワードを入力してください', 403);
    if (params.get('mode') === 'csv') {
      const records = await AttendanceRecord.find({ storeId }).sort({ personalId: 1, clockIn: 1 }).lean();
      return new Response(attendanceCsv(records.map(r => ({ personalId: Number(r.personalId), clockIn: r.clockIn, clockOut: r.clockOut }))), {
        headers: { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': `attachment; filename="attendance-${attendanceToday()}.csv"`, 'Cache-Control': 'no-store' },
      });
    }
    const [employees, records, shifts, totals, festival] = await Promise.all([
      Employee.find({ storeId }).sort({ personalId: 1 }),
      AttendanceRecord.find({ storeId }).sort({ clockIn: -1 }).limit(100),
      Shift.find({ storeId }).sort({ festivalDay: 1, startTime: 1, start: 1 }),
      AttendanceRecord.aggregate([
        { $match: { storeId, clockOut: { $ne: null } } },
        { $group: { _id: '$personalId', milliseconds: { $sum: { $max: [0, { $subtract: ['$clockOut', '$clockIn'] }] } } } },
      ]),
      FestivalSchedule.findById(storeId),
    ]);
    return NextResponse.json({ employees, records, shifts, totals, notificationDay: festival?.notificationDate === attendanceToday() ? festival.notificationDay : 0 });
  } catch { return reply('勤怠情報を取得できませんでした', 500); }
}

export async function POST(request: Request) {
  try {
    await connectToDatabase();
    const context = await getActiveStoreContext(request);
    if (!context) return unauthorizedResponse();
    const { storeId } = context;
    const body = await request.json();
    if (!body || typeof body !== 'object' || Array.isArray(body)) return reply('入力が不正です');
    if (body.action !== 'clockIn' && body.action !== 'clockOut' && !await canManageAttendance(request, context.userId)) return reply('店舗アカウントのパスワードを入力してください', 403);
    if (body.action === 'notificationDay') {
      if (![0, 1, 2].includes(body.day)) return reply('通知対象を正しく選択してください');
      await FestivalSchedule.findOneAndUpdate({ _id: storeId }, { $set: { notificationDay: body.day, notificationDate: attendanceToday() } }, { upsert: true });
      return reply('本日の通知対象を変更しました', 200);
    }
    if (body.action === 'employee' || body.action === 'employees') {
      const names: unknown[] = body.action === 'employee' ? [body.name] : body.names;
      if (!Array.isArray(names) || names.length < 1 || names.length > 200) return reply('スタッフは1〜200人で登録してください');
      if (names.some(name => typeof name !== 'string' || !name.trim() || name.trim().length > 80)) return reply('氏名を1〜80文字で入力してください');
      // Counter allocation and employee creation commit together; failed registration consumes no ID.
      const employees = await Employee.db.transaction(async session => {
        const counter = await EmployeeCounter.findOneAndUpdate({ _id: storeId }, { $inc: { value: names.length } }, { upsert: true, new: true, session });
        return Employee.create(names.map((name, index) => ({ storeId, personalId: counter.value - names.length + index + 1, name: (name as string).trim() })), { session, ordered: true });
      });
      return NextResponse.json(body.action === 'employee' ? employees[0] : { employees }, { status: 201 });
    }
    const personalId = personalIdFrom(body.personalId);
    if (!personalId) return reply('個人IDを正しく入力してください');
    if (!['clockIn', 'clockOut', 'shift', 'updateShift', 'deleteShift', 'changeId', 'deleteEmployee', 'updateRecord', 'deleteRecord'].includes(body.action)) return reply('操作が不正です');
    const managingRecord = ['updateRecord', 'deleteRecord'].includes(body.action);
    if (managingRecord && !isValidObjectId(body.recordId)) return reply('打刻履歴IDが不正です');
    if (body.action === 'deleteEmployee' && !isValidObjectId(body.employeeId)) return reply('スタッフIDが不正です');
    const newPersonalId = personalIdFrom(body.newPersonalId);
    if (body.action === 'changeId' && (!newPersonalId || newPersonalId >= Number.MAX_SAFE_INTEGER || !isValidObjectId(body.employeeId))) return reply('新しい個人IDを正しく入力してください');
    if (['deleteShift', 'updateShift'].includes(body.action) && !isValidObjectId(body.shiftId)) return reply('シフトIDが不正です');
    const result = await Employee.db.transaction(async session => {
      // Serialize changes for each employee, including simultaneous punches and overlapping shifts.
      const employee = await Employee.findOneAndUpdate({ storeId, personalId, ...(!managingRecord ? { archivedAt: null } : {}), ...(body.employeeId ? { _id: body.employeeId } : {}) }, { $inc: { revision: 1 } }, { session });
      if (!employee) return { message: 'スタッフが見つかりません', status: 404 };
      if (managingRecord) {
        const record = await AttendanceRecord.findOne({ _id: body.recordId, storeId, personalId }).session(session);
        if (!record) return { message: '打刻履歴が見つかりません', status: 404 };
        if (record.clockIn.toISOString() !== body.originalClockIn || (record.clockOut?.toISOString() ?? null) !== body.originalClockOut) return { message: '打刻履歴が変更されています。再取得してから操作してください', status: 409 };
        if (body.action === 'deleteRecord') {
          await AttendanceRecord.deleteOne({ _id: record._id, storeId, personalId }, { session });
          return { message: '打刻履歴を削除しました', status: 200 };
        }
        const dates = attendanceDates(body.clockIn, body.clockOut);
        if (!dates) return { message: '日時を正しく入力し、退勤を出勤より後にしてください', status: 400 };
        if (!dates.clockOut && employee.archivedAt) return { message: '削除済みスタッフを出勤中にはできません', status: 400 };
        const overlap = await AttendanceRecord.exists({ storeId, personalId, _id: { $ne: record._id }, ...(dates.clockOut ? { clockIn: { $lt: dates.clockOut } } : {}), $or: [{ clockOut: null }, { clockOut: { $gt: dates.clockIn } }] }).session(session);
        if (overlap) return { message: '他の打刻履歴と時間が重なっています', status: 409 };
        Object.assign(record, dates);
        await record.save({ session });
        return { message: '打刻履歴を更新しました', status: 200 };
      }
      if (body.action === 'deleteEmployee') {
        const active = await AttendanceRecord.findOne({ storeId, personalId, clockOut: null }).session(session);
        if (active) return { message: '出勤中のスタッフは退勤してから削除してください', status: 409 };
        await Employee.updateOne({ _id: employee._id, storeId }, { $set: { archivedAt: new Date() } }, { session });
        await Shift.deleteMany({ storeId, personalId, $or: [{ festivalDay: { $in: [1, 2] } }, { end: { $gte: new Date() } }] }, { session });
        return { message: 'スタッフを削除しました。打刻履歴と勤務時間は保存されています', status: 200 };
      }
      if (body.action === 'changeId' && newPersonalId) {
        if (newPersonalId === personalId) return { message: '同じ個人IDです', status: 200 };
        const existing = await Employee.exists({ storeId, personalId: newPersonalId }).session(session);
        if (existing) return { message: 'その個人IDはすでに使われています', status: 409 };
        // Keep automatic allocation above manually assigned IDs, in the same transaction.
        await EmployeeCounter.findOneAndUpdate({ _id: storeId }, { $max: { value: newPersonalId } }, { upsert: true, session });
        await Employee.updateOne({ _id: employee._id, storeId }, { $set: { personalId: newPersonalId } }, { session });
        await AttendanceRecord.updateMany({ storeId, personalId }, { $set: { personalId: newPersonalId } }, { session });
        await Shift.updateMany({ storeId, personalId }, { $set: { personalId: newPersonalId } }, { session });
        return { message: `個人IDを${newPersonalId}に変更しました`, status: 200 };
      }
      if (body.action === 'shift' || body.action === 'updateShift') {
        const dates = festivalShift(body.day, body.start, body.end);
        if (!dates) return { message: '1日目・2日目を選び、10:00〜16:00の30分刻みで終了を開始より後に設定してください', status: 400 };
        const overlap = await Shift.exists({ storeId, personalId, festivalDay: dates.festivalDay, ...(body.action === 'updateShift' ? { _id: { $ne: body.shiftId } } : {}), startTime: { $lt: dates.endTime }, endTime: { $gt: dates.startTime } }).session(session);
        if (overlap) return { message: '既存のシフトと時間が重なっています', status: 409 };
        if (body.action === 'updateShift') {
          const updated = await Shift.findOneAndUpdate({ _id: body.shiftId, storeId, personalId }, { $set: dates, $unset: { start: 1, end: 1 } }, { session });
          return { message: updated ? 'シフトを更新しました' : 'シフトが見つかりません', status: updated ? 200 : 404 };
        }
        await Shift.create([{ storeId, personalId, ...dates }], { session });
        return { message: 'シフトを登録しました', status: 201 };
      }
      if (body.action === 'deleteShift') {
        const deleted = await Shift.findOneAndDelete({ _id: body.shiftId, storeId, personalId }, { session });
        return { message: deleted ? 'シフトを削除しました' : 'シフトが見つかりません', status: deleted ? 200 : 404 };
      }
      const active = await AttendanceRecord.findOne({ storeId, personalId, clockOut: null }).session(session);
      if (body.action === 'clockIn') {
        if (active) return { message: 'すでに出勤しています。状態を再取得してください', status: 409 };
        await AttendanceRecord.create([{ storeId, personalId, clockIn: new Date(), clockOut: null }], { session });
      } else {
        if (!active || String(active._id) !== body.recordId) return { message: '勤怠状態が変わりました。状態を再取得してください', status: 409 };
        active.clockOut = new Date();
        await active.save({ session });
      }
      return { message: body.action === 'clockIn' ? '出勤を記録しました' : '退勤を記録しました', status: 200 };
    });
    return reply(result.message, result.status);
  } catch (error) {
    if (error && typeof error === 'object' && 'code' in error && error.code === 11000) return reply('IDまたは勤怠状態が変更されました。再取得してください', 409);
    if (error instanceof SyntaxError) return reply('入力が不正です');
    return reply('保存できませんでした。再取得して状態を確認してください', 500);
  }
}
