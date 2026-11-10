// Memeriksa jawaban AI sebelum dikirim. Kalau ada yang meragukan, chat diteruskan ke admin.
const cfg = $('Pengaturan').first().json;
const chat = $('Tentukan Jalur').first().json;
const bahan = $('Susun Prompt').first().json;
const mentah = $input.first().json;

function nominalDari(teks) {
  const hasil = [];
  const t = String(teks ?? '').toLowerCase();
  const pola = /(\brp\.?\s*)?(\d{1,3}(?:\.\d{3})+|\d+(?:[.,]\d+)?)(\s*(ribu|rb|k|juta|jt)\b)?/g;
  let m;
  while ((m = pola.exec(t)) !== null) {
    const adaRp = Boolean(m[1]);
    const satuan = m[4];
    const ribuan = /^\d{1,3}(\.\d{3})+$/.test(m[2]);
    if (!adaRp && !satuan && !ribuan) continue;
    let n = ribuan ? Number(m[2].replace(/\./g, '')) : Number(m[2].replace(',', '.'));
    if (satuan === 'ribu' || satuan === 'rb' || satuan === 'k') n *= 1000;
    if (satuan === 'juta' || satuan === 'jt') n *= 1000000;
    if (Number.isFinite(n) && n >= 1000) hasil.push(Math.round(n));
  }
  return hasil;
}
function keMenit(jam) {
  const [h, m] = String(jam ?? '').split(/[:.]/).map(Number);
  return (h || 0) * 60 + (m || 0);
}
function kapanDibalas() {
  if (!chat.luar_jam) return 'Admin kami akan segera membalas Kakak.';
  // Sebelum jam buka (misalnya jam 06.00) berarti hari ini; sesudah jam tutup berarti besok.
  const jamKini = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Jakarta', hour: '2-digit', minute: '2-digit', hour12: false,
  }).format(new Date(Date.now()));
  const hari = keMenit(jamKini) < keMenit(cfg.jam_buka) ? 'hari ini' : 'besok';
  return `Klinik sedang tutup, admin kami akan membalas Kakak ${hari} mulai pukul ${String(cfg.jam_buka).replace(':', '.')} WIB.`;
}
// Merapikan teks AI untuk WhatsApp: tanpa tanda bintang, butir daftar diseragamkan jadi "• ", baris kosong paling banyak satu.
function bersih(t) {
  return String(t ?? '')
    .replace(/\\n/g, '\n')
    .replace(/^[ \t]*(?:[-*•·]|\d+[.)])[ \t]+/gm, '• ')
    .replace(/\*+/g, '')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

// 1. Membaca JSON dari jawaban AI.
let ai = null;
let catatan = '';
try {
  if (mentah.error) throw new Error('AI gagal dipanggil');
  let teks = mentah.text ?? mentah.response?.text ?? mentah.output ?? '';
  if (typeof teks !== 'string') teks = JSON.stringify(teks);
  const awal = teks.indexOf('{');
  const akhir = teks.lastIndexOf('}');
  if (awal === -1 || akhir <= awal) throw new Error('jawaban AI bukan JSON');
  ai = JSON.parse(teks.slice(awal, akhir + 1));
} catch (e) {
  catatan = e.message;
}

const alasanSah = ['harga_tidak_ada', 'kondisi_kulit', 'booking', 'minta_admin', 'komplain', 'lainnya'];
const topikSah = ['harga', 'jadwal', 'lokasi', 'promo', 'booking', 'kondisi_kulit', 'komplain', 'lainnya'];

let tindakan = ai && ['jawab', 'teruskan'].includes(ai.tindakan) ? ai.tindakan : 'teruskan';
let alasan = ai && alasanSah.includes(ai.alasan) ? ai.alasan : null;
let topik = ai && topikSah.includes(ai.topik) ? ai.topik : 'lainnya';
let balasan = ai ? bersih(ai.balasan) : '';
let booking = null;
if (ai && ai.booking && typeof ai.booking === 'object') {
  const b = {
    nama: bersih(ai.booking.nama), perawatan: bersih(ai.booking.perawatan), waktu: bersih(ai.booking.waktu),
  };
  if (b.nama || b.perawatan || b.waktu) booking = b;
}
// Nama perawatan yang sedang dibicarakan, untuk sheet Prospek & Booking.
let perawatan = ai ? bersih(ai.perawatan) : '';
if (/^(null|undefined|-)$/i.test(perawatan)) perawatan = '';
if (!perawatan && booking && booking.perawatan) perawatan = booking.perawatan;

