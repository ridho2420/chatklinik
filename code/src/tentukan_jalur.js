// Memutuskan: dijawab AI, diteruskan ke admin, atau bot diam.
const cfg = $('Pengaturan').first().json;
const chat = { ...$('Cek Pasien Lama').first().json };
const status = $('Catat Chat Masuk').first().json;   // hasil dari Supabase

// Pesan yang sama terkirim dua kali dari Fonnte: berhenti di sini.
if (status.duplikat) return [];

const namaTampil = chat.nama_di_sheet || chat.nama || 'tanpa nama';
const SERAH = 'Mulai dari sini Kakak akan dibalas langsung oleh admin kami, bukan asisten AI.';
const SAMBIL = 'Sambil menunggu, kalau ada pertanyaan lain soal harga, jadwal, atau promo, Kakak tetap bisa tanya saya ya.';
// Saklar di node Pengaturan: apakah bot tetap menjawab pertanyaan lain selama chat menunggu admin?
//   "selalu"   : tetap menjawab kapan saja (dipakai untuk demo)
//   "luar_jam" : tetap menjawab hanya saat klinik tutup; di jam kerja bot diam karena admin sedang memegang chat
//   "tidak"    : bot diam sampai admin selesai (perilaku lama, juga dipakai kalau kolomnya kosong)
const modeMenunggu = String(cfg.jawab_saat_menunggu_admin ?? '').trim().toLowerCase();
const jawabSaatMenunggu = modeMenunggu === 'selalu' || (modeMenunggu === 'luar_jam' && Boolean(chat.luar_jam));
function penutupSerah() {
  return jawabSaatMenunggu ? `${kapanDibalas()} ${SAMBIL}` : `${SERAH} ${kapanDibalas()}`;
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
function untukAdmin(judul, baris = []) {
  return [
    `[${judul}]`,
    `Dari: ${namaTampil} (${chat.nomor})`,
    ...baris,
    `Pesan: "${chat.pesan || '(lampiran)'}"`,
  ].join('\n');
}
function selesai(o) {
  return [{ json: {
    perlu_ai: false, nomor: chat.nomor, nama: chat.nama,
    pesan_pasien: '', pesan_admin: '',
    log: { tindakan: 'diam', alasan: null, topik: null, booking: null },
    ...o,
  } }];
}
function keMenit(jam) {
  const [h, m] = String(jam ?? '').split(/[:.]/).map(Number);
  return (h || 0) * 60 + (m || 0);
}
// Berapa jam dari rentang waktu a..b yang jatuh di dalam jam buka klinik (WIB).
function jamKerja(a, b) {
  if (!(b > a)) return 0;
  const OFF = 7 * 3600000, HARI = 86400000;
  const buka = keMenit(cfg.jam_buka) * 60000, tutup = keMenit(cfg.jam_tutup) * 60000;
  let total = 0;
  for (let h = Math.floor((a + OFF) / HARI); h <= Math.floor((b + OFF) / HARI); h++) {
    const s = h * HARI - OFF + buka, e = h * HARI - OFF + tutup;
    total += Math.max(0, Math.min(b, e) - Math.max(a, s));
  }
  return total / 3600000;
}
function tanggalWIB(ms) {
  return new Date(ms + 7 * 3600000).toISOString().slice(0, 10);
}
function jamWIB(ms) {
  return new Date(ms + 7 * 3600000).toISOString().slice(11, 16).replace(':', '.');
}
// "kemarin 19.30", "hari ini 10.05", atau "01/11 19.30".
function kapanWIB(ms) {
  const selisih = (Date.parse(tanggalWIB(sekarang)) - Date.parse(tanggalWIB(ms))) / 86400000;
  if (selisih === 0) return `hari ini ${jamWIB(ms)}`;
  if (selisih === 1) return `kemarin ${jamWIB(ms)}`;
  const t = tanggalWIB(ms);
  return `${t.slice(8, 10)}/${t.slice(5, 7)} ${jamWIB(ms)}`;
}
function lamaTunggu(ms) {
  const menit = Math.max(0, Math.round(ms / 60000));
  if (menit < 60) return `${menit} menit`;
  return `${Math.floor(menit / 60)} jam ${menit % 60} menit`;
}
// Pesan yang menandakan pasien menunggu balasan, misalnya "halo?", "kak??", "kok belum dibalas".
function menagih(teks) {
  const p = String(teks ?? '').toLowerCase().trim();
  if (!p) return false;
  return [
    /^(ha+l+o+|hai+|p+|ping|kak+|ka+|min+|admin|permisi|tes|test)[\s?!.]*$/,
    /\?{2,}/,
    /\b(kok|koq|ko)\b.{0,25}\b(lama|belum|blm|gak|ga|nggak|engga|enggak|tidak|ndak)\b/,
    /\b(belum|blm|blom)\b.{0,15}\b(dibalas|dibales|dijawab|direspon|direspons|dibaca|bales|balas|respon|jawab)\b/,
    /\b(lama|lambat)\s*(banget|bgt|sekali|amat|ya|yah)\b/,
    /\b(masih|udah|sudah|udh)\s*(nunggu|menunggu)\b/,
    /\b(respon|tanggapi|bales|balas|jawab)\s*(dong|donk|please|plis|pls|ya)\b/,
    /^(jadi|jadinya|terus|trus|gimana|bagaimana)(\s+(kak|ka|min|ya|nih|dong|jadinya|gimana|nya))*\s*\?+\s*$/,
    /^jadi(nya)?\s+(bisa|gimana|kapan|gak|nggak|ga)\b.{0,15}\?*\s*$/,
    /\b(ditinggal|dicuekin|dikacangin|diabaikan|gak ada yang bales|ga ada yang bales)\b/,
  ].some(r => r.test(p));
}

// ---- Apakah nomor ini sedang ditangani admin? ----
// Dihitung dari catatan chat di Supabase (node Cek Ambil Alih). Kalau catatan gagal dibaca,
// bot berperilaku seperti biasa.
const pesanSekarang = chat.pesan || '(lampiran)';
let catatanLama = $('Cek Ambil Alih').all().map(i => i.json).filter(r => r && r.id && r.waktu);
catatanLama.sort((a, b) => a.id - b.id);

// Sapaan kilat: pesan pertama yang sudah dibalas langsung oleh node Cek Sapaan Kilat
// tidak ikut digabung lagi dengan bubble berikutnya.
const kilatRow = catatanLama.find(r => r.alasan === 'sapaan_kilat' && r.arah !== 'masuk');
let idDisapa = null;
if (kilatRow) {
  const sebelumKilat = catatanLama.filter(r => r.arah === 'masuk' && r.id < kilatRow.id).map(r => r.id);
  if (sebelumKilat.length) idDisapa = Math.min(...sebelumKilat);
}

// ---- Pesan beruntun (banyak bubble) ----
// Workflow menunggu dulu (node "Tunggu Pasien Selesai") sebelum sampai di sini.
// Kalau ada pesan pasien lain yang tercatat paling lama TUNGGU_DETIK sesudah pesan ini, pesan ini tidak dibalas
// sendiri: ia ikut dibalas bersama pesan terbaru itu. Aturan "tunggu" dan aturan "gabung" memakai batas yang
// sama dan jam pencatatan yang sama (Supabase), jadi setiap bubble dijawab tepat sekali.
const TUNGGU_DETIK = 5;   // samakan dengan node "Tunggu Pasien Selesai"
let iIni = -1;
if (chat.id_pesan) {
  for (let i = catatanLama.length - 1; i >= 0; i--) {
    if (catatanLama[i].arah === 'masuk' && catatanLama[i].id_pesan === chat.id_pesan) { iIni = i; break; }
  }
}
if (iIni === -1) {
  for (let i = catatanLama.length - 1; i >= 0; i--) {
    if (catatanLama[i].arah === 'masuk' && catatanLama[i].pesan === pesanSekarang) { iIni = i; break; }
  }
}
let bubble = [];
if (iIni !== -1) {
  const tIni = Date.parse(catatanLama[iIni].waktu);
  if (catatanLama.slice(iIni + 1).some(r => r.arah === 'masuk' && Date.parse(r.waktu) - tIni <= TUNGGU_DETIK * 1000)) return [];
  // Bubble sebelumnya ikut digabung kalau dikirim beruntun dan belum dijawab.
  let awal = iIni;
  while (awal > 0) {
    const sebelum = catatanLama[awal - 1];
    if (sebelum.arah !== 'masuk') break;
    if (sebelum.id === idDisapa) break;
    if (Date.parse(catatanLama[awal].waktu) - Date.parse(sebelum.waktu) > TUNGGU_DETIK * 1000) break;
    awal--;
  }
  bubble = catatanLama.slice(awal, iIni + 1);
  // Buang baris pesan yang sedang diproses (sudah dicatat oleh Catat Chat Masuk).
  catatanLama.splice(awal, bubble.length);
}
const semuaPesan = bubble.length ? bubble.map(r => r.pesan || '(lampiran)') : [pesanSekarang];
let riwayatChat = status.riwayat || [];
if (semuaPesan.length > 1) {
  chat.pesan = semuaPesan.filter(t => t !== '(lampiran)').join('\n');
  if (semuaPesan.includes('(lampiran)')) chat.media = true;
  if (bubble.some(r => r.dari_iklan === true)) chat.dari_iklan = true;
  // Riwayat dari Supabase sudah memuat bubble sebelumnya; buang supaya tidak terhitung dua kali.
  let buang = semuaPesan.length - 1;
  while (buang > 0 && riwayatChat.length && riwayatChat[riwayatChat.length - 1].arah === 'masuk') {
    riwayatChat = riwayatChat.slice(0, -1);
    buang--;
  }
}
// Balasan sapaan kilat bisa belum masuk riwayat kalau bubble berikutnya dikirim cepat.
// Ditambahkan supaya bot tidak memperkenalkan diri dua kali.
if (kilatRow && kilatRow.pesan && riwayatChat.length <= 3
    && !riwayatChat.some(r => r.arah !== 'masuk' && r.pesan === kilatRow.pesan)) {
  riwayatChat = [...riwayatChat];
  const i = riwayatChat.findIndex(r => r.arah === 'masuk');
  riwayatChat.splice(i === -1 ? 0 : i + 1, 0, { arah: 'keluar', pesan: kilatRow.pesan });
}
const sekarang = Date.now();
const jeda = Number(cfg.jeda_ambil_alih_jam) > 0 ? Number(cfg.jeda_ambil_alih_jam) : 2;
let ambilAlih = null;      // diisi kalau nomor ini sedang ditangani admin
let kembaliAktif = false;  // true kalau bot baru aktif lagi setelah admin menangani
let iSerah = -1;
for (let i = catatanLama.length - 1; i >= 0; i--) {
  if (catatanLama[i].tindakan === 'teruskan' && catatanLama[i].arah !== 'masuk') { iSerah = i; break; }
}
if (iSerah >= 0) {
  const serah = catatanLama[iSerah];
  const tSerah = Date.parse(serah.waktu);
  const sesudah = catatanLama.slice(iSerah + 1);
  // Kalau bot sudah pernah menjawab lagi sesudah penyerahan, masa ditangani admin sudah selesai.
  // (Jawaban bot untuk pertanyaan lain selama menunggu admin, alasan "menunggu_admin", tidak dihitung.)
  const menungguSaja = r => r.tindakan === 'jawab' && r.alasan === 'menunggu_admin';
  if (!sesudah.some(r => r.tindakan === 'jawab' && !menungguSaja(r))) {
    const waktuPasien = sesudah.filter(r => r.arah === 'masuk').map(r => Date.parse(r.waktu));
    const terakhirAktif = Math.max(tSerah, ...waktuPasien);
    if (jamKerja(terakhirAktif, sekarang) < jeda) {
      ambilAlih = {
        sejak: tSerah,
        alasan: serah.alasan,
        sudahDiingatkan: sesudah.some(r => r.tindakan === 'pengingat'),
        // Sudah dikabari hari ini (WIB)? Dipakai untuk sapaan pertama di hari baru.
        dikabariHariIni: sesudah.some(r => (r.tindakan === 'pengingat' || menungguSaja(r))
          && tanggalWIB(Date.parse(r.waktu)) === tanggalWIB(sekarang)),
        hariBaru: tanggalWIB(tSerah) !== tanggalWIB(sekarang),
      };
    } else {
      kembaliAktif = true;
    }
  }
}
const riwayatAda = riwayatChat.length > 0;
const sapaNama = chat.nama ? `Kak ${String(chat.nama).split(' ')[0]}` : 'Kak';
function sapaKembali(teks) {
  if (!kembaliAktif || !riwayatAda || /(saya|ini) asisten (AI|otomatis)/i.test(teks)) return teks;
  return `Halo Kak, ini asisten AI ${cfg.nama_klinik} lagi. ` + teks;
}

// 1. Pasien lama: bot tidak menjawab, admin diberi tahu.
if (chat.pasien_lama) {
  return selesai({
    pesan_admin: untukAdmin('Pasien lama, tidak dijawab otomatis'),
    log: { tindakan: 'diam', alasan: 'pasien_lama', topik: null, booking: null },
  });
}

// 2. Sedang ditangani admin: bot tidak ikut menjawab soal yang sudah diserahkan.
//    a. Pesan pertama pasien di hari baru: selalu dikabari SATU kali hari itu, admin diingatkan.
//    b. Kalau pasien menagih, dikabari SATU kali, admin diingatkan.
//    c. Pertanyaan lain: dijawab AI kalau saklar jawab_saat_menunggu_admin mengizinkan; selain itu bot diam.
let menungguAdmin = null;   // diisi kalau bot tetap menjawab pertanyaan lain selama menunggu admin
if (ambilAlih) {
  const tagih = semuaPesan.some(menagih);
  const namaAlasan = {
    booking: 'permintaan booking', kondisi_kulit: 'pertanyaan kondisi kulit',
    harga_tidak_ada: 'harga tidak ada di daftar', minta_admin: 'minta bicara dengan admin',
    komplain: 'komplain', kirim_media: 'kiriman foto atau berkas', lainnya: 'pertanyaan lain',
  };
  const soal = namaAlasan[ambilAlih.alasan] || 'diteruskan ke admin';
  const ingatkanAdmin = () => untukAdmin('Pasien chat lagi hari ini, mohon segera dibalas', [
    `Diserahkan sejak: ${kapanWIB(ambilAlih.sejak)} (${soal})`,
    `Sudah menunggu: ${lamaTunggu(sekarang - ambilAlih.sejak)}`,
  ]);
  const perluDiingatkan = ambilAlih.hariBaru && !ambilAlih.dikabariHariIni;
  if (jawabSaatMenunggu && !tagih) {
    if (chat.media) {
      return selesai({
        pesan_pasien: `Terima kasih, Kak, kirimannya sudah masuk dan akan dilihat langsung oleh admin kami. ${kapanDibalas()}`,
        pesan_admin: untukAdmin('Pasien mengirim foto atau berkas (chat ini sedang menunggu admin)', [
          `Diserahkan sejak: ${kapanWIB(ambilAlih.sejak)} (${soal})`,
        ]),
        log: { tindakan: 'jawab', alasan: 'menunggu_admin', topik: 'kondisi_kulit', booking: null },
      });
    }
    // Lanjut ke langkah 3–7 di bawah, ditandai "menunggu admin".
    menungguAdmin = { soal, admin_tambahan: perluDiingatkan ? ingatkanAdmin() : '' };
  } else {
    if (perluDiingatkan) {
      const jam = chat.luar_jam
        ? `Admin kami mulai membalas pukul ${String(cfg.jam_buka).replace(':', '.')} WIB ya.`
        : 'Admin sudah kami ingatkan, Kakak akan segera dibalas.';
      return selesai({
        pesan_pasien: `Halo Kak, ini asisten AI ${cfg.nama_klinik}. Pesan Kakak sudah kami teruskan ke admin. ${jam}`,
        pesan_admin: ingatkanAdmin(),
        log: { tindakan: 'pengingat', alasan: 'hari_baru', topik: tagih ? 'menagih' : null, booking: null },
      });
    }
    if (tagih && !ambilAlih.sudahDiingatkan) {
      return selesai({
        pesan_pasien: `Mohon maaf membuat Kakak menunggu. Ini asisten AI ${cfg.nama_klinik}: pesan Kakak sudah ada di admin kami dan akan dibalas langsung oleh admin. ${kapanDibalas()}`,
        pesan_admin: untukAdmin('Pasien menagih, mohon segera dibalas', [
          `Sudah menunggu: ${lamaTunggu(sekarang - ambilAlih.sejak)} sejak diserahkan (${soal})`,
        ]),
        log: { tindakan: 'pengingat', alasan: 'menagih', topik: 'menagih', booking: null },
      });
    }
    return selesai({
      log: { tindakan: 'diam', alasan: 'ditangani_admin', topik: tagih ? 'menagih' : null, booking: null },
    });
  }
}

// 3. Foto atau berkas: bot tidak menilai, langsung ke admin.
if (chat.media) {
  return selesai({
    pesan_pasien: !riwayatAda
      ? `Halo ${sapaNama}, saya asisten AI ${cfg.nama_klinik}. Terima kasih, kirimannya sudah masuk. Saya tidak bisa menilai foto atau berkas, `
        + 'jadi saya teruskan ke admin kami ya. ' + penutupSerah()
      : sapaKembali('Terima kasih, Kak, kirimannya sudah masuk. Saya asisten AI, jadi tidak bisa menilai foto atau berkas. '
        + 'Saya teruskan ke admin kami ya. ' + penutupSerah()),
    pesan_admin: untukAdmin('Perlu ditangani: pasien mengirim foto atau berkas'),
    log: { tindakan: 'teruskan', alasan: 'kirim_media', topik: 'kondisi_kulit', booking: null },
  });
}

// 4. Batas biaya. Kalau tercapai, bot diam dan chat kembali ke admin.
if (Number(status.balasan_bot_bulan_ini) >= Number(cfg.batas_balasan_per_bulan)) {
  return selesai({
    pesan_admin: untukAdmin('Batas balasan bulanan tercapai, mohon dibalas manual'),
    log: { tindakan: 'diam', alasan: 'batas_bulanan', topik: null, booking: null },
  });
}
if (Number(status.balasan_bot_hari_ini) >= Number(cfg.batas_balasan_per_nomor_per_hari)) {
  return selesai({
    pesan_admin: untukAdmin('Nomor ini sudah banyak dibalas otomatis hari ini, mohon dilanjutkan manual'),
    log: { tindakan: 'diam', alasan: 'batas_harian', topik: null, booking: null },
  });
}

// 5. Mode hemat: bot hanya bekerja saat klinik tutup.
if (cfg.jawab_hanya_di_luar_jam === true && !chat.luar_jam) {
  return selesai({
    log: { tindakan: 'diam', alasan: 'jam_kerja', topik: null, booking: null },
  });
}

// 6. Kondisi kulit yang serius atau hal medis: langsung ke orang, tanpa bertanya ke AI.
//    Keluhan kulit biasa (jerawat, kusam, flek, "cocoknya apa") tetap dijawab AI dari data klinik,
//    lalu AI menawarkan untuk meneruskan ke tim klinik.
const p = chat.pesan.toLowerCase();
const soalKulit = [
  /\b(hamil|menyusui|alergi|iritasi|perih|bengkak|bernanah|nanah|meradang|radang|berdarah|infeksi|ruam|efek samping)\b/,
  /\b(obat|salep)\b.{0,20}\b(apa|yang mana|bagus)\b/,
].some(r => r.test(p));

if (soalKulit) {
  return selesai({
    pesan_pasien: !riwayatAda
      ? `Halo ${sapaNama}, saya asisten AI ${cfg.nama_klinik}. Untuk kondisi kulit, saya tidak memberi saran supaya tidak keliru. `
        + 'Pertanyaan Kakak saya teruskan ke admin kami agar dijawab langsung oleh tim klinik. ' + penutupSerah()
      : sapaKembali('Untuk kondisi kulit, saya tidak memberi saran supaya tidak keliru. '
        + 'Pertanyaan Kakak saya teruskan ke admin kami agar dijawab langsung oleh tim klinik. ' + penutupSerah()),
    pesan_admin: untukAdmin('Perlu ditangani: pertanyaan kondisi kulit'),
    log: { tindakan: 'teruskan', alasan: 'kondisi_kulit', topik: 'kondisi_kulit', booking: null },
  });
}

// 7. Selain itu: dijawab AI dari data klinik.
return [{ json: {
  perlu_ai: true, nomor: chat.nomor, nama: chat.nama, pesan: chat.pesan,
  luar_jam: chat.luar_jam, dari_iklan: chat.dari_iklan,
  riwayat: riwayatChat,
  kembali_aktif: kembaliAktif,
  // Diisi kalau chat ini sedang menunggu admin dan bot tetap menjawab pertanyaan lain.
  menunggu_admin: Boolean(menungguAdmin),
  soal_menunggu: menungguAdmin ? menungguAdmin.soal : '',
  kapan_dibalas: menungguAdmin ? kapanDibalas() : '',
  admin_tambahan: menungguAdmin ? menungguAdmin.admin_tambahan : '',
} }];
