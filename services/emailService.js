import nodemailer from "nodemailer";
import dotenv from "dotenv";

dotenv.config();

// Tạo transporter cho email
const createTransporter = () => {
  // Cấu hình email từ environment variables
  const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST || "smtp.gmail.com",
    port: parseInt(process.env.SMTP_PORT || "587"),
    secure: process.env.SMTP_SECURE === "true", // true for 465, false for other ports
    auth: {
      user: process.env.SMTP_USER, // Email gửi đi
      pass: process.env.SMTP_PASS, // Password hoặc App Password
    },
  });

  return transporter;
};

// Gửi email reset mật khẩu
export const sendPasswordResetEmail = async (email, resetToken, resetUrl) => {
  try {
    const transporter = createTransporter();

    // Nếu không có cấu hình SMTP, log và return (để test)
    if (!process.env.SMTP_USER || !process.env.SMTP_PASS) {
      console.warn("SMTP không được cấu hình. Không thể gửi email.");
      console.log("Reset token (chỉ để test):", resetToken);
      console.log("Reset URL:", resetUrl);
      return { success: false, message: "SMTP chưa được cấu hình" };
    }

    const mailOptions = {
      from: `"Drug Traceability System" <${process.env.SMTP_USER}>`,
      to: email,
      subject: "Yêu cầu đặt lại mật khẩu",
      html: `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { background-color:rgb(76, 91, 175); color: white; padding: 20px; text-align: center; }
            .content { padding: 20px; background-color: #f9f9f9; }
            .button { display: inline-block; padding: 12px 30px; background-color:rgb(39, 48, 223); color: white; text-decoration: none; border-radius: 5px; margin: 20px 0; }
            .footer { padding: 20px; text-align: center; color: #666; font-size: 12px; }
            .warning { background-color: #fff3cd; border-left: 4px solid #ffc107; padding: 10px; margin: 20px 0; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1>Đặt lại mật khẩu</h1>
            </div>
            <div class="content">
              <p>Xin chào,</p>
              <p>Chúng tôi nhận được yêu cầu đặt lại mật khẩu cho tài khoản của bạn.</p>
              
              <p>Vui lòng nhấp vào nút bên dưới để đặt lại mật khẩu của bạn:</p>
              <p style="text-align: center;">
                <a href="${resetUrl}" class="button">Đặt lại mật khẩu</a>
              </p>
              
              <p>Hoặc copy và paste link này vào trình duyệt:</p>
              <p style="word-break: break-all; color: #0066cc;">${resetUrl}</p>
              
              <div class="warning">
                <strong>Lưu ý:</strong>
                <ul>
                  <li>Link này có hiệu lực trong 1 giờ</li>
                  <li>Nếu bạn không yêu cầu đặt lại mật khẩu, vui lòng bỏ qua email này</li>
                  <li>Không chia sẻ link này với bất kỳ ai</li>
                </ul>
              </div>
              
              <p>Nếu bạn không thực hiện yêu cầu này, bạn có thể bỏ qua email này một cách an toàn.</p>
              
              <p>Trân trọng,<br>Đội ngũ Drug Traceability System</p>
            </div>
            <div class="footer">
              <p>Email này được gửi tự động, vui lòng không trả lời.</p>
              <p>&copy; ${new Date().getFullYear()} Drug Traceability System. All rights reserved.</p>
            </div>
          </div>
        </body>
        </html>
      `,
      text: `
        Yêu cầu đặt lại mật khẩu
        
        Xin chào,
        
        Chúng tôi nhận được yêu cầu đặt lại mật khẩu cho tài khoản của bạn.
        
        Vui lòng truy cập link sau để đặt lại mật khẩu:
        ${resetUrl}
        
        Link này có hiệu lực trong 1 giờ.
        
        Nếu bạn không yêu cầu đặt lại mật khẩu, vui lòng bỏ qua email này.
        
        Trân trọng,
        Đội ngũ Drug Traceability System
      `,
    };

    const info = await transporter.sendMail(mailOptions);
    console.log("Email đã được gửi:", info.messageId);
    return { success: true, messageId: info.messageId };
  } catch (error) {
    console.error("Lỗi khi gửi email reset mật khẩu:", error);
    throw error;
  }
};

