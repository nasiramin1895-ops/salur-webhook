require('dotenv').config();
const express = require('express');
const TelegramBot = require('node-telegram-bot-api');
const { Pool } = require('pg');
const nodemailer = require('nodemailer');
const axios = require('axios');

// ==========================================
// 1. KONFIGURASI EXPRESS & BOT
// ==========================================
const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const PORT = process.env.PORT || 3000;
const ADMIN_CHAT_ID = process.env.ADMIN_CHAT_ID;

// 🔗 URL CLOUDFLARE TUNNEL PC
const LOCAL_PC_SYNC_URL = "https://intensive-drilling-mixer-controversial.trycloudflare.com/sync-data";

// Inisialisasi Bot Telegram
const bot = new TelegramBot(process.env.TELEGRAM_BOT_TOKEN, { polling: true });

// ==========================================
// 2. KONFIGURASI POSTGRESQL (RENDER)
// ==========================================
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false
  }
});

// Auto-Setup Jadual Database jika belum wujud
async function setupDatabase() {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS customers (
          id SERIAL PRIMARY KEY,
          email VARCHAR(255) UNIQUE NOT NULL,
          telegram_id BIGINT,
          tarikh_daftar TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
      CREATE TABLE IF NOT EXISTS access_keys (
          id SERIAL PRIMARY KEY,
          customer_id INT REFERENCES customers(id) ON DELETE CASCADE,
          access_key VARCHAR(255) UNIQUE NOT NULL,
          instance_id VARCHAR(255) UNIQUE NOT NULL,
          pakej VARCHAR(100),
          status VARCHAR(50) DEFAULT 'ACTIVE',
          dicipta_pada TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);
    console.log("✅ Database Render Postgres sedia digunakan!");
  } catch (err) {
    console.error("❌ Ralat setup database:", err.message);
  }
}
setupDatabase();

// ==========================================
// 3. KONFIGURASI E-MEL (NODEMAILER)
// ==========================================
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS
  }
});

// ==========================================
// 4. ARAHAN BOT TELEGRAM
// ==========================================

// Arahan /start
bot.onText(/\/start/, (msg) => {
  bot.sendMessage(
    msg.chat.id,
    "🚀 *Sistem SaaS Beroperasi!*\n\n" +
    "Jika anda kehilangan Access Key, gunakan arahan berikut untuk pemulihan:\n" +
    "`/recover e-mel_anda@gmail.com`",
    { parse_mode: 'Markdown' }
  );
});

// Arahan /recover <email>
bot.onText(/\/recover (.+)/, async (msg, match) => {
  const chatId = msg.chat.id;
  const inputEmail = match[1].trim().toLowerCase();

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(inputEmail)) {
    return bot.sendMessage(chatId, "❌ Format e-mel tidak sah. Contoh: `/recover nama@gmail.com`", { parse_mode: 'Markdown' });
  }

  try {
    const queryText = `
      SELECT c.email, a.access_key, a.instance_id, a.pakej 
      FROM customers c
      JOIN access_keys a ON c.id = a.customer_id
      WHERE LOWER(c.email) = $1 AND a.status = 'ACTIVE'
    `;
    const result = await pool.query(queryText, [inputEmail]);

    if (result.rows.length === 0) {
      return bot.sendMessage(chatId, "❌ E-mel tidak dijumpai atau tiada Access Key yang aktif.");
    }

    let senaraiKeys = "";
    result.rows.forEach((row, index) => {
      senaraiKeys += `\n${index + 1}. Pakej: ${row.pakej || 'Standard'}\n   Instance ID: ${row.instance_id}\n   Access Key: ${row.access_key}\n`;
    });

    await transporter.sendMail({
      from: `"Sokongan SaaS" <${process.env.EMAIL_USER}>`,
      to: inputEmail,
      subject: 'Pemulihan Access Key Anda',
      text: `Salam,\n\nBerikut adalah maklumat langganan anda yang masih aktif:\n${senaraiKeys}\n\nSila simpan dengan selamat. Terima kasih!`
    });

    const [name, domain] = inputEmail.split('@');
    const maskedEmail = `${name.substring(0, 2)}***@${domain}`;

    bot.sendMessage(chatId, `✅ Maklumat Access Key telah berjaya dihantar ke e-mel **${maskedEmail}**. Sila semak *Inbox* atau *Spam*.`, { parse_mode: 'Markdown' });

  } catch (error) {
    console.error("Ralat Recover Email:", error.message);
    bot.sendMessage(
      chatId, 
      "⚠️ Berlaku ralat penghantaran e-mel. (Pastikan tetapan EMAIL_PASS 16-digit di Render telah dikemas kini)."
    );
  }
});

