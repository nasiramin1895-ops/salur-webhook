const express = require("express");
const axios = require("axios");
const crypto = require("crypto");
const app = express();

app.use(express.urlencoded({ extended: true }));
app.use(express.json());

// Tetapan Rahsia
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID;
const TOYYIBPAY_SECRET_KEY = process.env.TOYYIBPAY_SECRET_KEY; 

const CATEGORY_CODE = "8h4pisjz"; 

// 🛠️ FUNGSI AUTO-PROVISIONING
async function autoProvisionInstance(orderId, amount) {
  try {
    const instanceId = "SALUR-INST-" + Math.floor(1000 + Math.random() * 9000);
    const accessKey = "sk_live_" + crypto.randomBytes(8).toString("hex");
    const expiryDate = new Date();
    expiryDate.setDate(expiryDate.getDate() + 30); // 30 Hari

    console.log(`\n⚙️ Membina Instance Baharu untuk Order: ${orderId}...`);

    const telegramUrl = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`;
    const message = `🚀 *AUTO-PROVISIONING SUCCESSFUL!*\n\n` +
                    `🏢 *Order ID:* ${orderId}\n` +
                    `📦 *Instance ID:* \`${instanceId}\`\n` +
                    `🔑 *Access Key:* \`${accessKey}\`\n` +
                    `📅 *Tarikh Luput:* ${expiryDate.toLocaleDateString("ms-MY")}\n\n` +
                    `🤖 *Note:* Instance telah diaktifkan secara automatik.`;

    await axios.post(telegramUrl, {
      chat_id: TELEGRAM_CHAT_ID,
      text: message,
      parse_mode: "Markdown"
    });

  } catch (error) {
    console.error("❌ Ralat Auto-Provisioning:", error.message);
  }
}

// 1️⃣ PINTU MENERIMA BAYARAN (WEBHOOK)
app.all("/webhook", async (req, res) => {
  try {
    const data = { ...req.query, ...req.body };
    const status = data.status_id || data.status;

    if (status === "1" || status === 1) {
      const orderId = data.order_id || data.billcode || "Tiada ID";
      const refNo = data.refno || data.transaction_id || "Tiada Ref";
      const amount = data.transaction_amount || data.amount || "0.00";
      const profit = (parseFloat(amount) - 1.00).toFixed(2);

      const telegramUrl = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`;
      const message = `💰 *BAYARAN SEBENAR BERJAYA!*\n\n` +
                      `🏢 *Order ID:* ${orderId}\n` +
                      `📄 *Ref No:* ${refNo}\n` +
                      `💵 *Jumlah Bayaran:* RM ${amount}\n` +
                      `✨ *Net Profit:* *RM ${profit}*\n` +
                      `🚀 *Status:* Bayaran Disahkan!`;

      await axios.post(telegramUrl, {
        chat_id: TELEGRAM_CHAT_ID,
        text: message,
        parse_mode: "Markdown"
      });

      await autoProvisionInstance(orderId, amount);
    }
    res.status(200).send("OK");
  } catch (error) {
    console.error("❌ Ralat Webhook:", error.message);
    res.status(500).send("Error");
  }
});

// 2️⃣ PINTU CIPTA BIL AUTOMATIK (DINAMIK)
app.get("/bayar", async (req, res) => {
  try {
    // Tangkap nama pakej & harga dari URL (atau guna default jika tiada)
    const pakej = req.query.pakej || "Ujian";
    const hargaRM = req.query.harga || "1.00"; 
    
    // Tukar RM ke bentuk sen untuk ToyyibPay
    const amountInCents = Math.round(parseFloat(hargaRM) * 100).toString();

    const formData = new URLSearchParams();
    formData.append("userSecretKey", TOYYIBPAY_SECRET_KEY);
    formData.append("categoryCode", CATEGORY_CODE);
    
    // Nama bil dan deskripsi akan berubah ikut pakej
    formData.append("billName", `Sistem Salur - Pakej ${pakej}`);
    formData.append("billDescription", `Langganan Pakej ${pakej} (RM ${hargaRM})`);
    
    formData.append("billPriceSetting", "1");
    formData.append("billPayorInfo", "0");
    formData.append("billAmount", amountInCents); 
    formData.append("billReturnUrl", "https://t.me/BOTA_ANDA");
    formData.append("billCallbackUrl", "https://salur-webhook.onrender.com/webhook");
    
    // Order ID akan memaparkan nama pakej supaya mudah dibaca di Telegram
    formData.append("billExternalReferenceNo", `SALUR-${pakej.toUpperCase()}-${Date.now()}`);
    
    formData.append("billTo", "Pelanggan");
    formData.append("billEmail", "tiada@email.com");
    formData.append("billPhone", "0000000000");

    const response = await axios.post("https://toyyibpay.com/index.php/api/createBill", formData);

    if (response.data && response.data.length > 0) {
      const billCode = response.data[0].BillCode;
      res.redirect(`https://toyyibpay.com/${billCode}`);
    } else {
      res.send("Gagal mencipta bil.");
    }
  } catch (error) {
    console.error("❌ Ralat Cipta Bil:", error.message);
    res.send("Sistem ralat.");
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`\n🚀 Salur Cloud Webhook aktif di port ${PORT}`);
});
