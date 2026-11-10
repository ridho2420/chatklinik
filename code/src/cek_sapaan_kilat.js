// Sapaan kilat: pesan PERTAMA yang isinya hanya sapaan ("halo kak", "permisi, mau tanya-tanya perawatan wajah")
// langsung dibalas dengan kalimat jadi dari Pengaturan (isi_sapaan_kilat), tanpa menunggu bubble berikutnya
// dan tanpa bertanya ke AI. Pesan lain lanjut ke jalur biasa (Tunggu Pasien Selesai).
const cfg = $('Pengaturan').first().json;
const chat = $('Cek Pasien Lama').first().json;
const status = $('Catat Chat Masuk').first().json;
const isi = String(cfg.isi_sapaan_kilat ?? '').trim();

// Kata yang boleh ada di sapaan. Huruf berulang dirapikan dulu ("haloo" -> "halo", "assalamualaikum" -> "asalamualaikum").
const SAPA = ['halo', 'helo', 'hai', 'hay', 'hi', 'hy', 'hey', 'pagi', 'siang', 'sore', 'malam', 'permisi',
  'asalamualaikum', 'asalamu', 'salam', 'kak', 'kakak', 'min', 'admin', 'mimin', 'mba', 'mbak', 'sis', 'sist',
  'gan', 'dok', 'tanya', 'nanya', 'bertanya', 'info', 'informasi'];
const PELENGKAP = ['selamat', 'alaikum', 'wr', 'wb', 'warahmatulahi', 'wabarakatuh', 'ka', 'mas', 'bu', 'ibu', 'pak',
  'mau', 'ingin', 'pengen', 'pingin', 'pengin', 'boleh', 'bisa', 'saya', 'aku', 'sy', 'aq', 'dong', 'donk', 'ya', 'yah',
  'nih', 'dulu', 'sedikit', 'dikit', 'seputar', 'soal', 'tentang', 'mengenai', 'perawatan', 'treatment', 'wajah',
  'muka', 'kulit', 'klinik', 'di', 'sini', 'disini', 'ini', 'mohon', 'minta', 'numpang', 'kah', 'nya'];
const BOLEH = new Set([...SAPA, ...PELENGKAP]);
const WAJIB = new Set(SAPA);

function hanyaSapaan(teks) {
  const kata = String(teks ?? '').toLowerCase()
    .replace(/[^a-z\s]/g, ' ')
    .split(/\s+/).filter(Boolean)
    .map(k => k.replace(/(.)\1+/g, '$1'));
  if (kata.length === 0 || kata.length > 12) return false;
  return kata.every(k => BOLEH.has(k)) && kata.some(k => WAJIB.has(k));
}

const kilat = isi !== ''
  && !chat.pasien_lama
  && !chat.media
  && !status.duplikat
  && (status.riwayat || []).length === 0
  && !(cfg.jawab_hanya_di_luar_jam === true && !chat.luar_jam)
  && Number(status.balasan_bot_bulan_ini || 0) < Number(cfg.batas_balasan_per_bulan || Infinity)
  && hanyaSapaan(chat.pesan);

if (!kilat) return [{ json: { kilat: false } }];

const sapaNama = chat.nama ? `Kak ${String(chat.nama).trim().split(/\s+/)[0]}` : 'Kak';
return [{ json: {
  kilat: true,
  perlu_ai: false,
  nomor: chat.nomor,
  nama: chat.nama,
  pesan_pasien: `Halo ${sapaNama}, saya asisten AI ${cfg.nama_klinik}. ${isi}`,
  pesan_admin: '',
  log: { tindakan: 'jawab', alasan: 'sapaan_kilat', topik: 'lainnya', booking: null },
} }];
