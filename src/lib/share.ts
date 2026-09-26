/** Phone number as digits with India's 91 prefix for 10-digit numbers. */
export function intlDigits(phone: string) {
  const digits = phone.replace(/\D/g, "").replace(/^0+/, "");
  return digits.length === 10 ? `91${digits}` : digits;
}

export function hasPhone(phone: string) {
  return intlDigits(phone).length >= 10;
}

/** WhatsApp chat with the text typed in; with no number WhatsApp asks whom to send it to. */
export function whatsAppLink(phone: string, text: string) {
  const num = hasPhone(phone) ? intlDigits(phone) : "";
  return `https://wa.me/${num}?text=${encodeURIComponent(text)}`;
}

/** SMS app with the text typed in. */
export function smsLink(phone: string, text: string) {
  const num = hasPhone(phone) ? `+${intlDigits(phone)}` : "";
  return `sms:${num}?body=${encodeURIComponent(text)}`;
}