if (!ai) { tindakan = 'teruskan'; alasan = 'lainnya'; }
// Pasien baru saja menyetujui tawaran bot untuk diteruskan ke tim klinik.
const setuju = Boolean(ai && (ai.setuju_diteruskan === true || ai.setuju_diteruskan === 'true'));
// AI kadang memilih "teruskan booking" padahal data booking belum lengkap dan balasannya justru bertanya.
// Booking baru diserahkan ke admin kalau nama, perawatan, dan waktu sudah ada; selain itu kirim pertanyaan AI.
const bookingLengkap = booking && booking.nama && booking.perawatan && booking.waktu;
if (ai && tindakan === 'teruskan' && alasan === 'booking' && !bookingLengkap && balasan) {
  tindakan = 'jawab';
  topik = 'booking';
}
if (tindakan === 'jawab' && !balasan) { tindakan = 'teruskan'; alasan = 'lainnya'; catatan = 'balasan AI kosong'; }

// 2. Pagar harga: setiap nominal di balasan harus ada di data klinik.
if (tindakan === 'jawab') {
  const diizinkan = new Set(bahan.harga_diizinkan || []);
  const asing = nominalDari(balasan).filter(n => !diizinkan.has(n));
  if (asing.length) {
    tindakan = 'teruskan'; alasan = 'harga_tidak_ada'; topik = 'harga';
    catatan = 'AI menyebut nominal yang tidak ada di daftar: ' + asing.join(', ');
  }
}
// 3. Balasan yang terlalu panjang biasanya tanda AI melantur. Daftar per baris boleh lebih panjang.
const batasPanjang = /\n• /.test(balasan) ? 1500 : 900;
if (tindakan === 'jawab' && balasan.length > batasPanjang) {
  tindakan = 'teruskan'; alasan = 'lainnya'; catatan = 'balasan AI terlalu panjang';
}
if (tindakan === 'teruskan' && !alasan) alasan = 'lainnya';
// Selama chat menunggu admin, jawaban bot ditandai supaya masa ditangani admin tidak dianggap selesai.
if (tindakan === 'jawab' && chat.menunggu_admin) alasan = 'menunggu_admin';
if (tindakan === 'teruskan' && alasan === 'booking') topik = 'booking';
if (tindakan === 'teruskan' && alasan === 'kondisi_kulit') topik = 'kondisi_kulit';

// 4. Untuk chat yang diteruskan, kalimat ke pasien memakai teks tetap, bukan karangan AI.
const sapa = chat.nama ? `Kak ${chat.nama.split(' ')[0]}` : 'Kak';
const SERAH = 'Mulai dari sini Kakak akan dibalas langsung oleh admin kami, bukan asisten AI.';
const SAMBIL = 'Sambil menunggu, kalau ada pertanyaan lain soal harga, jadwal, atau promo, Kakak tetap bisa tanya saya ya.';
// Saklar jawab_saat_menunggu_admin di node Pengaturan (penjelasan lengkap di node Tentukan Jalur).
const modeMenunggu = String(cfg.jawab_saat_menunggu_admin ?? '').trim().toLowerCase();
const jawabSaatMenunggu = modeMenunggu === 'selalu' || (modeMenunggu === 'luar_jam' && Boolean(chat.luar_jam));
function penutupSerah() {
  return jawabSaatMenunggu ? `${kapanDibalas()} ${SAMBIL}` : `${SERAH} ${kapanDibalas()}`;
}
const teksTerusan = {
  harga_tidak_ada: `Untuk yang itu saya belum punya harga pastinya, Kak, jadi saya tidak mau asal sebut. Saya teruskan ke admin kami ya. ${penutupSerah()}`,
  kondisi_kulit: `Untuk kondisi kulit, saya tidak memberi saran supaya tidak keliru. Pertanyaan Kakak saya teruskan ke admin kami agar dijawab langsung oleh tim klinik. ${penutupSerah()}`,
  booking: `Baik ${booking && booking.nama ? 'Kak ' + booking.nama : sapa}, permintaan booking ${booking && booking.perawatan ? booking.perawatan : 'perawatan'}${booking && booking.waktu ? ' untuk ' + booking.waktu : ''} sudah saya catat dan saya teruskan ke admin. Jadwalnya belum pasti sampai admin mengonfirmasi. ${penutupSerah()}`,
  minta_admin: `Baik Kak, saya sambungkan ke admin kami. ${penutupSerah()}`,
  komplain: `Mohon maaf atas ketidaknyamanannya, Kak. Saya teruskan ke admin kami supaya segera ditangani. ${penutupSerah()}`,
  lainnya: `Untuk yang itu saya teruskan ke admin kami ya, Kak, supaya jawabannya tepat. ${penutupSerah()}`,
};
let pesan_pasien = tindakan === 'teruskan' ? teksTerusan[alasan] : balasan;
if (tindakan === 'teruskan' && setuju && alasan !== 'booking') {
  pesan_pasien = `Baik Kak, saya teruskan ke tim klinik ya. ${penutupSerah()}`;
}

