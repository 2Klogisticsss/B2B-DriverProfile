-- 0045: ปิดช่องโหว่จากการตรวจความปลอดภัยทั้งระบบ (2026-11-18)
--
-- ต้องรันหลัง 0044 — รันซ้ำได้
--
-- 1) ผู้ใช้แก้ profiles.email ของตัวเองได้ (profiles_self_update ล็อกแค่ role) → ตั้งอีเมลเป็นของ
--    คนใน line_switchers / allowlist บันทึกกิจกรรม แล้วได้สิทธิ์สลับฝั่ง + ดูบันทึกกิจกรรม
--    แก้: ห้ามแก้ email/id จากหน้าเว็บ และ allowlist ทุกตัวอ่านอีเมลจาก auth.users (ยืนยันแล้ว)
-- 2) ผู้ใช้ที่ถูกปิดบัญชีเปิดตัวเองกลับได้ (is_active ไม่ถูกล็อก)
--    แก้: is_active / role เปลี่ยนได้เฉพาะ admin ที่ยัง active
-- 3) ผู้ใช้ที่ถูกปิดบัญชียังอ่านข้อมูลทั้งฝั่งได้ (policy อ่านเป็น using(true))
--    แก้: current_line() คืน null เมื่อ inactive → policy แยกฝั่ง (RESTRICTIVE) ปิดทุกตารางเอง
-- 4) สมัครบัญชีเองผ่าน API ได้ (Dashboard ยังเปิด signup) แล้วได้บัญชี TRANSPORT ที่ active ทันที
--    แก้ชั้นฐานข้อมูล: บัญชีใหม่เป็น inactive จนกว่า admin เปิด (ยกเว้นอีเมลใน express_team)
--    ต้องปิด "Allow new users to sign up" ใน Dashboard ด้วย (ไฟล์นี้ทำแทนไม่ได้)
-- 5) ผู้ให้คะแนนแก้คอลัมน์ใดก็ได้ในใบของตัวเอง (overall_score, created_at, driver_id ...)
-- 6) jobs.import_batch_id ไม่ได้ตรวจว่าเป็นฝั่งเดียวกัน
-- 7) bucket รูปเอกสารไม่จำกัดชนิด/ขนาดไฟล์
--
-- เปิดบัญชีใหม่ (หลังผู้ใช้สมัคร/ถูกเชิญ):
--   update profiles set is_active = true where email = '<อีเมล>';

-- -----------------------------------------------------------------------------
-- 1+2) กันแก้คอลัมน์สำคัญของ profiles จากหน้าเว็บ
-- -----------------------------------------------------------------------------
create or replace function fn_profiles_guard() returns trigger
language plpgsql set search_path = public
as $$
begin
  -- SQL Editor / ฟังก์ชัน security definer (current_user = เจ้าของ) ผ่านได้ตามเดิม
  if current_user in ('authenticated', 'anon') then
    if new.id is distinct from old.id or new.email is distinct from old.email then
      raise exception 'ไม่สามารถแก้อีเมลหรือรหัสบัญชีจากหน้าเว็บได้';
    end if;
    if (new.is_active is distinct from old.is_active or new.role is distinct from old.role)
       and not has_role('admin') then
      raise exception 'ไม่มีสิทธิ์เปลี่ยนสถานะหรือสิทธิ์ของบัญชี';
    end if;
  end if;
  return new;
end
$$;

revoke execute on function fn_profiles_guard() from public, anon, authenticated;

drop trigger if exists profiles_guard on profiles;
create trigger profiles_guard before update on profiles
  for each row execute function fn_profiles_guard();

-- อีเมลที่ยืนยันแล้วจาก auth.users — ผู้ใช้แก้เองไม่ได้ (ต่างจาก profiles.email)
create or replace function my_verified_email() returns text
language sql stable security definer set search_path = public
as $$
  select lower(email) from auth.users where id = auth.uid() and email_confirmed_at is not null
$$;

revoke execute on function my_verified_email() from public, anon, authenticated;

create or replace function can_switch_line() returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from line_switchers s
      join profiles p on p.id = auth.uid() and p.is_active
     where s.email = my_verified_email()
  )
$$;

create or replace function can_see_activity_log() returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from profiles
     where id = auth.uid() and is_active
       and my_verified_email() = any(array[
         'kritpat.t@2klogistics.co.th',
         'awirut.tan@2klogistics.co.th',
         'datacenter@2klogistics.co.th'
       ])
  )
