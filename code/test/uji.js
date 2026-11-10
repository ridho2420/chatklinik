// Uji logika node Code di workflow Klinik - Balas Chat dan Klinik - Laporan Malam.
// Jalankan dari folder utama: node test/uji.js   (tambahkan --contoh untuk melihat contoh laporan)
// Butuh: test/harness.js dan folder src/ berisi kode tiap node.
const assert = require('assert');
const { jalankan } = require('./harness');

const cfg = {
  nama_klinik: 'Klinik Aura Derma', jam_buka: '09:00', jam_tutup: '20:00',
  nomor_admin: '0811-1111-111', nomor_owner: '628222222222',
  kalimat_iklan: 'Halo, saya mau tanya info promonya',
  batas_balasan_per_nomor_per_hari: 10, batas_balasan_per_bulan: 1400,
  jawab_hanya_di_luar_jam: false, jam_laporan_mundur: 24,
  jeda_ambil_alih_jam: 2, jawab_saat_menunggu_admin: 'selalu',
  isi_sapaan_kilat: 'Di klinik kami tersedia perawatan Facial dan Laser. Ada keluhan kulit yang ingin Kakak tanyakan?',
};
const harga = [
  { row_number: 2, Perawatan: 'Facial Acne', Kategori: 'Facial', Harga: 250000, Durasi: '60 menit' },
  { row_number: 3, Perawatan: 'Facial Brightening', Kategori: 'Facial', Harga: '300000', Durasi: '60 menit' },
  { row_number: 4, Perawatan: 'Laser Rejuvenation', Kategori: 'Laser', Harga: 1250000, Durasi: '45 menit' },
  { row_number: 5, Perawatan: '', Harga: '' },
];
const jadwal = [{ Nama: 'dr. Maya', Peran: 'Dokter', Hari: 'Senin, Rabu, Jumat', Jam: '10.00-17.00' }];
const promo = [{ Promo: 'Paket Facial Acne 3x', 'Harga Promo': 650000, 'Berlaku Sampai': '30 November 2027', Syarat: 'DP Rp 100.000 saat booking' },
  { Promo: 'Promo lama', 'Harga Promo': 99000, 'Berlaku Sampai': '31 Oktober 2026', Syarat: '' }];
const info = [{ Topik: 'Alamat', Isi: 'Jl. Contoh No. 12, Bekasi' }, { Topik: 'Parkir', Isi: 'Tersedia untuk 5 mobil' }];
const booking = [
  { 'Tanggal': '2026-10-12', 'Jam': '14.00', 'Nama Pasien': 'Bu Ani', 'Nomor HP': '0812-9999-0001', 'Perawatan': 'Facial Acne', 'Ditangani': 'Terapis Lia' },
  { 'Tanggal': '2026-10-13', 'Nama Pasien': 'Rudi', 'Nomor HP': 81299990002 },
];
let lulus = 0;
const uji = (nama, f) => { try { f(); lulus++; console.log('  lulus  ' + nama); } catch (e) { console.log('  GAGAL  ' + nama + '\n         ' + e.message); process.exitCode = 1; } };

const rapikan = body => jalankan('rapikan_pesan.js', { nodes: { 'Pengaturan': [cfg], 'Webhook Fonnte': [{ body }] } })[0];
const cekLama = chat => jalankan('cek_pasien_lama.js', { nodes: { 'Rapikan Pesan': [chat], 'Baca Booking': booking } })[0];
const jalur = (chat, status, c = cfg, catatan = []) => jalankan('tentukan_jalur.js', { nodes: { 'Pengaturan': [c], 'Cek Pasien Lama': [chat], 'Catat Chat Masuk': [status], 'Cek Ambil Alih': catatan } });
const statusBaru = { duplikat: false, balasan_bot_hari_ini: 0, balasan_bot_bulan_ini: 0, riwayat: [] };
const chatDari = (pesan, lain = {}) => cekLama(rapikan({ sender: '6281200000001', name: 'Sari Dewi', message: pesan, ...lain }));
const promptDari = j => jalankan('susun_prompt.js', { nodes: { 'Pengaturan': [cfg], 'Tentukan Jalur': [j], 'Data Klinik': [{ ada: false }], 'Baca Harga': harga, 'Baca Jadwal': jadwal, 'Baca Promo': promo, 'Baca Info': info } })[0];
const periksa = (j, aiOut) => jalankan('periksa_jawaban.js', { nodes: { 'Pengaturan': [cfg], 'Tentukan Jalur': [j], 'Susun Prompt': [promptDari(j)] }, input: [aiOut] })[0];
const ai = o => ({ text: '```json\n' + JSON.stringify(o) + '\n```' });
const lewatAI = (pesan, aiObj, status = statusBaru) => { const j = jalur(chatDari(pesan), status)[0]; assert.equal(j.perlu_ai, true, 'seharusnya sampai ke AI'); return periksa(j, ai(aiObj)); };

