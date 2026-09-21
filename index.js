const express = require("express");
const axios = require("axios");
const app = express();

app.use(express.urlencoded({ extended: true }));
app.use(express.json());

// Mengambil rahsia daripada Tetapan Render secara selamat
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID;

app.post("/webhook", async (req, res) => {
  try {
    const data = req.body;
    console.log("\n📩 Mesej Masuk Dari ToyyibPay:", data);

    if (data.status_id === "1" || data.status_id === 1) {
      const orderId = data.order_id || "Tiada ID";
      const refNo = data.refno || "Tiada Ref";
      const amount = data.transaction_amount || "0.00";
      const profit = (parseFloat(amount) * 0.95).toFixed(2);

      const telegramUrl = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`;
      const message = `💰 *BAYARAN BAHARU BERJAYA! (Render Cloud)*\n\n` +
                      `🏢 *Instance ID:* ${orderId}\n` +
                      `📄 *Ref No:* ${refNo}\n` +
                      `💵 *Jumlah Jualan:* RM ${amount}\n` +
                      `✨ *Net Profit Mr MNA (95%):* *RM ${profit}*\n` +
                      `⏱️ *Waktu Transaksi:* Baru Sahaja\n` +
                      `🚀 *Status:* Diterima & diproses 24/7 melalui Render Cloud!`;

      await axios.post(telegramUrl, {
        chat_id: TELEGRAM_CHAT_ID,
        text: message,
        parse_mode: "Markdown"
      });

      console.log("✅ Notifikasi Telegram Berjaya Dihantar dari Cloud!");
    }

    res.status(200).send("OK");
  } catch (error) {
    if (error.response) {
      console.error("❌ Ralat Telegram API:", error.response.data);
    } else {
      console.error("❌ Ralat Webhook:", error.message);
    }
    res.status(500).send("Error");
  }
});

// Render akan sediakan port secara automatik
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`\n🚀 Salur Cloud Webhook aktif di port ${PORT}`);
});
