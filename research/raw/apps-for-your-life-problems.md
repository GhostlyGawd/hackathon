# Apps for Your Life: evidence-first problem atlas

The strongest white space is not generic “life assistance.” It is the moment a person must prove, reconcile, or act on consequential information scattered across institutions that do not share a source of truth.

Evidence labels:

- **Prevalence:** representative or administrative data.
- **Mechanism:** research showing how the failure occurs.
- **Report/anecdote:** authentic evidence that establishes existence, not prevalence.
- **Confidence:** confidence that the recurring failure is real as framed.

## Ranked shortlist

Scores are 1–5; **poor substitutes = 5** means current alternatives are especially bad. “Model-native leverage” only measures whether the problem contains heterogeneous language, documents, rules, and contradictions—it does not presume a product.

| Rank | Failure event | Severity | Frequency | Poor substitutes | Model-native leverage | Demo legibility | Total |
|---|---|---:|---:|---:|---:|---:|---:|
| 1 | Patient must contest a health-insurance denial before care is delayed | 5 | 5 | 5 | 5 | 5 | **25** |
| 2 | Eligible enrollee loses benefits for a procedural renewal failure | 5 | 5 | 5 | 5 | 5 | **25** |
| 3 | Family caregiver must coordinate a plan no system represents completely | 5 | 5 | 5 | 5 | 4 | **24** |
| 4 | Renter must disprove erroneous hidden tenant-screening data | 5 | 4 | 5 | 5 | 5 | **24** |
| 5 | Patient must reconcile contradictory medications immediately after discharge | 5 | 4 | 4 | 5 | 5 | **23** |

**Highest-uncertainty wildcard:** death administration. It also scores 23, has unusually poor substitutes and clear cross-institution friction, but quantitative U.S. burden evidence is thinner than for medication reconciliation.

---

## 1. Contesting a health-insurance denial before care is lost

