const nodemailer = require('nodemailer');

/**
 * Email utility for sending OTP and notifications
 */
class EmailService {
  constructor() {
    this.transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS
      }
    });
  }

  /**
   * Send OTP email
   */
  async sendOTPEmail(email, otp, type = 'verification') {
    try {
      const subject = type === 'verification' 
        ? 'Verify Your WENZE TII NDAKU Account' 
        : 'Your WENZE TII NDAKU OTP';

      const html = `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <div style="background: linear-gradient(135deg, #1e3a8a 0%, #ea580c 100%); padding: 20px; text-align: center;">
            <h1 style="color: white; margin: 0;">WENZE TII NDAKU</h1>
            <p style="color: white; margin: 5px 0 0 0;">Premium Marketplace</p>
          </div>
          
          <div style="padding: 30px; background: #f8fafc;">
            <h2 style="color: #1e3a8a; margin-bottom: 20px;">${type === 'verification' ? 'Verify Your Account' : 'Your OTP Code'}</h2>
            
            <p style="color: #374151; font-size: 16px; line-height: 1.6;">
              ${type === 'verification' 
                ? 'Thank you for signing up with WENZE TII NDAKU! Please use the OTP below to verify your account:'
                : 'Here is your OTP code for WENZE TII NDAKU:'
              }
            </p>
            
            <div style="background: white; border: 2px solid #1e3a8a; border-radius: 8px; padding: 20px; text-align: center; margin: 20px 0;">
              <h1 style="color: #1e3a8a; font-size: 32px; letter-spacing: 5px; margin: 0;">${otp}</h1>
            </div>
            
            <p style="color: #6b7280; font-size: 14px;">
              This OTP is valid for 5 minutes. Do not share this code with anyone.
            </p>
            
            <p style="color: #6b7280; font-size: 14px; margin-top: 30px;">
              If you didn't request this ${type === 'verification' ? 'verification' : 'OTP'}, please ignore this email.
            </p>
          </div>
          
          <div style="background: #1f2937; padding: 20px; text-align: center;">
            <p style="color: #9ca3af; font-size: 12px; margin: 0;">
              © 2025 WENZE TII NDAKU. All rights reserved.
            </p>
          </div>
        </div>
      `;

      const mailOptions = {
        from: process.env.EMAIL_USER,
        to: email,
        subject,
        html
      };

      await this.transporter.sendMail(mailOptions);
      return true;
    } catch (error) {
      console.error('Error sending OTP email:', error);
      throw new Error('Failed to send OTP email');
    }
  }

  /**
   * Send welcome email
   */
  async sendWelcomeEmail(email, name, role) {
    try {
      const subject = 'Welcome to WENZE TII NDAKU!';
      
      const html = `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <div style="background: linear-gradient(135deg, #1e3a8a 0%, #ea580c 100%); padding: 20px; text-align: center;">
            <h1 style="color: white; margin: 0;">WENZE TII NDAKU</h1>
            <p style="color: white; margin: 5px 0 0 0;">Premium Marketplace</p>
          </div>
          
          <div style="padding: 30px; background: #f8fafc;">
            <h2 style="color: #1e3a8a; margin-bottom: 20px;">Welcome, ${name}!</h2>
            
            <p style="color: #374151; font-size: 16px; line-height: 1.6;">
              Thank you for joining WENZE TII NDAKU! Your account has been successfully ${role === 'vendor' ? 'created and is pending approval' : 'verified'}.
            </p>
            
            <div style="background: white; border-radius: 8px; padding: 20px; margin: 20px 0;">
              <h3 style="color: #1e3a8a; margin-top: 0;">What's next?</h3>
              ${role === 'vendor' 
                ? '<p style="color: #374151; margin: 0;">Our team will review your vendor application within 2-3 business days. You\'ll receive an email notification once approved.</p>'
                : '<p style="color: #374151; margin: 0;">You can now start shopping and exploring our marketplace. Browse thousands of products from verified vendors.</p>'
              }
            </div>
            
            <div style="text-align: center; margin: 30px 0;">
              <a href="${process.env.FRONTEND_URL}" 
                 style="background: linear-gradient(135deg, #1e3a8a 0%, #ea580c 100%); color: white; padding: 12px 30px; text-decoration: none; border-radius: 6px; font-weight: bold;">
                ${role === 'vendor' ? 'Check Application Status' : 'Start Shopping'}
              </a>
            </div>
          </div>
          
          <div style="background: #1f2937; padding: 20px; text-align: center;">
            <p style="color: #9ca3af; font-size: 12px; margin: 0;">
              © 2025 WENZE TII NDAKU. All rights reserved.
            </p>
          </div>
        </div>
      `;

      const mailOptions = {
        from: process.env.EMAIL_USER,
        to: email,
        subject,
        html
      };

      await this.transporter.sendMail(mailOptions);
      return true;
    } catch (error) {
      console.error('Error sending welcome email:', error);
      throw new Error('Failed to send welcome email');
    }
  }

  /**
   * Send vendor approval email
   */
  async sendVendorApprovalEmail(email, businessName) {
    try {
      const subject = 'Congratulations! Your Vendor Application Has Been Approved';
      
      const html = `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <div style="background: linear-gradient(135deg, #1e3a8a 0%, #ea580c 100%); padding: 20px; text-align: center;">
            <h1 style="color: white; margin: 0;">WENZE TII NDAKU</h1>
            <p style="color: white; margin: 5px 0 0 0;">Premium Marketplace</p>
          </div>
          
          <div style="padding: 30px; background: #f8fafc;">
            <h2 style="color: #1e3a8a; margin-bottom: 20px;">🎉 Congratulations, ${businessName}!</h2>
            
            <p style="color: #374151; font-size: 16px; line-height: 1.6;">
              Great news! Your vendor application has been <strong>approved</strong> and you can now start selling on WENZE TII NDAKU marketplace.
            </p>
            
            <div style="background: white; border: 2px solid #10b981; border-radius: 8px; padding: 20px; margin: 20px 0;">
              <h3 style="color: #10b981; margin-top: 0;">What's next?</h3>
              <ul style="color: #374151; margin: 0; padding-left: 20px;">
                <li>Log in to your vendor dashboard</li>
                <li>Add your products to the marketplace</li>
                <li>Set up your payment preferences</li>
                <li>Start receiving orders from customers</li>
              </ul>
            </div>
            
            <div style="text-align: center; margin: 30px 0;">
              <a href="${process.env.FRONTEND_URL}/vendor/login" 
                 style="background: linear-gradient(135deg, #1e3a8a 0%, #ea580c 100%); color: white; padding: 12px 30px; text-decoration: none; border-radius: 6px; font-weight: bold;">
                Access Your Vendor Dashboard
              </a>
            </div>
            
            <p style="color: #6b7280; font-size: 14px; margin-top: 30px;">
              If you have any questions, please don't hesitate to contact our support team.
            </p>
          </div>
          
          <div style="background: #1f2937; padding: 20px; text-align: center;">
            <p style="color: #9ca3af; font-size: 12px; margin: 0;">
              © 2025 WENZE TII NDAKU. All rights reserved.
            </p>
          </div>
        </div>
      `;

      const mailOptions = {
        from: process.env.EMAIL_USER,
        to: email,
        subject,
        html
      };

      await this.transporter.sendMail(mailOptions);
      return true;
    } catch (error) {
      console.error('Error sending vendor approval email:', error);
      throw new Error('Failed to send vendor approval email');
    }
  }

  /**
   * Send vendor rejection email
   */
  async sendVendorRejectionEmail(email, businessName, reason) {
    try {
      const subject = 'Vendor Application Update - WENZE TII NDAKU';
      
      const html = `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <div style="background: linear-gradient(135deg, #1e3a8a 0%, #ea580c 100%); padding: 20px; text-align: center;">
            <h1 style="color: white; margin: 0;">WENZE TII NDAKU</h1>
            <p style="color: white; margin: 5px 0 0 0;">Premium Marketplace</p>
          </div>
          
          <div style="padding: 30px; background: #f8fafc;">
            <h2 style="color: #1e3a8a; margin-bottom: 20px;">Application Update</h2>
            
            <p style="color: #374151; font-size: 16px; line-height: 1.6;">
              Dear ${businessName},
            </p>
            
            <p style="color: #374151; font-size: 16px; line-height: 1.6;">
              Thank you for your interest in becoming a vendor on WENZE TII NDAKU. After careful review of your application, we regret to inform you that we cannot approve your vendor account at this time.
            </p>
            
            ${reason ? `
            <div style="background: #fef2f2; border: 1px solid #fecaca; border-radius: 8px; padding: 15px; margin: 20px 0;">
              <h4 style="color: #dc2626; margin-top: 0;">Reason:</h4>
              <p style="color: #7f1d1d; margin: 0;">${reason}</p>
            </div>
            ` : ''}
            
            <p style="color: #374151; font-size: 16px; line-height: 1.6;">
              We encourage you to address the issues mentioned above and reapply in the future. We're always looking for quality vendors to join our marketplace.
            </p>
            
            <div style="text-align: center; margin: 30px 0;">
              <a href="${process.env.FRONTEND_URL}/vendor/register" 
                 style="background: linear-gradient(135deg, #1e3a8a 0%, #ea580c 100%); color: white; padding: 12px 30px; text-decoration: none; border-radius: 6px; font-weight: bold;">
                Reapply as Vendor
              </a>
            </div>
            
            <p style="color: #6b7280; font-size: 14px; margin-top: 30px;">
              If you have any questions about this decision, please contact our support team.
            </p>
          </div>
          
          <div style="background: #1f2937; padding: 20px; text-align: center;">
            <p style="color: #9ca3af; font-size: 12px; margin: 0;">
              © 2025 WENZE TII NDAKU. All rights reserved.
            </p>
          </div>
        </div>
      `;

      const mailOptions = {
        from: process.env.EMAIL_USER,
        to: email,
        subject,
        html
      };

      await this.transporter.sendMail(mailOptions);
      return true;
    } catch (error) {
      console.error('Error sending vendor rejection email:', error);
      throw new Error('Failed to send vendor rejection email');
    }
  }
}

module.exports = new EmailService();
