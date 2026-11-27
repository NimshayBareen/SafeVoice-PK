-- SafeVoice PK database schema (Design Document, Section 6). Safe to run more than once.

-- ============ Accounts ============
CREATE TABLE IF NOT EXISTS users (
  user_id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email                 VARCHAR(255) UNIQUE,
  mobile                VARCHAR(20)  UNIQUE,
  password_hash         TEXT NOT NULL,
  role                  VARCHAR(10) NOT NULL DEFAULT 'VICTIM' CHECK (role IN ('VICTIM','LAWYER','ADMIN')),
  alias                 VARCHAR(60),
  full_name             VARCHAR(120),
  preferred_language    CHAR(2) NOT NULL DEFAULT 'en' CHECK (preferred_language IN ('en','ur')),
  status                VARCHAR(20) NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING','ACTIVE','LOCKED','SUSPENDED')),
  two_factor_enabled    BOOLEAN NOT NULL DEFAULT FALSE,
  two_factor_secret_enc BYTEA,
  failed_login_count    INT NOT NULL DEFAULT 0,
  locked_until          TIMESTAMPTZ,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_login_at         TIMESTAMPTZ,
  CHECK (email IS NOT NULL OR mobile IS NOT NULL)
);
ALTER TABLE users ADD COLUMN IF NOT EXISTS city VARCHAR(60);

CREATE TABLE IF NOT EXISTS verification_tokens (
  token_id    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
  token_hash  CHAR(64) NOT NULL,
  purpose     VARCHAR(20) NOT NULL,
  expires_at  TIMESTAMPTZ NOT NULL,
  used_at     TIMESTAMPTZ
);
ALTER TABLE verification_tokens ADD COLUMN IF NOT EXISTS attempts INT NOT NULL DEFAULT 0;
ALTER TABLE verification_tokens ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT now();
ALTER TABLE verification_tokens DROP CONSTRAINT IF EXISTS verification_tokens_purpose_check;
ALTER TABLE verification_tokens ADD CONSTRAINT verification_tokens_purpose_check
  CHECK (purpose IN ('EMAIL_VERIFY','EMAIL_OTP','PASSWORD_RESET'));
CREATE INDEX IF NOT EXISTS idx_vtokens_user ON verification_tokens(user_id, purpose);