console.log('Rapikan Pesan');
uji('field Fonnte versi Indonesia (pengirim, pesan) terbaca', () => { const r = rapikan({ pengirim: '081200000001', pesan: ' halo ' }); assert.equal(r.nomor, '6281200000001'); assert.equal(r.pesan, 'halo'); assert.equal(r.abaikan, false); });
uji('pesan grup diabaikan', () => assert.equal(rapikan({ sender: '120363@g.us', message: 'hai' }).abaikan, true));
uji('pesan kosong diabaikan', () => assert.equal(rapikan({ sender: '6281200000001', message: '' }).abaikan, true));
uji('foto tanpa teks tidak diabaikan dan ditandai media', () => { const r = rapikan({ sender: '6281200000001', message: 'non-text message', url: 'https://x/y.jpg' }); assert.equal(r.abaikan, false); assert.equal(r.media, true); });
uji('kalimat iklan dikenali walau beda huruf besar dan tanda baca', () => { assert.equal(rapikan({ sender: '6281200000001', message: 'halo saya mau tanya info promonya!' }).dari_iklan, true); assert.equal(rapikan({ sender: '6281200000001', message: 'harga facial?' }).dari_iklan, false); });

console.log('Cek Pasien Lama');
uji('nomor 0812-xxx di sheet cocok dengan 62812xxx', () => assert.equal(cekLama(rapikan({ sender: '6281299990001', message: 'hai' })).pasien_lama, true));
uji('nomor di sheet yang kehilangan angka 0 tetap cocok', () => assert.equal(cekLama(rapikan({ sender: '6281299990002', message: 'hai' })).pasien_lama, true));
uji('nomor baru bukan pasien lama', () => assert.equal(chatDari('hai').pasien_lama, false));