// 5. Di pesan pertama, bot memperkenalkan diri sebagai asisten AI.
//    Kalau jawaban sudah diawali sapaan ("Halo Kak Rina, ..." atau "Baik Kak Rina, ..."),
//    sapaan itu dipakai sekali saja supaya tidak dobel.
function perkenalan(teks, kalimat) {
  const m = teks.match(/^(halo|hallo|hai|hi|selamat (?:pagi|siang|sore|malam)|baik)(?:\s+juga)?\s*,?\s*(kak(?:ak)?(?:\s+[^\s,.!?]+){0,2})?\s*[,.!]\s*/i);
  if (!m) return `Halo ${sapa}, ${kalimat} ` + teks;
  const sebutan = m[2] && /\s/.test(m[2].trim())
    ? 'Kak ' + m[2].trim().split(/\s+/).slice(1).join(' ')
    : sapa;
  let sisa = teks.slice(m[0].length);
  if (/^baik$/i.test(m[1])) sisa = 'Baik, ' + sisa;
  else sisa = sisa.charAt(0).toUpperCase() + sisa.slice(1);
  return `Halo ${sebutan}, ${kalimat} ${sisa}`;
}
const pesanPertama = (chat.riwayat || []).length === 0;
if (pesanPertama && !/(saya|ini) asisten (AI|otomatis)/i.test(pesan_pasien)) {
  pesan_pasien = perkenalan(pesan_pasien, `saya asisten AI ${cfg.nama_klinik}.`);
}
// 5b. Kalau bot baru aktif lagi setelah chat ini ditangani admin, beri tahu pasien bahwa yang membalas asisten AI.
else if (chat.kembali_aktif && !/(saya|ini) asisten (AI|otomatis)/i.test(pesan_pasien)) {
  pesan_pasien = perkenalan(pesan_pasien, `ini asisten AI ${cfg.nama_klinik} lagi.`);
}

// 6. Pemberitahuan untuk admin kalau diteruskan.
const judul = {
  harga_tidak_ada: 'Perlu ditangani: harga tidak ada di daftar',
  kondisi_kulit: 'Perlu ditangani: pertanyaan kondisi kulit',
  booking: 'Permintaan booking, mohon dikonfirmasi',
  minta_admin: 'Perlu ditangani: pasien minta bicara dengan admin',
  komplain: 'Perlu ditangani: komplain',
  lainnya: 'Perlu ditangani',
};
let pesan_admin = '';
// Pesan pertama hari ini dari pasien yang masih menunggu admin: admin diingatkan sekali.
if (tindakan === 'jawab' && chat.menunggu_admin && chat.admin_tambahan) pesan_admin = chat.admin_tambahan;
if (tindakan === 'teruskan') {
  const baris = [`[${judul[alasan]}]`, `Dari: ${chat.nama || 'tanpa nama'} (${chat.nomor})`];
  if (alasan === 'booking' && booking) {
    baris.push(`Nama: ${booking.nama || '-'}`, `Perawatan: ${booking.perawatan || '-'}`, `Waktu diminta: ${booking.waktu || '-'}`);
  }
  if (setuju) {
    const konteks = (chat.riwayat || []).slice(-4)
      .map(r => `${r.arah === 'masuk' ? 'Pasien' : 'Bot'}: ${String(r.pesan || '').slice(0, 200)}`);
    if (konteks.length) baris.push('Percakapan sebelumnya:', ...konteks);
  }
  baris.push(`Pesan: "${chat.pesan}"`);
  if (catatan) baris.push(`Catatan sistem: ${catatan}`);
  pesan_admin = baris.join('\n');
}

return [{ json: {
  perlu_ai: true, nomor: chat.nomor, nama: chat.nama,
  pesan_pasien, pesan_admin,
  log: { tindakan, alasan, topik, booking, perawatan },
  catatan_sistem: catatan,
} }];
