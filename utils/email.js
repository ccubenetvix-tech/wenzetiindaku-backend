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

  /**
   * Notify vendor about a new order
   */
  async sendVendorNewOrderEmail({
    vendorEmail,
    vendorName,
    customerName,
    customerEmail,
    orderId,
    totalAmount,
    paymentMethod,
    shippingAddress,
    items = []
  }) {
    if (!vendorEmail) {
      return false;
    }

    try {
      const currencyFormatter = new Intl.NumberFormat(undefined, {
        style: 'currency',
        currency: 'USD',
        minimumFractionDigits: 2
      });

      const formattedTotal = currencyFormatter.format(Number.parseFloat(totalAmount || 0));
      const formattedPaymentMethod = paymentMethod === 'cod' ? 'Pay on Delivery' : 'Online (Stripe)';

      const itemsRows = items
        .map(item => {
          const itemTotal = currencyFormatter.format((Number(item.price) || 0) * (Number(item.quantity) || 0));
          return `
            <tr>
              <td style="padding: 8px; border: 1px solid #e5e7eb;">${item.name}</td>
              <td style="padding: 8px; border: 1px solid #e5e7eb; text-align: center;">${item.quantity}</td>
              <td style="padding: 8px; border: 1px solid #e5e7eb; text-align: right;">${currencyFormatter.format(item.price || 0)}</td>
              <td style="padding: 8px; border: 1px solid #e5e7eb; text-align: right;">${itemTotal}</td>
            </tr>
          `;
        })
        .join('');

      const shippingLines = [
        shippingAddress?.fullName,
        shippingAddress?.street1,
        shippingAddress?.street2,
        [shippingAddress?.city, shippingAddress?.state, shippingAddress?.postalCode].filter(Boolean).join(', '),
        shippingAddress?.country,
        shippingAddress?.phone ? `Phone: ${shippingAddress.phone}` : null,
        shippingAddress?.email ? `Email: ${shippingAddress.email}` : null
      ]
        .filter(Boolean)
        .join('<br />');

      const html = `
        <div style="font-family: Arial, sans-serif; max-width: 640px; margin: 0 auto; background: #ffffff; border: 1px solid #e5e7eb; border-radius: 12px; overflow: hidden;">
          <div style="background: linear-gradient(135deg, #1e3a8a 0%, #ea580c 100%); padding: 20px 24px; color: white;">
            <h1 style="margin: 0; font-size: 22px;">New Order ${orderId ? `#${orderId}` : ''}</h1>
            <p style="margin: 4px 0 0; font-size: 14px;">A customer just placed a new order on Wenze Tii Ndaku marketplace.</p>
          </div>

          <div style="padding: 24px;">
            <p style="margin: 0 0 16px; font-size: 15px; color: #111827;">
              Hello ${vendorName || 'Vendor'},
            </p>
            <p style="margin: 0 0 16px; font-size: 15px; color: #374151;">
              ${customerName || 'A customer'} has placed a new order. Please review the details below and fulfil the order promptly.
            </p>

            <div style="margin-bottom: 20px;">
              <h3 style="margin: 0 0 8px; font-size: 16px; color: #111827;">Order summary</h3>
              <p style="margin: 0; font-size: 14px; color: #374151;"><strong>Total:</strong> ${formattedTotal}</p>
              <p style="margin: 4px 0 0; font-size: 14px; color: #374151;"><strong>Payment method:</strong> ${formattedPaymentMethod}</p>
              <p style="margin: 4px 0 0; font-size: 14px; color: #374151;"><strong>Customer email:</strong> ${customerEmail || 'Not provided'}</p>
            </div>

            <div style="margin-bottom: 20px;">
              <h3 style="margin: 0 0 8px; font-size: 16px; color: #111827;">Shipping address</h3>
              <p style="margin: 0; font-size: 14px; color: #374151; line-height: 1.5;">${shippingLines}</p>
            </div>

            <div style="margin-bottom: 24px;">
              <h3 style="margin: 0 0 8px; font-size: 16px; color: #111827;">Items</h3>
              <table style="width: 100%; border-collapse: collapse; font-size: 14px;">
                <thead>
                  <tr style="background: #f3f4f6;">
                    <th style="padding: 8px; border: 1px solid #e5e7eb; text-align: left;">Product</th>
                    <th style="padding: 8px; border: 1px solid #e5e7eb; text-align: center;">Qty</th>
                    <th style="padding: 8px; border: 1px solid #e5e7eb; text-align: right;">Unit Price</th>
                    <th style="padding: 8px; border: 1px solid #e5e7eb; text-align: right;">Total</th>
                  </tr>
                </thead>
                <tbody>
                  ${itemsRows || '<tr><td colspan="4" style="padding: 8px; border: 1px solid #e5e7eb; text-align: center; color: #6b7280;">No item breakdown available.</td></tr>'}
                </tbody>
              </table>
            </div>

            <p style="margin: 0; font-size: 13px; color: #6b7280;">
              Make sure to update the order status in your vendor dashboard as it progresses. Thank you for partnering with Wenze Tii Ndaku.
            </p>
          </div>

          <div style="background: #f9fafb; padding: 16px 24px; text-align: center;">
            <p style="margin: 0; font-size: 12px; color: #9ca3af;">© ${new Date().getFullYear()} Wenze Tii Ndaku. All rights reserved.</p>
          </div>
        </div>
      `;

      await this.transporter.sendMail({
        from: process.env.EMAIL_USER,
        to: vendorEmail,
        subject: `New order ${orderId ? `#${orderId}` : ''} awaiting fulfilment`,
        html,
      });

      return true;
    } catch (error) {
      console.error('Error sending vendor new order email:', error);
      return false;
    }
  }

  /**
   * Send order confirmation to customer
   */
  async sendCustomerOrderConfirmation({
    customerEmail,
    customerName,
    orders = [],
    paymentMethod,
    shippingAddress
  }) {
    if (!customerEmail) {
      return false;
    }

    try {
      const currencyFormatter = new Intl.NumberFormat(undefined, {
        style: 'currency',
        currency: 'USD',
        minimumFractionDigits: 2
      });

      const totalAmount = orders.reduce(
        (sum, order) => sum + Number.parseFloat(order.total_amount || 0),
        0
      );

      const shippingLines = [
        shippingAddress?.fullName,
        shippingAddress?.street1,
        shippingAddress?.street2,
        [shippingAddress?.city, shippingAddress?.state, shippingAddress?.postalCode].filter(Boolean).join(', '),
        shippingAddress?.country,
        shippingAddress?.phone ? `Phone: ${shippingAddress.phone}` : null
      ]
        .filter(Boolean)
        .join('<br />');

      const ordersList = orders
        .map((order) => {
          return `
            <li style="margin-bottom: 12px;">
              <strong>Order ${order.id}</strong><br />
              Vendor: ${order.vendor?.business_name ?? 'Assigned vendor'}<br />
              Status: ${(order.status || 'pending').toString()}<br />
              Amount: ${currencyFormatter.format(Number.parseFloat(order.total_amount || 0))}
            </li>
          `;
        })
        .join('');

      const html = `
        <div style="font-family: Arial, sans-serif; max-width: 640px; margin: 0 auto; background: #ffffff; border: 1px solid #e5e7eb; border-radius: 12px; overflow: hidden;">
          <div style="background: linear-gradient(135deg, #1e3a8a 0%, #ea580c 100%); padding: 20px 24px; color: white;">
            <h1 style="margin: 0; font-size: 22px;">Thank you for your order!</h1>
            <p style="margin: 4px 0 0; font-size: 14px;">We're getting your items ready for delivery.</p>
          </div>

          <div style="padding: 24px;">
            <p style="margin: 0 0 16px; font-size: 15px; color: #111827;">
              Hi ${customerName || 'there'},
            </p>
            <p style="margin: 0 0 16px; font-size: 15px; color: #374151;">
              We received your order and shared it with the respective vendor(s). You'll get updates as your items move through fulfilment.
            </p>

            <div style="margin-bottom: 20px;">
              <h3 style="margin: 0 0 8px; font-size: 16px; color: #111827;">Order summary</h3>
              <p style="margin: 0; font-size: 14px; color: #374151;"><strong>Total paid:</strong> ${currencyFormatter.format(totalAmount)}</p>
              <p style="margin: 4px 0 0; font-size: 14px; color: #374151;"><strong>Payment method:</strong> ${paymentMethod === 'cod' ? 'Pay on Delivery' : 'Online (Stripe)'}</p>
            </div>

            ${
              shippingLines
                ? `
            <div style="margin-bottom: 20px;">
              <h3 style="margin: 0 0 8px; font-size: 16px; color: #111827;">Shipping to</h3>
              <p style="margin: 0; font-size: 14px; color: #374151; line-height: 1.5;">${shippingLines}</p>
            </div>`
                : ''
            }

            <div style="margin-bottom: 20px;">
              <h3 style="margin: 0 0 8px; font-size: 16px; color: #111827;">Orders included</h3>
              <ul style="padding-left: 18px; margin: 0; color: #374151; font-size: 14px;">
                ${ordersList}
              </ul>
            </div>

            <p style="margin: 0; font-size: 13px; color: #6b7280;">
              Keep an eye on your inbox for delivery updates. You can also track progress anytime from your dashboard.
            </p>
          </div>

          <div style="background: #f9fafb; padding: 16px 24px; text-align: center;">
            <p style="margin: 0; font-size: 12px; color: #9ca3af;">© ${new Date().getFullYear()} Wenze Tii Ndaku. All rights reserved.</p>
          </div>
        </div>
      `;

      await this.transporter.sendMail({
        from: process.env.EMAIL_USER,
        to: customerEmail,
        subject: 'Your Wenze Tii Ndaku order is on the way!',
        html,
      });

      return true;
    } catch (error) {
      console.error('Error sending customer order confirmation email:', error);
      return false;
    }
  }
}

module.exports = new EmailService();
