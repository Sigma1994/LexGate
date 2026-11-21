import type {
  DocumentChunk,
  DocumentVersion,
  GoldenSmokeQuestion,
  GroupId,
  GroupMembership,
  Principal,
  QuarantineRecord,
  RegulatoryDocument,
} from '../shared/types.ts';

export const UNIFORM_ABSTENTION_TEXT =
  'Insufficient authorized regulatory evidence effective as of the requested date to answer this query.';

export const MAX_EPOCH_SENTINEL_TS = 253402300799; // 9999-12-31T23:59:59Z

export const SEED_PRINCIPALS: Principal[] = [
  {
    principal_id: '11111111-1111-4111-8111-111111111101',
    external_sub: 'wanjiku.mwangi@external.ke',
    display_name: 'Wanjiku Mwangi',
    role_label: 'Public Reader (Public laws only)',
    is_active: true,
    created_at: '2020-01-15T08:00:00Z',
  },
  {
    principal_id: '11111111-1111-4111-8111-111111111102',
    external_sub: 'kamau.ochieng@bank.ke',
    display_name: 'Kamau Ochieng',
    role_label: 'Compliance Officer (Public + Compliance)',
    is_active: true,
    created_at: '2021-06-01T08:00:00Z',
  },
  {
    principal_id: '11111111-1111-4111-8111-111111111103',
    external_sub: 'amina.hassan@bank.ke',
    display_name: 'Amina Hassan',
    role_label: 'Head of Internal Audit (Full Access)',
    is_active: true,
    created_at: '2019-03-10T08:00:00Z',
  },
  {
    principal_id: '11111111-1111-4111-8111-111111111104',
    external_sub: 'brian.kiprop@former.ke',
    display_name: 'Brian Kiprop',
    role_label: 'Former Auditor (Audit access ended Mar 2025)',
    is_active: true,
    created_at: '2020-01-01T08:00:00Z',
  },
  {
    principal_id: '11111111-1111-4111-8111-111111111105',
    external_sub: 'suspended.user@bank.ke',
    display_name: 'Suspended Account',
    role_label: 'Turned Off (All access blocked)',
    is_active: false,
    created_at: '2022-02-01T08:00:00Z',
  },
];

export const SEED_MEMBERSHIPS: GroupMembership[] = [
  {
    principal_id: '11111111-1111-4111-8111-111111111101',
    group_id: 'public',
    valid_from: '2020-01-15T00:00:00Z',
    valid_to: null,
  },
  {
    principal_id: '11111111-1111-4111-8111-111111111102',
    group_id: 'public',
    valid_from: '2021-06-01T00:00:00Z',
    valid_to: null,
  },
  {
    principal_id: '11111111-1111-4111-8111-111111111102',
    group_id: 'compliance_officer',
    valid_from: '2021-06-01T00:00:00Z',
    valid_to: null,
  },
  {
    principal_id: '11111111-1111-4111-8111-111111111103',
    group_id: 'public',
    valid_from: '2019-03-10T00:00:00Z',
    valid_to: null,
  },
  {
    principal_id: '11111111-1111-4111-8111-111111111103',
    group_id: 'compliance_officer',
    valid_from: '2019-03-10T00:00:00Z',
    valid_to: null,
  },
  {
    principal_id: '11111111-1111-4111-8111-111111111103',
    group_id: 'internal_audit',
    valid_from: '2019-03-10T00:00:00Z',
    valid_to: null,
  },
  // Brian Kiprop: active public, EXPIRED internal_audit (tests Bug 1 time-travel ACL bypass!)
  {
    principal_id: '11111111-1111-4111-8111-111111111104',
    group_id: 'public',
    valid_from: '2020-01-01T00:00:00Z',
    valid_to: null,
  },
  {
    principal_id: '11111111-1111-4111-8111-111111111104',
    group_id: 'internal_audit',
    valid_from: '2020-01-01T00:00:00Z',
    valid_to: '2025-03-01T00:00:00Z',
  },
  // Suspended account still has a membership row, blocked by principals.is_active = false
  {
    principal_id: '11111111-1111-4111-8111-111111111105',
    group_id: 'internal_audit',
    valid_from: '2022-02-01T00:00:00Z',
    valid_to: null,
  },
];

export const SEED_DOCUMENTS: RegulatoryDocument[] = [
  {
    doc_id: '22222222-2222-4222-8222-222222222201',
    title: 'Central Bank of Kenya Act (Cap. 491)',
    citation_code: 'Cap. 491',
    source_url: 'https://kenyalaw.org/kl/fileadmin/pdfdownloads/Acts/CentralBankofKenyaAct_Cap491.pdf',
    license: 'Public Statutory Text (Kenya Law)',
    sensitivity: 'public',
    created_at: '2025-01-10T09:00:00Z',
  },
  {
    doc_id: '22222222-2222-4222-8222-222222222202',
    title: 'CBK Prudential Guideline on Capital Adequacy (CBK/PG/03)',
    citation_code: 'CBK/PG/03',
    source_url: 'https://www.centralbank.go.ke/uploads/prudential_guidelines/CBK_PG_03_Capital_Adequacy.pdf',
    license: 'Public Regulatory Notice (CBK)',
    sensitivity: 'public',
    created_at: '2025-01-10T09:05:00Z',
  },
  {
    doc_id: '22222222-2222-4222-8222-222222222203',
    title: 'CBK Circular No. 11 of 2024 — Liquidity & Stress Returns',
    citation_code: 'CBK/CIRC/11/2024',
    source_url: 'https://www.centralbank.go.ke/uploads/banking_circulars/Circular_11_2024.pdf',
    license: 'Synthetic Compliance Classification',
    sensitivity: 'compliance_officer',
    created_at: '2025-01-10T09:10:00Z',
  },
  {
    doc_id: '22222222-2222-4222-8222-222222222204',
    title: 'OAG Special Audit Report — Reserve Buffers & Treasury Controls (FY 2024/25)',
    citation_code: 'OAG/SAR/2025/04',
    source_url: 'https://www.oagkenya.go.ke/audit-reports/special-audit-2025',
    license: 'Synthetic Internal Audit Classification',
    sensitivity: 'internal_audit',
    created_at: '2025-01-15T10:00:00Z',
  },
  {
    doc_id: '22222222-2222-4222-8222-222222222205',
    title: 'Banking (Amendment) Act, 2025 — Staggered Core Capital & Licensing Schedule',
    citation_code: 'Cap. 488 / Amend. 2025',
    source_url: 'https://kenyalaw.org/kl/fileadmin/pdfdownloads/Acts/BankingAct_Cap488_2025.pdf',
    license: 'Public Statutory Text (Kenya Law)',
    sensitivity: 'public',
    created_at: '2025-02-12T09:00:00Z',
  },
  {
    doc_id: '22222222-2222-4222-8222-222222222206',
    title: 'Financial Sector Data Protection & Cross-Border Transfer Guidance (2025)',
    citation_code: 'ODPC/FIN/2025/03',
    source_url: 'https://www.odpc.go.ke/guidance-notes/financial-sector-2025',
    license: 'Public Regulatory Notice (ODPC)',
    sensitivity: 'public',
    created_at: '2025-05-18T10:30:00Z',
  },
  {
    doc_id: '22222222-2222-4222-8222-222222222207',
    title: 'CBK Cyber Resilience, AI Governance & Cloud Risk Guideline (2026)',
    citation_code: 'CBK/PG/18/2026',
    source_url: 'https://www.centralbank.go.ke/uploads/prudential_guidelines/CBK_PG_18_Cyber_AI_2026.pdf',
    license: 'Synthetic Compliance Classification',
    sensitivity: 'compliance_officer',
    created_at: '2026-01-14T08:00:00Z',
  },
  {
    doc_id: '22222222-2222-4222-8222-222222222208',
    title: 'AML / CFT & Virtual Asset Service Providers Directive (2026)',
    citation_code: 'CBK/AML/2026/02',
    source_url: 'https://www.centralbank.go.ke/uploads/aml_directives/AML_VASP_2026_02.pdf',
    license: 'Synthetic Compliance Classification',
    sensitivity: 'compliance_officer',
    created_at: '2026-02-05T09:15:00Z',
  },
  {
    doc_id: '22222222-2222-4222-8222-222222222209',
    title: 'Enterprise Credit Risk & IFRS 9 Expected Credit Loss Policy (2026)',
    citation_code: 'BANK/POL/2026/09',
    source_url: 'https://intranet.bank.ke/policies/ifrs9-credit-loss-2026',
    license: 'Internal Bank Policy (Compliance)',
    sensitivity: 'compliance_officer',
    created_at: '2026-03-01T08:30:00Z',
  },
  {
    doc_id: '22222222-2222-4222-8222-222222222210',
    title: 'Internal Audit Board Report — Insider Lending & FX Desk Exceptions (2026)',
    citation_code: 'AUDIT/2026/07',
    source_url: 'https://audit.bank.ke/reports/board-fx-insider-2026',
    license: 'Confidential Internal Audit',
    sensitivity: 'internal_audit',
    created_at: '2026-06-10T11:00:00Z',
  },
];

