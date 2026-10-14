# AI Task Board

AI Task Board menampilkan pekerjaan yang dilaporkan oleh agen AI. Aplikasi berjalan di komputer lokal, menyimpan event di SQLite, dan menyediakan dashboard, REST API, SSE, serta MCP bridge.

## Fitur

- Daftar proyek dengan jumlah tugas per status. Pilih proyek untuk membuka board yang hanya menampilkan tugas di proyek tersebut.
- Instalasi baru menampilkan Task Tracker Kanban, Dot Notifier, dan Ashram Gandhi Puri Landing Page sebagai proyek awal.
- Saat Codex pertama kali mulai bekerja di proyek, plugin mendaftarkannya ke Task Board. Tugas baru ditautkan dengan ID proyek tersebut.
- Pindahkan tugas ke proyek lain dari kartu tugas. Proyek dan penetapan tugas disimpan bersama di SQLite lokal.
- Pantau antrean, pekerjaan berjalan, tugas terblokir, selesai, dan gagal; filter berdasarkan agen, model, atau status.
- Buka riwayat event setiap tugas dan lihat penggunaan token serta perkiraan biaya jika data dan harga tersedia.
- Terima event melalui MCP atau REST. Keduanya menggunakan layanan event dan validasi yang sama.
- Tampilan utama berisi daftar proyek dan board; halaman Settings telah dihapus.

## Menjalankan aplikasi

Persyaratan: Node.js 22.13 atau lebih baru dan npm.

```bash
git clone https://github.com/kidkyzo/task-tracker.git
cd task-tracker
npm install
npm run dev
```

Buka [http://127.0.0.1:4317](http://127.0.0.1:4317). Server hanya menerima koneksi dari komputer lokal. Untuk menjalankan build produksi:

```bash
npm start
```

`npm start` membangun aplikasi terlebih dahulu, kemudian menjalankannya. Database lokal dibuat di `data/board.sqlite`. Atur `AI_TASK_BOARD_DB` bila ingin menentukan lokasi database lain. Atur `PORT` bila port default `4317` sedang dipakai.

## Memasang plugin marketplace Codex

Plugin repository ini menyediakan MCP bridge `ai-task-board` dan panduan pelaporan tugas. Pemasangannya bersifat lokal untuk repository ini, bukan publikasi ke marketplace umum.

1. Di terminal pertama, jalankan Task Tracker dengan `npm start`. Perintah ini membangun aplikasi dan MCP bridge, lalu menjalankan dashboard.
2. Buka PowerShell lain di folder repository dan tambahkan marketplace serta pluginnya:

   ```powershell
   codex plugin marketplace add ./
   codex plugin add ai-task-board@ai-task-board-local
   ```

3. Buka Codex dari folder repository dan aktifkan plugin AI Task Board pada project ini. Saat mulai bekerja, Codex mendaftarkan proyek aktif dan memakai ID-nya untuk menautkan task.

Awalan `./` penting agar CLI mengenali root repository sebagai sumber lokal dan menemukan `.agents/plugins/marketplace.json`. Tanpanya, `.agents/plugins` dapat ditafsirkan sebagai shorthand repository GitHub.

> [!NOTE]
> MCP lokal tidak memakai autentikasi. Proses lokal yang dapat menghubungi port `4317` dapat melaporkan tugas sebagai agen “Local MCP”. REST API tetap memerlukan token agen. Plugin mengirim event ke server loopback `http://127.0.0.1:4317`. Detail konfigurasi ada di [panduan MCP](integrations/mcp/README.md).

### Uji koneksi MCP

Di sesi Codex pada project ini, minta Codex membuat tugas lewat AI Task Board MCP, memulainya, memperbarui langkahnya, lalu menyelesaikannya. Pastikan perubahan muncul di dashboard sebagai agen “Local MCP”. Lihat [catatan verifikasi Codex](docs/codex-verification.md).

## Pemeriksaan dan tes

Jalankan semua pemeriksaan sebelum mengirim perubahan:

```bash
npm run check
```

Perintah ini menjalankan ESLint, pemeriksaan format, typecheck, production build, dan tes Node.js. CI menjalankan perintah yang sama pada push dan pull request.

## Batasan data dan koneksi

- Server berjalan di `127.0.0.1`; aplikasi ini tidak menyediakan akses jaringan, telemetri, atau layanan cloud.
- Event dan pengaturan aplikasi disimpan pada database SQLite lokal. Token agen disimpan sebagai hash dan hanya ditampilkan sekali saat dibuat.
- Nama proyek dan penetapan tugas disimpan di database SQLite lokal. Saat mendaftarkan proyek, server hanya menyimpan hash path proyek, bukan path mentahnya.
- Board mencatat pekerjaan yang dilaporkan agen. Board tidak memulai atau mengendalikan agen.
- Integrasi langsung yang sudah disiapkan adalah plugin marketplace Codex. Dukungan klien lain belum diverifikasi.

## Struktur repository

```text
app/                  Halaman Next.js, dashboard, dan Route Handlers
server/               Layanan event bersama dan penyimpanan SQLite
integrations/mcp/     MCP bridge dan panduan konfigurasi
integrations/rest/    Contoh penggunaan REST API
schema/               Kontrak event dan tool versi 1
.agents/plugins/      Marketplace lokal dan plugin AI Task Board
docs/                 Rencana pengembangan, QA, dan verifikasi
```

Dokumen produk dan pengembangan: [PRD](AI_Task_Tracker_PRD.md), [rencana implementasi](docs/rebuild-plan.md), [desain](DESIGN.MD), dan [rencana QA](docs/qa-plan.md).