console.log('Tentukan Jalur');
uji('pesan ganda berhenti tanpa hasil', () => assert.equal(jalur(chatDari('hai'), { duplikat: true }).length, 0));
uji('pasien lama: bot diam, admin diberi tahu', () => { const j = jalur(cekLama(rapikan({ sender: '6281299990001', message: 'mau geser jadwal' })), statusBaru)[0]; assert.equal(j.perlu_ai, false); assert.equal(j.pesan_pasien, ''); assert.match(j.pesan_admin, /Bu Ani/); assert.equal(j.log.alasan, 'pasien_lama'); });
uji('keluhan kulit biasa ("Jerawat saya begini, cocoknya apa?") sampai ke AI', () => assert.equal(jalur(chatDari('Jerawat saya begini, cocoknya apa?'), statusBaru)[0].perlu_ai, true));
uji('kondisi serius (meradang, bernanah) diteruskan tanpa AI dan tanpa saran perawatan', () => { const j = jalur(chatDari('jerawatku meradang dan bernanah, boleh facial?'), statusBaru)[0]; assert.equal(j.perlu_ai, false); assert.equal(j.log.tindakan, 'teruskan'); assert.equal(j.log.alasan, 'kondisi_kulit'); assert.match(j.pesan_pasien, /asisten AI/); assert.doesNotMatch(j.pesan_pasien, /laser|peeling|Rp/i); assert.ok(j.pesan_admin); });
uji('pertanyaan hamil dan alergi diteruskan', () => { assert.equal(jalur(chatDari('lagi hamil boleh laser ga?'), statusBaru)[0].log.alasan, 'kondisi_kulit'); assert.equal(jalur(chatDari('aku alergi, aman?'), statusBaru)[0].log.alasan, 'kondisi_kulit'); });
uji('pertanyaan biasa sampai ke AI', () => { for (const p of ['Harga facial jerawat berapa?', 'Dokternya ada hari apa?', 'alamatnya di mana ya', 'Halo, saya mau tanya info promonya', 'mau booking facial sabtu jam 2']) assert.equal(jalur(chatDari(p), statusBaru)[0].perlu_ai, true, p); });
uji('foto diteruskan ke admin', () => { const j = jalur(chatDari('non-text message', { url: 'https://x/y.jpg' }), statusBaru)[0]; assert.equal(j.log.alasan, 'kirim_media'); assert.ok(j.pesan_admin); });
uji('batas harian per nomor membuat bot diam', () => { const j = jalur(chatDari('harga?'), { ...statusBaru, balasan_bot_hari_ini: 10 })[0]; assert.equal(j.log.alasan, 'batas_harian'); assert.equal(j.pesan_pasien, ''); assert.ok(j.pesan_admin); });
uji('batas bulanan membuat bot diam', () => assert.equal(jalur(chatDari('harga?'), { ...statusBaru, balasan_bot_bulan_ini: 1400 })[0].log.alasan, 'batas_bulanan'));
uji('mode hanya di luar jam: diam saat klinik buka, menjawab saat tutup', () => { const c = { ...cfg, jawab_hanya_di_luar_jam: true }; const buka = { ...chatDari('harga?'), luar_jam: false }; const tutup = { ...chatDari('harga?'), luar_jam: true }; assert.equal(jalur(buka, statusBaru, c)[0].log.alasan, 'jam_kerja'); assert.equal(jalur(tutup, statusBaru, c)[0].perlu_ai, true); });

console.log('Susun Prompt');
uji('data klinik masuk ke prompt dan baris kosong dilewati', () => { const p = promptDari(jalur(chatDari('harga facial?'), statusBaru)[0]); assert.match(p.prompt, /Facial Acne/); assert.match(p.prompt, /Rp 250\.000/); assert.match(p.prompt, /Rp 300\.000/); assert.match(p.prompt, /dr\. Maya/); assert.doesNotMatch(p.prompt, /row_number/); });
uji('daftar nominal yang diizinkan lengkap, termasuk DP di kolom teks', () => assert.deepEqual(promptDari(jalur(chatDari('harga?'), statusBaru)[0]).harga_diizinkan, [100000, 250000, 300000, 650000, 1250000]));