export const SEED_ACL_GRANTS: Array<{ doc_id: string; group_id: GroupId }> = [
  { doc_id: '22222222-2222-4222-8222-222222222201', group_id: 'public' },
  { doc_id: '22222222-2222-4222-8222-222222222201', group_id: 'compliance_officer' },
  { doc_id: '22222222-2222-4222-8222-222222222201', group_id: 'internal_audit' },
  { doc_id: '22222222-2222-4222-8222-222222222202', group_id: 'public' },
  { doc_id: '22222222-2222-4222-8222-222222222202', group_id: 'compliance_officer' },
  { doc_id: '22222222-2222-4222-8222-222222222202', group_id: 'internal_audit' },
  { doc_id: '22222222-2222-4222-8222-222222222203', group_id: 'compliance_officer' },
  { doc_id: '22222222-2222-4222-8222-222222222203', group_id: 'internal_audit' },
  { doc_id: '22222222-2222-4222-8222-222222222204', group_id: 'internal_audit' },
  { doc_id: '22222222-2222-4222-8222-222222222205', group_id: 'public' },
  { doc_id: '22222222-2222-4222-8222-222222222205', group_id: 'compliance_officer' },
  { doc_id: '22222222-2222-4222-8222-222222222205', group_id: 'internal_audit' },
  { doc_id: '22222222-2222-4222-8222-222222222206', group_id: 'public' },
  { doc_id: '22222222-2222-4222-8222-222222222206', group_id: 'compliance_officer' },
  { doc_id: '22222222-2222-4222-8222-222222222206', group_id: 'internal_audit' },
  { doc_id: '22222222-2222-4222-8222-222222222207', group_id: 'compliance_officer' },
  { doc_id: '22222222-2222-4222-8222-222222222207', group_id: 'internal_audit' },
  { doc_id: '22222222-2222-4222-8222-222222222208', group_id: 'compliance_officer' },
  { doc_id: '22222222-2222-4222-8222-222222222208', group_id: 'internal_audit' },
  { doc_id: '22222222-2222-4222-8222-222222222209', group_id: 'compliance_officer' },
  { doc_id: '22222222-2222-4222-8222-222222222209', group_id: 'internal_audit' },
  { doc_id: '22222222-2222-4222-8222-222222222210', group_id: 'internal_audit' },
];

export const SEED_VERSIONS: DocumentVersion[] = [
  // Pre-1970 statute version (negative Unix timestamp!)
  {
    version_id: '33333333-3333-4333-8333-333333333301',
    doc_id: '22222222-2222-4222-8222-222222222201',
    version_label: 'Cap. 491 (1966 Original Enactment)',
    effective_from: '1966-05-24T00:00:00Z',
    effective_to: '2012-01-01T00:00:00Z',
    supersedes_version_id: null,
    content_hash: 'sha256:491_1966_v1',
  },
  // Open-ended active statute version (effective_to = null)
  {
    version_id: '33333333-3333-4333-8333-333333333302',
    doc_id: '22222222-2222-4222-8222-222222222201',
    version_label: 'Cap. 491 (2012 Revised Edition)',
    effective_from: '2012-01-01T00:00:00Z',
    effective_to: null,
    supersedes_version_id: '33333333-3333-4333-8333-333333333301',
    content_hash: 'sha256:491_2012_v2',
  },
  // Superseded CBK Capital Adequacy v1
  {
    version_id: '33333333-3333-4333-8333-333333333303',
    doc_id: '22222222-2222-4222-8222-222222222202',
    version_label: 'CBK/PG/03 (2013–2023 Framework)',
    effective_from: '2013-01-01T00:00:00Z',
    effective_to: '2023-07-01T00:00:00Z',
    supersedes_version_id: null,
    content_hash: 'sha256:pg03_2013_v1',
  },
  // Open-ended active CBK Capital Adequacy v2
  {
    version_id: '33333333-3333-4333-8333-333333333304',
    doc_id: '22222222-2222-4222-8222-222222222202',
    version_label: 'CBK/PG/03 (2023 Revised Capital Buffer)',
    effective_from: '2023-07-01T00:00:00Z',
    effective_to: null,
    supersedes_version_id: '33333333-3333-4333-8333-333333333303',
    content_hash: 'sha256:pg03_2023_v2',
  },
  // Compliance Officer Restricted Circular
  {
    version_id: '33333333-3333-4333-8333-333333333305',
    doc_id: '22222222-2222-4222-8222-222222222203',
    version_label: 'Circular 11/2024 (In Force)',
    effective_from: '2024-04-01T00:00:00Z',
    effective_to: null,
    supersedes_version_id: null,
    content_hash: 'sha256:circ11_2024_v1',
  },
  // Internal Audit Only Report
  {
    version_id: '33333333-3333-4333-8333-333333333306',
    doc_id: '22222222-2222-4222-8222-222222222204',
    version_label: 'OAG Special Audit FY 2024/25',
    effective_from: '2025-01-15T00:00:00Z',
    effective_to: null,
    supersedes_version_id: null,
    content_hash: 'sha256:oag_2025_v1',
  },
  // Banking (Amendment) Act, 2025
  {
    version_id: '33333333-3333-4333-8333-333333333307',
    doc_id: '22222222-2222-4222-8222-222222222205',
    version_label: 'Banking Act Cap. 488 (2025 Amendment)',
    effective_from: '2025-02-01T00:00:00Z',
    effective_to: null,
    supersedes_version_id: null,
    content_hash: 'sha256:cap488_2025_v1',
  },
  // ODPC Financial Data Protection Guidance 2025
  {
    version_id: '33333333-3333-4333-8333-333333333308',
    doc_id: '22222222-2222-4222-8222-222222222206',
    version_label: 'ODPC/FIN/2025/03 (In Force)',
    effective_from: '2025-05-15T00:00:00Z',
    effective_to: null,
    supersedes_version_id: null,
    content_hash: 'sha256:odpc_2025_v1',
  },
  // CBK Cyber Resilience & AI Governance 2026
  {
    version_id: '33333333-3333-4333-8333-333333333309',
    doc_id: '22222222-2222-4222-8222-222222222207',
    version_label: 'CBK/PG/18/2026 (2026 Edition)',
    effective_from: '2026-01-15T00:00:00Z',
    effective_to: null,
    supersedes_version_id: null,
    content_hash: 'sha256:cbk_pg18_2026_v1',
  },
  // AML / CFT & VASP Directive 2026
  {
    version_id: '33333333-3333-4333-8333-333333333310',
    doc_id: '22222222-2222-4222-8222-222222222208',
    version_label: 'CBK/AML/2026/02 (In Force)',
    effective_from: '2026-02-01T00:00:00Z',
    effective_to: null,
    supersedes_version_id: null,
    content_hash: 'sha256:aml_2026_v1',
  },
  // IFRS 9 Credit Loss Policy 2026
  {
    version_id: '33333333-3333-4333-8333-333333333311',
    doc_id: '22222222-2222-4222-8222-222222222209',
    version_label: 'BANK/POL/2026/09 (FY 2026)',
    effective_from: '2026-03-01T00:00:00Z',
    effective_to: null,
    supersedes_version_id: null,
    content_hash: 'sha256:ifrs9_2026_v1',
  },
  // Internal Audit Board Report 2026
  {
    version_id: '33333333-3333-4333-8333-333333333312',
    doc_id: '22222222-2222-4222-8222-222222222210',
    version_label: 'AUDIT/2026/07 (Q2 2026)',
    effective_from: '2026-06-01T00:00:00Z',
    effective_to: null,
    supersedes_version_id: null,
    content_hash: 'sha256:audit_2026_v1',
  },
];

