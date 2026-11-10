// Menyusun laporan malam dari catatan chat (Supabase), sheet Booking, dan sheet Prospek & Booking.
const cfg = $('Pengaturan').first().json;
const r = $('Ringkasan Chat').first().json;
const barisBooking = $('Baca Booking').all().map(i => i.json);
const barisProspek = $('Baca Prospek').all().map(i => i.json);
const barisLog = $('Ambil Log Chat').all().map(i => i.json);

function nomorRapi(n) {
  let d = String(n ?? '').replace(/\D/g, '');
  if (d.startsWith('0')) d = '62' + d.slice(1);
  else if (d.startsWith('8')) d = '62' + d;
  return d;
}
const kolomNomor = /(nomor|no\.?)\s*(hp|wa|telp|telepon|whatsapp)|^hp$|^wa$|whatsapp|telepon/i;
const sudahBooking = new Set();
for (const b of barisBooking) {
  for (const [k, v] of Object.entries(b)) {
    if (kolomNomor.test(k) && nomorRapi(v).length >= 9) sudahBooking.add(nomorRapi(v));
  }
}

// Nomor bertanda "arsip-" adalah data uji coba yang sudah di-reset, tidak ikut dilaporkan.
const bukanArsip = n => !/^arsip/i.test(String(n ?? '').trim());
const orang = (r.orang || []).filter(o => bukanArsip(o.nomor));
const baru = orang.filter(o => o.baru);
const lama = orang.filter(o => !o.baru);
const iklan = baru.filter(o => o.dari_iklan);
const bukanIklan = baru.filter(o => !o.dari_iklan);
const jadi = o => sudahBooking.has(o.nomor);

// Di tahap mana orang baru yang belum booking itu berhenti.
function tahap(o) {
  if (o.belum_ditanggapi || !o.tindakan_terakhir) return 'Belum ditanggapi';
  if (o.tindakan_terakhir === 'pengingat' && o.alasan_terakhir === 'hari_baru') return 'Chat lagi keesokan hari, sudah dikabari';
  if (o.tindakan_terakhir === 'pengingat') return 'Mulai tidak sabar, admin sudah diingatkan';
  if (o.tindakan_terakhir === 'diam' && o.alasan_terakhir === 'ditangani_admin') return 'Diteruskan ke admin, menunggu jawaban';
  if (o.tindakan_terakhir === 'teruskan') {
    if (o.alasan_terakhir === 'booking') return 'Sudah minta booking, menunggu konfirmasi admin';
    return 'Diteruskan ke admin, menunggu jawaban';
  }
  if (o.tindakan_terakhir === 'diam') return 'Tidak dijawab otomatis, menunggu admin';
  const peta = {
    harga: 'Berhenti setelah diberi harga',
    promo: 'Berhenti setelah diberi info promo',
    jadwal: 'Berhenti setelah diberi jadwal',
    lokasi: 'Berhenti setelah diberi alamat',
    booking: 'Berhenti saat ditanya data booking',
  };
  return peta[o.topik_terakhir] || 'Berhenti setelah pertanyaan lain';
}
const hitungTahap = {};
for (const o of baru.filter(x => !jadi(x))) {
  const t = tahap(o);
  hitungTahap[t] = (hitungTahap[t] || 0) + 1;
}
const urutTahap = Object.entries(hitungTahap).sort((a, b) => b[1] - a[1]);

// Orang baru yang sudah masuk sheet Booking dianggap sudah ditangani admin.
const menunggu = orang.filter(o => !(o.baru && jadi(o)) &&
  (o.belum_ditanggapi || ['teruskan', 'diam', 'pengingat'].includes(o.tindakan_terakhir)));

const namaTopik = {
  harga: 'Harga', promo: 'Promo', jadwal: 'Jadwal dokter', lokasi: 'Alamat dan lokasi',
  booking: 'Booking', kondisi_kulit: 'Kondisi kulit', komplain: 'Komplain', lainnya: 'Lain-lain',
  menagih: 'Menagih balasan admin',
};
const topik = Object.entries(r.topik || {}).sort((a, b) => b[1] - a[1]).slice(0, 3);

const iklanSemua = (r.nomor_iklan_semua || []).filter(bukanArsip);
const iklanSemuaJadi = iklanSemua.filter(n => sudahBooking.has(n));
const persen = (a, b) => (b > 0 ? ` (${Math.round((a / b) * 100)}%)` : '');

