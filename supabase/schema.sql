-- =====================================================================
-- JWPS Apartments — Resident Portal
-- supabase/schema.sql  (Phase 1 — full rebuild, idempotent, re-runnable)
-- Revision: T0-R2 (applicant acknowledgment columns; flat rent 825 / utilities 45)
--
-- Paste this entire file into the Supabase SQL Editor and run once.
-- WARNING: drops and recreates every public table. All data is lost.
-- auth schema is never dropped (auth.users is managed by Supabase).
-- =====================================================================

-- ---------------------------------------------------------------------
-- 0. EXTENSIONS
-- ---------------------------------------------------------------------
create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------
-- 1. DROP SECTION (reverse FK dependency order)
-- ---------------------------------------------------------------------

-- 1a. trigger on auth.users (drop before its function)
drop trigger if exists on_auth_user_created on auth.users;

-- 1b. tables (children first)
drop table if exists public.charge_lines          cascade;
drop table if exists public.payments              cascade;
drop table if exists public.maintenance_requests  cascade;
drop table if exists public.notifications         cascade;
drop table if exists public.invoices              cascade;
drop table if exists public.leases                cascade;
drop table if exists public.applications          cascade;
drop table if exists public.profiles              cascade;

-- 1c. functions
drop function if exists public.approve_application(uuid)                cascade;
drop function if exists public.decline_application(uuid, text)          cascade;
drop function if exists public.resubmit_application(uuid)               cascade;
drop function if exists public.record_payment(uuid, numeric, text)      cascade;
drop function if exists public.gen_payment_confirmation()               cascade;
drop function if exists public.next_maintenance_number()                cascade;
drop function if exists public.handle_new_user()                        cascade;
drop function if exists public.is_admin()                               cascade;
drop function if exists public.set_updated_at()                         cascade;

-- 1d. sequences
drop sequence if exists public.maintenance_number_seq cascade;

-- 1e. enum types
drop type if exists public.signature_status     cascade;
drop type if exists public.floor_code           cascade;
drop type if exists public.building_code        cascade;
drop type if exists public.room_label           cascade;
drop type if exists public.maintenance_category cascade;
drop type if exists public.maintenance_status   cascade;
drop type if exists public.invoice_status       cascade;
drop type if exists public.lease_type           cascade;
drop type if exists public.application_status   cascade;
drop type if exists public.profile_status       cascade;
drop type if exists public.user_role            cascade;

-- ---------------------------------------------------------------------
-- 2. ENUM TYPES
-- ---------------------------------------------------------------------
create type public.user_role            as enum ('resident', 'admin');
create type public.profile_status       as enum ('pending', 'active', 'declined');
create type public.application_status   as enum ('pending', 'approved', 'declined');
create type public.lease_type           as enum ('rent', 'parking');
create type public.invoice_status       as enum ('due', 'partial', 'paid', 'overdue');
create type public.maintenance_status   as enum ('submitted', 'in_progress', 'completed');
create type public.maintenance_category as enum ('plumbing', 'electrical', 'hvac', 'appliance', 'general');
create type public.room_label           as enum ('A', 'B', 'C', 'D', 'E');
create type public.building_code        as enum ('1240_arthur', '1243_arthur', '6419_wayne');
create type public.floor_code           as enum ('garden', 'first', 'second');
create type public.signature_status     as enum ('unsigned', 'signed');

-- ---------------------------------------------------------------------
-- 3. SEQUENCES + DEFAULT-SUPPORTING FUNCTIONS
--    next_maintenance_number() must be defined here: section 4 uses it
--    as a column DEFAULT, which is resolved at table-creation time.
-- ---------------------------------------------------------------------
create sequence public.maintenance_number_seq start 1000 increment 1;

create or replace function public.next_maintenance_number()
returns text
language sql
volatile
security definer
set search_path = public
as $$
  select 'MR-' || lpad(nextval('public.maintenance_number_seq')::text, 6, '0');
$$;

-- ---------------------------------------------------------------------
-- 4. TABLES
-- ---------------------------------------------------------------------

