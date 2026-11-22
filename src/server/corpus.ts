import { chunkDocumentPages, type PageInput } from './chunker.ts';
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

export const SEED_VERSION_PAGES: Record<string, PageInput[]> = {
  // 1. Cap. 491 (1966 Original Enactment) — 4 pages
  '33333333-3333-4333-8333-333333333301': [
    {
      page_number: 1,
      text: 'Part I Preliminary & Commencement (Cap. 491, 1966 Original Enactment): This Act may be cited as the Central Bank of Kenya Act and shall come into operation on such day as the Minister may by notice in the Gazette appoint. In this Act, unless the context otherwise requires, "specified bank" means any licensed commercial bank carrying on banking business in Kenya under the Banking Ordinance.',
    },
    {
      page_number: 2,
      text: 'Part II Establishment & Corporate Status (Cap. 491, 1966): There is hereby established a bank to be known as the Central Bank of Kenya which shall be a body corporate with perpetual succession and a common seal. The head office of the Bank shall be in Nairobi, and the Bank may establish branches or appoint agents in any part of Kenya or abroad with approval of the Board.',
    },
    {
      page_number: 3,
      text: 'Section 11 Board of Directors & Governor Tenure (Cap. 491, 1966): The Board of Directors shall consist of the Governor, Deputy Governor, the Permanent Secretary to the Treasury, and four other directors appointed by the President for a term of four years. Every director shall declare any direct or indirect pecuniary interest in banking or credit contracts before deliberation.',
    },
    {
      page_number: 4,
      text: 'Section 4 (1966 Original Enactment): The principal object of the Bank shall be to regulate the issue of notes and coins, to assist in the development and maintenance of a sound monetary, credit and banking system in Kenya conducive to the orderly and balanced economic development of the country and the external stability of the currency. Authorized capital at commencement is fixed at twenty-six million shillings, paid from the Consolidated Fund in instalments approved by the Treasury.',
    },
  ],
  // 2. Cap. 491 (2012 Revised Edition) — 4 key statutory pages (incl. Page 7)
  '33333333-3333-4333-8333-333333333302': [
    {
      page_number: 1,
      text: 'Part I Short Title & Statutory Interpretation (Cap. 491, 2012 Revised Edition): "Board" means the Board of Directors of the Bank; "Minister" means the Cabinet Secretary responsible for finance; "bank" includes any institution licensed under the Banking Act or Microfinance Act participating in the national payment and clearing system.',
    },
    {
      page_number: 3,
      text: 'Section 4B Monetary Policy Committee (Cap. 491, 2012 Revised Edition): There shall be a Monetary Policy Committee responsible for formulating monetary policy. The Committee shall meet at least once every two months and publish its policy rate decision and inflation outlook report within seven days of each sitting.',
    },
    {
      page_number: 5,
      text: 'Section 22 Legal Tender & Currency Issuance (Cap. 491, 2012 Revised Edition): The unit of currency of Kenya shall be the Kenya shilling divided into one hundred cents. Only notes and coins issued by the Central Bank of Kenya and not demonetized by Gazette Notice shall constitute legal tender for payment of public and private debts.',
    },
    {
      page_number: 7,
      text: 'Section 4 & Section 4A (2012 Revised Edition): The principal object of the Bank shall be to formulate and implement monetary policy directed to achieving and maintaining stability in the general level of prices. Under Section 4A, the Bank shall foster the liquidity, solvency and proper functioning of a stable market-based financial system and formulate and implement foreign exchange policy. Section 8 fixes authorized capital at five billion shillings, and the Bank shall maintain a General Reserve Fund funded from annual net profits.',
    },
  ],
  // 3. CBK/PG/03 (2013–2023 Framework) — 4 pages (incl. Page 12 table)
  '33333333-3333-4333-8333-333333333303': [
    {
      page_number: 2,
      text: 'Section 1.1 Scope & Objective (CBK/PG/03, 2013 Framework): This Guideline applies to all institutions licensed under the Banking Act (Cap. 488) and establishes minimum capital adequacy standards aligned with Basel II/III core principles. Institutions must maintain capital commensurate with credit, market, and operational risk exposures on both solo and consolidated bases.',
    },
    {
      page_number: 5,
      text: 'Section 2.1 Components of Core Capital & Tier 2 Capital (CBK/PG/03, 2013): Core Capital (Tier 1) consists of permanent shareholders equity (paid-up ordinary shares), disclosed general reserves, and audited retained earnings, less goodwill, intangible assets, and deferred tax deductions. Tier 2 Supplementary Capital includes general loan loss reserves up to 1.25% of risk-weighted assets and approved subordinated debt capped at 50% of Core Capital.',
    },
    {
      page_number: 9,
      text: 'Section 2.6 Risk-Weighting Methodology (CBK/PG/03, 2013): Claims on the Government of Kenya and Central Bank of Kenya denominated and funded in Kenya shillings carry a 0% credit risk weight. Fully secured residential mortgage facilities meeting loan-to-value limits carry a 35% risk weight, whereas unrated commercial corporate facilities carry 100%.',
    },
    {
      page_number: 12,
      text: `Section 3.2 Capital Adequacy Ratios (2013 Framework, effective 2013-01-01 to 2023-06-30):
| Metric | Minimum Ratio | Capital Conservation Buffer | Total Requirement |
|---|---|---|---|
| Core Capital / Total Risk-Weighted Assets (TRWA) | 8.0% | 2.5% | 10.5% |
| Total Capital / Total Risk-Weighted Assets (TRWA) | 12.0% | 2.5% | 14.5% |
| Core Capital / Total Deposit Liabilities | 8.0% | N/A | 8.0% |
Minimum absolute paid-up core capital for commercial banks under the 2013 schedule is KES 1.0 billion, and institutions breaching the conservation buffer face mandatory restrictions on discretionary bonus and dividend payouts.`,
    },
  ],
  // 4. CBK/PG/03 (2023 Revised Capital Buffer) — 4 pages (incl. Page 14 table)
  '33333333-3333-4333-8333-333333333304': [
    {
      page_number: 3,
      text: 'Section 1.3 Supervisory Transition & D-SIB Designation (CBK/PG/03, 2023 Revised Edition): The Central Bank identifies Domestic Systemically Important Banks (D-SIBs) annually based on size, interconnectedness, substitutability, and cross-jurisdictional complexity. Designated D-SIB institutions are subject to an additional Common Equity Tier 1 surcharge.',
    },
    {
      page_number: 7,
      text: 'Section 2.4 Internal Capital Adequacy Assessment Process (ICAAP, 2023): Every commercial bank board must approve an annual forward-looking ICAAP stress-test submission demonstrating capital resilience over a 3-year horizon against severe macroeconomic and sectoral credit-concentration shocks.',
    },
    {
      page_number: 10,
      text: 'Section 3.1 Leverage Ratio & Large Exposure Cap (CBK/PG/03, 2023): In addition to risk-weighted adequacy ratios, institutions shall maintain a non-risk-based Tier 1 Leverage Ratio of at least 3.0% of total on-balance-sheet and off-balance-sheet exposures, and single-borrower credit exposure shall not exceed 25.0% of Core Capital.',
    },
    {
      page_number: 14,
      text: `Section 4.1 Revised Capital Adequacy & D-SIB Schedule (effective 2023-07-01, currently in force):
| Metric | Minimum Ratio | Conservation Buffer | D-SIB Tier 1 Surcharge | Total D-SIB Requirement |
|---|---|---|---|---|
| Core Capital / TRWA | 8.0% | 2.5% | 1.5% | 12.0% |
| Total Capital / TRWA | 12.0% | 2.5% | 1.5% | 16.0% |
| Core Capital / Total Deposits | 8.0% | N/A | N/A | 8.0% |
Revised statutory floor raises minimum core capital for commercial banks from KES 1.0 billion to KES 3.0 billion by December 2025 and KES 10.0 billion by December 2029.`,
    },
  ],
  // 5. CBK/CIRC/11/2024 — 4 pages (incl. Page 3 table)
  '33333333-3333-4333-8333-333333333305': [
    {
      page_number: 1,
      text: 'Circular 11/2024 Section 1.1 Directive Purpose (Compliance Officer Tier): This supervisory circular updates intraday liquidity monitoring, weekly statutory liquidity return templates (BSD-L1), and monthly Liquidity Coverage Ratio (LCR) stress haircuts for all licensed commercial banks and mortgage finance companies.',
    },
    {
      page_number: 2,
      text: 'Circular 11/2024 Section 1.4 High-Quality Liquid Assets (HQLA) Eligibility: Level 1 liquid assets include cash in vault, unrestricted balances held at the Central Bank of Kenya, and unencumbered Kenya Government Treasury Bills and Bonds valued at daily mark-to-market prices.',
    },
    {
      page_number: 3,
      text: `Circular 11/2024 Clause 2.4 — Statutory Liquidity & Stress Return Haircuts (Compliance Officer Tier):
| Asset / Outflow Bucket | Statutory Minimum / Haircut | Reporting Frequency | Escalation Threshold |
|---|---|---|---|
| Statutory Liquidity Ratio | 20.0% of total deposit liabilities | Weekly (BSD-L1) | Alert below 22.0% |
| 30-Day Liquidity Coverage Ratio (LCR) | 100.0% | Monthly (BSD-L2) | Alert below 105.0% |
| Uninsured Corporate Deposit Run-Off Haircut | 40.0% stress outflow factor | Monthly | Board Risk Committee |
Institutions falling below 22.0% statutory liquidity must file an intraday cash-flow contingency notice within 24 hours signed by the Chief Financial Officer and Head of Treasury.`,
    },
    {
      page_number: 4,
      text: 'Circular 11/2024 Section 3.1 Contingency Funding Plan Testing: Treasury Operations must execute quarterly reverse stress-test drills simulating simultaneous interbank repo market closure and 15% retail deposit withdrawal over five consecutive business days.',
    },
  ],
  // 6. OAG/SAR/2025/04 — 4 pages (incl. Page 19)
  '33333333-3333-4333-8333-333333333306': [
    {
      page_number: 4,
      text: 'Section 1.2 Audit Mandate & Scope (OAG Special Audit FY 2024/25, Internal Audit Tier Only): Audit procedures covered treasury cash-reserve maintenance, correspondent nostro reconciliations, overnight interbank borrowings, and Treasury Single Account settlement cutoffs from 1 July 2024 through 31 December 2024.',
    },
    {
      page_number: 9,
      text: 'Finding 2.3 Treasury Collateral & Haircut Governance (Internal Audit Tier Only): Automated collateral valuation feeds experienced a 6-hour pricing lag during October 2024 T-bond auctions. Management agreed to enforce dual-vendor mark-to-market verification before collateral release.',
    },
    {
      page_number: 14,
      text: 'Finding 3.1 SWIFT Alliance Access & Segregation of Duties (Internal Audit Tier Only): Four privileged user profiles retained dual payment-initiation and release roles in disaster-recovery testing. Emergency credentials must be vaulted with automatic 4-hour expiry.',
    },
    {
      page_number: 19,
      text: 'Finding 4.2 (Internal Audit Tier Only) — Unreconciled Nostro Suspense & Reserve Buffer Variance: During Q3 FY 2024/25, internal audit sampling identified KES 412.6 million in aged nostro suspense items exceeding 30 days across three correspondent accounts, alongside a temporary 140 bps reserve buffer shortfall resolved within 48 hours via interbank repo. Remediation sign-off is tracked monthly by the Board Audit Committee.',
    },
  ],
  // 7. Banking (Amendment) Act, 2025 — 4 pages (incl. Page 5 table)
  '33333333-3333-4333-8333-333333333307': [
    {
      page_number: 1,
      text: 'Section 1 Short Title & Enactment (Banking Amendment Act, 2025): This Act may be cited as the Banking (Amendment) Act, 2025, amending the Banking Act (Cap. 488) to strengthen institutional capital resilience, governance accountability, and staggered statutory minimum core capital compliance.',
    },
    {
      page_number: 2,
      text: 'Section 7 Amended Core Capital & Licensing Obligations (Banking Amendment Act, 2025): No institution shall be granted or hold a commercial banking license unless its paid-up core capital meets or exceeds the phased statutory minimum amounts prescribed in the Second Schedule.',
    },
    {
      page_number: 4,
      text: 'Section 18A Capital Restoration Plans & Merger Facilitation (Banking Amendment Act, 2025): Where an institution projects a capital shortfall against any upcoming December milestone, its Board must submit a binding capital injection, rights issue, or merger transaction timeline at least six months prior to the compliance deadline.',
    },
    {
      page_number: 5,
      text: `Second Schedule — Staggered Minimum Core Capital Transition for Commercial Banks (Banking Amendment Act, 2025):
| Compliance Milestone Date | Minimum Core Capital Required | Non-Compliance Daily Administrative Penalty |
|---|---|---|
| 31 December 2025 | KES 3.0 billion | KES 100,000 per day |
| 31 December 2026 | KES 5.0 billion | KES 200,000 per day |
| 31 December 2027 | KES 7.0 billion | KES 350,000 per day |
| 31 December 2029 | KES 10.0 billion | License suspension review |
Banks failing to submit a board-approved capital build-up plan within 90 days of enactment face dividend distribution restrictions under Section 18A.`,
    },
  ],
  // 8. ODPC/FIN/2025/03 — 4 pages (incl. Page 9)
  '33333333-3333-4333-8333-333333333308': [
    {
      page_number: 2,
      text: 'Clause 1.2 Applicability to Financial Institutions (ODPC/FIN/2025/03): This Guidance Note applies to commercial banks, digital credit providers, mobile-money operators, and payment gateways acting as Data Controllers or Data Processors for customer KYC, biometric, credit-bureau, and payment records.',
    },
    {
      page_number: 5,
      text: 'Clause 3.1 Lawful Basis, Consent & Automated Credit Scoring (ODPC/FIN/2025/03): Institutions using automated profiling to assess loan eligibility must disclose plain-language adverse decision factors to applicants and provide an accessible human-review channel within 7 business days of request.',
    },
    {
      page_number: 7,
      text: 'Clause 4.2 Data Protection Impact Assessments (DPIA, ODPC/FIN/2025/03): Prior to launching any cloud AI model, open-banking API, or biometric onboarding workflow, institutions must file a documented Data Protection Impact Assessment reviewed by their designated Data Protection Officer.',
    },
    {
      page_number: 9,
      text: 'Clause 5.1 Cross-Border Transfer & Breach Notification (ODPC/FIN/2025/03): Regulated payment processors and commercial banks transferring customer financial records outside Kenya under Section 48 must enforce TLS 1.3 encryption in transit, AES-256 at rest, and execute approved Standard Contractual Clauses. Confirmed personal data breaches must be notified to the Office of the Data Protection Commissioner within 72 hours. Statutory anti-money laundering transaction records must be retained for 7 years before cryptographic erasure.',
    },
  ],
  // 9. CBK/PG/18/2026 — 5 pages (incl. Page 6 table & Page 11 AI Governance)
  '33333333-3333-4333-8333-333333333309': [
    {
      page_number: 2,
      text: 'Section 1.2 Board Cyber Oversight & CISO Independence (CBK/PG/18/2026): Regulated institutions shall appoint an independent Chief Information Security Officer (CISO) with direct reporting access to the Board Risk Committee and conduct annual board-level cyber crisis tabletop simulations.',
    },
    {
      page_number: 4,
      text: 'Section 2.3 Zero-Trust Identity & Privileged Access Management (CBK/PG/18/2026): Phishing-resistant multi-factor authentication (FIDO2 or hardware tokens) is mandatory for all administrative cloud consoles, core-banking database sessions, and SWIFT payment terminals.',
    },
    {
      page_number: 6,
      text: `Section 3.1 Cyber Incident & Cloud Resilience Mandates (CBK/PG/18/2026):
| Control Domain | Mandatory Requirement | SLA / Frequency |
|---|---|---|
| Major Cyber Incident Notification | Report payment-system or core-banking disruption to CBK Bank Supervision | Within 2 hours of detection |
| Critical Core Banking Failover | Tier-1 recovery time objective (RTO) and recovery point objective (RPO) | RTO <= 2 hours; RPO <= 15 minutes |
| Red-Team Penetration Testing | Independent adversarial testing on public APIs and cloud gateways | Quarterly |
All third-party cloud hosts storing primary ledgers must maintain tested active-active regional disaster recovery.`,
    },
    {
      page_number: 8,
      text: 'Section 4.2 Third-Party Cloud Exit Strategy & Escrow Controls (CBK/PG/18/2026): Critical cloud SaaS and IaaS contracts must include data portability guarantees, sovereign audit rights for CBK inspectors, and quarterly configuration-drift scans.',
    },
    {
      page_number: 11,
      text: 'Section 6.4 Artificial Intelligence & Automated Decision Governance (CBK/PG/18/2026): Any machine learning or generative AI model used in credit underwriting, AML transaction triage, or regulatory interpretation must enforce: (1) zero training on restricted customer PII in external public clouds, (2) human-in-the-loop override capability for all adverse credit decisions above KES 250,000, and (3) deterministic source-citation logging retaining model version, prompt hash, and input record timestamps for at least 5 years.',
    },
  ],
  // 10. CBK/AML/2026/02 — 4 pages (incl. Page 4 table)
  '33333333-3333-4333-8333-333333333310': [
    {
      page_number: 1,
      text: 'Directive 1.1 Risk-Based AML/CFT & VASP Supervision (CBK/AML/2026/02): Commercial banks, mobile payment providers, and licensed Virtual Asset Service Providers (VASPs) must maintain dynamic customer risk scoring updated continuously on sanctions designations and beneficial-ownership changes.',
    },
    {
      page_number: 2,
      text: 'Directive 2.3 Enhanced Customer Due Diligence & Beneficial Ownership (CBK/AML/2026/02): For all corporate entities, trusts, and nominee arrangements, institutions must verify ultimate natural-person beneficial owners holding 10% or more equity or effective voting control prior to account activation.',
    },
    {
      page_number: 4,
      text: `Directive 4.2 Cash Reporting, Travel Rule & Suspicious Activity Deadlines (CBK/AML/2026/02):
| Trigger Event | Threshold / Scope | Filing Deadline & Authority |
|---|---|---|
| Cash Transaction Report (CTR) | Single or linked cash transactions >= KES 1,000,000 (or USD 10,000 equivalent) | Weekly to Financial Reporting Centre (FRC) |
| Suspicious Transaction Report (STR) | Suspected money laundering, structuring, or sanctions evasion | Within 48 hours to FRC |
| Virtual Asset Travel Rule | Crypto / VASP transfers >= KES 100,000 | Immediate originator & beneficiary metadata |
Onboarding any Foreign or Domestic Politically Exposed Person (PEP) requires Senior Management written approval and annual source-of-wealth refresh.`,
    },
    {
      page_number: 6,
      text: 'Directive 5.1 Sanctions Screening & Tipping-Off Prohibition (CBK/AML/2026/02): Real-time name and wallet screening against UN Security Council, OFAC, and domestic targeted financial sanctions lists must complete prior to cross-border settlement release, and staff are strictly prohibited from disclosing STR filings to customers.',
    },
  ],
  // 11. BANK/POL/2026/09 (IFRS 9 Policy) — 4 pages (incl. Page 8 table)
  '33333333-3333-4333-8333-333333333311': [
    {
      page_number: 2,
      text: 'Section 1.4 Credit Risk Governance & Underwriting Authority (BANK/POL/2026/09): All corporate credit facilities above KES 50 million require independent Credit Risk sign-off, debt-service coverage verification, and perfection of perfected security charges prior to disbursement.',
    },
    {
      page_number: 5,
      text: 'Section 2.2 Significant Increase in Credit Risk (SICR) Qualitative Triggers (BANK/POL/2026/09): Beyond days-past-due delinquency counters, exposures exhibiting debt-restructuring requests, covenant breaches, sector downturns, or two-notch internal rating downgrades must immediately migrate from Stage 1 to Stage 2.',
    },
    {
      page_number: 8,
      text: `Section 3.3 IFRS 9 Expected Credit Loss (ECL) Staging Matrix (BANK/POL/2026/09):
| Credit Stage | Days Past Due (DPD) Trigger | Loss Horizon | Minimum Coverage Floor |
|---|---|---|---|
| Stage 1 (Performing) | 0 to 29 DPD, no significant credit deterioration | 12-Month ECL | 1.0% general reserve floor |
| Stage 2 (Underperforming / SICR) | 30 to 89 DPD or internal rating drop >= 2 notches | Lifetime ECL | 15.0% watchlist floor |
| Stage 3 (Credit-Impaired / NPL) | 90+ DPD or restructured forbearance default | Lifetime ECL (Net of Collateral) | 100% unsecured shortfall |
All stage migration overrides require Chief Risk Officer sign-off prior to quarterly GL close.`,
    },
    {
      page_number: 10,
      text: 'Section 4.1 Collateral Haircuts & Write-Off Policy (BANK/POL/2026/09): Forced-sale real-estate valuations must be refreshed every 24 months by panel valuers, and unsecured non-performing facilities past 360 DPD without active legal recovery must be written off against provisions.',
    },
  ],
  // 12. AUDIT/2026/07 (Internal Audit Board Report) — 4 pages (incl. Page 14)
  '33333333-3333-4333-8333-333333333312': [
    {
      page_number: 3,
      text: 'Audit Section 1.1 Executive Mandate (AUDIT/2026/07, Internal Audit Tier Only): Internal Audit evaluated FX dealing room limit compliance, insider-lending director disclosures under Section 11 of the Banking Act, and whistleblower governance across Q1–Q2 2026.',
    },
    {
      page_number: 7,
      text: 'Audit Section 1.5 Dealing Room Voice Logging & Deal-Ticket Integrity (AUDIT/2026/07): Sample testing of 120 interbank spot and forward FX tickets confirmed accurate timestamp matching between Bloomberg Reuters dealing feeds and treasury back-office blotters.',
    },
    {
      page_number: 10,
      text: 'Audit Section 1.8 Related-Party Register Completeness (AUDIT/2026/07): Board Credit Committee minutes confirmed quarterly verification of director, senior officer, and associate exposures at arm-length commercial interest rates.',
    },
    {
      page_number: 14,
      text: 'Audit Exception 2.1 (Internal Audit Tier Only) — Insider Lending & FX Net Open Position Controls (AUDIT/2026/07): Q2 2026 treasury testing detected two overnight breaches of the 10.0% core-capital Foreign Exchange Net Open Position (NOP) ceiling peaking at 11.4% during month-end settlement. Additionally, aggregate insider lending stood at 18.2% of core capital, safely within the 20.0% single-insider and 100.0% aggregate statutory limits. Whistleblower hotline escalations must be triaged by the Head of Internal Audit within 5 business days.',
    },
  ],
};

function buildSeedChunksFromPages(): DocumentChunk[] {
  const allChunks: DocumentChunk[] = [];
  for (const ver of SEED_VERSIONS) {
    const doc = SEED_DOCUMENTS.find((d) => d.doc_id === ver.doc_id);
    const pages = SEED_VERSION_PAGES[ver.version_id];
    if (!doc || !pages) continue;
    const chunked = chunkDocumentPages({
      doc_id: doc.doc_id,
      doc_title: doc.title,
      version_id: ver.version_id,
      citation_code: doc.citation_code,
      pages,
      run_id: '66666666-6666-4666-8666-666666666600',
      now_iso: doc.created_at,
      deterministic_seed_prefix: `seed:${ver.version_id}`,
      first_parent_id:
        ver.version_id === '33333333-3333-4333-8333-333333333301'
          ? '44444444-4444-4444-8444-444444444401'
          : undefined,
      ocr_confidence: 0.98,
    });
    allChunks.push(...chunked.parentChunks, ...chunked.childChunks);
  }
  return allChunks;
}

export const SEED_CHUNKS: DocumentChunk[] = buildSeedChunksFromPages();

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