console.log('Periksa Jawaban');
uji('harga dari daftar lolos, bot memperkenalkan diri di pesan pertama', () => { const h = lewatAI('Harga facial jerawat berapa?', { tindakan: 'jawab', alasan: null, topik: 'harga', balasan: 'Facial Acne harganya Rp 250.000 ya Kak, durasinya 60 menit.', booking: null }); assert.equal(h.log.tindakan, 'jawab'); assert.match(h.pesan_pasien, /^Halo Kak Sari, saya asisten AI Klinik Aura Derma\./); assert.match(h.pesan_pasien, /Rp 250\.000/); assert.equal(h.pesan_admin, ''); });
uji('harga ditulis "250 ribu" atau "1,25 juta" tetap dikenali sebagai harga daftar', () => { assert.equal(lewatAI('harga?', { tindakan: 'jawab', topik: 'harga', balasan: 'Facial Acne 250 ribu, laser 1,25 juta.' }).log.tindakan, 'jawab'); });
uji('harga karangan AI diblokir dan diteruskan ke admin', () => { const h = lewatAI('harga botox berapa?', { tindakan: 'jawab', topik: 'harga', balasan: 'Botox sekitar Rp 2.500.000 ya Kak.' }); assert.equal(h.log.tindakan, 'teruskan'); assert.equal(h.log.alasan, 'harga_tidak_ada'); assert.doesNotMatch(h.pesan_pasien, /2\.500\.000/); assert.match(h.pesan_admin, /2500000/); });
uji('harga karangan dalam bentuk "175rb" juga diblokir', () => assert.equal(lewatAI('harga peeling?', { tindakan: 'jawab', topik: 'harga', balasan: 'Peeling 175rb Kak' }).log.alasan, 'harga_tidak_ada'));
uji('jam dan tanggal tidak dianggap harga', () => assert.equal(lewatAI('dokter ada kapan?', { tindakan: 'jawab', topik: 'jadwal', balasan: 'dr. Maya praktik Senin, Rabu, Jumat pukul 10.00-17.00. Promo berlaku sampai 31 Oktober 2026, bisa datang 2 kali.' }).log.tindakan, 'jawab'));
uji('AI menandai harga tidak ada: pasien dapat teks tetap', () => { const h = lewatAI('harga botox?', { tindakan: 'teruskan', alasan: 'harga_tidak_ada', topik: 'harga', balasan: 'Mungkin sekitar 2 jutaan' }); assert.doesNotMatch(h.pesan_pasien, /2 juta/); assert.match(h.pesan_pasien, /admin/); });
uji('AI menandai kondisi kulit: saran dari AI tidak ikut terkirim', () => { const h = lewatAI('kalau kusam gimana', { tindakan: 'teruskan', alasan: 'kondisi_kulit', topik: 'kondisi_kulit', balasan: 'Biasanya cocok Facial Brightening.' }); assert.doesNotMatch(h.pesan_pasien, /Brightening/); assert.equal(h.log.topik, 'kondisi_kulit'); });
uji('booking belum lengkap: bot bertanya, tidak diteruskan', () => { const h = lewatAI('mau booking facial', { tindakan: 'jawab', topik: 'booking', balasan: 'Boleh Kak, atas nama siapa dan untuk hari apa jam berapa?', booking: { nama: '', perawatan: 'Facial Acne', waktu: '' } }); assert.equal(h.log.tindakan, 'jawab'); assert.equal(h.pesan_admin, ''); });
uji('booking lengkap: diteruskan dengan rincian, tanpa janji jadwal', () => { const h = lewatAI('Sari, facial acne, sabtu jam 2', { tindakan: 'teruskan', alasan: 'booking', topik: 'booking', balasan: 'Sudah saya booking ya!', booking: { nama: 'Sari', perawatan: 'Facial Acne', waktu: 'Sabtu jam 14.00' } }); assert.equal(h.log.alasan, 'booking'); assert.deepEqual(h.log.booking, { nama: 'Sari', perawatan: 'Facial Acne', waktu: 'Sabtu jam 14.00' }); assert.match(h.pesan_pasien, /belum pasti sampai admin mengonfirmasi/); assert.doesNotMatch(h.pesan_pasien, /Sudah saya booking/); assert.match(h.pesan_admin, /Waktu diminta: Sabtu jam 14\.00/); });
uji('jawaban AI bukan JSON: diteruskan ke admin', () => { const j = jalur(chatDari('halo'), statusBaru)[0]; const h = periksa(j, { text: 'Maaf saya tidak mengerti' }); assert.equal(h.log.tindakan, 'teruskan'); assert.match(h.pesan_admin, /Catatan sistem/); });
uji('AI gagal dipanggil: diteruskan ke admin', () => { const j = jalur(chatDari('halo'), statusBaru)[0]; assert.equal(periksa(j, { error: 'quota' }).log.tindakan, 'teruskan'); });
uji('tanda bintang dari AI dibuang', () => assert.doesNotMatch(lewatAI('alamat?', { tindakan: 'jawab', topik: 'lokasi', balasan: '**Alamat** kami di Jl. Contoh No. 12, Bekasi.' }).pesan_pasien, /\*/));
uji('bukan pesan pertama: tidak memperkenalkan diri lagi', () => assert.doesNotMatch(lewatAI('alamat?', { tindakan: 'jawab', topik: 'lokasi', balasan: 'Di Jl. Contoh No. 12, Bekasi.' }, { ...statusBaru, riwayat: [{ arah: 'masuk', pesan: 'hai' }, { arah: 'keluar', pesan: 'Halo' }] }).pesan_pasien, /asisten AI/));

