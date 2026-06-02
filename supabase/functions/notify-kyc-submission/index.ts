import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface KycSubmissionPayload {
  driverId: string;
  driverName: string;
  driverPhone: string;
  submittedAt: string;
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const payload: KycSubmissionPayload = await req.json();
    const { driverId, driverName, driverPhone, submittedAt } = payload;

    console.log(`Processing KYC notification for driver: ${driverName} (${driverId})`);

    // Admin notification settings - hardcoded for now
    const adminEmail = "naffagi@gmail.com";
    const adminWhatsApp = "+14437684409";

    const results = {
      email: { success: false, message: "" },
      whatsapp: { success: false, message: "" },
    };

    // Send Email Notification using Resend (if API key available)
    const resendApiKey = Deno.env.get("RESEND_API_KEY");
    if (resendApiKey) {
      try {
        const emailHtml = `
          <!DOCTYPE html>
          <html>
          <head>
            <style>
              body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; }
              .container { max-width: 600px; margin: 0 auto; padding: 20px; }
              .header { background: linear-gradient(135deg, #f97316, #ea580c); color: white; padding: 20px; border-radius: 8px 8px 0 0; }
              .content { background: #f9fafb; padding: 20px; border: 1px solid #e5e7eb; border-top: none; border-radius: 0 0 8px 8px; }
              .info-row { display: flex; justify-content: space-between; padding: 10px 0; border-bottom: 1px solid #e5e7eb; }
              .label { color: #6b7280; font-size: 14px; }
              .value { font-weight: 600; }
              .cta { display: inline-block; background: #f97316; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; margin-top: 20px; }
              .footer { text-align: center; margin-top: 20px; color: #9ca3af; font-size: 12px; }
            </style>
          </head>
          <body>
            <div class="container">
              <div class="header">
                <h1 style="margin: 0;">🔔 Nouvelle soumission KYC</h1>
                <p style="margin: 10px 0 0 0; opacity: 0.9;">Un conducteur vient de soumettre ses documents</p>
              </div>
              <div class="content">
                <div class="info-row">
                  <span class="label">Conducteur</span>
                  <span class="value">${driverName}</span>
                </div>
                <div class="info-row">
                  <span class="label">Téléphone</span>
                  <span class="value">${driverPhone}</span>
                </div>
                <div class="info-row">
                  <span class="label">Date de soumission</span>
                  <span class="value">${new Date(submittedAt).toLocaleString('fr-FR')}</span>
                </div>
                <p style="margin-top: 20px;">
                  Une nouvelle demande de vérification KYC nécessite votre attention. 
                  Veuillez vous connecter au tableau de bord administrateur pour examiner les documents soumis.
                </p>
                <a href="${supabaseUrl.replace('.supabase.co', '')}/admin/drivers" class="cta">
                  Examiner la demande →
                </a>
              </div>
              <div class="footer">
                <p>DAM Flotte - Système de gestion de flotte</p>
              </div>
            </div>
          </body>
          </html>
        `;

        const emailResponse = await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${resendApiKey}`,
          },
          body: JSON.stringify({
            from: "DAM Flotte <notifications@resend.dev>",
            to: [adminEmail],
            subject: `🔔 Nouvelle soumission KYC - ${driverName}`,
            html: emailHtml,
          }),
        });

        if (emailResponse.ok) {
          results.email = { success: true, message: `Email sent to ${adminEmail}` };
          console.log(`Email notification sent to ${adminEmail}`);
        } else {
          const error = await emailResponse.text();
          results.email = { success: false, message: `Email failed: ${error}` };
          console.error(`Email notification failed: ${error}`);
        }
      } catch (emailError: unknown) {
        const errorMessage = emailError instanceof Error ? emailError.message : String(emailError);
        results.email = { success: false, message: `Email error: ${errorMessage}` };
        console.error(`Email notification error:`, emailError);
      }
    } else {
      results.email = { success: false, message: "RESEND_API_KEY not configured" };
      console.log("Email notification skipped: RESEND_API_KEY not configured");
    }

    // Send WhatsApp Notification using Twilio
    const twilioAccountSid = Deno.env.get("TWILIO_ACCOUNT_SID");
    const twilioAuthToken = Deno.env.get("TWILIO_AUTH_TOKEN");
    const twilioWhatsAppNumber = Deno.env.get("TWILIO_WHATSAPP_NUMBER") || "whatsapp:+14155238886";

    if (twilioAccountSid && twilioAuthToken) {
      try {
        const whatsappMessage = `🔔 *Nouvelle soumission KYC*\n\n` +
          `👤 Conducteur: ${driverName}\n` +
          `📱 Téléphone: ${driverPhone}\n` +
          `📅 Soumis le: ${new Date(submittedAt).toLocaleString('fr-FR')}\n\n` +
          `Connectez-vous au tableau de bord pour examiner les documents.`;

        const formData = new URLSearchParams();
        formData.append("From", twilioWhatsAppNumber);
        formData.append("To", `whatsapp:${adminWhatsApp}`);
        formData.append("Body", whatsappMessage);

        const twilioResponse = await fetch(
          `https://api.twilio.com/2010-04-01/Accounts/${twilioAccountSid}/Messages.json`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/x-www-form-urlencoded",
              Authorization: `Basic ${btoa(`${twilioAccountSid}:${twilioAuthToken}`)}`,
            },
            body: formData,
          }
        );

        if (twilioResponse.ok) {
          results.whatsapp = { success: true, message: `WhatsApp sent to ${adminWhatsApp}` };
          console.log(`WhatsApp notification sent to ${adminWhatsApp}`);
        } else {
          const error = await twilioResponse.text();
          results.whatsapp = { success: false, message: `WhatsApp failed: ${error}` };
          console.error(`WhatsApp notification failed: ${error}`);
        }
      } catch (whatsappError: unknown) {
        const errorMessage = whatsappError instanceof Error ? whatsappError.message : String(whatsappError);
        results.whatsapp = { success: false, message: `WhatsApp error: ${errorMessage}` };
        console.error(`WhatsApp notification error:`, whatsappError);
      }
    } else {
      results.whatsapp = { success: false, message: "Twilio credentials not configured" };
      console.log("WhatsApp notification skipped: Twilio credentials not configured");
    }

    // Log the notification attempt
    await supabase.from("admin_audit_logs").insert({
      admin_user_id: "00000000-0000-0000-0000-000000000000", // System user
      action: "kyc_notification_sent",
      entity_type: "driver",
      entity_id: driverId,
      details: {
        driverName,
        driverPhone,
        results,
      },
    });

    return new Response(
      JSON.stringify({
        success: true,
        results,
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error("Error processing KYC notification:", error);
    return new Response(
      JSON.stringify({
        success: false,
        error: errorMessage,
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
