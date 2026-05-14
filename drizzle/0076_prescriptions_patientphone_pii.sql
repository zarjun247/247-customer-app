-- Widen prescriptions.patientPhone to hold AES-GCM envelope (~67 chars for a typical phone).
ALTER TABLE prescriptions MODIFY patientPhone VARCHAR(500);