-- 4.1 profiles ---------------------------------------------------------
create table public.profiles (
  id                   uuid primary key references auth.users(id) on delete cascade,
  role                 public.user_role      not null default 'resident',
  status               public.profile_status not null default 'pending',

  first_name           text,
  middle_name          text,
  last_name            text,

  email                text,
  phone                text,
  date_of_birth        date,

  building             public.building_code,
  floor                public.floor_code,
  room_label           public.room_label,
  move_in_date         date,

  autopay_enabled      boolean not null default false,
  notify_email         boolean not null default true,
  notify_text          boolean not null default false,

  vehicle_make         text,
  vehicle_model        text,
  vehicle_color        text,
  vehicle_plate        text,
  vehicle_year         integer,

  payment_method_label text,

  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);

create index profiles_role_idx      on public.profiles (role);
create index profiles_status_idx    on public.profiles (status);
create index profiles_email_idx     on public.profiles (email);

-- 4.2 applications -----------------------------------------------------
create table public.applications (
  id                       uuid primary key default gen_random_uuid(),
  user_id                  uuid not null references auth.users(id) on delete cascade,
  status                   public.application_status not null default 'pending',

  submitted_at             timestamptz not null default now(),
  reviewed_at              timestamptz,
  reviewed_by              uuid references auth.users(id) on delete set null,
  decline_note             text,

  -- applicant name (3 columns)
  first_name               text,
  middle_name              text,
  last_name                text,

  -- applicant current address (5 columns)
  address_line1            text,
  address_line2            text,
  city                     text,
  state                    text,
  zip                      text,

  phone                    text,
  email                    text,
  date_of_birth            date,

  -- desired unit (3-level address)
  desired_building         public.building_code,
  desired_floor            public.floor_code,
  desired_room             public.room_label,

  -- sensitive PII: Phase 1 enforces NULL
  ssn_or_itin              text,
  drivers_license          text,

  residency_history        jsonb not null default '[]'::jsonb,

  school_name              text,
  student_id               text,
  class_standing           text,
  expected_graduation      text,
  enrollment_status        text,
  proof_of_enrollment_url  text,

  guarantor                jsonb not null default '{}'::jsonb,
  guarantor_required       boolean not null default true,

  co_applicants            jsonb not null default '[]'::jsonb,
  "references"             jsonb not null default '[]'::jsonb,

  consent_credit           boolean not null default false,
  consent_criminal         boolean not null default false,
  consent_rental_history   boolean not null default false,
  consent_at               timestamptz,

  -- applicant's own print-name acknowledgment (T0-R2).
  -- The guarantor's acknowledgment stays inside the `guarantor` jsonb.
  applicant_print_name_ack text,
  applicant_ack_date       date,

  constraint applications_no_sensitive_pii check (
    ssn_or_itin is null
    and drivers_license is null
    and (guarantor->>'guarantor_ssn') is null
  )
);

-- only one pending application per user
create unique index applications_one_pending_per_user
  on public.applications (user_id)
  where status = 'pending';

create index applications_user_id_idx      on public.applications (user_id);
create index applications_status_idx       on public.applications (status);
create index applications_submitted_at_idx on public.applications (submitted_at desc);

-- 4.3 leases -----------------------------------------------------------
create table public.leases (
  id               uuid primary key default gen_random_uuid(),
  resident_id      uuid not null references public.profiles(id) on delete cascade,
  type             public.lease_type not null default 'rent',

  building         public.building_code,
  floor            public.floor_code,
  room_label       public.room_label,

  monthly_rate     numeric(10,2) not null default 0,
  start_date       date,
  end_date         date,
  status           text not null default 'active' check (status in ('active', 'ended')),
  signature_status public.signature_status not null default 'unsigned',

  created_at       timestamptz not null default now()
);

create index leases_resident_id_idx on public.leases (resident_id);
create index leases_status_idx      on public.leases (status);

-- 4.4 invoices ---------------------------------------------------------
create table public.invoices (
  id           uuid primary key default gen_random_uuid(),
  resident_id  uuid not null references public.profiles(id) on delete cascade,
  lease_id     uuid references public.leases(id) on delete set null,

  period_month date not null,
  due_date     date not null,
  amount_due   numeric(10,2) not null default 0,
  amount_paid  numeric(10,2) not null default 0,
  status       public.invoice_status not null default 'due',

  created_at   timestamptz not null default now()
);