$$;

-- -----------------------------------------------------------------------------
-- 3) บัญชีที่ถูกปิด = ไม่มีฝั่ง = มองไม่เห็นข้อมูลฝั่งใดเลย (ยังเห็น profile ตัวเองตาม profiles_line)
-- -----------------------------------------------------------------------------
create or replace function current_line() returns text
language sql stable security definer set search_path = public
as $$ select business_line from profiles where id = auth.uid() and is_active $$;

-- -----------------------------------------------------------------------------
-- 4) บัญชีใหม่รออนุมัติ — ทีม EXPRESS ที่ลงรายชื่อไว้ล่วงหน้าเปิดให้เลย
-- -----------------------------------------------------------------------------
alter table profiles alter column is_active set default false;

create or replace function fn_profiles_assign_line() returns trigger
language plpgsql security definer set search_path = public
as $$
declare t express_team%rowtype;
begin
  select * into t from express_team where email = lower(new.email);
  if found then
    new.business_line := 'EXPRESS';
    new.role := t.role;
    new.is_active := true;
  end if;
  return new;
end
$$;

-- -----------------------------------------------------------------------------
-- 5) ใบประเมิน: ผู้ให้คะแนนแก้ได้เฉพาะเนื้อหา (เหตุผล/แท็ก/จะใช้อีกไหม) — คะแนนรวมคิดจาก
--    rating_scores ผ่าน fn_recalc_overall_score (security definer จึงไม่ติด trigger นี้)
-- -----------------------------------------------------------------------------
create or replace function fn_ratings_guard() returns trigger
language plpgsql set search_path = public
as $$
begin
  if current_user in ('authenticated', 'anon') and not has_role('admin') then
    if new.driver_id is distinct from old.driver_id
       or new.assignment_id is distinct from old.assignment_id
       or new.rater_id is distinct from old.rater_id
       or new.created_at is distinct from old.created_at
       or new.overall_score is distinct from old.overall_score
       or new.locked_at is distinct from old.locked_at
       or new.voided_at is distinct from old.voided_at then
      raise exception 'แก้ได้เฉพาะเหตุผลและรายละเอียดของใบประเมิน';
    end if;
  end if;
  return new;
end
$$;

revoke execute on function fn_ratings_guard() from public, anon, authenticated;

drop trigger if exists driver_ratings_guard on driver_ratings;
create trigger driver_ratings_guard before update on driver_ratings
  for each row execute function fn_ratings_guard();

-- -----------------------------------------------------------------------------
-- 6) งานผูกกับ batch นำเข้าของอีกฝั่งไม่ได้ (เพิ่มจาก 0039)
-- -----------------------------------------------------------------------------
create or replace function fn_same_line_refs() returns trigger
language plpgsql security definer set search_path = public
as $$
declare
  v_line text;
begin
  if tg_table_name = 'jobs' then
    v_line := new.segment;
  else
    v_line := new.business_line;
  end if;

  if tg_table_name = 'jobs' then
    if new.customer_id is not null
       and (select business_line from customers where id = new.customer_id) is distinct from v_line then
      raise exception 'ลูกค้าไม่ได้อยู่ฝั่ง %', v_line;
    end if;
    if new.vehicle_id is not null
       and (select business_line from vehicles where id = new.vehicle_id) is distinct from v_line then
      raise exception 'ทะเบียนรถไม่ได้อยู่ฝั่ง %', v_line;
    end if;
    if new.import_batch_id is not null
       and (select business_line from import_batches where id = new.import_batch_id) is distinct from v_line then
      raise exception 'ชุดนำเข้าไม่ได้อยู่ฝั่ง %', v_line;
    end if;
  end if;
  if new.vehicle_type_id is not null
     and (select business_line from vehicle_types where id = new.vehicle_type_id) is distinct from v_line then
    raise exception 'ประเภทรถไม่ได้อยู่ฝั่ง %', v_line;
  end if;
  return new;
end
$$;

-- -----------------------------------------------------------------------------
-- 7) รูปเอกสาร: หน้าเว็บย่อเป็น JPEG ก่อนอัปโหลดเสมอ (DocumentSlot.tsx) — กันไฟล์อื่นผ่าน API ตรง
-- -----------------------------------------------------------------------------
update storage.buckets
   set file_size_limit = 5 * 1024 * 1024,
       allowed_mime_types = array['image/jpeg']
 where id = 'driver-documents';