export const SEED_CHUNKS: DocumentChunk[] = [
  // Cap 491 (1966) Parent & Child
  {
    chunk_id: '44444444-4444-4444-8444-444444444401',
    version_id: '33333333-3333-4333-8333-333333333301',
    parent_chunk_id: null,
    chunk_tier: 'parent',
    kind: 'text',
    page_number: 4,
    ocr_confidence: 0.96,
    text_content:
      'Section 4 (1966 Original Enactment): The principal object of the Bank shall be to regulate the issue of notes and coins, to assist in the development and maintenance of a sound monetary, credit and banking system in Kenya conducive to the orderly and balanced economic development of the country and the external stability of the currency. Authorized capital at commencement is fixed at twenty-six million shillings.',
    token_count: 82,
    keywords: ['central bank', '1966', 'cap 491', 'principal object', 'capital', 'twenty-six million', 'shillings', 'currency'],
  },
  {
    chunk_id: '44444444-4444-4444-8444-444444444402',
    version_id: '33333333-3333-4333-8333-333333333301',
    parent_chunk_id: '44444444-4444-4444-8444-444444444401',
    chunk_tier: 'child',
    kind: 'text',
    page_number: 4,
    ocr_confidence: 0.96,
    text_content:
      'Section 4 (1966): The principal object of the Bank shall be to regulate notes and coins and maintain monetary stability. Authorized capital at commencement is twenty-six million shillings.',
    token_count: 34,
    keywords: ['central bank', '1966', 'cap 491', 'principal object', 'authorized capital', 'twenty-six million', 'shillings'],
  },
  // Cap 491 (2012 Revised) Parent & Child
  {
    chunk_id: '44444444-4444-4444-8444-444444444403',
    version_id: '33333333-3333-4333-8333-333333333302',
    parent_chunk_id: null,
    chunk_tier: 'parent',
    kind: 'text',
    page_number: 7,
    ocr_confidence: 0.99,
    text_content:
      'Section 4 & Section 4A (2012 Revised Edition): The principal object of the Bank shall be to formulate and implement monetary policy directed to achieving and maintaining stability in the general level of prices. Under Section 4A, the Bank shall foster the liquidity, solvency and proper functioning of a stable market-based financial system and formulate and implement foreign exchange policy. Section 8 fixes authorized capital at five billion shillings.',
    token_count: 88,
    keywords: ['central bank', '2012', 'cap 491', 'price stability', 'monetary policy', 'liquidity', 'solvency', 'five billion', 'authorized capital'],
  },
  {
    chunk_id: '44444444-4444-4444-8444-444444444404',
    version_id: '33333333-3333-4333-8333-333333333302',
    parent_chunk_id: '44444444-4444-4444-8444-444444444403',
    chunk_tier: 'child',
    kind: 'text',
    page_number: 7,
    ocr_confidence: 0.99,
    text_content:
      'Section 4 (2012): Formulate monetary policy for price stability; foster liquidity and solvency. Section 8 fixes authorized capital at five billion shillings.',
    token_count: 28,
    keywords: ['central bank', '2012', 'cap 491', 'price stability', 'five billion', 'authorized capital', 'monetary policy'],
  },
  // CBK/PG/03 (2013 v1) Parent & Child Table
  {
    chunk_id: '44444444-4444-4444-8444-444444444405',
    version_id: '33333333-3333-4333-8333-333333333303',
    parent_chunk_id: null,
    chunk_tier: 'parent',
    kind: 'table',
    page_number: 12,
    ocr_confidence: 0.94,
    text_content:
      'Section 3.2 Capital Adequacy Ratios (2013 Framework, effective 2013-01-01 to 2023-06-30):\n| Metric | Minimum Ratio | Capital Conservation Buffer | Total Requirement |\n|---|---|---|---|\n| Core Capital / Total Risk-Weighted Assets (TRWA) | 8.0% | 2.5% | 10.5% |\n| Total Capital / Total Risk-Weighted Assets (TRWA) | 12.0% | 2.5% | 14.5% |\n| Core Capital / Total Deposit Liabilities | 8.0% | N/A | 8.0% |\nMinimum absolute paid-up core capital for commercial banks under the 2013 schedule is KES 1.0 billion.',
    token_count: 112,
    keywords: ['capital adequacy', 'core capital', 'total capital', 'trwa', 'risk-weighted', '8.0%', '10.5%', '12.0%', '14.5%', '1.0 billion', '2013', 'cbk/pg/03'],
  },
  {
    chunk_id: '44444444-4444-4444-8444-444444444406',
    version_id: '33333333-3333-4333-8333-333333333303',
    parent_chunk_id: '44444444-4444-4444-8444-444444444405',
    chunk_tier: 'child',
    kind: 'table',
    page_number: 12,
    ocr_confidence: 0.94,
    text_content:
      '| Metric | Minimum Ratio | Capital Conservation Buffer | Total Requirement |\n| Core Capital / TRWA | 8.0% | 2.5% | 10.5% |\n| Total Capital / TRWA | 12.0% | 2.5% | 14.5% |\nMinimum absolute core capital: KES 1.0 billion (2013 Framework).',
    token_count: 58,
    keywords: ['capital adequacy', 'core capital', 'total capital', 'trwa', '8.0%', '10.5%', '12.0%', '14.5%', '1.0 billion', 'cbk/pg/03'],
  },
  // CBK/PG/03 (2023 v2) Parent & Child Table
  {
    chunk_id: '44444444-4444-4444-8444-444444444407',
    version_id: '33333333-3333-4333-8333-333333333304',
    parent_chunk_id: null,
    chunk_tier: 'parent',
    kind: 'table',
    page_number: 14,
    ocr_confidence: 0.98,
    text_content:
      'Section 4.1 Revised Capital Adequacy & D-SIB Schedule (effective 2023-07-01, currently in force):\n| Metric | Minimum Ratio | Conservation Buffer | D-SIB Tier 1 Surcharge | Total D-SIB Requirement |\n|---|---|---|---|---|\n| Core Capital / TRWA | 8.0% | 2.5% | 1.5% | 12.0% |\n| Total Capital / TRWA | 12.0% | 2.5% | 1.5% | 16.0% |\n| Core Capital / Total Deposits | 8.0% | N/A | N/A | 8.0% |\nRevised statutory floor raises minimum core capital for commercial banks from KES 1.0 billion to KES 3.0 billion by December 2025 and KES 10.0 billion by December 2029.',
    token_count: 126,
    keywords: ['capital adequacy', 'd-sib', 'surcharge', 'core capital', 'total capital', 'trwa', '12.0%', '16.0%', '3.0 billion', '10.0 billion', '2023', 'cbk/pg/03'],
  },
  {
    chunk_id: '44444444-4444-4444-8444-444444444408',
    version_id: '33333333-3333-4333-8333-333333333304',
    parent_chunk_id: '44444444-4444-4444-8444-444444444407',
    chunk_tier: 'child',
    kind: 'table',
    page_number: 14,
    ocr_confidence: 0.98,
    text_content:
      '| Metric | Minimum Ratio | Conservation Buffer | D-SIB Tier 1 Surcharge | Total D-SIB Requirement |\n| Core Capital / TRWA | 8.0% | 2.5% | 1.5% | 12.0% |\n| Total Capital / TRWA | 12.0% | 2.5% | 1.5% | 16.0% |\nMinimum core capital phases to KES 3.0B (2025) and KES 10.0B (2029).',
    token_count: 68,
    keywords: ['capital adequacy', 'd-sib', 'surcharge', '12.0%', '16.0%', '3.0 billion', '10.0 billion', 'cbk/pg/03'],
  },
  // Compliance Officer Restricted Circular (CBK/CIRC/11/2024)
  {
    chunk_id: '44444444-4444-4444-8444-444444444409',
    version_id: '33333333-3333-4333-8333-333333333305',
    parent_chunk_id: null,
    chunk_tier: 'parent',
    kind: 'table',
    page_number: 3,
    ocr_confidence: 0.97,
    text_content:
      'Circular 11/2024 Clause 2.4 — Statutory Liquidity & Stress Return Haircuts (Compliance Officer Tier):\n| Asset / Outflow Bucket | Statutory Minimum / Haircut | Reporting Frequency | Escalation Threshold |\n|---|---|---|---|\n| Statutory Liquidity Ratio | 20.0% of total deposit liabilities | Weekly (BSD-L1) | Alert below 22.0% |\n| 30-Day Liquidity Coverage Ratio (LCR) | 100.0% | Monthly (BSD-L2) | Alert below 105.0% |\n| Uninsured Corporate Deposit Run-Off Haircut | 40.0% stress outflow factor | Monthly | Board Risk Committee |\nInstitutions falling below 22.0% statutory liquidity must file an intraday cash-flow contingency notice within 24 hours.',
    token_count: 118,
    keywords: ['liquidity', 'stress', 'lcr', '20.0%', '22.0%', '100.0%', '40.0%', 'haircut', 'circular 11', 'bsd-l1', 'contingency'],
  },
  {
    chunk_id: '44444444-4444-4444-8444-444444444410',
    version_id: '33333333-3333-4333-8333-333333333305',
    parent_chunk_id: '44444444-4444-4444-8444-444444444409',
    chunk_tier: 'child',
    kind: 'table',
    page_number: 3,
    ocr_confidence: 0.97,
    text_content:
      '| Asset / Outflow Bucket | Statutory Minimum / Haircut | Reporting Frequency | Escalation Threshold |\n| Statutory Liquidity Ratio | 20.0% | Weekly (BSD-L1) | Alert below 22.0% |\n| 30-Day LCR | 100.0% | Monthly (BSD-L2) | Alert below 105.0% |\n| Corporate Deposit Run-Off Haircut | 40.0% | Monthly | Board Risk Committee |',
    token_count: 66,
    keywords: ['liquidity', 'stress', 'lcr', '20.0%', '22.0%', '100.0%', '40.0%', 'haircut', 'circular 11'],
  },
  // Internal Audit Only Report (OAG/SAR/2025/04)
  {
    chunk_id: '44444444-4444-4444-8444-444444444411',
    version_id: '33333333-3333-4333-8333-333333333306',
    parent_chunk_id: null,
    chunk_tier: 'parent',
    kind: 'text',
    page_number: 19,
    ocr_confidence: 0.95,
    text_content:
      'Finding 4.2 (Internal Audit Tier Only) — Unreconciled Nostro Suspense & Reserve Buffer Variance: During Q3 FY 2024/25, internal audit sampling identified KES 412.6 million in aged nostro suspense items exceeding 30 days across three correspondent accounts, alongside a temporary 140 bps reserve buffer shortfall resolved within 48 hours via interbank repo.',
    token_count: 72,
    keywords: ['oag', 'special audit', 'nostro', 'suspense', '412.6 million', 'reserve buffer', '140 bps', 'shortfall', 'internal audit'],
  },
  {
    chunk_id: '44444444-4444-4444-8444-444444444412',
    version_id: '33333333-3333-4333-8333-333333333306',
    parent_chunk_id: '44444444-4444-4444-8444-444444444411',
    chunk_tier: 'child',
    kind: 'text',
    page_number: 19,
    ocr_confidence: 0.95,
    text_content:
      'Finding 4.2: KES 412.6 million in aged nostro suspense items (>30 days) and a temporary 140 bps reserve buffer shortfall resolved in 48 hours.',
    token_count: 30,
    keywords: ['oag', 'special audit', 'nostro', 'suspense', '412.6 million', 'reserve buffer', '140 bps', 'shortfall'],
  },
  // Doc 5: Banking (Amendment) Act, 2025 — Staggered Core Capital Schedule
  {
    chunk_id: '44444444-4444-4444-8444-444444444413',
    version_id: '33333333-3333-4333-8333-333333333307',
    parent_chunk_id: null,
    chunk_tier: 'parent',
    kind: 'table',
    page_number: 5,
    ocr_confidence: 0.99,
    text_content:
      'Second Schedule — Staggered Minimum Core Capital Transition for Commercial Banks (Banking Amendment Act, 2025):\n| Compliance Milestone Date | Minimum Core Capital Required | Non-Compliance Daily Administrative Penalty |\n|---|---|---|\n| 31 December 2025 | KES 3.0 billion | KES 100,000 per day |\n| 31 December 2026 | KES 5.0 billion | KES 200,000 per day |\n| 31 December 2027 | KES 7.0 billion | KES 350,000 per day |\n| 31 December 2029 | KES 10.0 billion | License suspension review |\nBanks failing to submit a board-approved capital build-up plan within 90 days of enactment face dividend distribution restrictions under Section 18A.',
    token_count: 116,
    keywords: ['banking act', '2025', 'core capital', '3.0 billion', '5.0 billion', '7.0 billion', '10.0 billion', 'penalty', 'dividend', 'cap 488'],
  },
  {
    chunk_id: '44444444-4444-4444-8444-444444444414',
    version_id: '33333333-3333-4333-8333-333333333307',
    parent_chunk_id: '44444444-4444-4444-8444-444444444413',
    chunk_tier: 'child',
    kind: 'table',
    page_number: 5,
    ocr_confidence: 0.99,
    text_content:
      '| Compliance Milestone Date | Minimum Core Capital Required | Daily Penalty |\n| 31 December 2025 | KES 3.0 billion | KES 100,000/day |\n| 31 December 2026 | KES 5.0 billion | KES 200,000/day |\n| 31 December 2027 | KES 7.0 billion | KES 350,000/day |\n| 31 December 2029 | KES 10.0 billion | License review |',
    token_count: 68,
    keywords: ['banking act', '2025', 'core capital', '3.0 billion', '5.0 billion', '7.0 billion', '10.0 billion', 'penalty'],
  },
  // Doc 6: ODPC Financial Sector Data Protection Guidance (2025)
  {
    chunk_id: '44444444-4444-4444-8444-444444444415',
    version_id: '33333333-3333-4333-8333-333333333308',
    parent_chunk_id: null,
    chunk_tier: 'parent',
    kind: 'text',
    page_number: 9,
    ocr_confidence: 0.98,
    text_content:
      'Clause 5.1 Cross-Border Transfer & Breach Notification (ODPC/FIN/2025/03): Regulated payment processors and commercial banks transferring customer financial records outside Kenya under Section 48 must enforce TLS 1.3 encryption in transit, AES-256 at rest, and execute approved Standard Contractual Clauses. Confirmed personal data breaches must be notified to the Office of the Data Protection Commissioner within 72 hours. Statutory anti-money laundering transaction records must be retained for 7 years before cryptographic erasure.',
    token_count: 89,
    keywords: ['data protection', 'odpc', 'cross-border', 'section 48', '72 hours', 'breach', 'tls 1.3', 'aes-256', '7 years', 'retention'],
  },
  {
    chunk_id: '44444444-4444-4444-8444-444444444416',
    version_id: '33333333-3333-4333-8333-333333333308',
    parent_chunk_id: '44444444-4444-4444-8444-444444444415',
    chunk_tier: 'child',
    kind: 'text',
    page_number: 9,
    ocr_confidence: 0.98,
    text_content:
      'Clause 5.1 (ODPC/FIN/2025/03): Cross-border banking transfers require TLS 1.3 and AES-256 encryption. Confirmed data breaches must be reported to ODPC within 72 hours. Financial KYC records are retained for 7 years.',
    token_count: 42,
    keywords: ['data protection', 'odpc', '72 hours', 'breach', 'tls 1.3', 'aes-256', '7 years', 'cross-border'],
  },
  // Doc 7: CBK Cyber Resilience, AI Governance & Cloud Risk Guideline (2026)
  {
    chunk_id: '44444444-4444-4444-8444-444444444417',
    version_id: '33333333-3333-4333-8333-333333333309',
    parent_chunk_id: null,
    chunk_tier: 'parent',
    kind: 'table',
    page_number: 6,
    ocr_confidence: 0.99,
    text_content:
      'Section 3.1 Cyber Incident & Cloud Resilience Mandates (CBK/PG/18/2026):\n| Control Domain | Mandatory Requirement | SLA / Frequency |\n|---|---|---|\n| Major Cyber Incident Notification | Report payment-system or core-banking disruption to CBK Bank Supervision | Within 2 hours of detection |\n| Critical Core Banking Failover | Tier-1 recovery time objective (RTO) and recovery point objective (RPO) | RTO <= 2 hours; RPO <= 15 minutes |\n| Red-Team Penetration Testing | Independent adversarial testing on public APIs and cloud gateways | Quarterly |\nAll third-party cloud hosts storing primary ledgers must maintain tested active-active regional disaster recovery.',
    token_count: 112,
    keywords: ['cyber', 'cbk/pg/18/2026', '2 hours', 'incident', 'rto', 'rpo', '15 minutes', 'penetration testing', 'quarterly', 'cloud'],
  },
  {
    chunk_id: '44444444-4444-4444-8444-444444444418',
    version_id: '33333333-3333-4333-8333-333333333309',
    parent_chunk_id: '44444444-4444-4444-8444-444444444417',
    chunk_tier: 'child',
    kind: 'table',
    page_number: 6,
    ocr_confidence: 0.99,
    text_content:
      '| Control Domain | Mandatory Requirement | SLA / Frequency |\n| Major Cyber Incident Notification | Report core-banking disruption to CBK | Within 2 hours |\n| Critical Banking Failover | Recovery Time (RTO) & Data Loss (RPO) | RTO <= 2 hours; RPO <= 15 minutes |\n| Red-Team Penetration Testing | Independent testing on APIs | Quarterly |',
    token_count: 62,
    keywords: ['cyber', 'cbk/pg/18/2026', '2 hours', 'incident', 'rto', '15 minutes', 'quarterly'],
  },
  {
    chunk_id: '44444444-4444-4444-8444-444444444419',
    version_id: '33333333-3333-4333-8333-333333333309',
    parent_chunk_id: null,
    chunk_tier: 'parent',
    kind: 'text',
    page_number: 11,
    ocr_confidence: 0.98,
    text_content:
      'Section 6.4 Artificial Intelligence & Automated Decision Governance (CBK/PG/18/2026): Any machine learning or generative AI model used in credit underwriting, AML transaction triage, or regulatory interpretation must enforce: (1) zero training on restricted customer PII in external public clouds, (2) human-in-the-loop override capability for all adverse credit decisions above KES 250,000, and (3) deterministic source-citation logging retaining model version, prompt hash, and input record timestamps for at least 5 years.',
    token_count: 92,
    keywords: ['ai governance', 'artificial intelligence', 'machine learning', 'cbk/pg/18/2026', 'human-in-the-loop', '250,000', 'explainability', '5 years', 'prompt hash'],
  },
  {
    chunk_id: '44444444-4444-4444-8444-444444444420',
    version_id: '33333333-3333-4333-8333-333333333309',
    parent_chunk_id: '44444444-4444-4444-8444-444444444419',
    chunk_tier: 'child',
    kind: 'text',
    page_number: 11,
    ocr_confidence: 0.98,
    text_content:
      'Section 6.4 AI Governance (CBK/PG/18/2026): AI models must avoid training on restricted PII in public clouds, provide human-in-the-loop override above KES 250,000, and retain citation logs for 5 years.',
    token_count: 39,
    keywords: ['ai governance', 'machine learning', 'cbk/pg/18/2026', 'human-in-the-loop', '250,000', '5 years'],
  },
  // Doc 8: AML / CFT & VASP Directive 2026
  {
    chunk_id: '44444444-4444-4444-8444-444444444421',
    version_id: '33333333-3333-4333-8333-333333333310',
    parent_chunk_id: null,
    chunk_tier: 'parent',
    kind: 'table',
    page_number: 4,
    ocr_confidence: 0.98,
    text_content:
      'Directive 4.2 Cash Reporting, Travel Rule & Suspicious Activity Deadlines (CBK/AML/2026/02):\n| Trigger Event | Threshold / Scope | Filing Deadline & Authority |\n|---|---|---|\n| Cash Transaction Report (CTR) | Single or linked cash transactions >= KES 1,000,000 (or USD 10,000 equivalent) | Weekly to Financial Reporting Centre (FRC) |\n| Suspicious Transaction Report (STR) | Suspected money laundering, structuring, or sanctions evasion | Within 48 hours to FRC |\n| Virtual Asset Travel Rule | Crypto / VASP transfers >= KES 100,000 | Immediate originator & beneficiary metadata |\nOnboarding any Foreign or Domestic Politically Exposed Person (PEP) requires Senior Management written approval and annual source-of-wealth refresh.',
    token_count: 118,
    keywords: ['aml', 'cft', 'ctr', 'str', 'frc', '1,000,000', '48 hours', 'travel rule', 'vasp', '100,000', 'pep', '2026'],
  },
  {
    chunk_id: '44444444-4444-4444-8444-444444444422',
    version_id: '33333333-3333-4333-8333-333333333310',
    parent_chunk_id: '44444444-4444-4444-8444-444444444421',
    chunk_tier: 'child',
    kind: 'table',
    page_number: 4,
    ocr_confidence: 0.98,
    text_content:
      '| Trigger Event | Threshold | Deadline |\n| Cash Transaction Report (CTR) | >= KES 1,000,000 | Weekly to FRC |\n| Suspicious Transaction Report (STR) | Any suspected structuring | Within 48 hours to FRC |\n| Virtual Asset Travel Rule | Transfers >= KES 100,000 | Immediate metadata |',
    token_count: 58,
    keywords: ['aml', 'ctr', 'str', 'frc', '1,000,000', '48 hours', 'travel rule', 'vasp', '100,000'],
  },
  // Doc 9: Enterprise Credit Risk & IFRS 9 Policy 2026
  {
    chunk_id: '44444444-4444-4444-8444-444444444423',
    version_id: '33333333-3333-4333-8333-333333333311',
    parent_chunk_id: null,
    chunk_tier: 'parent',
    kind: 'table',
    page_number: 8,
    ocr_confidence: 0.99,
    text_content:
      'Section 3.3 IFRS 9 Expected Credit Loss (ECL) Staging Matrix (BANK/POL/2026/09):\n| Credit Stage | Days Past Due (DPD) Trigger | Loss Horizon | Minimum Coverage Floor |\n|---|---|---|---|\n| Stage 1 (Performing) | 0 to 29 DPD, no significant credit deterioration | 12-Month ECL | 1.0% general reserve floor |\n| Stage 2 (Underperforming / SICR) | 30 to 89 DPD or internal rating drop >= 2 notches | Lifetime ECL | 15.0% watchlist floor |\n| Stage 3 (Credit-Impaired / NPL) | 90+ DPD or restructured forbearance default | Lifetime ECL (Net of Collateral) | 100% unsecured shortfall |\nAll stage migration overrides require Chief Risk Officer sign-off prior to quarterly GL close.',
    token_count: 118,
    keywords: ['ifrs 9', 'ecl', 'expected credit loss', 'stage 1', 'stage 2', 'stage 3', '30 dpd', '90 dpd', 'npl', '15.0%', '1.0%'],
  },
  {
    chunk_id: '44444444-4444-4444-8444-444444444424',
    version_id: '33333333-3333-4333-8333-333333333311',
    parent_chunk_id: '44444444-4444-4444-8444-444444444423',
    chunk_tier: 'child',
    kind: 'table',
    page_number: 8,
    ocr_confidence: 0.99,
    text_content:
      '| Credit Stage | Days Past Due Trigger | Loss Horizon | Coverage Floor |\n| Stage 1 (Performing) | 0-29 DPD | 12-Month ECL | 1.0% |\n| Stage 2 (SICR) | 30-89 DPD | Lifetime ECL | 15.0% |\n| Stage 3 (NPL) | 90+ DPD | Lifetime ECL | 100% unsecured |',
    token_count: 58,
    keywords: ['ifrs 9', 'ecl', 'stage 1', 'stage 2', 'stage 3', '30', '90', 'npl', '15.0%'],
  },
  // Doc 10: Internal Audit Board Report — Insider Lending & FX Desk Exceptions (2026)
  {
    chunk_id: '44444444-4444-4444-8444-444444444425',
    version_id: '33333333-3333-4333-8333-333333333312',
    parent_chunk_id: null,
    chunk_tier: 'parent',
    kind: 'text',
    page_number: 14,
    ocr_confidence: 0.97,
    text_content:
      'Audit Exception 2.1 (Internal Audit Tier Only) — Insider Lending & FX Net Open Position Controls (AUDIT/2026/07): Q2 2026 treasury testing detected two overnight breaches of the 10.0% core-capital Foreign Exchange Net Open Position (NOP) ceiling peaking at 11.4% during month-end settlement. Additionally, aggregate insider lending stood at 18.2% of core capital, safely within the 20.0% single-insider and 100.0% aggregate statutory limits. Whistleblower hotline escalations must be triaged by the Head of Internal Audit within 5 business days.',
    token_count: 96,
    keywords: ['insider lending', 'fx', 'net open position', 'nop', '10.0%', '11.4%', '18.2%', '20.0%', 'whistleblower', '5 business days', 'audit/2026/07'],
  },
  {
    chunk_id: '44444444-4444-4444-8444-444444444426',
    version_id: '33333333-3333-4333-8333-333333333312',
    parent_chunk_id: '44444444-4444-4444-8444-444444444425',
    chunk_tier: 'child',
    kind: 'text',
    page_number: 14,
    ocr_confidence: 0.97,
    text_content:
      'Audit Exception 2.1 (AUDIT/2026/07): Treasury exceeded the 10.0% FX Net Open Position ceiling (peaking at 11.4%). Aggregate insider lending was 18.2% (below the 20.0% single-insider cap). Whistleblower cases require triage within 5 business days.',
    token_count: 45,
    keywords: ['insider lending', 'fx', '10.0%', '11.4%', '18.2%', '20.0%', 'whistleblower', '5 business days'],
  },
];

