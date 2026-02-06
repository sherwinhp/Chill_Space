ALTER TABLE users
  ADD COLUMN kyc_status ENUM('unverified','pending','verified','rejected','blocked') DEFAULT 'unverified',
  ADD COLUMN kyc_checked_at DATETIME NULL;

CREATE TABLE watchlist (
  watch_id INT NOT NULL AUTO_INCREMENT,
  name VARCHAR(120) DEFAULT NULL,
  email VARCHAR(120) DEFAULT NULL,
  contact_number VARCHAR(40) DEFAULT NULL,
  reason VARCHAR(255) DEFAULT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (watch_id),
  UNIQUE KEY uq_watch_email (email),
  KEY idx_watch_name (name),
  KEY idx_watch_contact (contact_number)
);

CREATE TABLE compliance_flags (
  flag_id INT NOT NULL AUTO_INCREMENT,
  user_id INT DEFAULT NULL,
  related_type ENUM('transaction','refund','account','payment') DEFAULT 'transaction',
  related_id INT DEFAULT NULL,
  severity ENUM('low','medium','high') DEFAULT 'medium',
  reason VARCHAR(255) NOT NULL,
  details TEXT DEFAULT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  resolved_at DATETIME DEFAULT NULL,
  resolved_by INT DEFAULT NULL,
  PRIMARY KEY (flag_id),
  KEY idx_compliance_user (user_id),
  KEY idx_compliance_related (related_type, related_id),
  CONSTRAINT fk_compliance_user FOREIGN KEY (user_id) REFERENCES users (user_id) ON DELETE SET NULL,
  CONSTRAINT fk_compliance_resolved_by FOREIGN KEY (resolved_by) REFERENCES users (user_id) ON DELETE SET NULL
);

CREATE TABLE audit_logs (
  log_id INT NOT NULL AUTO_INCREMENT,
  actor_id INT DEFAULT NULL,
  actor_role VARCHAR(20) DEFAULT 'admin',
  action VARCHAR(80) NOT NULL,
  target_type VARCHAR(40) DEFAULT NULL,
  target_id INT DEFAULT NULL,
  details TEXT DEFAULT NULL,
  ip_address VARCHAR(45) DEFAULT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (log_id),
  KEY idx_audit_actor (actor_id),
  KEY idx_audit_target (target_type, target_id),
  CONSTRAINT fk_audit_actor FOREIGN KEY (actor_id) REFERENCES users (user_id) ON DELETE SET NULL
);
