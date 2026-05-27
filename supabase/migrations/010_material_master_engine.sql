
create table if not exists material_types (
  id uuid primary key default gen_random_uuid(),
  name text unique not null,
  coefficient numeric,
  is_grammage boolean default false,
  created_at timestamptz default now()
);

create table if not exists material_grades (
  id uuid primary key default gen_random_uuid(),
  material_type_id uuid references material_types(id) on delete cascade,
  code text not null,
  description text,
  created_at timestamptz default now(),
  unique(material_type_id, code)
);

create table if not exists material_thicknesses (
  id uuid primary key default gen_random_uuid(),
  material_grade_id uuid references material_grades(id) on delete cascade,
  thickness numeric not null,
  gm2 numeric not null,
  created_at timestamptz default now(),
  unique(material_grade_id, thickness)
);

alter table material_types enable row level security;
alter table material_grades enable row level security;
alter table material_thicknesses enable row level security;

create policy "read material types" on material_types for select using (true);
create policy "read material grades" on material_grades for select using (true);
create policy "read material thicknesses" on material_thicknesses for select using (true);