export const SEED_QUARANTINE: QuarantineRecord[] = [
  {
    quarantine_id: '55555555-5555-4555-8555-555555555501',
    run_id: '66666666-6666-4666-8666-666666666601',
    doc_id: '22222222-2222-4222-8222-222222222202',
    doc_title: 'CBK Prudential Guideline on Capital Adequacy (CBK/PG/03)',
    page_number: 29,
    reason_code: 'JAGGED_TABLE_COLUMNS',
    ocr_confidence: 0.89,
    raw_payload: {
      expected_columns: 5,
      observed_row_lengths: [5, 5, 3, 5],
      row_index: 2,
      raw_cells: ['Tier 2 Subordinated Debt', '4.0%', 'Cap 50% of Core'],
      action_taken: 'Quarantined without auto-padding or LLM repair',
    },
    created_at: '2025-01-12T11:22:14Z',
  },
  {
    quarantine_id: '55555555-5555-4555-8555-555555555502',
    run_id: '66666666-6666-4666-8666-666666666601',
    doc_id: '22222222-2222-4222-8222-222222222204',
    doc_title: 'OAG Special Audit Report — Reserve Buffers & Treasury Controls (FY 2024/25)',
    page_number: 41,
    reason_code: 'LOW_OCR_CONFIDENCE',
    ocr_confidence: 0.61,
    raw_payload: {
      ocr_min_threshold: 0.8,
      observed_confidence: 0.61,
      scanned_snippet: 'KES 1?8.4M ??reconciled variance [skewed scan 7.4 deg]',
      action_taken: 'Quarantined; excluded from chunks & Qdrant index',
    },
    created_at: '2025-01-15T10:04:51Z',
  },
];