// ---- Sheet Prospek & Booking ----
// Tanggal dibaca sebagai angka seri Google Sheets dalam zona waktu WIB.
function waktuDari(v) {
  if (typeof v === 'number' && v > 0) return (v - 25569) * 86400000 - 7 * 3600000;
  const t = Date.parse(String(v ?? ''));
  return Number.isNaN(t) ? null : t;
}
function lamaMenunggu(ms) {
  const jam = Math.floor(ms / 3600000);
  return jam < 48 ? `${jam} jam` : `${Math.floor(jam / 24)} hari`;
}
const sekarang = Date.now();
const prospekGagal = barisProspek.some(b => b && b.error);
const prospek = prospekGagal ? [] : barisProspek
  .filter(b => b && b['Nomor WA'] && bukanArsip(b['Nomor WA']))
  .map(b => {
    const nomor = nomorRapi(b['Nomor WA']);
    let status = String(b.Status ?? '').trim();
    const baruTerkonfirmasi = ['Tanya-tanya', 'Menunggu Konfirmasi'].includes(status) && sudahBooking.has(nomor);
    if (baruTerkonfirmasi) status = 'Terkonfirmasi';
    return {
      nomor, status, baruTerkonfirmasi,
      nama: String(b.Nama ?? '').trim(),
      perawatan: String(b.Perawatan ?? '').trim(),
      waktuDiminta: String(b['Waktu Diminta'] ?? '').trim(),
      pesan: String(b['Pesan Terakhir'] ?? '').trim(),
      diteruskan: waktuDari(b['Diteruskan Pada']),
      terakhir: waktuDari(b['Terakhir Chat']),
    };
  });
const menungguKonfirmasi = prospek.filter(p => p.status === 'Menunggu Konfirmasi');
const menggantung = menungguKonfirmasi
  .filter(p => p.diteruskan && sekarang - p.diteruskan > 24 * 3600000)
  .sort((a, b) => a.diteruskan - b.diteruskan);
const baruTerkonfirmasi = prospek.filter(p => p.baruTerkonfirmasi).length;
const batalPekanIni = prospek.filter(p => p.status === 'Batal' && p.terakhir && sekarang - p.terakhir <= 7 * 86400000).length;

// ---- Waktu tunggu pasien ke admin (dari catatan chat 8 hari terakhir) ----
// Untuk tiap penyerahan ke admin, dicari pesan "menagih" pertama dari pasien sebelum penyerahan berikutnya.
const logGagal = barisLog.some(b => b && b.error);
const logChat = barisLog.filter(b => b && b.id && b.waktu && b.nomor && bukanArsip(b.nomor)).sort((a, b) => a.id - b.id);
function statistikTunggu(jamMundur) {
  const batas = sekarang - jamMundur * 3600000;
  const perNomor = {};
  for (const b of logChat) (perNomor[b.nomor] = perNomor[b.nomor] || []).push(b);
  let diserahkan = 0;
  const menit = [];
  for (const baris of Object.values(perNomor)) {
    baris.forEach((b, i) => {
      if (b.tindakan !== 'teruskan' || b.arah === 'masuk') return;
      const t = Date.parse(b.waktu);
      if (t < batas) return;
      diserahkan++;
      for (const s of baris.slice(i + 1)) {
        if (s.tindakan === 'teruskan' && s.arah !== 'masuk') break;
        if (s.topik === 'menagih') { menit.push((Date.parse(s.waktu) - t) / 60000); break; }
      }
    });
  }
  menit.sort((a, b) => a - b);
  const median = menit.length ? (menit.length % 2 ? menit[(menit.length - 1) / 2] : (menit[menit.length / 2 - 1] + menit[menit.length / 2]) / 2) : null;
  return { diserahkan, menagih: menit.length, median, tercepat: menit.length ? menit[0] : null };
}
function teksMenit(m) {
  const n = Math.round(m);
  return n < 60 ? `${n} menit` : `${Math.floor(n / 60)} jam ${n % 60} menit`;
}
function barisTunggu(label, s) {
  if (!s.diserahkan) return `- ${label}: belum ada chat yang diserahkan ke admin`;
  const dasar = `- ${label}: ${s.diserahkan} kali diserahkan ke admin, ${s.menagih} pasien mulai tidak sabar`;
  if (!s.menagih) return dasar;
  return `${dasar} (median ${teksMenit(s.median)}, tercepat ${teksMenit(s.tercepat)} setelah diserahkan)`;
}

const tgl = new Intl.DateTimeFormat('id-ID', {
  timeZone: 'Asia/Jakarta', weekday: 'long', day: 'numeric', month: 'long',
}).format(new Date());