console.log('Cek Sapaan Kilat');
const kilat = (chat, status = statusBaru, c = cfg) => jalankan('cek_sapaan_kilat.js', { nodes: { 'Pengaturan': [c], 'Cek Pasien Lama': [chat], 'Catat Chat Masuk': [status] } })[0];
uji('pesan pertama yang hanya sapaan dibalas kalimat jadi, tanpa AI', () => { const k = kilat(chatDari('Halo kak, mau tanya-tanya perawatan wajah')); assert.equal(k.kilat, true); assert.match(k.pesan_pasien, /^Halo Kak Sari, saya asisten AI Klinik Aura Derma\./); assert.equal(k.log.alasan, 'sapaan_kilat'); });
uji('sapaan yang memuat pertanyaan (harga, jerawat) lewat jalur biasa', () => { assert.equal(kilat(chatDari('halo kak, harga facial berapa?')).kilat, false); assert.equal(kilat(chatDari('halo kak jerawatku banyak')).kilat, false); });
uji('sapaan kilat hanya untuk pesan pertama dan bukan untuk pasien lama', () => { assert.equal(kilat(chatDari('halo kak'), { ...statusBaru, riwayat: [{ arah: 'masuk', pesan: 'hai' }] }).kilat, false); assert.equal(kilat(cekLama(rapikan({ sender: '6281299990001', message: 'halo kak' }))).kilat, false); });

console.log('Menunggu admin');
const jamLalu = j => new Date(Date.now() - j * 3600000).toISOString();
const sudahSerah = [{ id: 1, waktu: jamLalu(0.2), arah: 'masuk', pesan: 'Sari, facial acne, sabtu jam 2' }, { id: 2, waktu: jamLalu(0.2), arah: 'keluar', pesan: 'sudah saya teruskan', tindakan: 'teruskan', alasan: 'booking' }];
const riwayatAda = { ...statusBaru, riwayat: [{ arah: 'masuk', pesan: 'Sari, facial acne, sabtu jam 2' }, { arah: 'keluar', pesan: 'sudah saya teruskan' }] };
uji('saklar "selalu": pertanyaan lain tetap sampai ke AI dengan tanda menunggu admin', () => { const j = jalur(chatDari('promo bulan ini apa aja kak'), riwayatAda, cfg, sudahSerah)[0]; assert.equal(j.perlu_ai, true); assert.equal(j.menunggu_admin, true); assert.match(j.soal_menunggu, /booking/); });
uji('saklar "tidak": bot diam selama chat ditangani admin', () => { const j = jalur({ ...chatDari('promo bulan ini apa aja kak'), luar_jam: false }, riwayatAda, { ...cfg, jawab_saat_menunggu_admin: 'tidak' }, sudahSerah)[0]; assert.equal(j.perlu_ai, false); assert.equal(j.pesan_pasien, ''); assert.equal(j.log.alasan, 'ditangani_admin'); });
uji('saklar "tidak": pasien menagih dikabari sekali dan admin diingatkan', () => { const j = jalur({ ...chatDari('kok belum dibalas kak??'), luar_jam: false }, riwayatAda, { ...cfg, jawab_saat_menunggu_admin: 'tidak' }, sudahSerah)[0]; assert.equal(j.log.tindakan, 'pengingat'); assert.match(j.pesan_pasien, /sudah ada di admin/); assert.match(j.pesan_admin, /menagih/i); });
uji('klinik tutup: pasien diberi tahu jam admin mulai membalas, bukan "segera"', () => { const j = jalur({ ...chatDari('non-text message', { url: 'https://x/y.jpg' }), luar_jam: true }, statusBaru)[0]; assert.match(j.pesan_pasien, /Klinik sedang tutup/); assert.match(j.pesan_pasien, /pukul 09\.00 WIB/); assert.doesNotMatch(j.pesan_pasien, /segera membalas/); });
uji('jawaban selama menunggu admin dicatat sebagai menunggu_admin', () => { const j = jalur(chatDari('promo bulan ini apa aja kak'), riwayatAda, cfg, sudahSerah)[0]; const h = periksa(j, ai({ tindakan: 'jawab', topik: 'promo', balasan: 'Ada Paket Facial Acne 3x Rp 650.000, Kak.' })); assert.equal(h.log.tindakan, 'jawab'); assert.equal(h.log.alasan, 'menunggu_admin'); });