create index invoices_resident_id_idx  on public.invoices (resident_id);
create index invoices_status_idx       on public.invoices (status);
create index invoices_due_date_idx     on public.invoices (due_date desc);
create index invoices_period_month_idx on public.invoices (period_month desc);

-- 4.5 charge_lines -----------------------------------------------------
create table public.charge_lines (
  id         uuid primary key default gen_random_uuid(),
  invoice_id uuid not null references public.invoices(id) on delete cascade,
  label      text not null,
  amount     numeric(10,2) not null default 0,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

create index charge_lines_invoice_id_idx on public.charge_lines (invoice_id);

-- 4.6 payments ---------------------------------------------------------
create table public.payments (
  id                uuid primary key default gen_random_uuid(),
  resident_id       uuid not null references public.profiles(id) on delete cascade,
  invoice_id        uuid references public.invoices(id) on delete set null,
  amount            numeric(10,2) not null,
  method            text not null default 'card',
  confirmation_code text not null unique,
  paid_at           timestamptz not null default now(),
  created_at        timestamptz not null default now()
);

create index payments_resident_id_idx on public.payments (resident_id);
create index payments_invoice_id_idx  on public.payments (invoice_id);
create index payments_paid_at_idx     on public.payments (paid_at desc);

-- 4.7 maintenance_requests --------------------------------------------
create table public.maintenance_requests (
  id             uuid primary key default gen_random_uuid(),
  resident_id    uuid not null references public.profiles(id) on delete cascade,
  request_number text not null unique default public.next_maintenance_number(),

  category       public.maintenance_category not null default 'general',
  title          text not null,
  description    text,
  permission_to_enter boolean not null default true,
  photo_path     text,

  status         public.maintenance_status not null default 'submitted',
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  completed_at   timestamptz
);

create index maintenance_requests_resident_id_idx on public.maintenance_requests (resident_id);
create index maintenance_requests_status_idx      on public.maintenance_requests (status);
create index maintenance_requests_created_at_idx  on public.maintenance_requests (created_at desc);

-- 4.8 notifications ----------------------------------------------------
create table public.notifications (
  id          uuid primary key default gen_random_uuid(),
  resident_id uuid not null references public.profiles(id) on delete cascade,
  title       text not null,
  body        text,
  read        boolean not null default false,
  created_at  timestamptz not null default now()
);

create index notifications_resident_id_idx on public.notifications (resident_id);
create index notifications_read_idx        on public.notifications (read);
create index notifications_created_at_idx  on public.notifications (created_at desc);

-- ---------------------------------------------------------------------
-- 5. FUNCTIONS  (all SECURITY DEFINER, search_path = public)
--    next_maintenance_number() is defined earlier, in section 3.
-- ---------------------------------------------------------------------

-- 5.1 updated_at helper -----------------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

create trigger maintenance_requests_set_updated_at
  before update on public.maintenance_requests
  for each row execute function public.set_updated_at();

-- 5.2 is_admin ---------------------------------------------------------
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p.role = 'admin'
  );
$$;

-- 5.3 gen_payment_confirmation ----------------------------------------
create or replace function public.gen_payment_confirmation()
returns text
language sql
volatile
security definer
set search_path = public
as $$
  select 'JWPS-PMT-'
      || to_char(now() at time zone 'utc', 'YYYYMMDD')
      || '-'
      || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 6));
$$;

-- 5.4 handle_new_user --------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_meta   jsonb := coalesce(new.raw_user_meta_data, '{}'::jsonb);
  v_first  text;
  v_middle text;
  v_last   text;
  v_full   text;
  v_parts  text[];
  v_n      integer;
