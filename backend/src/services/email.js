import nodemailer from "nodemailer";
import { env } from "../config/env.js";

export class EmailConfigurationError extends Error {
  constructor() {
    super("Email delivery is unavailable. Configure SMTP in the server environment.");
    this.name = "EmailConfigurationError";
    this.status = 503;
    this.code = "EMAIL_NOT_CONFIGURED";
  }
}

let transporter;

function getTransporter() {
  if (!env.smtp) throw new EmailConfigurationError();
  transporter ??= nodemailer.createTransport({
    host: env.smtp.host,
    port: env.smtp.port,
    secure: env.smtp.port === 465,
    auth: { user: env.smtp.user, pass: env.smtp.password }
  });
  return transporter;
}

export async function sendEmail({ to, subject, text, html }) {
  return getTransporter().sendMail({ from: env.smtp.from, to, subject, text, html });
}

export function ensureEmailConfigured() {
  if (!env.smtp) throw new EmailConfigurationError();
}