console.log('Data Klinik dan promo');
const salinan = baris => jalankan('data_klinik.js', { input: baris })[0];
const segar = new Date().toISOString();
uji('salinan lengkap dan baru dipakai', () => assert.equal(salinan([{ tab: 'harga', isi: JSON.stringify(harga), diperbarui: segar }, { tab: 'jadwal', isi: '[]', diperbarui: segar }, { tab: 'promo', isi: '[]', diperbarui: segar }, { tab: 'info', isi: '[]', diperbarui: segar }]).ada, true));
uji('salinan lebih dari 6 jam atau tidak lengkap tidak dipakai', () => { const lama = jamLalu(7); assert.equal(salinan([{ tab: 'harga', isi: JSON.stringify(harga), diperbarui: lama }, { tab: 'jadwal', isi: '[]', diperbarui: lama }, { tab: 'promo', isi: '[]', diperbarui: lama }, { tab: 'info', isi: '[]', diperbarui: lama }]).ada, false); assert.equal(salinan([{ tab: 'harga', isi: JSON.stringify(harga), diperbarui: segar }]).ada, false); });
uji('promo yang sudah lewat tidak dikirim ke AI dan harganya tidak diizinkan', () => { const p = promptDari(jalur(chatDari('promo?'), statusBaru)[0]); assert.doesNotMatch(p.prompt, /Promo lama/); assert.ok(!p.harga_diizinkan.includes(99000)); });

console.log('Siapkan Prospek');
const prospek = (chat, log, baris = []) => jalankan('siapkan_prospek.js', { nodes: { 'Cek Pasien Lama': [chat], 'Susun Kiriman': [{ log }], 'Baca Prospek': baris } });
const logBooking = { tindakan: 'teruskan', alasan: 'booking', booking: { nama: 'Sari', perawatan: 'Facial Acne', waktu: 'Sabtu jam 14.00' } };
uji('orang baru yang bertanya dicatat Tanya-tanya', () => { const r = prospek(chatDari('harga facial?'), { tindakan: 'jawab', perawatan: 'Facial Acne' })[0]; assert.equal(r.Status, 'Tanya-tanya'); assert.equal(r['Nomor WA'], '6281200000001'); assert.equal(r.Perawatan, 'Facial Acne'); });
uji('booking diteruskan: status Menunggu Konfirmasi dan jam tunggu mulai', () => { const r = prospek(chatDari('Sari, facial acne, sabtu jam 2'), logBooking, [{ 'Nomor WA': '6281200000001', Status: 'Tanya-tanya' }])[0]; assert.equal(r.Status, 'Menunggu Konfirmasi'); assert.equal(r['Waktu Diminta'], 'Sabtu jam 14.00'); assert.ok(r['Diteruskan Pada']); });
uji('status Terkonfirmasi dari admin tidak ditimpa', () => { const r = prospek(chatDari('Sari, facial acne, sabtu jam 2'), logBooking, [{ 'Nomor WA': '6281200000001', Status: 'Terkonfirmasi' }])[0]; assert.equal(r.Status, undefined); });
uji('permintaan yang sudah menunggu tidak mengulang jam tunggu', () => { const r = prospek(chatDari('jadi bisa kak?'), logBooking, [{ 'Nomor WA': '6281200000001', Status: 'Menunggu Konfirmasi', 'Diteruskan Pada': '2026-11-01 10:00:00' }])[0]; assert.equal(r['Diteruskan Pada'], undefined); });
uji('sheet gagal dibaca: tidak menulis apa pun', () => assert.equal(prospek(chatDari('harga?'), { tindakan: 'jawab' }, [{ error: 'x' }]).length, 0));

