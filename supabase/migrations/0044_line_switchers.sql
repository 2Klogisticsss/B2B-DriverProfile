-- 0044: บัญชีที่เลือกฝั่งได้ตอนเข้าสู่ระบบ (TRANSPORT/B2B หรือ EXPRESS)
--
-- ต้องรันหลัง 0039/0040
--
-- ไม่แตะ RLS เลย — ทุก policy ยังผูกกับ profiles.business_line ผ่าน current_line() ค่าเดียว
-- การ "เลือกฝั่ง" คือย้าย business_line ของตัวเองผ่าน set_my_line() เท่านั้น
--   - ผู้ใช้หน้าเว็บยังย้ายฝั่งตรง ๆ ไม่ได้ (trigger profiles_lock_line ของ 0039 กันไว้)
--   - set_my_line() เป็น security definer → current_user เป็นเจ้าของฟังก์ชัน ไม่ใช่
--     authenticated จึงผ่าน trigger นั้น แต่เช็ครายชื่อใน line_switchers ก่อนเสมอ
--
-- ข้อจำกัด: ฝั่งเป็นค่าเดียวต่อบัญชี — เปิดสองแท็บแล้วเลือกคนละฝั่ง แท็บแรกจะกลายเป็นฝั่งที่
-- เลือกล่าสุด (ข้อมูลไม่รั่วข้ามฝั่ง แค่สลับตาม) ถ้าต้องดูพร้อมกันสองฝั่งต้องเปลี่ยนมาผูก
-- ฝั่งกับ session/JWT แทน
--
-- เพิ่ม/ลดคน: insert/delete ในตาราง line_switchers จาก SQL Editor

create table if not exists line_switchers (
  email  text primary key check (email = lower(email)),
  note   text
);

-- ไม่มี policy = ผู้ใช้หน้าเว็บอ่าน/แก้ไม่ได้เลย (เหมือน express_team)
alter table line_switchers enable row level security;
revoke all on line_switchers from anon, authenticated;

insert into line_switchers (email) values
  ('awirut.tan@2klogistics.co.th'),
  ('datacenter@2klogistics.co.th'),
  ('kritpat.t@2klogistics.co.th')
on conflict (email) do nothing;

create or replace function can_switch_line() returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from line_switchers s
      join profiles p on lower(p.email) = s.email
     where p.id = auth.uid()
  )
$$;

create or replace function set_my_line(p_line text) returns void
language plpgsql security definer set search_path = public
as $$
begin
  if p_line not in ('B2B', 'EXPRESS') then
    raise exception 'ฝั่งไม่ถูกต้อง: %', p_line;
  end if;
  if not can_switch_line() then
    raise exception 'บัญชีนี้ไม่มีสิทธิ์เลือกฝั่ง';
  end if;
  update profiles set business_line = p_line where id = auth.uid();
end
$$;

revoke execute on function can_switch_line() from public, anon;
revoke execute on function set_my_line(text) from public, anon;
grant execute on function can_switch_line() to authenticated;
grant execute on function set_my_line(text) to authenticated;