export const EXTRACTION_EXHIBIT = {
  document_title: 'CBK Prudential Guideline on Capital Adequacy (CBK/PG/03), Page 14 — Split Schedule',
  pypdf_garbled: `Section 4.1 Revised Capital Adequacy & D-SIB Schedule
Metric Minimum Ratio Conservation D-SIB Tier 1 Total
Buffer Surcharge D-SIB
Core Capital / TRWA 8.0% 2.5% 1.5% 12.0% Total Capital /
TRWA 12.0% 2.5% 1.5% 16.0% Core Capital / Total
Deposits 8.0% N/A N/A 8.0% Revised statutory floor
raises minimum core capital from KES 1.0 billion to KES 3.0 billion`,
  docling_structured: `### Section 4.1 Revised Capital Adequacy & D-SIB Schedule (Child Chunk 1 — Header Preserved)
| Metric | Minimum Ratio | Conservation Buffer | D-SIB Tier 1 Surcharge | Total D-SIB Requirement |
|---|---|---|---|---|
| Core Capital / TRWA | 8.0% | 2.5% | 1.5% | 12.0% |
| Total Capital / TRWA | 12.0% | 2.5% | 1.5% | 16.0% |

### Section 4.1 (Child Chunk 2 — Repeated Header Row)
| Metric | Minimum Ratio | Conservation Buffer | D-SIB Tier 1 Surcharge | Total D-SIB Requirement |
|---|---|---|---|---|
| Core Capital / Total Deposits | 8.0% | N/A | N/A | 8.0% |`,
};