console.log('Susun Kiriman dan Siapkan Catatan');
const kirim = k => jalankan('susun_kiriman.js', { nodes: { 'Pengaturan': [cfg] }, input: [k] });
uji('balasan biasa: satu pesan ke pasien', () => { const k = kirim({ nomor: '6281', pesan_pasien: 'hai', pesan_admin: '', log: { tindakan: 'jawab' } }); assert.equal(k.length, 1); assert.equal(k[0].target, '6281'); });
uji('diteruskan: pasien dulu, lalu admin dengan nomor dirapikan', () => { const k = kirim({ nomor: '6281', pesan_pasien: 'a', pesan_admin: 'b', log: {} }); assert.deepEqual(k.map(x => [x.jenis, x.target]), [['pasien', '6281'], ['admin', '08111111111']]); });
uji('tidak ada kiriman: tetap satu item supaya catatan tersimpan', () => { const k = kirim({ nomor: '6281', pesan_pasien: '', pesan_admin: '', log: { tindakan: 'diam', alasan: 'jam_kerja' } }); assert.equal(k.length, 1); assert.equal(k[0].ada_kiriman, false); });
const catat = (kiriman, hasil, jalan = true) => jalankan('siapkan_catatan.js', { nodes: { 'Susun Kiriman': kiriman, 'Kirim WhatsApp': hasil || [] }, tidakJalan: jalan ? [] : ['Kirim WhatsApp'] })[0];
uji('terkirim tercatat true kalau Fonnte sukses', () => assert.equal(catat(kirim({ nomor: '6281', pesan_pasien: 'a', pesan_admin: 'b', log: { tindakan: 'teruskan', alasan: 'booking', topik: 'booking', booking: { nama: 'S' } } }), [{ status: true }, { status: true }]).p_terkirim, true));
uji('terkirim false kalau Fonnte menolak', () => assert.equal(catat(kirim({ nomor: '6281', pesan_pasien: 'a', pesan_admin: '', log: { tindakan: 'jawab' } }), [{ status: false, reason: 'device disconnected' }]).p_terkirim, false));
uji('hanya ke admin (pasien lama): bukan balasan ke pasien', () => { const c = catat(kirim({ nomor: '6281', pesan_pasien: '', pesan_admin: 'b', log: { tindakan: 'diam', alasan: 'pasien_lama' } }), [{ status: true }]); assert.equal(c.p_terkirim, false); assert.equal(c.p_pesan_pasien, null); });
uji('node kirim tidak jalan: catatan tetap tersusun', () => assert.equal(catat(kirim({ nomor: '6281', pesan_pasien: '', pesan_admin: '', log: { tindakan: 'diam', alasan: 'jam_kerja' } }), null, false).p_tindakan, 'diam'));