// ==========================================
// 5. SERVER EXPRESS & WEBHOOK
// ==========================================

app.get('/', (req, res) => {
  res.send('🚀 Webhook & Server SaaS Beroperasi Cemerlang!');
});

app.post('/webhook', async (req, res) => {
  try {
    const status_id = req.body.status_id;
    const order_id = req.body.order_id || "SALUR-MANUAL-" + Date.now();
    const transaction_amount = parseFloat(req.body.amount || req.body.transaction_amount || 0);
    const billEmail = (req.body.billEmail || req.body.email || "tiada_emel@sistem.com").trim().toLowerCase();
    const namaPakej = req.body.pakej || "Pakej Dinamik";
    const refNo = req.body.refno || req.body.transaction_id || "REF-BANK-999";

    if (status_id === '1' || status_id === 1) {
      
      const instanceId = "INST-" + Math.random().toString(36).substring(2, 8).toUpperCase();
      const accessKey = "AK-" + Math.random().toString(36).substring(2, 12).toUpperCase();
      const untungBersih = transaction_amount - 1.00;

      // 1. Simpan ke Render Postgres
      const custResult = await pool.query(`
        INSERT INTO customers (email, telegram_id) 
        VALUES ($1, $2) 
        ON CONFLICT (email) DO UPDATE SET telegram_id = EXCLUDED.telegram_id
        RETURNING id
      `, [billEmail, order_id]);

      const customerId = custResult.rows[0].id;

      await pool.query(`
        INSERT INTO access_keys (customer_id, access_key, instance_id, pakej, status) 
        VALUES ($1, $2, $3, $4, 'ACTIVE')
      `, [customerId, accessKey, instanceId, namaPakej]);

      // 2. SYNC KE LOCAL PC DATABASE (CLOUDFLARE TUNNEL)
      if (LOCAL_PC_SYNC_URL.startsWith("http")) {
        try {
          const expiryDate = new Date();
          expiryDate.setDate(expiryDate.getDate() + 30);
          
          await axios.post(LOCAL_PC_SYNC_URL, {
            orderId: order_id,
            refNo: refNo,
            pakejName: namaPakej,
            amountPaid: transaction_amount,
            netProfit: untungBersih,
            instanceId: instanceId,
            accessKey: accessKey,
            expiryDate: expiryDate.toISOString().split('T')[0]
          });
          console.log(`✅ Data transaksi berjaya dihantar ke Local PC Database!`);
        } catch (errSync) {
          console.error(`⚠️ Ralat Sync ke Local PC:`, errSync.message);
        }
      }

      // 3. Telegram Pelanggan
      if (order_id) {
        const mesejPelanggan = `🎉 *Bayaran Berjaya!*\n\nTerima kasih kerana melanggan *${namaPakej}*.\n\n` +
                               `🖥️ *Instance ID:* \`${instanceId}\`\n` +
                               `🔑 *Access Key:* \`${accessKey}\`\n\n` +
                               `Sila simpan maklumat ini. Jika hilang, anda boleh gunakan arahan /recover ${billEmail}`;

        bot.sendMessage(order_id, mesejPelanggan, { parse_mode: 'Markdown' }).catch(e => console.error("Ralat Hantar Mesej Pelanggan:", e.message));
      }

      // 4. Telegram Admin
      if (ADMIN_CHAT_ID) {
        const mesejAdmin = `💰 *JUALAN BARU MASUK!*\n\n` +
                           `📦 Pakej: ${namaPakej}\n` +
                           `💵 Bayaran Pelanggan: RM ${transaction_amount.toFixed(2)}\n` +
                           `🏦 Caj FPX: RM 1.00\n` +
                           `✅ *Untung Bersih: RM ${untungBersih.toFixed(2)}*\n\n` +
                           `📧 E-mel: ${billEmail}`;

        bot.sendMessage(ADMIN_CHAT_ID, mesejAdmin, { parse_mode: 'Markdown' }).catch(e => console.error("Ralat Hantar Mesej Admin:", e.message));
      }

      console.log(`✅ Transaksi berjaya disimpan & diproses untuk ${billEmail}`);
      return res.status(200).send("OK");

    } else {
      console.log(`⚠️ Status Bayaran Tidak Berjaya: ${status_id}`);
      return res.status(400).send("Bayaran tidak berjaya");
    }

  } catch (err) {
    console.error("❌ Ralat Webhook:", err);
    return res.status(500).send("Internal Server Error");
  }
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Server berjalan di port ${PORT}`);
});