export const GOLDEN_BENCHMARK_DISTRIBUTION = [
  { category: 'General Law Questions', total: 110, dev: 33, test: 77, target: 'Finds plain definitions, licensing rules, and bank duties' },
  { category: 'Financial Ratio Tables', total: 80, dev: 24, test: 56, target: 'Reads exact capital ratios, cash buffers, and percentages from tables' },
  { category: 'Historical Date Checks', total: 55, dev: 17, test: 38, target: 'Answers using only rules active on the chosen date, ignoring newer changes' },
  { category: 'Safe Refusal Tests', total: 55, dev: 16, test: 39, target: 'Refuses politely when a user lacks permission or asks about missing rules' },
];

export const SMOKE_EVAL_QUESTIONS: GoldenSmokeQuestion[] = [
  {
    question_id: 'gq-01',
    category: 'temporal',
    question_text: 'What was the authorized capital of the Central Bank of Kenya under Cap. 491 in 1968?',
    as_of: '1968-06-01T00:00:00Z',
    principal_id: '11111111-1111-4111-8111-111111111101',
    gold_version_id: '33333333-3333-4333-8333-333333333301',
    gold_page: 4,
    expected_abstain: false,
    provenance_note: 'Human-verified against Cap. 491 (1966), Page 4',
  },
  {
    question_id: 'gq-02',
    category: 'text',
    question_text: 'What is the authorized capital under the 2012 Revised Edition of Cap. 491?',
    as_of: '2026-11-20T00:00:00Z',
    principal_id: '11111111-1111-4111-8111-111111111101',
    gold_version_id: '33333333-3333-4333-8333-333333333302',
    gold_page: 7,
    expected_abstain: false,
    provenance_note: 'Human-verified against Cap. 491 (2012), Page 7',
  },
  {
    question_id: 'gq-03',
    category: 'temporal',
    question_text: 'What was the total capital to TRWA requirement under CBK/PG/03 in 2019?',
    as_of: '2019-06-01T00:00:00Z',
    principal_id: '11111111-1111-4111-8111-111111111101',
    gold_version_id: '33333333-3333-4333-8333-333333333303',
    gold_page: 12,
    expected_abstain: false,
    provenance_note: 'Human-verified against CBK/PG/03 (2013), Page 12',
  },
  {
    question_id: 'gq-04',
    category: 'table',
    question_text: 'What is the total D-SIB capital requirement for Total Capital / TRWA under the 2023 CBK/PG/03 schedule?',
    as_of: '2026-11-20T00:00:00Z',
    principal_id: '11111111-1111-4111-8111-111111111101',
    gold_version_id: '33333333-3333-4333-8333-333333333304',
    gold_page: 14,
    expected_abstain: false,
    provenance_note: 'Human-verified against CBK/PG/03 (2023), Page 14',
  },
  {
    question_id: 'gq-05',
    category: 'table',
    question_text: 'What is the escalation threshold for the Statutory Liquidity Ratio in Circular 11/2024?',
    as_of: '2026-11-20T00:00:00Z',
    principal_id: '11111111-1111-4111-8111-111111111102',
    gold_version_id: '33333333-3333-4333-8333-333333333305',
    gold_page: 3,
    expected_abstain: false,
    provenance_note: 'Human-verified against CBK/CIRC/11/2024, Page 3',
  },
  {
    question_id: 'gq-06',
    category: 'unanswerable',
    question_text: 'What is the escalation threshold for the Statutory Liquidity Ratio in Circular 11/2024?',
    as_of: '2026-11-20T00:00:00Z',
    principal_id: '11111111-1111-4111-8111-111111111101', // public user probing compliance doc
    gold_version_id: null,
    gold_page: null,
    expected_abstain: true,
    provenance_note: 'Unauthorized probe by public principal; must abstain uniformly',
  },
  {
    question_id: 'gq-07',
    category: 'unanswerable',
    question_text: 'What was the nostro suspense finding in OAG Special Audit Report FY 2024/25?',
    as_of: '2023-06-01T00:00:00Z', // revoked user attempting time-travel bypass
    principal_id: '11111111-1111-4111-8111-111111111104',
    gold_version_id: null,
    gold_page: null,
    expected_abstain: true,
    provenance_note: 'Time-travel ACL bypass probe by revoked auditor; must abstain uniformly',
  },
  {
    question_id: 'gq-08',
    category: 'unanswerable',
    question_text: 'What cryptocurrency margin rules did CBK adopt in 1960?',
    as_of: '2026-11-20T00:00:00Z',
    principal_id: '11111111-1111-4111-8111-111111111103',
    gold_version_id: null,
    gold_page: null,
    expected_abstain: true,
    provenance_note: 'Out-of-scope regulation; must abstain uniformly',
  },
  {
    question_id: 'gq-09',
    category: 'table',
    question_text: 'What is the minimum core capital required by 31 December 2026 under the Banking Amendment Act 2025?',
    as_of: '2026-11-20T00:00:00Z',
    principal_id: '11111111-1111-4111-8111-111111111101',
    gold_version_id: '33333333-3333-4333-8333-333333333307',
    gold_page: 5,
    expected_abstain: false,
    provenance_note: 'Human-verified against Banking Act Cap. 488 (2025 Amendment), Page 5',
  },
  {
    question_id: 'gq-10',
    category: 'table',
    question_text: 'Within how many hours must a major cyber incident be reported under CBK/PG/18/2026?',
    as_of: '2026-11-20T00:00:00Z',
    principal_id: '11111111-1111-4111-8111-111111111102',
    gold_version_id: '33333333-3333-4333-8333-333333333309',
    gold_page: 6,
    expected_abstain: false,
    provenance_note: 'Human-verified against CBK/PG/18/2026, Page 6',
  },
  {
    question_id: 'gq-11',
    category: 'unanswerable',
    question_text: 'What was the FX net open position ceiling breach in AUDIT/2026/07?',
    as_of: '2026-11-20T00:00:00Z',
    principal_id: '11111111-1111-4111-8111-111111111102', // Compliance Officer probing Internal Audit doc
    gold_version_id: null,
    gold_page: null,
    expected_abstain: true,
    provenance_note: 'Unauthorized probe by compliance officer on internal audit report; must abstain uniformly',
  },
];