// Gửi email thông báo admin đã xác nhận yêu cầu reset mật khẩu
export const sendPasswordResetApprovedEmail = async (email, resetToken, resetUrl) => {
  try {
    const transporter = createTransporter();

    if (!process.env.SMTP_USER || !process.env.SMTP_PASS) {
      console.warn("SMTP không được cấu hình. Không thể gửi email.");
      console.log("Reset token (chỉ để test):", resetToken);
      console.log("Reset URL:", resetUrl);
      return { success: false, message: "SMTP chưa được cấu hình" };
    }

    const mailOptions = {
      from: `"Drug Traceability System" <${process.env.SMTP_USER}>`,
      to: email,
      subject: "Yêu cầu đặt lại mật khẩu đã được xác nhận",
      html: `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { background-color: #2196F3; color: white; padding: 20px; text-align: center; }
            .content { padding: 20px; background-color: #f9f9f9; }
            .button { display: inline-block; padding: 12px 30px; background-color: #2196F3; color: white; text-decoration: none; border-radius: 5px; margin: 20px 0; }
            .footer { padding: 20px; text-align: center; color: #666; font-size: 12px; }
            .info { background-color: #d1ecf1; border-left: 4px solid #0c5460; padding: 10px; margin: 20px 0; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1>Yêu cầu đặt lại mật khẩu đã được xác nhận</h1>
            </div>
            <div class="content">
              <p>Xin chào,</p>
              <p>Yêu cầu đặt lại mật khẩu của bạn đã được admin xác nhận.</p>
              
              <div class="info">
                <p><strong>Thông tin tài khoản:</strong> ${email}</p>
              </div>
              
              <p>Bây giờ bạn có thể đặt lại mật khẩu bằng cách nhấp vào nút bên dưới:</p>
              <p style="text-align: center;">
                <a href="${resetUrl}" class="button">Đặt lại mật khẩu</a>
              </p>
              
              <p>Hoặc copy và paste link này vào trình duyệt:</p>
              <p style="word-break: break-all; color: #0066cc;">${resetUrl}</p>
              
              <p><strong>Lưu ý:</strong> Link này có hiệu lực trong 24 giờ.</p>
              
              <p>Trân trọng,<br>Đội ngũ Drug Traceability System</p>
            </div>
            <div class="footer">
              <p>Email này được gửi tự động, vui lòng không trả lời.</p>
              <p>&copy; ${new Date().getFullYear()} Drug Traceability System. All rights reserved.</p>
            </div>
          </div>
        </body>
        </html>
      `,
      text: `
        Yêu cầu đặt lại mật khẩu đã được xác nhận
        
        Xin chào,
        
        Yêu cầu đặt lại mật khẩu của bạn đã được admin xác nhận.
        
        Bây giờ bạn có thể đặt lại mật khẩu bằng cách truy cập link sau:
        ${resetUrl}
        
        Link này có hiệu lực trong 24 giờ.
        
        Trân trọng,
        Đội ngũ Drug Traceability System
      `,
    };

    const info = await transporter.sendMail(mailOptions);
    console.log("Email xác nhận đã được gửi:", info.messageId);
    return { success: true, messageId: info.messageId };
  } catch (error) {
    console.error("Lỗi khi gửi email xác nhận reset mật khẩu:", error);
    throw error;
  }
};

// Gửi email mật khẩu mới (sau khi admin duyệt yêu cầu reset)
export const sendNewPasswordEmail = async (toEmail, newPassword, username) => {
  try {
    const transporter = createTransporter();

    if (!process.env.SMTP_USER || !process.env.SMTP_PASS) {
      console.warn("SMTP không được cấu hình. Không thể gửi email.");
      console.log("Mật khẩu mới (chỉ để test):", newPassword);
      return { success: false, message: "SMTP chưa được cấu hình" };
    }

    const mailOptions = {
      from: `"Drug Traceability System" <${process.env.SMTP_USER}>`,
      to: toEmail,
      subject: "Mật khẩu mới của bạn cho hệ thống Drug Traceability",
      html: `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { background-color:rgb(76, 91, 175); color: white; padding: 20px; text-align: center; }
            .content { padding: 20px; background-color: #f9f9f9; }
            .password-box { font-size: 20px; font-weight: bold; text-align: center; background-color: #e9ecef; padding: 15px; border-radius: 5px; margin: 20px 0; }
            .footer { padding: 20px; text-align: center; color: #666; font-size: 12px; }
            .warning { background-color: #fff3cd; border-left: 4px solid #ffc107; padding: 10px; margin: 20px 0; }
          </style>
        </head>
        <body>
          <div class="header">
            <h2>Mật khẩu mới của bạn</h2>
          </div>
          <div class="content">
            <p>Xin chào ${username || toEmail},</p>
            <p>Yêu cầu đặt lại mật khẩu của bạn đã được quản trị viên phê duyệt. Đây là mật khẩu mới của bạn:</p>
            <div class="password-box">${newPassword}</div>
            <div class="warning">
              <strong>Lưu ý quan trọng:</strong>
              <ul>
                <li>Vui lòng đăng nhập bằng mật khẩu này và đổi mật khẩu ngay lập tức để đảm bảo an toàn cho tài khoản của bạn</li>
                <li>Không chia sẻ mật khẩu này với bất kỳ ai</li>
                <li>Nếu bạn không yêu cầu thay đổi mật khẩu này, vui lòng liên hệ với quản trị viên hệ thống ngay lập tức</li>
              </ul>
            </div>
            <p>Trân trọng,<br>Đội ngũ Drug Traceability System</p>
          </div>
          <div class="footer">
            <p>Đây là email tự động, vui lòng không trả lời.</p>
            <p>&copy; ${new Date().getFullYear()} Drug Traceability System</p>
          </div>
        </body>
        </html>
      `,
      text: `
        Mật khẩu mới của bạn
        
        Xin chào ${username || toEmail},
        
        Yêu cầu đặt lại mật khẩu của bạn đã được quản trị viên phê duyệt. Đây là mật khẩu mới của bạn:
        
        ${newPassword}
        
        Vui lòng đăng nhập bằng mật khẩu này và đổi mật khẩu ngay lập tức để đảm bảo an toàn cho tài khoản của bạn.
        
        Nếu bạn không yêu cầu thay đổi mật khẩu này, vui lòng liên hệ với quản trị viên hệ thống ngay lập tức.
        
        Trân trọng,
        Đội ngũ Drug Traceability System
      `,
    };

    const info = await transporter.sendMail(mailOptions);
    console.log("Email mật khẩu mới đã được gửi:", info.messageId);
    return { success: true, messageId: info.messageId };
  } catch (error) {
    console.error("Lỗi khi gửi email mật khẩu mới:", error);
    throw error;
  }
};

