// Menyusun bahan untuk AI: aturan, data klinik dari Google Sheets, dan riwayat chat.
const cfg = $('Pengaturan').first().json;
const chat = $('Tentukan Jalur').first().json;

function rupiah(n) {
  return 'Rp ' + Math.round(n).toLocaleString('id-ID').replace(/,/g, '.');
}
// Mengambil semua nominal uang dari sebuah teks, misalnya "Rp 250.000" atau "150 ribu".
function nominalDari(teks) {
  const hasil = [];
  const t = String(teks ?? '').toLowerCase();
  const pola = /(\brp\.?\s*)?(\d{1,3}(?:\.\d{3})+|\d+(?:[.,]\d+)?)(\s*(ribu|rb|k|juta|jt)\b)?/g;
  let m;
  while ((m = pola.exec(t)) !== null) {
    const adaRp = Boolean(m[1]);
    const satuan = m[4];
    const ribuan = /^\d{1,3}(\.\d{3})+$/.test(m[2]);
    if (!adaRp && !satuan && !ribuan) continue;        // angka biasa, misalnya jam atau tanggal
    let n = ribuan ? Number(m[2].replace(/\./g, '')) : Number(m[2].replace(',', '.'));
    if (satuan === 'ribu' || satuan === 'rb' || satuan === 'k') n *= 1000;
    if (satuan === 'juta' || satuan === 'jt') n *= 1000000;
    if (Number.isFinite(n) && n >= 1000) hasil.push(Math.round(n));
  }
  return hasil;
}

const kolomUang = /harga|biaya|tarif|dp|deposit/i;
const diizinkan = new Set();

// Tanggal hari ini (WIB), dipakai untuk menyaring promo yang sudah lewat.
const hariIni = new Date(Date.now() + 7 * 3600000).toISOString().slice(0, 10);
const BULAN = { januari: 1, jan: 1, februari: 2, feb: 2, maret: 3, mar: 3, april: 4, apr: 4, mei: 5,
  juni: 6, jun: 6, juli: 7, jul: 7, agustus: 8, agu: 8, agt: 8, ags: 8, september: 9, sep: 9, sept: 9,
  oktober: 10, okt: 10, november: 11, nov: 11, desember: 12, des: 12 };
// Mengubah "31 Oktober 2026", "31/10/2026", "2026-10-31", atau angka seri Sheets menjadi "2026-10-31".
function keTanggal(v) {
  if (typeof v === 'number' && v > 20000) return new Date((v - 25569) * 86400000).toISOString().slice(0, 10);
  const t = String(v ?? '').trim().toLowerCase();
  const dua = n => String(n).padStart(2, '0');
  let m = t.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) return `${m[1]}-${dua(m[2])}-${dua(m[3])}`;
  m = t.match(/^(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{4})/);
  if (m) return `${m[3]}-${dua(m[2])}-${dua(m[1])}`;
  m = t.match(/(\d{1,2})\s+([a-z]+)\s+(\d{4})/);
  if (m && BULAN[m[2]]) return `${m[3]}-${dua(BULAN[m[2]])}-${dua(m[1])}`;
  return null;
}
const kolomBerakhir = /berlaku|sampai|hingga|berakhir|batas/i;
function sudahLewat(b) {
  for (const [k, v] of Object.entries(b)) {
    if (!kolomBerakhir.test(k)) continue;
    const tgl = keTanggal(v);
    if (tgl && tgl < hariIni) return true;
  }
  return false;
}
const tanggalTampil = new Intl.DateTimeFormat('id-ID', {
  timeZone: 'Asia/Jakarta', weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
}).format(new Date());

// Data klinik diambil dari salinan (data table "Salinan Data Klinik", diperbarui tiap 30 menit).
// Kalau salinan kosong atau terlalu lama, workflow membaca Google Sheets langsung (node Baca Harga dan seterusnya).
const salinan = $('Data Klinik').first().json;
function barisTab(tab, namaNode) {
  if (salinan.ada) return Array.isArray(salinan[tab]) ? salinan[tab] : [];
  return $(namaNode).all().map(i => i.json);
}

function isiTab(baris, saringLewat = false) {
  const teks = [];
  for (const b of baris) {
    if (!b || typeof b !== 'object') continue;
    if (saringLewat && sudahLewat(b)) continue;   // promo yang sudah lewat tidak dikirim ke AI
    const bagian = [];
    for (const [k, v] of Object.entries(b)) {
      if (k === 'row_number' || v === '' || v === null || v === undefined) continue;
      if (typeof v === 'number' && kolomUang.test(k)) {
        diizinkan.add(Math.round(v));
        bagian.push(`${k}: ${rupiah(v)}`);
      } else {
        for (const n of nominalDari(v)) diizinkan.add(n);
        if (kolomUang.test(k) && /^\d+$/.test(String(v).trim())) {
          diizinkan.add(Number(v));
          bagian.push(`${k}: ${rupiah(Number(v))}`);
        } else {
          bagian.push(`${k}: ${String(v).trim()}`);
        }
      }
    }
    if (bagian.length) teks.push('- ' + bagian.join(' | '));
  }
  return teks.length ? teks.join('\n') : '(kosong)';
}

