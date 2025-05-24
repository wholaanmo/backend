const nodemailer = require('nodemailer');

// Configure your email transporter
const transporter = nodemailer.createTransport({
  service: process.env.EMAIL_SERVICE,
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS
  }
});

module.exports = {
  sendInvitationEmail: async ({ email, groupName, groupCode, inviterName }) => {

    const websiteLink = `${process.env.FRONTEND_URL}/login`;
    
    const mailOptions = {
      from: process.env.EMAIL_FROM,
      to: email,
      subject: `Join ${inviterName}'s group "${groupName}" on Money Log`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; color: #333;">
          <div style="background-color: #6a9c89; padding: 20px; color: white; text-align: center;">
            <h1 style="margin: 0;">Money Log Invitation</h1>
          </div>
          
          <div style="padding: 20px;">
            <p>Hello,</p>
            <p>${inviterName} has invited you to join the group <strong>${groupName}</strong> on Money Log.</p>
            
            <div style="background-color: #f8f9fa; border-left: 4px solid #6a9c89; padding: 15px; margin: 20px 0;">
              <h3 style="margin-top: 0;">Group Access Information</h3>
              <p><strong>Group Name:</strong> ${groupName}</p>
              <p><strong>Group Code:</strong> 
                <span style="font-size: 18px; font-weight: bold; background-color: #e9f7ef; padding: 5px 10px; border-radius: 3px;">
                  ${groupCode}
                </span>
              </p>
            </div>
            
            <div style="text-align: center; margin: 30px 0;">
              <a href="${websiteLink}" style="background-color: #6a9c89; color: white; padding: 12px 25px; text-decoration: none; border-radius: 4px; font-weight: bold; display: inline-block;">
              Click here to access the Money Log website
              </a>
            </div>
            
            <p style="font-size: 12px; color: #45474B; margin-top: 30px;">
              This invitation will expire in 7 days. If you didn't request this, you can ignore this email.
            </p>
          </div>
        </div>
      `
    };
    
    try {
      await transporter.sendMail(mailOptions);
      console.log(`Invitation email sent to ${email}`);
    } catch (err) {
      console.error('Error sending invitation email:', err);
      throw err;
    }
  }
};