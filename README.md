<div align="center">
  <h1>🌟 Ourin-Ai WhatsApp Bot MD 🌟</h1>
  <p><b>Bot WhatsApp Multi-Device berbasis Baileys (Node.js) dengan 1.400+ Fitur & Cuaca Otomatis!</b></p>
</div>

<p align="center">
  <img src="https://img.shields.io/badge/Version-3.0.1-orange?style=flat-square&logo=git&logoColor=white">
  <img src="https://img.shields.io/badge/Total_Features-1400%2B-blue?style=flat-square&logo=fire">
  <img src="https://img.shields.io/badge/Node.js-Ready-green?style=flat-square&logo=node.js">
  <img src="https://img.shields.io/badge/Baileys-MultiDevice-blue?style=flat-square&logo=whatsapp">
  <img src="https://img.shields.io/badge/Status-Active-success?style=flat-square">
</p>

---

## ✨ Fitur Unggulan
* 🌤️ **Fitur Cuaca Otomatis:** Cek informasi prakiraan cuaca real-time langsung dari dalam chat WhatsApp.
* 🤖 **1.400+ Total Fitur:** Koleksi fitur super lengkap mulai dari AI, Downloader, Game, RPG, Tools, hingga Group Management.
* 📥 **Media Downloader:** Unduh video dan musik dari berbagai platform dengan cepat.
* ⚙️ **Multi-Device Support:** Stabil dan aman menggunakan library Baileys terbaru.
* 🛠️ **Modular System:** Struktur folder (`plugins`, `case`, `src`) yang rapi dan mudah dikustomisasi.

## 🌟 Fitur Terbaik — Deskripsi Unik
Berikut deskripsi singkat yang menonjolkan keunikan fitur-fitur terbaik bot ini:

* 🌤️ Fitur Cuaca Otomatis — "Cuaca di Saku": Menyajikan prakiraan cuaca akurat berdasarkan lokasi atau nama kota yang dikirimkan oleh pengguna, lengkap dengan suhu, kelembapan, dan peringatan cuaca sehingga pengguna tidak perlu keluar dari WhatsApp untuk mengecek kondisi terbaru.

* 🤖 AI Conversation — "Asisten Percakapan Pintar": Integrasi AI yang mampu memahami konteks percakapan, menjawab pertanyaan, merangkum teks panjang, serta memberikan rekomendasi yang relevan sehingga pengalaman chatting terasa seperti berinteraksi dengan asisten nyata.

* 📥 Media Downloader — "Satu Ketuk, Beres": Mengunduh media dari berbagai platform (video, musik, gambar) dengan satu perintah, otomatis menyesuaikan format/kompresi untuk pengiriman nyaman melalui WhatsApp.

* 🛡️ Group Management Otomatis — "Admin Cerdas": Fitur otomatis untuk moderasi grup seperti anti-spam, auto-kick pengguna bermasalah, penjadwalan pengumuman, dan pengaturan cepat izin anggota untuk menjaga komunitas tetap rapi.

* 🔌 Modular Plugin System — "Bangun Sendiri Fitur Baru": Desain plugin yang mudah dimengerti memungkinkan developer menambahkan atau menonaktifkan fitur tanpa mengubah inti aplikasi. Cocok untuk kustomisasi cepat dan eksperimen fitur baru.

* ⚡ Performance & Stabilitas — "Ringan tapi Kuat": Optimasi penggunaan memori dan proses asynchronous membuat bot responsif pada host kelas rendah (VPS/Termux) sekaligus handal untuk deployment di panel seperti Pterodactyl.

* 🔒 Privasi & Multi-Device — "Aman Berkolaborasi": Dukungan Baileys Multi-Device menjaga sesi tetap stabil tanpa harus sering memindai ulang, serta mempertahankan kontrol privasi dan pengelolaan sesi yang lebih baik.

* 🧩 Tools & Utilities — "Kotak Perangkat Serba Guna": Dilengkapi utilitas mulai dari converter, generator, hingga tools admin yang memudahkan automasi tugas sehari-hari di chat dan grup.


## 🚀 Cara Instalasi (Termux / VPS / Panel Pterodactyl)
```bash
git clone https://github.com/itsmeeaizat/Ourin-Ai-Whatsapp-Bot-Multi-Device.git
cd Ourin-Ai-Whatsapp-Bot-Multi-Device
npm install
node index.js
```

## 🚀 Panduan Instalasi di Pterodactyl Panel

Bagi kamu yang ingin menjalankan bot ini menggunakan panel Pterodactyl, ikuti langkah-langkah di bawah ini:

1. **Buat Server Baru:**
   * Pilih **Egg / Nest Node.js** (pastikan versi minimal Node.js v18 atau v20+).
   * Atur startup command ke file utama bot (misal `node index.js`).
2. **Clone Repository (Via Console):**
   Masuk ke tab **Console** di server Pterodactyl, pastikan server dalam keadaan *Stop*, lalu jalankan perintah ini:
   ```bash
   git clone https://github.com/itsmeeaizat/Ourin-Ai-Whatsapp-Bot-Multi-Device.git .
   ```

Created with ❤️ by itsmeeaizat