- **Actor / trigger / job:** An insured patient or caregiver receives a denied claim, prior-authorization denial, or unexpected EOB and must establish whether recommended care is covered, what evidence is missing, and what deadline applies.
- **Current workaround:** Read plan documents and the EOB, call the insurer and provider repeatedly, ask family for help, and possibly file a formal appeal.
- **Observable harm:** Delayed or foregone treatment, health decline, and unexpected out-of-pocket cost.
- **Why current tools fail:** The relevant facts are split among clinical notes, billing codes, plan language, authorization criteria, and correspondence. A denial letter is not a complete representation of the case.
- **Evidence:** In a nationally representative 2023 KFF survey, 58% of insured adults reported an insurance problem; among those with problems, 17% could not receive recommended care, 15% reported health decline, 28% paid more than expected, and 31% eventually gave up trying to resolve it. ([KFF, June 2023](https://www.kff.org/affordable-care-act/kff-survey-of-consumer-experiences-with-health-insurance/)) In June 2026, HHS OIG found Medicare Advantage plans denied 12% of reviewed skilled-nursing admission requests; only 18% of denials were appealed, but 95% of those appeals were overturned. ([HHS OIG, June 2026](https://oig.hhs.gov/reports/all/2026/medicare-advantage-organizations-overturned-nearly-all-appealed-prior-authorization-denials-for-skilled-nursing-facility-admission-raising-concerns-about-initial-denials/))
- **Confidence:** **High.** Representative prevalence plus current administrative evidence.
- **Contradiction:** **People need a timely, evidence-based coverage decision, but current systems force sick people to reconstruct the insurer’s reasoning from fragmented records after the denial.**

## 2. Finding a genuinely available in-network behavioral-health provider

- **Actor / trigger / job:** A Medicare Advantage or Medicaid enrollee needs behavioral-health care and is told to select an in-network clinician.
- **Current workaround:** Search the plan directory, call entries one by one, discover wrong locations or nonparticipation, then repeat or ask the plan and existing clinicians for leads.
- **Observable harm:** Delayed or abandoned treatment, repeated disclosure of sensitive information, and uncompensated search time.
- **Why current tools fail:** Directories represent contractual listings, not reliable present-tense availability, willingness to accept the plan, location, specialty fit, or appointment capacity.
- **Evidence:** HHS OIG’s review of 33 Medicare Advantage and 19 Medicaid plans in 10 counties found that more than half of MA plans and one-third of Medicaid plans had networks where at least one-third of listed providers were inactive; most inactive providers should not have been listed. This is strong mechanism evidence but not a national prevalence estimate. ([HHS OIG, October 2025](https://oig.hhs.gov/reports/all/2025/many-medicare-advantage-and-medicaid-managed-care-plans-have-limited-behavioral-health-provider-networks-and-inactive-providers/)) KFF found 43% of insured adults in fair or poor mental health did not receive services or medication they thought they needed. ([KFF, June 2023](https://www.kff.org/affordable-care-act/kff-survey-of-consumer-experiences-with-health-insurance/))
- **Confidence:** **High** that the failure exists; **medium** on nationwide directory-error prevalence.
- **Contradiction:** **People need to locate a clinician who can actually treat them now, but current systems force them to interrogate a directory of nominal relationships.**

## 3. Reconciling medication instructions after hospital discharge

- **Actor / trigger / job:** An older adult, polypharmacy patient, or caregiver arrives home and discovers that the discharge list, old medication bottles, pharmacy record, and portal do not agree.
- **Current workaround:** Compare lists manually, infer which medications were stopped or changed, and call the pharmacist, hospital, primary-care office, or home-health nurse.
- **Observable harm:** Wrong dose, omitted or duplicated drugs, adverse drug events, calls, office visits, emergency care, or rehospitalization.
- **Why current tools fail:** Each list is a partial snapshot produced at a different moment; electronic transmission can move discrepancies without resolving which regimen is intended.
- **Evidence:** An AHRQ-reported study of 212 hospital-to-home patients found 89% had at least one discrepancy and 40.7% of discrepancies could potentially contribute to an adverse drug event. The magnitude is from a specific, older cohort, but the failure types include conflicting provider information, incomplete discharge instructions, and incorrect dose or labels. ([AHRQ evidence report](https://www.ahrq.gov/patient-safety/reports/liability/neumiller.html)) A 2024 study found electronic transmission reduced drug-level discrepancies but did not reduce the proportion of patients affected. ([PubMed, February 2024](https://pubmed.ncbi.nlm.nih.gov/37934347/))
- **Confidence:** **High** on recurrence and clinical significance; **medium** on a single universal prevalence estimate.
- **Contradiction:** **People need one unambiguous medication plan at the moment they resume self-care, but current systems give them several conflicting snapshots and make them determine which is authoritative.**

## 4. Coordinating complex care across relatives, clinicians, and paid caregivers

- **Actor / trigger / job:** A family caregiver for an older adult, person with dementia, or medically complex child must communicate a change from a visit, hospitalization, or home-care shift to everyone responsible for acting on it.
- **Current workaround:** Attend visits when possible, relay information verbally, keep notebooks or spreadsheets, use group texts, call offices, and sometimes share the patient’s portal credentials.
- **Observable harm:** Missed medication, delayed care, repeated procedures, avoidable emergency use, caregiver work disruption, financial strain, and chronic stress.
- **Why current tools fail:** Clinical systems are organized around encounters and the patient-provider dyad. They do not systematically identify every care partner, their authority, what each person needs to know, or whether a handoff was understood.
- **Evidence:** A representative 2025 AARP/NAC study estimated 63 million U.S. caregivers; nearly one in four provided 40+ hours weekly, almost half reported major financial impact, and over half managed complex medical or nursing tasks while only just over 20% received formal training. ([AARP/NAC, July 2025](https://www.aarp.org/press/releases/2025-07-24-new-report-reveals-crisis-point-for-americas-63-million-family-caregivers.html)) A 2025 systematic review found caregivers of medically complex children repeatedly became de facto coordinators because of poor communication, fragmented services, and excessive paperwork, with reported missed medications and delayed care. ([Systematic review, 2025](https://pmc.ncbi.nlm.nih.gov/articles/PMC12480434/)) Portal proxy access is often onerous enough that families use the patient’s credentials, undermining privacy and accountability. ([JMIR/PubMed, June 2024](https://pubmed.ncbi.nlm.nih.gov/38935963/))
- **Confidence:** **High.**
- **Contradiction:** **People need a shared, current care plan with clear responsibility, but current systems force one unpaid relative to act as the integration layer among institutions and people.**

## 5. Understanding high-stakes medical instructions without strong English proficiency

- **Actor / trigger / job:** A patient with limited English proficiency receives ED discharge instructions, medication directions, return precautions, or treatment-consent material and must understand what to do safely.
- **Current workaround:** Request an interpreter, rely on a family member or child, use a translation app, or attempt to interpret English paperwork after leaving.
- **Observable harm:** Medication errors, missed warning signs, unplanned return visits, invalid consent, or serious clinical injury.
- **Why current tools fail:** Interpreter availability is inconsistent; written material often remains English-only; literal translation does not guarantee comprehension; low-resource languages receive weaker support.
- **Evidence:** The 2023 ACS reports 5.72 million limited-English-speaking households; Spanish alone had 17.6 million people age five or older who spoke English less than “very well.” ([U.S. Census, 2023](https://data.census.gov/table/ACSDT1Y2023.B16001)) AHRQ identifies discharge, medication reconciliation, and informed consent as high-risk scenarios and documents serious harm when competent interpretation is absent. ([AHRQ](https://www.ahrq.gov/health-literacy/professional-training/lepguide/chapter1.html)) In a 2026 English-Bengali cancer-consent study, only 15.7% of 121 participants understood treatment intent after reading translated booklets; machine translation introduced 11 meaning-changing errors versus one in professional translation. This is setting-specific, not a population estimate. ([PubMed, 2026](https://pubmed.ncbi.nlm.nih.gov/41824083/))
- **Confidence:** **High** on the safety problem; **medium** on current failure rates across institutions and languages.
- **Contradiction:** **People need actionable comprehension in their own language, but current systems force them to choose among unavailable interpreters, English paperwork, and translations whose accuracy they cannot evaluate.**

## 6. Completing a high-stakes digital form with a disability

- **Actor / trigger / job:** A blind, low-vision, keyboard-only, cognitively disabled, deaf, or motor-disabled person encounters a government, health, housing, voting, or transportation form and must complete it independently.
- **Current workaround:** Fight through the interface with assistive technology, call the agency, visit in person, abandon the task, or disclose private information to a sighted helper.
- **Observable harm:** Delayed or denied services, loss of privacy and independence, missed deadlines, or exclusion from civic and medical processes.
- **Why current tools fail:** Missing labels, broken focus behavior, inaccessible validation, third-party widgets, and incorrect ARIA can make the functional task impossible even when content is technically online.
- **Evidence:** WebAIM’s February 2025 automated scan found detectable WCAG failures on 94.8% of one million popular home pages, with 34.2% of form inputs improperly labeled. Automated scans cover only a subset of barriers and homepage results do not measure task abandonment. ([WebAIM, March 2025](https://webaim.org/projects/million/2025)) DOJ’s 2024 Title II rule explicitly cites inaccessible transit, voter-registration, and university services as barriers requiring enforceable standards. ([U.S. DOJ, April 2024](https://www.justice.gov/archives/opa/pr/justice-department-publish-final-rule-strengthen-web-and-mobile-app-access-people))
- **Confidence:** **High** that barriers are widespread; **medium** on the frequency of complete task blockage.
- **Contradiction:** **People need independent, private access to essential services, but current systems force them to seek human assistance because the digital path does not preserve the semantics their assistive technology requires.**

## 7. Retaining Medicaid during an eligibility renewal

- **Actor / trigger / job:** An eligible Medicaid enrollee receives a renewal notice, document request, or termination caused by missing information and must preserve uninterrupted coverage.
- **Current workaround:** Find the notice in time, submit income and household documents by mail or portal, call the state, and reapply or appeal if terminated.
- **Observable harm:** Coverage gaps, delayed treatment, cycling off and back onto Medicaid, worse health outcomes, and higher program cost.
- **Why current tools fail:** Agencies may request information already available to government, assess eligibility at the wrong household level, rely on stale contact information, or treat a procedural nonresponse as loss of eligibility.
- **Evidence:** GAO found compliance problems in almost every state during the 2023–24 unwinding. Failure to conduct individual-level reviews in 29 states caused about 420,000 eligible people, including children, to lose coverage. ([GAO-24-106883, July 2024](https://www.gao.gov/products/gao-24-106883)) CMS materials reported that, as of February 2024, 70% of unwinding disenrollments were procedural. This extraordinary unwinding period is not a clean estimate of normal annual-renewal failure rates. ([CMS, 2024](https://www.cms.gov/files/document/all-tribes-webinar-best-practices-and-lessons-learned-improving-health-coverage-tribal-communities.pdf))
- **Confidence:** **High** on the mechanism and demonstrated harm; **medium** on post-unwinding baseline frequency.
- **Contradiction:** **People need eligibility determined from the best available facts, but current systems force continued coverage to depend on successfully repeating evidence the state may already possess.**

## 8. Determining whether an urgent payment request is authentic before money moves

- **Actor / trigger / job:** A consumer receives a plausible bank, government, employer, merchant, investment, or family impersonation and is pressured to transfer money immediately.
- **Current workaround:** Search the message, call a known number, ask family or bank staff, inspect warnings, or report the event after payment.
- **Observable harm:** Irrecoverable savings, debt, loss of housing security, and psychological trauma.
- **Why current tools fail:** The attack crosses text, phone, email, social media, spoofed sites, and payment rails. Generative voice and imagery weaken familiar authenticity cues, while “authorized” transfers often fall outside reimbursement obligations.
- **Evidence:** The FTC reported about **$16 billion** in fraud losses in 2025, including **$3.5 billion** from imposter scams; reported figures understate total harm. ([FTC, June 2026](https://www.ftc.gov/news-events/news/press-releases/2026/06/ftc-data-show-people-reported-losing-3-point-5-billion-imposter-scams-2025)) GAO found financial institutions generally are not federally required to reimburse fraudulently induced payments because the victim authorized them, and that generative AI makes scams harder to detect. ([GAO-24-107107, July 2024](https://www.gao.gov/products/gao-24-107107))
- **Confidence:** **High.**
- **Contradiction:** **People need authenticity established before an irreversible transaction, but current systems force each person to judge a cross-channel adversary using isolated content cues and generic warnings.**

## 9. Correcting hidden tenant-screening errors before losing housing

- **Actor / trigger / job:** A renter is rejected, charged more, or required to obtain a co-signer because of a tenant-screening report and must discover what data was used and correct errors quickly.
- **Current workaround:** Obtain the report within the legal window, compare court and credit records, contact the screening firm, creditors and courts, document the dispute, and ask the landlord to reconsider.
- **Observable harm:** Housing denial, repeated application fees, temporary housing expense, higher deposits or rent, and prolonged instability.
- **Why current tools fail:** Reports can merge identities, retain outdated records, and compress unverified inputs into opaque recommendations. Renters may never receive the required adverse-action notice or underlying data lineage.
- **Evidence:** GAO reported that of about 26,700 CFPB tenant-screening complaints from January 2019 through September 2022, about 17,200 concerned inaccurate information; complaint counts demonstrate scale but lack a denominator. ([GAO-25-107196, August 2025](https://www.gao.gov/products/gao-25-107196)) CFPB’s analysis of more than 24,000 complaints found wrong-person, outdated, and uncorrected criminal and eviction information, along with absent adverse-action notices. ([CFPB, November 2022](https://www.consumerfinance.gov/archive/newsroom/cfpb-reports-highlight-problems-with-tenant-background-checks/))
- **Confidence:** **High** on the failure mechanism; **medium** on population prevalence.
- **Contradiction:** **People need a timely chance to contest the facts deciding whether they get a home, but current systems force them to reverse-engineer an opaque report only after the housing decision.**

## 10. Administering a life across institutions immediately after a death

- **Actor / trigger / job:** An executor, surviving spouse, or adult child must discover accounts, establish authority, notify organizations, claim benefits, stop or transfer services, pay debts, and meet legal deadlines.
- **Current workaround:** Order multiple death certificates, search mail and devices, maintain a checklist or spreadsheet, and contact banks, insurers, utilities, pensions, employers, government agencies, and platforms separately.
- **Observable harm:** Missed benefits or deadlines, frozen funds, continued charges, redundant paperwork, professional fees, and significant burden during acute grief.
- **Why current tools fail:** There is no authoritative inventory of the deceased person’s relationships, and every institution applies different identity, authority, death-certificate, account-access, and MFA rules.
- **Evidence:** The U.S. recorded 3,072,666 deaths in 2024, establishing recurring scale but not burden per estate. ([CDC final 2024 data](https://www.cdc.gov/nchs/nvss/deaths.htm)) A 2023 qualitative study specifically documents fragmented “death administration” and participants’ desire for one place that handles the process; qualitative evidence proves experience, not prevalence. ([University of Sheffield research](https://eprints.whiterose.ac.uk/id/eprint/201020/)) The UK’s current Tell Us Once service covers government bodies, but bereaved people must still notify banks, mortgage and insurance providers, utilities, landlords, and other private organizations individually. ([GOV.UK](https://www.gov.uk/after-a-death/report-without-tell-us-once))
- **Confidence:** **Medium-high** on the recurring event; **medium** on measured U.S. burden.
- **Contradiction:** **People need one coherent transition of legal and financial responsibility, but current systems force a grieving person to rediscover and negotiate every relationship independently.**

## 11. Understanding and responding correctly to an IRS notice

- **Actor / trigger / job:** A taxpayer receives an audit, disallowance, balance, identity-verification, or changed-return notice and must identify the issue, evidence, response channel, and deadline.
- **Current workaround:** Search by notice number, compare the notice with the return, call the IRS, gather documents, mail or fax responses, or hire a tax professional.
- **Observable harm:** Lost refunds or appeal rights, penalties and interest, collection action, representation cost, and prolonged uncertainty.
- **Why current tools fail:** Notice language can omit critical legal consequences; the taxpayer’s records, IRS rationale, procedural posture, and response history live in different systems and paper channels.
- **Evidence:** The National Taxpayer Advocate’s 2025 report says confusing or incomplete disallowance notices jeopardize refunds and judicial-review rights; it also documents persistent paper processing and record-access failures. ([TAS 2025 Annual Report, released 2026](https://www.taxpayeradvocate.irs.gov/reports/2025-annual-report-to-congress/most-serious-problems/)) Earlier correspondence-audit data showed a 41.6% no-response rate and 20.4% default rate in 2022, with difficulty understanding notices and submitting evidence cited as causes. ([TAS Objectives Report](https://www.taxpayeradvocate.irs.gov/reports/2024-objectives-report-to-congress/newsroom/))
- **Confidence:** **High.**
- **Contradiction:** **People need to know exactly what the government alleges and how to preserve their rights, but current systems force them to infer a legal process from notice-specific language and fragmented records.**

## 12. Producing a complete health history from multiple patient portals

- **Actor / trigger / job:** A chronic-care or cancer patient—or caregiver—sees a new clinician, moves systems, or investigates a discrepancy and must provide a complete current record.
- **Current workaround:** Log into multiple portals, download PDFs or data files, manually maintain lists, transmit records, and explain gaps verbally.
- **Observable harm:** Lost time, missing or duplicated information, retesting, medication discrepancies, and decisions made from incomplete history.
- **Why current tools fail:** Each portal represents an institution rather than the person; formats and permissions differ, and existing organizing apps have very low adoption.
- **Evidence:** In 2024, 59% of U.S. individuals reported multiple online medical records or portals, but only 7% used an app to combine them. This proves fragmentation and low consolidation, not that every multi-portal user experienced harm. ([ASTP/ONC HINTS data, published 2025](https://healthit.gov/data/data-briefs/individuals-access-and-use-patient-portals-and-smartphone-health-apps-2024/)) A 2024 scoping review found few studied portals offered the entire record across multiple sites. ([PubMed, March 2024](https://pubmed.ncbi.nlm.nih.gov/38266425/))
- **Confidence:** **High** on fragmentation; **medium** on direct causal harm frequency.
- **Contradiction:** **People need a longitudinal record centered on their body and care, but current systems force them to assemble institution-centered fragments manually.**

---

## Saturated framings to avoid

These problems may be real, but the following framings are crowded or fail to attack the documented mechanism:

- **Generic personal assistant, habit coach, journal, meal planner, fitness coach, travel planner, or “organize my life” app.**
- **AI therapist or loneliness companion.** Crowded, clinically risky, and usually grounded in an underspecified problem.
- **Therapist search engine.** The evidenced failure is inaccurate availability and inadequate network capacity, not absence of another search box.
- **Medication reminder.** It does not resolve contradictory medication sources.
- **Caregiver calendar or family chat.** It does not establish clinical authority, provenance, comprehension, or closed-loop handoffs.
- **Personal-health-record aggregator.** Apple Health Records and CommonHealth already represent this framing; ONC’s 7% usage suggests aggregation alone does not settle interoperability, trust, or workflow.
- **“Explain this benefits/tax/insurance letter” chatbot.** Mostly prompt-level value unless it addresses evidence, procedural state, rights, deadlines, and unresolved uncertainty.
- **Scam-message classifier.** Highly saturated and brittle because the failure crosses identity, relationship history, communication channels, and payment context.
- **Accessibility scanner or overlay.** Scanning is crowded; the actual user failure is inability to finish a task independently.
- **Bereavement checklist or document vault.** The deepest failure is institutional discovery and acceptance of authority, not lack of another checklist.

The most important research conclusion is that the best problems share a common structure: **a consequential decision depends on evidence distributed across parties, while the affected person bears the cost of reconstructing the truth under a deadline.**