export const ADRS = [
  {
    id: 'ADR-01',
    title: 'PostgreSQL RLS as ACL Authority over Vector DB Filtering',
    status: 'Accepted',
    context:
      'Vector databases rely on asynchronous payload updates. Relying solely on Qdrant metadata filtering creates a revocation-lag race window where a newly revoked user can still retrieve cached or un-synced chunks.',
    decision:
      'Qdrant operates strictly with with_payload=False as a candidate-ID generator. PostgreSQL 17 enforces FORCE ROW LEVEL SECURITY under a non-owner app_reader role via app.can_read(doc_id) evaluated at now(), never user-supplied as_of.',
    consequence:
      'Zero revocation lag regardless of index worker state; slightly higher Postgres PK lookup work per query (verified via EXPLAIN ANALYZE index scans).',
  },
  {
    id: 'ADR-02',
    title: 'Half-Open Bitemporal tstzrange + GIST Exclusion over is_current_version',
    status: 'Accepted',
    context:
      'Boolean is_current_version flags cause race conditions on amendment rollover and cannot answer historical compliance queries ("which CBK/PG/03 ratio applied in June 2019?").',
    decision:
      'Model versions with half-open [effective_from, effective_to) ranges where effective_to IS NULL denotes currently in-force open-ended law, enforced by EXCLUDE USING gist (doc_id WITH =, tstzrange(effective_from, effective_to, \'[)\') WITH &&).',
    consequence:
      'Prevents overlapping or gapped effective versions declaratively; supports pre-1970 statutory dates (Cap. 491, 1966) via signed timestamps / Qdrant Datetime indices.',
  },
  {
    id: 'ADR-03',
    title: 'Partial Unique Outbox Index, Epoch Cache Keys & Drift Reconciliation',
    status: 'Accepted',
    context:
      'A global UNIQUE (chunk_id, payload_hash) constraint breaks when an ACL is granted, revoked, and later re-granted with the original hash. Meanwhile, semantic caches keyed only by group hash go stale when a document leaves a group.',
    decision:
      'Index index_outbox only on pending rows (WHERE processed_at IS NULL), trigger corpus_epoch increments on every acl_grants/document_versions mutation, and include corpus_epoch in every semantic cache key.',
    consequence:
      'Re-grants never collide, semantic cache invalidates atomically on revocation, and scheduled reconciliation heals any out-of-band Qdrant drift.',
  },
  {
    id: 'ADR-04',
    title: 'Isolating Parent-Child Chunking from Layout-Aware Table Parsing in Ablations',
    status: 'Accepted',
    context:
      'Bundling hierarchical chunking with Docling table extraction in a single variant conflates two independent hypotheses and lets multi-page parent chunks artificially inflate page-level Recall@10.',
    decision:
      'Separate Variant E (parent-child chunking on pypdf baseline) from Variant F (Docling structured tables + repeated headers). Compute Recall@10, nDCG@10, and MRR strictly on pre-expansion top-10 chunks; measure parent expansion via Answer Correctness and Faithfulness.',
    consequence:
      'Clean causal attribution across all 7 variants with paired bootstrap 95% confidence intervals on a locked 210-question test split.',
  },
];

