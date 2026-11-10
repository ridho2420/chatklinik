-- =====================================================================
-- Demo klinik: tabel dan fungsi untuk n8n
-- Cara pakai: Supabase Dashboard > SQL Editor > New query > tempel semua > Run
-- Aman dijalankan ulang.
-- =====================================================================

-- 1. Tabel: satu baris untuk tiap pesan masuk, tiap balasan bot, dan tiap catatan
create table if not exists public.chat_log (
  id           bigint generated always as identity primary key,
  waktu        timestamptz not null default now(),
  nomor        text        not null,
  nama         text,
  arah         text        not null check (arah in ('masuk', 'keluar', 'catatan')),
  pesan        text,
  id_pesan     text unique,                    -- id pesan dari WhatsApp, untuk menolak kiriman ganda
  dari_iklan   boolean     not null default false,
  luar_jam     boolean     not null default false,
  pasien_lama  boolean     not null default false,
  tindakan     text,                           -- jawab / teruskan / diam
  alasan       text,
  topik        text,
  booking      jsonb
);

create index if not exists chat_log_nomor_waktu_idx on public.chat_log (nomor, waktu desc);
create index if not exists chat_log_waktu_idx       on public.chat_log (waktu);

-- Isi tabel ini adalah chat pasien. RLS dinyalakan tanpa policy,
-- jadi hanya secret key (yang dipakai n8n) yang bisa membaca dan menulis.
alter table public.chat_log enable row level security;


-- 2. Mencatat pesan masuk, lalu mengembalikan keadaan nomor itu
create or replace function public.catat_masuk(
  p_nomor        text,
  p_nama         text,
  p_pesan        text,
  p_id_pesan     text,
  p_dari_iklan   boolean,
  p_luar_jam     boolean,
  p_pasien_lama  boolean,
  p_zona         text default 'Asia/Jakarta'
) returns jsonb
language plpgsql
as $$
declare
  v_id         bigint;
  v_awal_hari  timestamptz := date_trunc('day',   now() at time zone p_zona) at time zone p_zona;
  v_awal_bulan timestamptz := date_trunc('month', now() at time zone p_zona) at time zone p_zona;
begin
  insert into public.chat_log (nomor, nama, arah, pesan, id_pesan, dari_iklan, luar_jam, pasien_lama)
  values (p_nomor, nullif(p_nama, ''), 'masuk', p_pesan, nullif(p_id_pesan, ''),
          coalesce(p_dari_iklan, false), coalesce(p_luar_jam, false), coalesce(p_pasien_lama, false))
  on conflict (id_pesan) do nothing
  returning id into v_id;

  if v_id is null then
    return jsonb_build_object('duplikat', true);
  end if;

  return jsonb_build_object(
    'duplikat', false,
    'balasan_bot_hari_ini', (
      select count(*) from public.chat_log
      where nomor = p_nomor and arah = 'keluar' and waktu >= v_awal_hari),
    'balasan_bot_bulan_ini', (
      select count(*) from public.chat_log
      where arah = 'keluar' and waktu >= v_awal_bulan),
    'pernah_dari_iklan', exists (
      select 1 from public.chat_log where nomor = p_nomor and dari_iklan),
    -- 6 pesan terakhir sebelum pesan ini, urut dari yang paling lama
    'riwayat', coalesce((
      select jsonb_agg(jsonb_build_object('arah', r.arah, 'pesan', r.pesan) order by r.id)
      from (
        select id, arah, pesan from public.chat_log
        where nomor = p_nomor and id < v_id and arah in ('masuk', 'keluar')
          and pesan is not null and waktu >= now() - interval '24 hours'
        order by id desc limit 6
      ) r), '[]'::jsonb)
  );
end;
$$;


-- 3. Mencatat hasil: balasan yang terkirim ke pasien, atau catatan kalau bot diam
create or replace function public.catat_hasil(
  p_nomor         text,
  p_pesan_pasien  text,
  p_tindakan      text,
  p_alasan        text,
  p_topik         text,
  p_booking       jsonb,
  p_terkirim      boolean
) returns jsonb
language plpgsql
as $$
declare
  v_arah text := case
    when coalesce(p_terkirim, false) and nullif(p_pesan_pasien, '') is not null then 'keluar'
    else 'catatan' end;