console.log('Susun Laporan');
const ringkasan = { orang: [
  { nomor: '6281200000001', nama: 'Sari', baru: true, dari_iklan: true, luar_jam: true, tindakan_terakhir: 'jawab', topik_terakhir: 'harga', belum_ditanggapi: false },
  { nomor: '6281200000002', nama: 'Dina', baru: true, dari_iklan: true, luar_jam: false, tindakan_terakhir: 'teruskan', alasan_terakhir: 'booking', topik_terakhir: 'booking', belum_ditanggapi: false },
  { nomor: '6281299990002', nama: 'Rudi', baru: true, dari_iklan: true, luar_jam: false, tindakan_terakhir: 'teruskan', alasan_terakhir: 'booking', topik_terakhir: 'booking', belum_ditanggapi: false },
  { nomor: '6281200000004', nama: null, baru: true, dari_iklan: false, luar_jam: true, tindakan_terakhir: null, belum_ditanggapi: true },
  { nomor: '6281299990001', nama: 'Bu Ani', baru: false, dari_iklan: false, luar_jam: false, tindakan_terakhir: 'diam', alasan_terakhir: 'pasien_lama', belum_ditanggapi: false },
], topik: { harga: 5, booking: 3, promo: 4, lokasi: 1 }, balasan_bot_bulan_ini: 37, nomor_iklan_semua: ['6281200000001', '6281200000002', '6281299990002', '6281200000009'] };
const lap = (r, prospek = [], log = []) => jalankan('susun_laporan.js', { nodes: { 'Pengaturan': [cfg], 'Ringkasan Chat': [r], 'Baca Booking': booking, 'Baca Prospek': prospek, 'Ambil Log Chat': log } })[0];
uji('angka laporan benar', () => { const m = lap(ringkasan).message; assert.match(m, /Yang chat: 5 orang/); assert.match(m, /Orang baru: 4 \(dari iklan 3, bukan iklan 1\)/); assert.match(m, /Pasien lama: 1/); assert.match(m, /luar jam buka: 2 orang/); assert.match(m, /sudah booking: 1 dari 4 orang baru/); assert.match(m, /Dari iklan: 1 dari 3 \(33%\)/); assert.match(m, /Berhenti setelah diberi harga: 1/); assert.match(m, /menunggu konfirmasi admin: 1/); assert.match(m, /Belum ditanggapi: 1/); assert.match(m, /1\. Harga: 5\n2\. Promo: 4\n3\. Booking: 3/); assert.match(m, /4 orang chat dari iklan, 1 sudah booking \(25%\)/); assert.match(m, /37 dari batas 1400/); assert.match(m, /perlu dicek: 3 orang/); assert.doesNotMatch(m, /- Rudi/); });
uji('laporan dikirim ke nomor owner', () => assert.equal(lap(ringkasan).target, '628222222222'));
uji('hari tanpa chat tidak membuat laporan rusak', () => assert.match(lap({ orang: [], topik: {}, balasan_bot_bulan_ini: 0, nomor_iklan_semua: [] }).message, /Tidak ada chat masuk/));
uji('sheet Booking kosong tidak membuat laporan rusak', () => assert.match(jalankan('susun_laporan.js', { nodes: { 'Pengaturan': [cfg], 'Ringkasan Chat': [ringkasan], 'Baca Booking': [{}], 'Baca Prospek': [], 'Ambil Log Chat': [] } })[0].message, /sudah booking: 0 dari 4/));

const seri = ms => (ms + 7 * 3600000) / 86400000 + 25569;   // angka seri Google Sheets (WIB)
uji('booking menggantung lebih dari 24 jam muncul di laporan', () => { const m = lap(ringkasan, [{ 'Nomor WA': '6281200000002', Nama: 'Dina', Status: 'Menunggu Konfirmasi', Perawatan: 'Facial Acne', 'Waktu Diminta': 'Sabtu 10.00', 'Diteruskan Pada': seri(Date.now() - 27.5 * 3600000) }, { 'Nomor WA': '6281200000007', Nama: 'Tia', Status: 'Menunggu Konfirmasi', 'Diteruskan Pada': seri(Date.now() - 2 * 3600000) }]).message; assert.match(m, /Menunggu konfirmasi admin: 2 orang, 1 di antaranya lewat 24 jam/); assert.match(m, /Dina \(6281200000002\): Facial Acne, minta Sabtu 10\.00\. Menunggu 27 jam\./); assert.doesNotMatch(m, /Tia \(/); });
uji('prospek yang nomornya sudah ada di sheet Booking ditandai Terkonfirmasi', () => { const r = jalankan('siapkan_terkonfirmasi.js', { nodes: { 'Baca Prospek': [{ 'Nomor WA': '6281299990002', Status: 'Menunggu Konfirmasi' }, { 'Nomor WA': '6281200000002', Status: 'Menunggu Konfirmasi' }, { 'Nomor WA': '6281299990001', Status: 'Batal' }], 'Baca Booking': booking } }); assert.deepEqual(r, [{ 'Nomor WA': '6281299990002', Status: 'Terkonfirmasi' }]); });

console.log(`\n${lulus} uji lulus` + (process.exitCode ? ', ADA YANG GAGAL' : ''));
if (process.argv.includes('--contoh')) { console.log('\n--- contoh laporan ---\n' + lap(ringkasan).message); }
