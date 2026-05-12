-- SM-E migration 0064: Add date_of_birth to users table for family consent enforcement
-- Existing rows will have NULL DOB. familyConsentService treats NULL as adult (with warning).
ALTER TABLE users ADD COLUMN date_of_birth DATE NULL AFTER email;
ALTER TABLE users ADD INDEX idx_users_date_of_birth (date_of_birth);