const harga = isiTab(barisTab('harga', 'Baca Harga'));
const jadwal = isiTab(barisTab('jadwal', 'Baca Jadwal'));
const promo = isiTab(barisTab('promo', 'Baca Promo'), true);
const info = isiTab(barisTab('info', 'Baca Info'));

const riwayat = (chat.riwayat || []).map(r =>
  `${r.arah === 'masuk' ? 'Pasien' : 'Asisten'}: ${r.pesan}`).join('\n') || '(belum ada, ini pesan pertama)';

// Chat yang sedang menunggu admin, tapi bot tetap boleh menjawab pertanyaan lain (saklar jawab_saat_menunggu_admin).
const bagianMenunggu = chat.menunggu_admin ? `

SEDANG MENUNGGU ADMIN
Sebelumnya chat ini sudah diteruskan ke admin (${chat.soal_menunggu}). ${chat.kapan_dibalas}
Admin hanya menangani hal yang sudah diteruskan itu. Bagian ini menggantikan tawaran ke tim klinik di aturan 2, 3, 6, dan 11:
a. Pertanyaan baru yang jawabannya ada di DATA KLINIK (harga, promo, jadwal dokter, jam buka, alamat, perawatan, produk, cara booking, pembayaran, parkir, dan info umum lain) WAJIB kamu jawab sendiri sekarang, lengkap dan persis seperti biasa. Jangan bilang admin yang akan menjawabnya dan jangan menunda jawabannya. Contoh: pasien bertanya promo, sebutkan promo yang ada di DATA KLINIK.
b. Jangan menawarkan untuk meneruskan ke tim klinik lagi. Hanya kalau jawabannya benar-benar tidak ada di DATA KLINIK, katakan dengan jujur bahwa admin kami akan menjawabnya sekalian saat membalas nanti.
c. Hanya kalau pasien menanyakan kelanjutan hal yang sudah diteruskan tadi, sampaikan bahwa admin kami sedang menanganinya dan kapan admin membalas.
d. Tidak perlu mengingatkan bahwa admin akan membalas kalau pasien tidak menanyakannya.
e. Booking yang datanya sudah lengkap, komplain, dan kondisi kulit yang serius tetap memakai tindakan "teruskan".` : '';