-- ============ Legal knowledge base (managed by administrators) ============
CREATE TABLE IF NOT EXISTS case_categories (
  category_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code        VARCHAR(40) NOT NULL UNIQUE,
  name_en     VARCHAR(120) NOT NULL,
  name_ur     VARCHAR(160),
  description TEXT,
  is_active   BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE TABLE IF NOT EXISTS statutes (
  statute_id       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  short_code       VARCHAR(30) NOT NULL UNIQUE,
  name             VARCHAR(200) NOT NULL,
  year             INT,
  version          INT NOT NULL DEFAULT 1,
  last_reviewed_on DATE NOT NULL DEFAULT CURRENT_DATE
);

CREATE TABLE IF NOT EXISTS offences (
  offence_id       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  statute_id       UUID NOT NULL REFERENCES statutes(statute_id) ON DELETE RESTRICT,
  code             VARCHAR(40) UNIQUE,
  title_en         VARCHAR(200) NOT NULL,
  title_ur         VARCHAR(200),
  section_ref      VARCHAR(60),
  ingredients_text TEXT,
  is_active        BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE TABLE IF NOT EXISTS forums (
  forum_id     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code         VARCHAR(40) UNIQUE,
  name_en      VARCHAR(150) NOT NULL,
  name_ur      VARCHAR(150),
  forum_type   VARCHAR(30) NOT NULL,
  contact_info TEXT
);

CREATE TABLE IF NOT EXISTS legal_rules (
  rule_id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  category_id       UUID REFERENCES case_categories(category_id) ON DELETE RESTRICT,
  offence_id        UUID NOT NULL REFERENCES offences(offence_id) ON DELETE RESTRICT,
  forum_id          UUID NOT NULL REFERENCES forums(forum_id) ON DELETE RESTRICT,
  title             VARCHAR(150),
  condition_json    JSONB NOT NULL DEFAULT '{}'::jsonb,
  procedure_text_en TEXT NOT NULL,
  procedure_text_ur TEXT,
  version           INT NOT NULL DEFAULT 1,
  review_date       DATE NOT NULL DEFAULT CURRENT_DATE,
  is_active         BOOLEAN NOT NULL DEFAULT TRUE
);
CREATE INDEX IF NOT EXISTS idx_rules_cat ON legal_rules(category_id, is_active);

CREATE TABLE IF NOT EXISTS intake_questions (
  question_id   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  q_key         VARCHAR(40) NOT NULL UNIQUE,
  applies_to    TEXT[] NOT NULL DEFAULT '{}',
  text_en       TEXT NOT NULL,
  text_ur       TEXT,
  answer_type   VARCHAR(20) NOT NULL CHECK (answer_type IN ('SINGLE','YESNO','TEXT','DATE')),
  options_json  JSONB,
  display_order INT NOT NULL DEFAULT 100,
  is_mandatory  BOOLEAN NOT NULL DEFAULT FALSE,
  is_active     BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE TABLE IF NOT EXISTS support_entries (
  entry_id    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        VARCHAR(150) NOT NULL,
  name_ur     VARCHAR(150),
  entry_type  VARCHAR(20) NOT NULL CHECK (entry_type IN ('HELPLINE','SHELTER','NGO','GOV_OFFICE')),
  city        VARCHAR(60),
  is_national BOOLEAN NOT NULL DEFAULT FALSE,
  phone       VARCHAR(60),
  address     TEXT,
  website     VARCHAR(200),
  description TEXT,
  is_active   BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE TABLE IF NOT EXISTS support_entry_categories (
  entry_id    UUID NOT NULL REFERENCES support_entries(entry_id) ON DELETE CASCADE,
  category_id UUID NOT NULL REFERENCES case_categories(category_id) ON DELETE CASCADE,
  PRIMARY KEY (entry_id, category_id)
);

-- ============ Cases and evidence ============
CREATE TABLE IF NOT EXISTS cases (
  case_id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  victim_id        UUID NOT NULL REFERENCES users(user_id) ON DELETE RESTRICT,
  category_id      UUID,
  reference_code   VARCHAR(20) NOT NULL UNIQUE,
  status           VARCHAR(20) NOT NULL DEFAULT 'DRAFT',
  wrapped_case_key BYTEA NOT NULL,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_cases_victim ON cases(victim_id);
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'cases_category_fk') THEN
    ALTER TABLE cases ADD CONSTRAINT cases_category_fk FOREIGN KEY (category_id) REFERENCES case_categories(category_id);
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS stored_files (
  file_key   TEXT PRIMARY KEY,
  data       BYTEA NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS intake_answers (
  answer_id        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id          UUID NOT NULL REFERENCES cases(case_id) ON DELETE RESTRICT,
  question_id      UUID NOT NULL REFERENCES intake_questions(question_id) ON DELETE RESTRICT,
  answer_value_enc BYTEA NOT NULL,
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (case_id, question_id)
);

CREATE TABLE IF NOT EXISTS evidence_items (
  evidence_id       UUID PRIMARY KEY,
  case_id           UUID NOT NULL REFERENCES cases(case_id) ON DELETE RESTRICT,
  evidence_type     VARCHAR(20) NOT NULL CHECK (evidence_type IN ('IMAGE','AUDIO','VIDEO','DOCUMENT','URL')),
  original_filename VARCHAR(255),
  mime_type         VARCHAR(100),
  size_bytes        BIGINT,
  storage_path      TEXT,
  encryption_iv     BYTEA,
  sha256_hash       CHAR(64) NOT NULL,
  url_value         TEXT,
  metadata_json     JSONB,
  description       TEXT,
  uploaded_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  is_deleted        BOOLEAN NOT NULL DEFAULT FALSE
);
CREATE INDEX IF NOT EXISTS idx_evidence_case ON evidence_items(case_id);

CREATE TABLE IF NOT EXISTS custody_log (
  log_id      BIGSERIAL PRIMARY KEY,
  evidence_id UUID REFERENCES evidence_items(evidence_id) ON DELETE RESTRICT,
  case_id     UUID NOT NULL REFERENCES cases(case_id) ON DELETE RESTRICT,
  actor_id    UUID REFERENCES users(user_id) ON DELETE RESTRICT,
  action      VARCHAR(20) NOT NULL,
  result      VARCHAR(20),
  ip_address  INET,
  created_at  TIMESTAMPTZ NOT NULL,
  prev_hash   CHAR(64),
  entry_hash  CHAR(64) NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_custody_case ON custody_log(case_id, log_id);
CREATE INDEX IF NOT EXISTS idx_custody_evidence ON custody_log(evidence_id, action, log_id);

CREATE TABLE IF NOT EXISTS complaint_drafts (
  draft_id    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id     UUID NOT NULL REFERENCES cases(case_id) ON DELETE RESTRICT,
  forum_id    UUID REFERENCES forums(forum_id),
  content_enc BYTEA NOT NULL,
  version_no  INT NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_drafts_case ON complaint_drafts(case_id, version_no);

-- ============ Lawyers ============
CREATE TABLE IF NOT EXISTS lawyer_profiles (
  lawyer_id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             UUID NOT NULL UNIQUE REFERENCES users(user_id) ON DELETE RESTRICT,
  full_name           VARCHAR(120) NOT NULL,
  bar_council_no      VARCHAR(40) NOT NULL UNIQUE,
  bar_council_name    VARCHAR(80),
  city                VARCHAR(60) NOT NULL,
  languages           TEXT[] NOT NULL DEFAULT '{}',
  fee_type            VARCHAR(10) NOT NULL DEFAULT 'MIXED' CHECK (fee_type IN ('PAID','PRO_BONO','MIXED')),
  bio                 TEXT,
  verification_status VARCHAR(24) NOT NULL DEFAULT 'PENDING_VERIFICATION'
                      CHECK (verification_status IN ('PENDING_VERIFICATION','VERIFIED','REJECTED','MORE_INFO_REQUIRED')),
  verification_note   TEXT,
  verified_by         UUID REFERENCES users(user_id),
  verified_at         TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_lawyers_dir ON lawyer_profiles(verification_status, city);

CREATE TABLE IF NOT EXISTS lawyer_documents (
  doc_id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lawyer_id         UUID NOT NULL REFERENCES lawyer_profiles(lawyer_id) ON DELETE CASCADE,
  doc_type          VARCHAR(30) NOT NULL,
  original_filename VARCHAR(255),
  mime_type         VARCHAR(100),
  file_path         TEXT NOT NULL,
  encryption_iv     BYTEA NOT NULL,
  uploaded_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS lawyer_specialisations (
  lawyer_id   UUID NOT NULL REFERENCES lawyer_profiles(lawyer_id) ON DELETE CASCADE,
  category_id UUID NOT NULL REFERENCES case_categories(category_id) ON DELETE CASCADE,
  PRIMARY KEY (lawyer_id, category_id)
);

-- ============ Representation workflow ============
CREATE TABLE IF NOT EXISTS representation_requests (
  request_id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id            UUID NOT NULL REFERENCES cases(case_id) ON DELETE RESTRICT,
  lawyer_id          UUID NOT NULL REFERENCES lawyer_profiles(lawyer_id) ON DELETE RESTRICT,
  anonymised_summary TEXT NOT NULL,
  status             VARCHAR(20) NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING','ACCEPTED','DECLINED','WITHDRAWN')),
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  responded_at       TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_requests_lawyer ON representation_requests(lawyer_id, status);
CREATE INDEX IF NOT EXISTS idx_requests_case ON representation_requests(case_id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_request_open ON representation_requests(case_id, lawyer_id)
  WHERE status IN ('PENDING','ACCEPTED');

CREATE TABLE IF NOT EXISTS evidence_shares (
  share_id    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id  UUID NOT NULL REFERENCES representation_requests(request_id) ON DELETE RESTRICT,
  evidence_id UUID NOT NULL REFERENCES evidence_items(evidence_id) ON DELETE RESTRICT,
  granted_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  revoked_at  TIMESTAMPTZ,
  is_active   BOOLEAN NOT NULL DEFAULT TRUE
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_share_active ON evidence_shares(request_id, evidence_id) WHERE is_active;
CREATE INDEX IF NOT EXISTS idx_shares_request ON evidence_shares(request_id, is_active);

CREATE TABLE IF NOT EXISTS vakalatnamas (
  vakalatnama_id       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id           UUID NOT NULL UNIQUE REFERENCES representation_requests(request_id) ON DELETE RESTRICT,
  draft_path           TEXT NOT NULL,
  draft_iv             BYTEA NOT NULL,
  signed_scan_path     TEXT,
  signed_scan_iv       BYTEA,
  signed_scan_name     VARCHAR(255),
  signed_scan_mime     VARCHAR(100),
  status               VARCHAR(30) NOT NULL DEFAULT 'SENT'
                       CHECK (status IN ('SENT','SIGNED_COPY_RECEIVED','VERIFIED','ORIGINAL_RECEIVED')),
  rejection_reason     TEXT,
  generated_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  scan_uploaded_at     TIMESTAMPTZ,
  verified_at          TIMESTAMPTZ,
  original_received_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS messages (
  message_id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id             UUID NOT NULL REFERENCES representation_requests(request_id) ON DELETE RESTRICT,
  sender_id              UUID NOT NULL REFERENCES users(user_id) ON DELETE RESTRICT,
  body_encrypted         BYTEA NOT NULL,
  attachment_evidence_id UUID REFERENCES evidence_items(evidence_id),
  sent_at                TIMESTAMPTZ NOT NULL DEFAULT now(),
  read_at                TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_messages_request ON messages(request_id, sent_at);

CREATE TABLE IF NOT EXISTS case_updates (
  update_id  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id    UUID NOT NULL REFERENCES cases(case_id) ON DELETE RESTRICT,
  stage      VARCHAR(60) NOT NULL,
  note       TEXT,
  updated_by UUID NOT NULL REFERENCES users(user_id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_updates_case ON case_updates(case_id, created_at);

CREATE TABLE IF NOT EXISTS case_dates (
  date_id    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id    UUID NOT NULL REFERENCES cases(case_id) ON DELETE RESTRICT,
  title      VARCHAR(120) NOT NULL,
  event_date DATE NOT NULL,
  created_by UUID NOT NULL REFERENCES users(user_id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_dates_case ON case_dates(case_id, event_date);

-- ============ Notifications, moderation, audit ============
CREATE TABLE IF NOT EXISTS notifications (
  notification_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
  type            VARCHAR(30) NOT NULL,
  neutral_text    VARCHAR(200) NOT NULL,
  is_read         BOOLEAN NOT NULL DEFAULT FALSE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS link VARCHAR(200);
CREATE INDEX IF NOT EXISTS idx_notif_user ON notifications(user_id, is_read, created_at);

CREATE TABLE IF NOT EXISTS misuse_reports (
  report_id        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reporter_id      UUID NOT NULL REFERENCES users(user_id),
  reported_user_id UUID NOT NULL REFERENCES users(user_id),
  reason           VARCHAR(60) NOT NULL,
  details          TEXT,
  status           VARCHAR(20) NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN','REVIEWED','ACTION_TAKEN','DISMISSED')),
  reviewed_by      UUID REFERENCES users(user_id),
  action_taken     VARCHAR(20),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  reviewed_at      TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS audit_logs (
  audit_id     BIGSERIAL PRIMARY KEY,
  actor_id     UUID REFERENCES users(user_id) ON DELETE RESTRICT,
  action       VARCHAR(40) NOT NULL,
  entity_type  VARCHAR(40),
  entity_id    TEXT,
  details_json JSONB,
  ip_address   INET,
  created_at   TIMESTAMPTZ NOT NULL,
  prev_hash    CHAR(64),
  entry_hash   CHAR(64) NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_audit_actor ON audit_logs(actor_id, created_at);

-- Append-only logs: updates and deletes are rejected (Design Document, Section 6.8)
CREATE OR REPLACE FUNCTION reject_log_change() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION '% is append-only', TG_TABLE_NAME;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS custody_log_append_only ON custody_log;
CREATE TRIGGER custody_log_append_only BEFORE UPDATE OR DELETE ON custody_log
  FOR EACH ROW EXECUTE FUNCTION reject_log_change();

DROP TRIGGER IF EXISTS audit_logs_append_only ON audit_logs;
CREATE TRIGGER audit_logs_append_only BEFORE UPDATE OR DELETE ON audit_logs
  FOR EACH ROW EXECUTE FUNCTION reject_log_change();
