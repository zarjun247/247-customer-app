# PRESCRIPTION_VAULT_STATUS

- Vault ownership guard: prescription detail route denies non-owner access (`NOT_FOUND`) and audits `prescription_viewed` for allowed reads.
- Staff/pharmacist review access remains on governance router role gates; prescription access log rows are recorded in governance `get` path.
- Storage path safety: sensitive keys remain behind storage key policy (`prescriptions/` classified sensitive).
- Download/view policy: safe-deny remains default where explicit permission mapping is unavailable; regulated-sensitive file access should route through storage policy.
- Audit posture: upload/on-file/view + regulated refill/whatsapp escalation actions are auditable.
- Remaining gap: explicit `canAccessPrescription` helper shared across all prescription file endpoints and family/dependent authorization graph.