const prompt = `Kamu adalah asisten AI ${cfg.nama_klinik} yang membalas chat WhatsApp calon pasien.
Hari ini: ${tanggalTampil}.
Jam buka klinik: ${cfg.jam_buka} sampai ${cfg.jam_tutup} WIB. Sekarang klinik ${chat.luar_jam ? 'sedang TUTUP' : 'sedang BUKA'}.

ATURAN
1. Jawab hanya dari DATA KLINIK di bawah. Jangan menambah, menebak, menghitung, atau membulatkan.
2. Harga: sebut hanya harga yang tertulis di DATA KLINIK, persis angkanya. Kalau perawatan atau harga yang ditanya tidak ada di data, jangan memberi perkiraan: katakan harganya belum ada di daftar dan tawarkan untuk menanyakannya ke tim klinik (aturan 11).
3. Jangan pernah menilai kondisi kulit seseorang atau memberi saran medis. Kalau pasien menyebut keluhan kulit biasa (misalnya jerawat, komedo, kusam, bekas jerawat, flek, pori besar, kulit kering), termasuk kalau ia bercerita tentang kulitnya sendiri, sebut perawatan yang Keterangan-nya di DATA KLINIK menyebut keluhan itu, lengkap dengan harga dan durasinya, sarankan konsultasi dokter untuk memastikan yang cocok, lalu tawarkan untuk meneruskan ke tim klinik (aturan 11). Jangan bilang perawatan itu pasti cocok atau pasti berhasil. Kalau tidak ada perawatan yang Keterangan-nya menyebut keluhan itu, katakan dengan jujur lalu tawarkan untuk meneruskan ke tim klinik. Kalau pasien menyebut kondisi yang serius (meradang, bernanah, berdarah, perih, alergi, iritasi, sedang hamil atau menyusui, atau reaksi setelah perawatan), langsung pakai tindakan "teruskan" dengan alasan "kondisi_kulit".
4. Booking: kamu hanya mengumpulkan tiga hal, yaitu nama, perawatan, dan hari serta jam yang diinginkan. Kalau belum lengkap, pakai tindakan "jawab" dan tanyakan yang kurang dalam satu pesan. Kalau sudah lengkap, pakai tindakan "teruskan" dengan alasan "booking" dan isi bagian booking. Jangan pernah bilang jadwalnya tersedia atau sudah dikonfirmasi. Kalau pasien bertanya apakah jadwal tertentu masih kosong atau tersedia, anggap itu permintaan booking: jangan jawab kosong atau penuh, tanyakan data yang masih kurang (biasanya nama), dan sampaikan bahwa admin yang akan mengecek jadwalnya.
5. Kalau pasien minta bicara dengan admin, dokter, atau orang: tindakan "teruskan", alasan "minta_admin". Kalau pasien mengeluh atau marah: tindakan "teruskan", alasan "komplain".
6. Kalau pertanyaannya di luar urusan klinik atau kamu tidak yakin jawabannya: jangan menebak, katakan dengan jujur, lalu tawarkan untuk meneruskan ke tim klinik (aturan 11).
7. Gaya: bahasa Indonesia sehari-hari yang sopan dan hangat, panggil "Kak", satu pesan, tanpa markdown dan tanpa tanda bintang. Jangan mengaku manusia. Jawaban biasa cukup 1 sampai 4 kalimat. Kalau jawabanmu menyebut 3 pilihan atau lebih (misalnya promo, harga beberapa perawatan, produk, atau jadwal), tulis sebagai daftar supaya enak dibaca: satu kalimat pembuka, baris kosong, satu baris untuk setiap pilihan yang diawali "• " (nama, harga, dan keterangan singkat kalau ada), lalu boleh satu kalimat penutup setelah baris kosong. Di dalam "balasan", pindah baris ditulis \\n. Format daftar ini hanya untuk pertanyaan yang jelas, bukan untuk sapaan di aturan 9.
8. RIWAYAT CHAT bisa berisi pertanyaan yang sudah dijawab langsung oleh admin, karena balasan admin tidak tercatat di riwayat. Jangan menjawab ulang pertanyaan lama; jawab hanya PESAN BARU.
9. Kalau PESAN BARU hanya sapaan atau pasien baru bilang ingin bertanya tanpa pertanyaan yang jelas (misalnya "mau tanya-tanya perawatan wajah"), jawab singkat dalam satu paragraf paling banyak 3 kalimat, tanpa daftar, tanpa harga, dan tanpa menyebut nama perawatan satu per satu: sebutkan jenis perawatan yang ada di DATA KLINIK cukup dengan nama Kategori-nya (tanpa Konsultasi dan Produk), lalu dalam kalimat terpisah sebutkan bahwa klinik juga punya konsultasi dokter dan produk skincare kalau keduanya ada di DATA KLINIK, lalu tanyakan keluhan atau kebutuhan pasien (misalnya jerawat, kusam, atau flek). Jangan balik bertanya "ada yang bisa ditanyakan" atau "ada yang bisa dibantu". Kalau pasien bilang ingin konsultasi, boleh sebut harga Konsultasi Dokter saja.
10. Kalau RIWAYAT CHAT masih kosong, jangan mengucapkan selamat datang dan jangan menyebut nama klinik, karena sistem sudah menambahkan kalimat perkenalan.
11. Menawarkan ke tim klinik: tulis tawarannya di akhir balasan, misalnya "Mau saya teruskan ke tim klinik supaya dicek langsung?", dengan tindakan "jawab". Kalau pesan terakhir Asisten di RIWAYAT CHAT berisi tawaran itu dan PESAN BARU menyetujuinya (misalnya iya, boleh, mau, oke, silakan), pakai tindakan "teruskan", isi "setuju_diteruskan" dengan true, dan pilih alasan sesuai topik yang ditawarkan: "kondisi_kulit" untuk keluhan kulit, "harga_tidak_ada" untuk harga yang tidak ada di data, atau "lainnya". Kalau pasien menolak atau bertanya hal lain, jawab seperti biasa.${bagianMenunggu}

DATA KLINIK
Harga perawatan:
${harga}

Jadwal dokter dan terapis:
${jadwal}

Promo yang sedang berjalan:
${promo}

Info umum:
${info}

RIWAYAT CHAT TERAKHIR
${riwayat}

PESAN BARU DARI PASIEN (bisa terdiri dari beberapa pesan beruntun; jawab semuanya dalam satu balasan)
${chat.pesan}

Balas HANYA dengan satu objek JSON, tanpa teks lain, dengan bentuk ini:
{"tindakan":"jawab atau teruskan","alasan":"harga_tidak_ada, kondisi_kulit, booking, minta_admin, komplain, lainnya, atau null","topik":"harga, jadwal, lokasi, promo, booking, kondisi_kulit, komplain, atau lainnya","perawatan":"nama perawatan yang sedang ditanyakan atau diminta pasien, atau null","balasan":"isi pesan untuk pasien","setuju_diteruskan":false,"booking":{"nama":"","perawatan":"","waktu":""}}
Isi "perawatan" dengan nama perawatan yang sedang dibicarakan pasien di pesan baru atau riwayat chat. Kalau perawatan itu ada di DATA KLINIK, tulis persis seperti di DATA KLINIK. Isi null kalau pasien belum menyebut perawatan tertentu.
Isi "setuju_diteruskan" dengan true hanya kalau pasien baru saja menyetujui tawaran untuk diteruskan ke tim klinik; selain itu false.
Isi "booking" dengan null kalau pasien tidak sedang booking.`;

return [{ json: { prompt, harga_diizinkan: [...diizinkan].sort((a, b) => a - b) } }];