begin
  -- preferred: discrete name fields from metadata
  v_first  := nullif(btrim(coalesce(v_meta->>'first_name',  '')), '');
  v_middle := nullif(btrim(coalesce(v_meta->>'middle_name', '')), '');
  v_last   := nullif(btrim(coalesce(v_meta->>'last_name',   '')), '');

  -- fallback: derive from full_name / name
  if v_first is null and v_last is null then
    v_full := nullif(btrim(coalesce(v_meta->>'full_name', v_meta->>'name', '')), '');

    if v_full is not null then
      v_parts := regexp_split_to_array(v_full, '\s+');
      v_n     := array_length(v_parts, 1);

      if v_n = 1 then
        v_first := v_parts[1];
      elsif v_n = 2 then
        v_first := v_parts[1];
        v_last  := v_parts[2];
      else
        v_first  := v_parts[1];
        v_last   := v_parts[v_n];
        v_middle := array_to_string(v_parts[2 : v_n - 1], ' ');
      end if;
    end if;
  end if;

  insert into public.profiles (id, email, first_name, middle_name, last_name, phone)
  values (
    new.id,
    new.email,
    v_first,
    v_middle,
    v_last,
    nullif(btrim(coalesce(v_meta->>'phone', '')), '')
  )
  on conflict (id) do nothing;

  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- 5.5 record_payment ---------------------------------------------------
