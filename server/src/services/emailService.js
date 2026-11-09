const { Resend } = require('resend');
const { resendApiKey, emailFrom, clientUrl } = require('../config/env');

// Initialize Resend client if key is provided
let resendInstance = resendApiKey ? new Resend(resendApiKey) : null;

// Allow injecting a mock client for testing
const setResendClient = (client) => {
  resendInstance = client;
};

const getResendClient = () => resendInstance;

/**
 * Base email layout wrapper matching NearExpiry light glassmorphism brand
 */
const buildEmailHtml = ({ title, bodyHtml, actionText, actionUrl, severity = 'info' }) => {
  const accentColor =
    severity === 'critical' || severity === 'danger'
      ? '#e11d48'
      : severity === 'warning'
        ? '#d97706'
        : '#059669';

  const badgeBg =
    severity === 'critical' || severity === 'danger'
      ? '#ffe4e6'
      : severity === 'warning'
        ? '#fef3c7'
        : '#d1fae5';

  const badgeColor =
    severity === 'critical' || severity === 'danger'
      ? '#9f1239'
      : severity === 'warning'
        ? '#92400e'
        : '#065f46';

  const targetUrl = actionUrl || clientUrl;

  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title}</title>
</head>
<body style="margin: 0; padding: 0; background-color: #f8fafc; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #1e293b;">
  <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="background-color: #f8fafc; padding: 32px 16px;">
    <tr>
      <td align="center">
        <!-- Main Card Container -->
        <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="max-width: 600px; background-color: #ffffff; border-radius: 16px; border: 1px solid #e2e8f0; overflow: hidden; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05);">
          
          <!-- Header Banner -->
          <tr>
            <td style="background-color: #059669; background: linear-gradient(135deg, #059669 0%, #047857 100%); padding: 24px 32px; text-align: left;">
              <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%">
                <tr>
                  <td>
                    <span style="display: inline-block; font-size: 20px; font-weight: 800; color: #ffffff; letter-spacing: -0.5px;">NearExpiry</span>
                    <span style="display: inline-block; margin-left: 8px; padding: 2px 8px; border-radius: 12px; font-size: 11px; font-weight: 700; background-color: rgba(255,255,255,0.2); color: #ffffff;">Supermarket Alert</span>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Content Body -->
          <tr>
            <td style="padding: 32px;">
              <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%">
                <tr>
                  <td>
                    <span style="display: inline-block; padding: 4px 10px; border-radius: 6px; font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px; background-color: ${badgeBg}; color: ${badgeColor}; margin-bottom: 12px;">
                      ${severity.toUpperCase()}
                    </span>
                    <h1 style="margin: 0 0 16px 0; font-size: 20px; font-weight: 700; color: #0f172a; line-height: 1.3;">
                      ${title}
                    </h1>
                  </td>
                </tr>
                <tr>
                  <td style="font-size: 14px; line-height: 1.6; color: #334155;">
                    ${bodyHtml}
                  </td>
                </tr>
                ${
                  actionText
                    ? `
                <tr>
                  <td style="padding-top: 24px;">
                    <a href="${targetUrl}" target="_blank" style="display: inline-block; background-color: ${accentColor}; color: #ffffff; text-decoration: none; padding: 12px 24px; border-radius: 8px; font-size: 14px; font-weight: 600; text-align: center;">
                      ${actionText} &rarr;
                    </a>
                  </td>
                </tr>
                `
                    : ''
                }
              </table>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="background-color: #f1f5f9; padding: 20px 32px; text-align: left; border-top: 1px solid #e2e8f0; font-size: 12px; color: #64748b; line-height: 1.5;">
              <p style="margin: 0 0 4px 0;">This notification was automatically dispatched by your NearExpiry store inventory system.</p>
              <p style="margin: 0;">You can update your email alert preferences in <a href="${clientUrl}/settings" style="color: #059669; text-decoration: underline;">Store Settings</a>.</p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>
  `.trim();
};

/**
 * Send an individual alert email via Resend
 */
const sendAlertEmail = async ({ to, subject, title, message, severity = 'warning', details = null, actionUrl = null, actionText = 'View in NearExpiry' }) => {
  if (!resendInstance) {
    console.log(`[Resend] RESEND_API_KEY not configured. Alert email to <${to}> skipped.`);
    return { success: false, skipped: true, reason: 'NO_API_KEY' };
  }

  let detailsHtml = '';
  if (details && typeof details === 'object') {
    detailsHtml = `
      <div style="margin: 16px 0; padding: 16px; background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px;">
        <table role="presentation" border="0" cellpadding="4" cellspacing="0" width="100%" style="font-size: 13px;">
          ${Object.entries(details)
            .filter(([_, v]) => v !== undefined && v !== null && v !== '')
            .map(
              ([k, v]) => `
              <tr>
                <td style="color: #64748b; font-weight: 600; width: 35%;">${k}:</td>
                <td style="color: #0f172a; font-weight: 700;">${v}</td>
              </tr>
            `
            )
            .join('')}
        </table>
      </div>
    `;
  }

  const bodyHtml = `
    <p style="margin: 0 0 12px 0;">${message}</p>
    ${detailsHtml}
  `;

  const html = buildEmailHtml({
    title,
    bodyHtml,
    actionText,
    actionUrl: actionUrl || `${clientUrl}/expiry`,
    severity
  });

  try {
    const data = await resendInstance.emails.send({
      from: emailFrom,
      to: Array.isArray(to) ? to : [to],
      subject: subject || title,
      html
    });

    console.log(`[Resend] Alert email sent successfully to ${to} (ID: ${data?.id || 'ok'})`);
    return { success: true, id: data?.id };
  } catch (err) {
    console.error(`[Resend Error] Failed to deliver alert to ${to}: ${err.message}`);
    return { success: false, error: err.message };
  }
};

/**
 * Send Daily Digest Email summarizing critical, expiring soon, and low stock items
 */
const sendDailyDigestEmail = async ({ to, userName, storeName, dateStr, criticalItems = [], warningItems = [], expiredItems = [], lowStockItems = [] }) => {
  if (!resendInstance) {
    console.log(`[Resend] RESEND_API_KEY not configured. Daily digest email to <${to}> skipped.`);
    return { success: false, skipped: true, reason: 'NO_API_KEY' };
  }

  const totalUrgent = criticalItems.length + expiredItems.length;
  const severity = totalUrgent > 0 ? 'critical' : warningItems.length > 0 ? 'warning' : 'info';

  const renderItemList = (title, items, color) => {
    if (!items || items.length === 0) return '';
    return `
      <div style="margin-top: 16px;">
        <h3 style="margin: 0 0 8px 0; font-size: 14px; font-weight: 700; color: ${color};">${title} (${items.length})</h3>
        <ul style="margin: 0; padding-left: 20px; font-size: 13px; color: #334155; line-height: 1.5;">
          ${items
            .slice(0, 8)
            .map(
              (it) => `
              <li><strong>${it.productName}</strong> ${it.batchNumber ? `(Batch #${it.batchNumber})` : ''} — ${it.quantity} units ${it.expiryDate ? `(Exp: ${it.expiryDate})` : ''}</li>
            `
            )
            .join('')}
          ${items.length > 8 ? `<li><em>...and ${items.length - 8} more</em></li>` : ''}
        </ul>
      </div>
    `;
  };

  const bodyHtml = `
    <p style="margin: 0 0 12px 0;">Hello ${userName || 'Store Manager'},</p>
    <p style="margin: 0 0 16px 0;">Here is your morning supermarket inventory & expiry digest for <strong>${storeName}</strong> on <strong>${dateStr}</strong>.</p>
    
    ${renderItemList('⚠️ Expired Inventory (Requires Immediate Removal)', expiredItems, '#e11d48')}
    ${renderItemList('🚨 Critical Expiry (Next 1–3 Days — Prioritize FEFO)', criticalItems, '#d97706')}
    ${renderItemList('📅 Expiring Soon (Next 7 Days)', warningItems, '#b45309')}
    ${renderItemList('📦 Low Stock Alerts (Reorder Recommended)', lowStockItems, '#2563eb')}

    ${
      totalUrgent === 0 && warningItems.length === 0 && lowStockItems.length === 0
        ? '<div style="padding: 16px; background-color: #ecfdf5; border: 1px solid #a7f3d0; border-radius: 8px; color: #065f46; font-weight: 600;">All shelves and batches are healthy. No critical expiry or low-stock alerts today!</div>'
        : ''
    }
  `;

  const html = buildEmailHtml({
    title: `Daily Expiry Digest — ${storeName}`,
    bodyHtml,
    actionText: 'Open NearExpiry Control Panel',
    actionUrl: `${clientUrl}/expiry`,
    severity
  });

  try {
    const data = await resendInstance.emails.send({
      from: emailFrom,
      to: Array.isArray(to) ? to : [to],
      subject: `[Daily Digest] ${storeName} Inventory & Expiry Summary (${dateStr})`,
      html
    });

    console.log(`[Resend] Daily digest email sent to ${to} (ID: ${data?.id || 'ok'})`);
    return { success: true, id: data?.id };
  } catch (err) {
    console.error(`[Resend Error] Failed to send digest email to ${to}: ${err.message}`);
    return { success: false, error: err.message };
  }
};

module.exports = {
  sendAlertEmail,
  sendDailyDigestEmail,
  setResendClient,
  getResendClient,
  buildEmailHtml
};

