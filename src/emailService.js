// File: ecommerce-backend/src/emailService.js
import nodemailer from "nodemailer";

// 1. Setup transporter Nodemailer menggunakan kredensial .env
const transporter = nodemailer.createTransport({
  host: process.env.MAIL_HOST,
  port: parseInt(process.env.MAIL_PORT, 10),
  secure: false, // true untuk port 465, false untuk port lain
  auth: {
    user: process.env.MAIL_USER,
    pass: process.env.MAIL_PASS,
  },
});

// 2. Fungsi helper untuk mengirim email
async function sendEmail(to, subject, htmlContent) {
  try {
    const info = await transporter.sendMail({
      from: process.env.MAIL_FROM,
      to: to, // email pelanggan
      subject: subject,
      html: htmlContent, // body email
    });

    console.log("Email terkirim: %s", info.messageId);
    // URL Preview Ethereal
    console.log("Lihat email di: %s", nodemailer.getTestMessageUrl(info));
    return info;
  } catch (err) {
    console.error("Gagal mengirim email:", err);
  }
}

// 3. Setup Template Email (Tugas 15.3)

/**
 * Template untuk pesanan baru (Menunggu Pembayaran)
 */
function getNewOrderTemplate(order, user) {
  const subject = `Pesanan #${order.id} Menunggu Pembayaran`;
  const html = `
    <h1>Halo ${user.name},</h1>
    <p>Pesanan Anda #${order.id} telah kami terima dan saat ini sedang <strong>Menunggu Pembayaran</strong>.</p>
    <p>Total Tagihan: <strong>Rp ${order.total}</strong></p>
    <p>Silakan lakukan pembayaran melalui halaman detail pesanan Anda.</p>
    <p>Terima kasih telah berbelanja di Holycat!</p>
  `;
  return { subject, html };
}

/**
 * Template untuk pesanan dibayar/diproses
 */
function getOrderProcessedTemplate(order, user) {
  const subject = `Pesanan #${order.id} Telah Dibayar dan Sedang Diproses`;
  const html = `
    <h1>Halo ${user.name},</h1>
    <p>Pembayaran untuk pesanan Anda #${order.id} telah kami konfirmasi!</p>
    <p>Saat ini pesanan Anda sedang <strong>Diproses</strong> oleh tim kami.</p>
    <p>Kami akan segera memberi tahu Anda setelah pesanan dikemas.</p>
    <p>Terima kasih!</p>
  `;
  return { subject, html };
}

/**
 * Template untuk pesanan dikirim
 */
function getOrderShippedTemplate(order, user) {
  const subject = `Pesanan #${order.id} Telah Dikirim`;
  const html = `
    <h1>Halo ${user.name},</h1>
    <p>Kabar baik! Pesanan Anda #${order.id} telah <strong>Dikirim</strong>.</p>
    <h3>Detail Pengiriman:</h3>
    <ul>
      <li>Kurir: <strong>${order.courier}</strong></li>
      <li>No. Resi: <strong>${order.trackingNumber}</strong></li>
      <li>Dikirim Pada: <strong>${new Date(order.shippedAt).toLocaleString(
        "id-ID"
      )}</strong></li>
    </ul>
    <p>Terima kasih telah berbelanja di Holycat!</p>
  `;
  return { subject, html };
}

/**
 * Template untuk pesanan selesai
 */
function getOrderCompletedTemplate(order, user) {
  const subject = `Pesanan #${order.id} Selesai`;
  const html = `
      <h1>Halo ${user.name},</h1>
      <p>Pesanan Anda #${order.id} telah <b>Selesai</b>.</p>
      <p>Terima kasih telah berbelanja di Holycat! Kami tunggu pesanan Anda berikutnya.</p>
    `;
  return { subject, html };
}

/**
 * Template untuk pesanan dibatalkan
 */
function getOrderCancelledTemplate(order, user) {
  const subject = `Pesanan #${order.id} Dibatalkan`;
  const html = `
      <h1>Halo ${user.name},</h1>
      <p>Pesanan Anda #${order.id} telah <strong>Dibatalkan</strong>.</p>
      <p>Jika Anda tidak merasa melakukan pembatalan, silakan hubungi kami.</p>
    `;
  return { subject, html };
}

// 4. Fungsi utama untuk memicu email berdasarkan status
export async function sendOrderStatusEmail(order, user) {
  let template;

  // Kita butuh Enum OrderStatus di sini, cara mudahnya adalah hardcode string
  // atau mengimpornya jika file ini di-refactor
  switch (order.status) {
    case "Menunggu_Pembayaran":
      template = getNewOrderTemplate(order, user);
      break;
    case "Diproses":
      template = getOrderProcessedTemplate(order, user);
      break;
    case "Dikirim":
      template = getOrderShippedTemplate(order, user);
      break;
    case "Selesai":
      template = getOrderCompletedTemplate(order, user);
      break;
    case "Dibatalkan":
      template = getOrderCancelledTemplate(order, user);
      break;
    default:
      // Tidak kirim email untuk status "Dikemas" atau lainnya
      return;
  }

  if (template) {
    await sendEmail(user.email, template.subject, template.html);
  }
}