const L = [];
L.push(`*Laporan chat ${cfg.nama_klinik}*`);
L.push(`${tgl}, ${cfg.jam_laporan_mundur} jam terakhir`);
L.push('');
if (orang.length === 0) {
  L.push('Tidak ada chat masuk dalam periode ini.');
  L.push('');
} else {
  L.push(`*Yang chat: ${orang.length} orang*`);
  L.push(`- Orang baru: ${baru.length} (dari iklan ${iklan.length}, bukan iklan ${bukanIklan.length})`);
  L.push(`- Pasien lama: ${lama.length}`);
  L.push(`- Chat di luar jam buka: ${orang.filter(o => o.luar_jam).length} orang`);
  L.push('');
  L.push(`*Yang sudah booking: ${baru.filter(jadi).length} dari ${baru.length} orang baru*`);
  L.push(`- Dari iklan: ${iklan.filter(jadi).length} dari ${iklan.length}${persen(iklan.filter(jadi).length, iklan.length)}`);
  L.push(`- Bukan iklan: ${bukanIklan.filter(jadi).length} dari ${bukanIklan.length}`);
  L.push('');
  if (urutTahap.length) {
    L.push('*Yang belum booking, berhentinya di mana*');
    for (const [t, n] of urutTahap) L.push(`- ${t}: ${n}`);
    L.push('');
  }
  if (menunggu.length) {
    L.push(`*Diserahkan ke admin, perlu dicek: ${menunggu.length} orang*`);
    for (const o of menunggu.slice(0, 8)) L.push(`- ${o.nama || 'tanpa nama'} (${o.nomor})`);
    if (menunggu.length > 8) L.push(`- dan ${menunggu.length - 8} lainnya`);
    L.push('');
  }
  if (topik.length) {
    L.push('*Pertanyaan terbanyak*');
    topik.forEach(([t, n], i) => L.push(`${i + 1}. ${namaTopik[t] || t}: ${n}`));
    L.push('');
  }
}

// Bagian ini selalu muncul, karena booking yang menggantung tetap penting walau hari ini sepi chat.
if (prospekGagal) {
  L.push('_Sheet Prospek & Booking tidak terbaca malam ini, bagian status booking dilewati._');
  L.push('');
} else {
  L.push('*Status booking (sheet Prospek & Booking)*');
  L.push(`- Menunggu konfirmasi admin: ${menungguKonfirmasi.length} orang, ${menggantung.length} di antaranya lewat 24 jam`);
  L.push(`- Baru terkonfirmasi sejak laporan terakhir: ${baruTerkonfirmasi} orang`);
  L.push(`- Batal (chat terakhir dalam 7 hari): ${batalPekanIni} orang`);
  L.push('');
  if (menggantung.length) {
    L.push(`*Booking menggantung lebih dari 24 jam: ${menggantung.length} orang*`);
    menggantung.slice(0, 8).forEach((p, i) => {
      const rinci = [p.perawatan || 'perawatan belum disebut', p.waktuDiminta ? `minta ${p.waktuDiminta}` : ''].filter(Boolean).join(', ');
      L.push(`${i + 1}. ${p.nama || 'tanpa nama'} (${p.nomor}): ${rinci}. Menunggu ${lamaMenunggu(sekarang - p.diteruskan)}.`);
      if (p.pesan) L.push(`   Pesan terakhir: "${p.pesan.slice(0, 120)}"`);
    });
    if (menggantung.length > 8) L.push(`- dan ${menggantung.length - 8} lainnya`);
    L.push('');
  }
}

if (logGagal) {
  L.push('_Catatan chat tidak terbaca malam ini, bagian waktu tunggu ke admin dilewati._');
  L.push('');
} else {
  L.push('*Waktu tunggu pasien ke admin*');
  L.push(barisTunggu('24 jam terakhir', statistikTunggu(24)));
  L.push(barisTunggu('7 hari terakhir', statistikTunggu(24 * 7)));
  L.push('');
}

L.push('*Iklan sejak sistem dipasang*');
L.push(`- ${iklanSemua.length} orang chat dari iklan, ${iklanSemuaJadi.length} sudah booking${persen(iklanSemuaJadi.length, iklanSemua.length)}`);
L.push('');
L.push(`Balasan otomatis bulan ini: ${r.balasan_bot_bulan_ini ?? 0} dari batas ${cfg.batas_balasan_per_bulan}.`);
L.push('');
L.push('_Catatan: booking dihitung dari sheet Booking, jadi pasien yang datang langsung tanpa booking tidak terhitung. Sistem contoh ini belum bisa melihat balasan admin, jadi daftar "perlu dicek" belum tentu belum dibalas._');

return [{ json: { target: String(cfg.nomor_owner ?? '').replace(/\D/g, ''), message: L.join('\n') } }];