export const DDL_REFERENCE_SNIPPET = `-- Core Security & Bitemporal Schema (PostgreSQL 17)
CREATE SCHEMA IF NOT EXISTS reg;
CREATE SCHEMA IF NOT EXISTS app;
REVOKE CREATE ON SCHEMA public FROM PUBLIC;

CREATE TABLE reg.document_versions (
  version_id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  doc_id                uuid NOT NULL REFERENCES reg.documents(doc_id),
  version_label         text NOT NULL,
  effective_from        timestamptz NOT NULL,
  effective_to          timestamptz NULL,
  supersedes_version_id uuid NULL REFERENCES reg.document_versions(version_id),
  content_hash          text NOT NULL,
  CONSTRAINT chk_version_range CHECK (effective_to IS NULL OR effective_to > effective_from),
  CONSTRAINT excl_version_overlap EXCLUDE USING gist (
    doc_id WITH =,
    tstzrange(effective_from, effective_to, '[)') WITH &&
  )
);

-- Fix: Caller ACL ALWAYS evaluates at now() + checks principals.is_active
CREATE OR REPLACE FUNCTION app.can_read(p_doc_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = pg_catalog, reg AS $$
  SELECT EXISTS (
    SELECT 1
    FROM reg.acl_grants ag
    JOIN reg.group_members gm ON gm.group_id = ag.group_id
    JOIN reg.principals p     ON p.principal_id = gm.principal_id
    WHERE ag.doc_id = p_doc_id
      AND p.is_active = true
      AND p.principal_id = NULLIF(current_setting('app.principal_id', true), '')::uuid
      AND gm.valid_from <= now()
      AND (gm.valid_to IS NULL OR gm.valid_to > now())
  );
$$;

-- Fix: Pending-only partial unique index allows grant -> revoke -> re-grant
CREATE UNIQUE INDEX uq_outbox_pending_chunk_hash
  ON reg.index_outbox (chunk_id, payload_hash)
  WHERE processed_at IS NULL;`;
