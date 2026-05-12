# Staff Access Roster

Who has access to what. Fill in before production launch. Required for P0 launch blocker closure.

See also: [OPERATIONS.md](../docs/OPERATIONS.md) §Store onboarding checklist, [RUNBOOK_ON_CALL.md](../docs/RUNBOOK_ON_CALL.md).

**Rules:**
- No shared admin accounts — every user must have a named individual login.
- Store staff are scoped to a single store. Cross-store access requires explicit break-glass justification.
- Break-glass access is reviewed by the incident commander and logged in audit_log_chain.
- Role changes require store manager + platform owner approval.

---

## Active staff roster

| Staff ID | Name | Role | Store(s) | Email | Phone | Access since | Last login | MFA enabled |
|----------|------|------|---------|-------|-------|-------------|------------|-------------|
| TBD | TBD | pharmacist | TBD | TBD | TBD | TBD | TBD | ☐ |
| TBD | TBD | store_manager | TBD | TBD | TBD | TBD | TBD | ☐ |
| TBD | TBD | counter_staff | TBD | TBD | TBD | TBD | TBD | ☐ |
| TBD | TBD | admin | ALL (break-glass) | TBD | TBD | TBD | TBD | ☐ |

---

## Role definitions

| Role | Capabilities | Restricted from |
|------|-------------|-----------------|
| `customer` | Place orders, view own prescriptions, view own orders | All admin/staff surfaces |
| `counter_staff` | Counter sales, stock lookup, order packing | Pharmacist gates, H/H1/X approval, refund override, supplier invoices |
| `pharmacist` | Prescription review, H/H1/X approve/reject, controlled drug register | Admin role-management, financial overrides |
| `store_manager` | Counter + pharmacist scope + stock adjustments, shift reconciliation, rider handoff | Cross-store access, audit log deletion, capability grants |
| `ops_admin` | Runtime monitoring, dead-letter review, chaos drill (with flag), deployment validation | Direct DB writes, user role assignment |
| `admin` | All of the above + user management, role assignment | Direct DB writes without audit |
| `super_admin` | Break-glass only — all capabilities | Must be reviewed by incident commander before use |

---

## Break-glass access log

Any `super_admin` or cross-store access must be logged here.

| Date | Staff name | Role used | Store(s) accessed | Reason | Approved by | Audit log ID |
|------|------------|-----------|------------------|--------|-------------|-------------|
| TBD | TBD | super_admin | TBD | TBD | TBD | TBD |

---

## Staff removal / deprovisioning

When a staff member leaves or changes role:
1. Store manager submits removal request (email or system ticket).
2. Platform owner revokes the system account and invalidates all active sessions.
3. Confirm in audit log: staff member's last login is before the removal date.
4. Update this roster with removal date.

| Staff ID | Name | Role | Removed date | Removed by | Reason |
|----------|------|------|-------------|------------|--------|
| TBD | TBD | TBD | TBD | TBD | TBD |

---

## Launch sign-off

All P0 launch gates require this roster to be complete and signed:

| Role | Signoff name | Date | Confirmation |
|------|-------------|------|-------------|
| Store manager | TBD | TBD | I confirm no shared accounts and all named staff are trained. |
| Pharmacist-in-charge | TBD | TBD | I confirm pharmacist accounts are individual and H/H1/X gate is understood. |
| Platform owner | TBD | TBD | I confirm MFA is enforced for admin accounts. |
| Incident commander | TBD | TBD | I confirm escalation contacts are reachable. |
| Compliance/legal | TBD | TBD | I confirm access scope meets jurisdictional requirements. |