create or replace function public.record_payment(
  p_invoice_id uuid,
  p_amount     numeric,
  p_method     text default 'card'
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_inv        public.invoices%rowtype;
  v_code       text;
  v_payment_id uuid;
  v_new_paid   numeric(10,2);
  v_new_status public.invoice_status;
  v_balance    numeric(10,2);
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;

  select * into v_inv
  from public.invoices
  where id = p_invoice_id
  for update;

  if not found then
    raise exception 'invoice not found';
  end if;

  if v_inv.resident_id <> auth.uid() and not public.is_admin() then
    raise exception 'not authorized';
  end if;

  if p_amount is null or p_amount <= 0 then
    raise exception 'invalid payment amount';
  end if;

  v_balance := v_inv.amount_due - v_inv.amount_paid;

  if v_balance <= 0 then
    raise exception 'invoice already paid in full';
  end if;

  if p_amount > v_balance then
    raise exception 'payment amount exceeds outstanding balance';
  end if;

  v_code := public.gen_payment_confirmation();

  insert into public.payments (resident_id, invoice_id, amount, method, confirmation_code)
  values (v_inv.resident_id, v_inv.id, p_amount, coalesce(nullif(btrim(p_method), ''), 'card'), v_code)
  returning id into v_payment_id;

  v_new_paid := v_inv.amount_paid + p_amount;

  v_new_status := case
    when v_new_paid >= v_inv.amount_due then 'paid'::public.invoice_status
    when v_new_paid > 0                 then 'partial'::public.invoice_status
    else v_inv.status
  end;

  update public.invoices
     set amount_paid = v_new_paid,
         status      = v_new_status
   where id = v_inv.id;

  insert into public.notifications (resident_id, title, body)
  values (
    v_inv.resident_id,
    'Payment received',
    'We received your payment of $' || to_char(p_amount, 'FM999999990.00')
      || '. Confirmation code ' || v_code || '.'
  );

  return jsonb_build_object(
    'payment_id',        v_payment_id,
    'confirmation_code', v_code,
    'invoice_id',        v_inv.id,
    'amount',            p_amount,
    'amount_paid',       v_new_paid,
    'amount_due',        v_inv.amount_due,
    'invoice_status',    v_new_status,
    'paid_at',           now()
  );
end;
$$;

-- 5.6 approve_application ---------------------------------------------
create or replace function public.approve_application(p_application_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_app            public.applications%rowtype;
  v_rent           numeric(10,2) := 825.00;  -- client-confirmed: flat rate, every room
  v_utilities      numeric(10,2) := 45.00;   -- client-confirmed
  v_lease_id       uuid;
  v_curr_invoice   uuid;
  v_prev_invoice   uuid;
  v_start          date := date_trunc('month', now())::date;
  v_end            date := (date_trunc('month', now()) + interval '1 year' - interval '1 day')::date;
  v_prev_month     date := (date_trunc('month', now()) - interval '1 month')::date;
  v_total          numeric(10,2);
  v_code           text;
begin
  if not public.is_admin() then
    raise exception 'not authorized';
  end if;

  select * into v_app
  from public.applications
  where id = p_application_id
  for update;

  if not found then
    raise exception 'application not found';
  end if;

  -- re-entrancy guard
  if v_app.status <> 'pending' then
    raise exception 'application has already been reviewed (status: %)', v_app.status;
  end if;

  if exists (select 1 from public.leases where resident_id = v_app.user_id) then
    raise exception 'resident already has a lease; approval aborted';
  end if;

  -- T0-R2: rent is a flat 825.00 for every room; no room-based CASE.
  v_total := v_rent + v_utilities;

  -- 1. application row
  update public.applications
     set status       = 'approved',
         reviewed_at  = now(),
         reviewed_by  = auth.uid(),
         decline_note = null
   where id = v_app.id;

  -- 2. profile
  update public.profiles
     set status        = 'active',
         first_name    = coalesce(v_app.first_name,  first_name),
         middle_name   = v_app.middle_name,
         last_name     = coalesce(v_app.last_name,   last_name),
         email         = coalesce(v_app.email,       email),
         phone         = coalesce(v_app.phone,       phone),
         date_of_birth = coalesce(v_app.date_of_birth, date_of_birth),
         building      = v_app.desired_building,
         floor         = v_app.desired_floor,
         room_label    = v_app.desired_room,
         move_in_date  = coalesce(move_in_date, v_start)
   where id = v_app.user_id;

  -- 3. lease
  insert into public.leases (
    resident_id, type, building, floor, room_label,
    monthly_rate, start_date, end_date, status, signature_status
  )
  values (
    v_app.user_id, 'rent', v_app.desired_building, v_app.desired_floor, v_app.desired_room,
    v_rent, v_start, v_end, 'active', 'unsigned'
  )
  returning id into v_lease_id;

  -- 4a. previous month invoice (paid) — seeds payment history
  insert into public.invoices (resident_id, lease_id, period_month, due_date, amount_due, amount_paid, status)
  values (v_app.user_id, v_lease_id, v_prev_month, v_start, v_total, v_total, 'paid')
  returning id into v_prev_invoice;

  insert into public.charge_lines (invoice_id, label, amount, sort_order) values
    (v_prev_invoice, 'Monthly rent', v_rent,      1),
    (v_prev_invoice, 'Utilities',    v_utilities, 2);

  v_code := public.gen_payment_confirmation();

  insert into public.payments (resident_id, invoice_id, amount, method, confirmation_code, paid_at)
  values (v_app.user_id, v_prev_invoice, v_total, 'card', v_code, v_start::timestamptz);

  -- 4b. current month invoice (unpaid)
  insert into public.invoices (resident_id, lease_id, period_month, due_date, amount_due, amount_paid, status)
  values (
    v_app.user_id, v_lease_id, v_start,
    (date_trunc('month', now()) + interval '1 month')::date,
    v_total, 0, 'due'
  )
  returning id into v_curr_invoice;

  insert into public.charge_lines (invoice_id, label, amount, sort_order) values
    (v_curr_invoice, 'Monthly rent', v_rent,      1),
    (v_curr_invoice, 'Utilities',    v_utilities, 2);

  -- 5. seed maintenance request
  insert into public.maintenance_requests (resident_id, category, title, description, status)
  values (
    v_app.user_id, 'general', 'Welcome walkthrough',
    'Move-in condition walkthrough scheduled by the property team.', 'completed'
  );

  -- 6. seed notifications
  insert into public.notifications (resident_id, title, body) values
    (v_app.user_id, 'Application approved',
     'Your application has been approved. Your resident portal is now active.'),
    (v_app.user_id, 'Lease ready for review',
     'Your lease is available in the portal. E-signature will be enabled soon.');

  return jsonb_build_object(
    'application_id', v_app.id,
    'user_id',        v_app.user_id,
    'lease_id',       v_lease_id,
    'monthly_rate',   v_rent,
    'start_date',     v_start,
    'end_date',       v_end,
    'building',       v_app.desired_building,
    'floor',          v_app.desired_floor,
    'room_label',     v_app.desired_room
  );
end;
$$;

-- 5.7 decline_application ---------------------------------------------
create or replace function public.decline_application(
  p_application_id uuid,
  p_note           text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_app public.applications%rowtype;
begin
  if not public.is_admin() then
    raise exception 'not authorized';
  end if;

  select * into v_app
  from public.applications
  where id = p_application_id
  for update;

  if not found then
    raise exception 'application not found';
  end if;

  if v_app.status <> 'pending' then
    raise exception 'application has already been reviewed (status: %)', v_app.status;
  end if;

  update public.applications
     set status       = 'declined',
         reviewed_at  = now(),
         reviewed_by  = auth.uid(),
         decline_note = nullif(btrim(coalesce(p_note, '')), '')
   where id = v_app.id;

  update public.profiles
     set status = 'declined'
   where id = v_app.user_id
     and status <> 'active';

  insert into public.notifications (resident_id, title, body)
  values (
    v_app.user_id,
    'Application update',
    coalesce(
      nullif(btrim(coalesce(p_note, '')), ''),
      'Your application was not approved at this time. You may update and resubmit it.'
    )
  );

  return jsonb_build_object(
    'application_id', v_app.id,
    'user_id',        v_app.user_id,
    'status',         'declined',
    'decline_note',   nullif(btrim(coalesce(p_note, '')), '')
  );
end;
$$;

-- 5.8 resubmit_application --------------------------------------------
create or replace function public.resubmit_application(p_application_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_app public.applications%rowtype;
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;

  select * into v_app
  from public.applications
  where id = p_application_id
  for update;

  if not found then
    raise exception 'application not found';
  end if;

  if v_app.user_id <> auth.uid() and not public.is_admin() then
    raise exception 'not authorized';
  end if;

  if v_app.status <> 'declined' then
    raise exception 'only a declined application can be resubmitted (status: %)', v_app.status;
  end if;

  if exists (
    select 1 from public.applications
    where user_id = v_app.user_id and status = 'pending'
  ) then
    raise exception 'a pending application already exists for this user';
  end if;

  update public.applications
     set status       = 'pending',
         submitted_at = now(),
         reviewed_at  = null,
         reviewed_by  = null,
         decline_note = null
   where id = v_app.id;

  update public.profiles
     set status = 'pending'
   where id = v_app.user_id
     and status = 'declined';

  return jsonb_build_object(
    'application_id', v_app.id,
    'user_id',        v_app.user_id,
    'status',         'pending',
    'submitted_at',   now()
  );
end;
$$;

-- ---------------------------------------------------------------------
-- 6. ROW LEVEL SECURITY
-- ---------------------------------------------------------------------
alter table public.profiles             enable row level security;
alter table public.applications         enable row level security;
alter table public.leases               enable row level security;
alter table public.invoices             enable row level security;
alter table public.charge_lines         enable row level security;
alter table public.payments             enable row level security;
alter table public.maintenance_requests enable row level security;
alter table public.notifications        enable row level security;

-- 6.1 profiles ---------------------------------------------------------
create policy profiles_select_own on public.profiles
  for select to authenticated
  using (id = auth.uid());

create policy profiles_select_admin on public.profiles
  for select to authenticated
  using (public.is_admin());

create policy profiles_update_own on public.profiles
  for update to authenticated
  using (id = auth.uid())
  with check (id = auth.uid());

create policy profiles_update_admin on public.profiles
  for update to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- 6.2 applications -----------------------------------------------------
create policy applications_select_own on public.applications
  for select to authenticated
  using (user_id = auth.uid());

create policy applications_select_admin on public.applications
  for select to authenticated
  using (public.is_admin());

create policy applications_insert_own on public.applications
  for insert to authenticated
  with check (user_id = auth.uid() and status = 'pending');

create policy applications_update_admin on public.applications
  for update to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- 6.3 leases -----------------------------------------------------------
create policy leases_select_own on public.leases
  for select to authenticated
  using (resident_id = auth.uid());

create policy leases_select_admin on public.leases
  for select to authenticated
  using (public.is_admin());

create policy leases_update_admin on public.leases
  for update to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- 6.4 invoices ---------------------------------------------------------
create policy invoices_select_own on public.invoices
  for select to authenticated
  using (resident_id = auth.uid());

create policy invoices_select_admin on public.invoices
  for select to authenticated
  using (public.is_admin());

-- 6.5 charge_lines -----------------------------------------------------
create policy charge_lines_select_own on public.charge_lines
  for select to authenticated
  using (
    exists (
      select 1 from public.invoices i
      where i.id = charge_lines.invoice_id
        and i.resident_id = auth.uid()
    )
  );

create policy charge_lines_select_admin on public.charge_lines
  for select to authenticated
  using (public.is_admin());

-- 6.6 payments (read only; writes go through record_payment RPC) -------
create policy payments_select_own on public.payments
  for select to authenticated
  using (resident_id = auth.uid());

create policy payments_select_admin on public.payments
  for select to authenticated
  using (public.is_admin());

-- 6.7 maintenance_requests --------------------------------------------
create policy maintenance_select_own on public.maintenance_requests
  for select to authenticated
  using (resident_id = auth.uid());

create policy maintenance_select_admin on public.maintenance_requests
  for select to authenticated
  using (public.is_admin());

create policy maintenance_insert_own on public.maintenance_requests
  for insert to authenticated
  with check (resident_id = auth.uid());

create policy maintenance_update_admin on public.maintenance_requests
  for update to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- 6.8 notifications ----------------------------------------------------
create policy notifications_select_own on public.notifications
  for select to authenticated
  using (resident_id = auth.uid());

create policy notifications_select_admin on public.notifications
  for select to authenticated
  using (public.is_admin());

create policy notifications_update_own on public.notifications
  for update to authenticated
  using (resident_id = auth.uid())
  with check (resident_id = auth.uid());

-- ---------------------------------------------------------------------
-- 7. GRANTS  (table + column level)
-- ---------------------------------------------------------------------
grant usage on schema public to anon, authenticated;

-- profiles: select for all columns, update restricted to a whitelist
revoke all on public.profiles from anon, authenticated;
grant select on public.profiles to authenticated;
grant update (
  phone,
  autopay_enabled,
  notify_email,
  notify_text,
  vehicle_make,
  vehicle_model,
  vehicle_color,
  vehicle_plate,
  vehicle_year,
  payment_method_label
) on public.profiles to authenticated;

-- applications
-- INSERT is granted at TABLE level, so it automatically covers the T0-R2
-- columns (applicant_print_name_ack, applicant_ack_date). Column-level
-- restriction is applied to UPDATE only.
revoke all on public.applications from anon, authenticated;
grant select, insert on public.applications to authenticated;
grant update (
  status,
  reviewed_at,
  reviewed_by,
  decline_note
) on public.applications to authenticated;

-- leases / invoices / charge_lines / payments: read only for clients
revoke all on public.leases       from anon, authenticated;
grant select on public.leases to authenticated;
grant update (status, signature_status) on public.leases to authenticated;

revoke all on public.invoices     from anon, authenticated;
grant select on public.invoices to authenticated;

revoke all on public.charge_lines from anon, authenticated;
grant select on public.charge_lines to authenticated;

revoke all on public.payments     from anon, authenticated;
grant select on public.payments to authenticated;

-- maintenance_requests
revoke all on public.maintenance_requests from anon, authenticated;
grant select, insert on public.maintenance_requests to authenticated;
grant update (status, completed_at) on public.maintenance_requests to authenticated;

-- notifications
revoke all on public.notifications from anon, authenticated;
grant select on public.notifications to authenticated;
grant update (read) on public.notifications to authenticated;

-- function execution
revoke all on function public.is_admin()                          from public;
revoke all on function public.next_maintenance_number()           from public;
revoke all on function public.gen_payment_confirmation()          from public;
revoke all on function public.record_payment(uuid, numeric, text) from public;
revoke all on function public.approve_application(uuid)           from public;
revoke all on function public.decline_application(uuid, text)     from public;
revoke all on function public.resubmit_application(uuid)          from public;

grant execute on function public.is_admin()                          to authenticated;
grant execute on function public.next_maintenance_number()           to authenticated;
grant execute on function public.gen_payment_confirmation()          to authenticated;
grant execute on function public.record_payment(uuid, numeric, text) to authenticated;
grant execute on function public.approve_application(uuid)           to authenticated;
grant execute on function public.decline_application(uuid, text)     to authenticated;
grant execute on function public.resubmit_application(uuid)          to authenticated;

-- =====================================================================
-- END OF schema.sql
-- =====================================================================
