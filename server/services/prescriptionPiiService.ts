import { encrypt, decrypt } from "./piiEncryption";

// Transparent PII encrypt/decrypt for prescription fields.
// pharmacistNote and ocrText may contain PHI; patientPhone is direct PII.
// In passthrough mode (no master key + not production), these are identity functions.

export async function encryptPatientPhone(
  phone: string | null | undefined
): Promise<string | null> {
  if (!phone) return phone ?? null;
  return encrypt(phone, "prescription.patientPhone");
}

export async function decryptPatientPhone(
  stored: string | null | undefined
): Promise<string | null> {
  if (!stored) return stored ?? null;
  return decrypt(stored, "prescription.patientPhone");
}

export async function encryptPharmacistNote(
  note: string | null | undefined
): Promise<string | null> {
  if (!note) return note ?? null;
  return encrypt(note, "prescription.pharmacistNote");
}

export async function decryptPharmacistNote(
  stored: string | null | undefined
): Promise<string | null> {
  if (!stored) return stored ?? null;
  return decrypt(stored, "prescription.pharmacistNote");
}

export async function encryptOcrText(
  text: string | null | undefined
): Promise<string | null> {
  if (!text) return text ?? null;
  return encrypt(text, "prescription.ocrText");
}

export async function decryptOcrText(
  stored: string | null | undefined
): Promise<string | null> {
  if (!stored) return stored ?? null;
  return decrypt(stored, "prescription.ocrText");
}

export type PrescriptionPiiFields = {
  patientPhone?: string | null;
  pharmacistNote?: string | null;
  ocrText?: string | null;
};

export async function encryptPrescriptionPii<T extends PrescriptionPiiFields>(
  rx: T
): Promise<T> {
  return {
    ...rx,
    patientPhone:
      rx.patientPhone != null
        ? await encryptPatientPhone(rx.patientPhone)
        : rx.patientPhone,
    pharmacistNote:
      rx.pharmacistNote != null
        ? await encryptPharmacistNote(rx.pharmacistNote)
        : rx.pharmacistNote,
    ocrText: rx.ocrText != null ? await encryptOcrText(rx.ocrText) : rx.ocrText,
  };
}

export async function decryptPrescriptionPii<T extends PrescriptionPiiFields>(
  rx: T
): Promise<T> {
  return {
    ...rx,
    patientPhone:
      rx.patientPhone != null
        ? await decryptPatientPhone(rx.patientPhone)
        : rx.patientPhone,
    pharmacistNote:
      rx.pharmacistNote != null
        ? await decryptPharmacistNote(rx.pharmacistNote)
        : rx.pharmacistNote,
    ocrText: rx.ocrText != null ? await decryptOcrText(rx.ocrText) : rx.ocrText,
  };
}