begin
  insert into public.chat_log (nomor, arah, pesan, tindakan, alasan, topik, booking)
  values (p_nomor, v_arah, nullif(p_pesan_pasien, ''), p_tindakan, p_alasan, p_topik, p_booking);
  return jsonb_build_object('ok', true, 'arah', v_arah);
end;
$$;


-- 4. Bahan laporan malam: satu baris per orang yang chat dalam p_jam jam terakhir
create or replace function public.ringkasan_laporan(
  p_jam   int  default 24,
  p_zona  text default 'Asia/Jakarta'
) returns jsonb
language sql
stable
as $$
  with batas as (
    select now() - make_interval(hours => p_jam) as dari,
           now() as sampai,
           date_trunc('month', now() at time zone p_zona) at time zone p_zona as awal_bulan
  ),
  masuk as (
    select c.* from public.chat_log c, batas b
    where c.arah = 'masuk' and c.waktu >= b.dari and c.waktu <= b.sampai
  ),
  orang as (
    select
      m.nomor,
      max(m.nama)                          as nama,
      count(*)                             as jumlah_pesan,
      bool_or(m.luar_jam)                  as luar_jam,
      bool_or(not m.pasien_lama)           as baru,
      max(m.waktu)                         as masuk_terakhir,
      (select bool_or(x.dari_iklan) from public.chat_log x where x.nomor = m.nomor) as dari_iklan
    from masuk m
    group by m.nomor
  ),
  hasil as (
    -- tindakan terakhir bot untuk tiap orang dalam periode yang sama
    select distinct on (c.nomor) c.nomor, c.tindakan, c.alasan, c.topik, c.waktu
    from public.chat_log c, batas b
    where c.arah in ('keluar', 'catatan') and c.waktu >= b.dari and c.waktu <= b.sampai
    order by c.nomor, c.id desc
  )
  select jsonb_build_object(
    'dari',   (select dari   from batas),
    'sampai', (select sampai from batas),
    'orang', coalesce((
      select jsonb_agg(jsonb_build_object(
        'nomor', o.nomor, 'nama', o.nama, 'jumlah_pesan', o.jumlah_pesan,
        'luar_jam', o.luar_jam, 'baru', o.baru, 'dari_iklan', coalesce(o.dari_iklan, false),
        'tindakan_terakhir', h.tindakan, 'alasan_terakhir', h.alasan, 'topik_terakhir', h.topik,
        -- true kalau pesan terakhir orang ini belum ditanggapi bot sama sekali
        'belum_ditanggapi', (h.waktu is null or h.waktu < o.masuk_terakhir)
      ) order by o.masuk_terakhir)
      from orang o left join hasil h on h.nomor = o.nomor), '[]'::jsonb),
    'topik', coalesce((
      select jsonb_object_agg(t.topik, t.n) from (
        select c.topik, count(*) as n
        from public.chat_log c, batas b
        where c.arah in ('keluar', 'catatan') and c.topik is not null
          and c.waktu >= b.dari and c.waktu <= b.sampai
        group by c.topik) t), '{}'::jsonb),
    'balasan_bot_periode', (
      select count(*) from public.chat_log c, batas b
      where c.arah = 'keluar' and c.waktu >= b.dari and c.waktu <= b.sampai),
    'balasan_bot_bulan_ini', (
      select count(*) from public.chat_log c, batas b
      where c.arah = 'keluar' and c.waktu >= b.awal_bulan),
    -- semua orang baru yang pernah datang dari iklan, untuk dicocokkan dengan sheet Booking
    'nomor_iklan_semua', coalesce((
      select jsonb_agg(distinct c.nomor) from public.chat_log c
      where c.dari_iklan and not c.pasien_lama), '[]'::jsonb)
  );
$$;


-- 5. Fungsi ini hanya boleh dipanggil dengan secret key
revoke execute on function public.catat_masuk(text, text, text, text, boolean, boolean, boolean, text) from public, anon, authenticated;
revoke execute on function public.catat_hasil(text, text, text, text, text, jsonb, boolean)            from public, anon, authenticated;
revoke execute on function public.ringkasan_laporan(int, text)                                         from public, anon, authenticated;
grant  execute on function public.catat_masuk(text, text, text, text, boolean, boolean, boolean, text) to service_role;
grant  execute on function public.catat_hasil(text, text, text, text, text, jsonb, boolean)            to service_role;
grant  execute on function public.ringkasan_laporan(int, text)                                         to service_role;

-- 6. Supaya API Supabase langsung mengenali fungsi baru
notify pgrst, 'reload schema';
