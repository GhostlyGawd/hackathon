# Education problem atlas — failure events, not product ideas

Evidence labels: **P** = prevalence/scale, **C** = controlled/causal, **M** = mechanism or field audit, **Q** = qualitative/enforcement. Scores are 1–5; “poor substitutes” scores higher when current alternatives are worse.

## Top five

| Rank | Failure event | Severity | Frequency | Poor substitutes | Model-native leverage | Demo legibility | Total |
|---|---|---:|---:|---:|---:|---:|---:|
| 1 | A polished submission no longer proves mastery | 5 | 5 | 5 | 5 | 5 | **25** |
| 2 | Transfer students cannot know what credits apply before committing | 5 | 4 | 5 | 5 | 5 | **24** |
| 3 | AI improves assisted performance while degrading independent learning | 5 | 5 | 4 | 5 | 5 | **24** |
| 4 | Schools approve apps without knowing their real child-data behavior | 5 | 4 | 5 | 4 | 5 | **23** |
| 5 | Learners receive answers without being able to inspect their evidentiary basis | 4 | 5 | 4 | 5 | 5 | **23** |

These rank highly because their core work involves reasoning across messy evidence, changing state, contradictions, or latent understanding—not merely generating educational content.

## Twelve strongest problem cards

### 1. The submission–mastery disconnect

- **Actor/trigger:** An educator receives polished take-home work and must decide what the student actually understands.
- **Desired job:** Evaluate competence, reasoning, and growth—not merely artifact quality or probable authorship.
- **Current workaround:** AI detectors, proctored exams, oral defenses, version histories, surveillance.
- **Observable harm:** Invalid grades and credentials, false accusations, more testing burden, loss of accessible take-home assessment.
- **Why tools fail:** Detectors estimate authorship from surface patterns; they do not establish knowledge. Oral defenses and individualized assessment do not scale.
- **Evidence:** **M, 2024:** A blind real-world university study injected entirely GPT‑4-written work; **94% was undetected**, and it generally outscored real submissions ([PLOS One](https://journals.plos.org/plosone/article?id=10.1371%2Fjournal.pone.0305354)). **P, 2026:** 59% of U.S. teens said AI cheating happens regularly at their school ([Pew](https://www.pewresearch.org/internet/2026/02/24/how-teens-use-and-view-ai/)).
- **Confidence:** High that the failure exists; prevalence of undetected AI work is not established by the single-university experiment.
- **Contradiction:** Institutions need evidence of what a learner knows, but current assessment increasingly measures what the learner can submit.

### 2. Assisted performance masquerades as learning

- **Actor/trigger:** A student gets stuck, uses an unrestricted chatbot, completes the work, and assumes they learned it.
- **Desired job:** Receive help while retaining the ability to solve a related problem independently later.
- **Current workaround:** Bans, self-policing, generic tutors, answer checkers, teacher reminders.
- **Observable harm:** Illusory competence and weaker independent performance despite better practice grades.
- **Why tools fail:** General assistants optimize the immediate requested outcome. Learners often cannot perceive when the assistance has replaced the cognitive work.
- **Evidence:** **C, 2025:** In a preregistered field experiment with nearly 1,000 high-school math students, unrestricted GPT‑4 improved assisted practice grades by 48% but produced **17% lower unassisted exam grades** than no-AI controls; the students did not recognize the reduction ([PNAS](https://doi.org/10.1073/pnas.2422633122)). **P, 2026:** 64% of U.S. teens had used chatbots ([Pew](https://www.pewresearch.org/internet/2026/02/24/how-teens-use-and-view-ai/)).
- **Confidence:** High for this setting; generalization beyond high-school mathematics needs testing.
- **Contradiction:** Learners need assistance that builds independence, but assistants are rewarded for making the present task disappear.

### 3. Transfer-credit truth arrives after the decision

- **Actor/trigger:** A transfer student compares institutions, chooses a major, or accepts admission.
- **Desired job:** Know the real remaining courses, semesters, aid exposure, and cost before committing.
- **Current workaround:** Articulation tables, catalog searches, unofficial estimators, repeated advisor calls, waiting for an official evaluation.
- **Observable harm:** Repeated coursework, extra semesters, debt, exhausted aid, abandonment.
- **Why tools fail:** Rules are fragmented across institutions and majors; “accepted” credits may not apply to a degree; official evaluations often happen only after acceptance.
- **Evidence:** **P, 2017:** GAO estimated transfer students lost 43% of credits on average in 2004–09, including 37% between public institutions ([GAO](https://www.gao.gov/products/gao-17-574)). **Q, 2024:** AIR interviews found students commonly learned outcomes late and transfer technology was disconnected from internal evaluation ([AIR report](https://files.eric.ed.gov/fulltext/ED663739.pdf)). **M, 2026:** Texas research found major-level credit loss comparable in prevalence to general credit loss ([Educational Researcher](https://journals.sagepub.com/doi/full/10.3102/0013189X251410173)).
- **Confidence:** High on mechanism; the strongest national prevalence estimate is old.
- **Contradiction:** Students need degree-level certainty before committing, but institutions provide course-level answers after commitment.

### 4. Edtech approval cannot see actual child-data behavior

- **Actor/trigger:** A teacher or district approves or renews one of thousands of classroom apps.
- **Desired job:** Determine what data the app actually collects, transmits, retains, and shares.
- **Current workaround:** Privacy policies, vendor questionnaires, DPAs, spreadsheets, occasional legal or network review.
- **Observable harm:** Undisclosed advertising/analytics flows, profiling, contractual violations, child-privacy exposure.
- **Why tools fail:** Policy text and contracts can be vague or conflict with observed network behavior; apps update continuously; objective review requires technical and legal capacity schools lack.
- **Evidence:** **M, 2026:** Utah identified more than 3,000 apps in use; its investigation found some data behavior outside agreements and concluded the required expertise, time, and resources cannot realistically be demanded of educators ([Utah State Board investigation](https://schools.utah.gov/studentdataprivacy/files/Utah%20EdTech%20App%20Data%20Collection%20and%20Sharing%20-%202023-25%20Investigation.pdf)). **M, 2022–23:** A nonprofit national technical benchmark reported third-party data flows in 96% of 1,357 tested school apps; this is not peer-reviewed government prevalence data ([Internet Safety Labs](https://internetsafetylabs.org/blog/news-press/isl-research-reveals-96-of-school-apps-send-student-data-to-third-parties/)).
- **Confidence:** High that the verification gap exists; exact national incidence remains less certain.
- **Contradiction:** Schools must make accountable privacy decisions, but vendors control the evidence needed to make them.

### 5. Answers detach learners from evidence

- **Actor/trigger:** A learner uses an AI summary or search answer for a research task.
- **Desired job:** Understand which source supports each claim, its quality, contradictions, and uncertainty.
- **Current workaround:** Open many tabs, inspect citations manually, lateral-search, or trust the first fluent answer.
- **Observable harm:** Unsupported claims enter assignments; learners become confident without developing source-evaluation reasoning.
- **Why tools fail:** Fluent synthesis compresses away provenance and disagreement. Conventional assessments usually reveal the final judgment, not how it was reached.
- **Evidence:** **P, 2025:** In a nationally representative survey of 1,045 U.S. teens, 39% of GenAI schoolwork users reported encountering inaccuracies ([Common Sense Media](https://www.commonsensemedia.org/press-releases/research-reveals-teens-distrust-in-tech-companies-and-ai-generated-content)). **M, 2024:** Peer-reviewed research found ordinary source-evaluation assessments provide limited visibility into students’ evaluative reasoning ([Harvard Misinformation Review](https://misinforeview.hks.harvard.edu/article/measuring-what-matters-investigating-what-new-types-of-assessments-reveal-about-students-online-source-evaluations/)).
- **Confidence:** High on exposure to questionable information; medium on resulting learning harm.
- **Contradiction:** Learners need inspectable reasons for trusting a claim, but answer systems optimize a single frictionless response.

### 6. Report cards create false reassurance about mastery

- **Actor/trigger:** A parent sees a B or attends a conference and decides whether their child needs help.
- **Desired job:** Understand specific grade-level skills mastered, missing, and changing.
- **Current workaround:** Report cards, multiple assessment portals, teacher emails, tutoring after visible failure.
- **Observable harm:** Support arrives late because completion, effort, behavior, and mastery are compressed into one grade.
- **Why tools fail:** Data is fragmented and jargon-heavy; grades are useful summaries but poor diagnostic explanations.
- **Evidence:** **P, 2023:** Among roughly 2,000 public-school parents, 79% reported mostly B-or-better grades and 88–89% believed their child was at or above grade level ([Gallup/Learning Heroes](https://www.gallup.com/analytics/513881/parents-perspectives-on-grades.aspx)). **P, 2024:** 40% of fourth graders were below NAEP Basic in reading ([NAEP](https://www.nationsreportcard.gov/reports/reading/2024/g4_8/)). This juxtaposition signals a population information gap; it does not prove each surveyed parent was mistaken.
- **Confidence:** High on mismatch at population level; medium on individual causal consequences.
- **Contradiction:** Families need an actionable picture of mastery, but schools communicate through aggregates that can conceal it.

### 7. AI detectors falsely accuse multilingual writers

- **Actor/trigger:** A multilingual student submits original polished prose and is flagged.
- **Desired job:** Be evaluated on the work with a fair, contestable integrity process.
- **Current workaround:** Preserve drafts, prove edit history, appeal, or deliberately simplify writing.
- **Observable harm:** Disciplinary jeopardy, anxiety, inequity, and pressure to write worse.
- **Why tools fail:** Detector signals such as predictability overlap with features of non-native English writing and can be altered through trivial paraphrasing.
- **Evidence:** **M, 2023:** Seven detectors classified **61.22%** of human-written TOEFL essays by non-native English writers as AI-generated ([Stanford SCALE](https://scale.stanford.edu/publications/gpt-detectors-are-biased-against-non-native-english-writers)).
- **Confidence:** High for demonstrated bias; individual detector performance changes rapidly.
- **Contradiction:** Schools need fair integrity evidence, but current detection can transform linguistic difference into evidence of misconduct.

### 8. Accessible course content arrives late or unusable

- **Actor/trigger:** A disabled learner encounters a scanned PDF, unlabeled interface, inaccessible quiz, or uncaptioned media.
- **Desired job:** Access required material independently and at the same time as peers.
- **Current workaround:** OCR, disability-office requests, alternate files, human readers, family assistance.
- **Observable harm:** Lost study time, dependence, reduced participation, and privacy loss.
- **Why tools fail:** Automated checkers catch some conformance issues but miss semantic structure and real task usability; LMS and third-party content change continuously.
- **Evidence:** **P, 2019–20:** 21% of undergraduates reported a disability ([NCES](https://nces.ed.gov/fastfacts/display.asp?id=60)). **Q, 2024–26:** DOJ states public institutions’ LMS and course materials generally fall under the WCAG 2.1 AA rule ([DOJ](https://www.ada.gov/resources/web-rule-first-steps/)). **M, 2024:** A peer-reviewed review documents scanned PDFs and LMS barriers to assistive technology ([Education and Information Technologies](https://link.springer.com/article/10.1007/s12528-024-09424-2)).
- **Confidence:** High.
- **Contradiction:** Learners need equivalent access when instruction begins, but remediation starts only after exclusion is reported.

### 9. Multilingual families receive notices but cannot act on them

- **Actor/trigger:** A parent receives a deadline, IEP, safety, attendance, or progress communication in an unfamiliar language or register.
- **Desired job:** Understand consequences, ask questions, and respond in their preferred language.
- **Current workaround:** Children as interpreters, Google Translate, bilingual relatives, delayed interpreter appointments.
- **Observable harm:** Missed consent, services, deadlines, and diminished parental agency.
- **Why tools fail:** Literal one-way translation does not preserve educational/legal meaning or enable a continuing two-way conversation, especially in low-resource languages.
- **Evidence:** **P/context, 2024:** 5.3 million U.S. public-school students were English learners; this is scale context, not an estimate of parents with limited English ([NCES](https://nces.ed.gov/programs/coe/indicator/cgf)). **Q:** Federal guidance requires meaningful communication with limited-English-proficient parents ([U.S. Department of Education](https://www.ed.gov/laws-and-policy/civil-rights-laws/race-color-and-national-origin-discrimination/race-color-and-national-origin-discrimination-key-issues/equal-education-opportunities-english)). **Q, 2023:** Interviews with 42 multilingual migrant families documented persistent linguistic and enrollment barriers ([Dialog](https://journals.charlotte.edu/dialog/article/view/1681)).
- **Confidence:** Medium-high; broad national failure prevalence is undermeasured.
- **Contradiction:** Families need consequential communication they can act on, but schools often treat sending translated text as successful communication.

### 10. Basic-needs help is least discoverable during crisis

- **Actor/trigger:** A working, parenting, or low-income student experiences food, housing, transport, childcare, or internet disruption.
- **Desired job:** Find relevant support quickly enough to remain enrolled.
- **Current workaround:** Search campus and agency sites, repeat their story to offices, ask an advisor, or withdraw.
- **Observable harm:** Stopout, hunger, unstable housing, missed classes, and unused support.
- **Why tools fail:** Programs are fragmented across campus and government; eligibility language is difficult; discovery demands executive capacity at the worst moment.
- **Evidence:** **P, 2025, nonrepresentative:** Among 74,350 students at 91 institutions, 59% reported food or housing insecurity, 65% were unaware of available support, and 48% experiencing insecurity used no campus support ([Hope Center](https://hope.temple.edu/research/hope-center-basic-needs-survey/2023-2024-student-basic-needs-survey-report)).
- **Confidence:** High within the sample, medium for national prevalence.
- **Contradiction:** Students need low-friction support during overload, but support is organized around institutions and programs rather than the student’s situation.

### 11. Returning adults’ prior learning is administratively invisible

- **Actor/trigger:** An adult with old credits, military training, certifications, or work experience considers returning.
- **Desired job:** Know which prior learning counts and the shortest credible route to a credential.
- **Current workaround:** Order transcripts, contact multiple offices, build portfolios, pay assessment fees, or repeat mastered material.
- **Observable harm:** Extra tuition and time or abandonment before re-enrollment.
- **Why tools fail:** Institutions encode learning as local courses; recognition policies and evidentiary requirements vary substantially.
- **Evidence:** **P/context, 2025:** 43.1 million U.S. adults had some college but no credential; this does not establish prior-learning recognition as the cause ([National Student Clearinghouse](https://nscresearchcenter.org/some-college-no-credential/scncreport2025/)). **M, 2024:** CAEL/AACRAO found uneven credit-for-prior-learning practices ([CAEL/AACRAO](https://www.cael.org/resources/research/aacrao-cael-cpl-survey)); WICHE reports fees as a student barrier in institutional surveys ([WICHE](https://www.wiche.edu/key-initiatives/recognition-of-learning/synthesis-brief/)).
- **Confidence:** Medium; the population is enormous, but causal prevalence of this specific barrier is weakly measured.
- **Contradiction:** Adults need demonstrated learning recognized, but institutions recognize where and how learning was packaged.

### 12. Attendance systems detect absence, not its cause

- **Actor/trigger:** A family or school crosses an absenteeism threshold after weeks of missed instruction.
- **Desired job:** Identify the actual barrier—health, bullying, transport, housing, caregiving, or disengagement—early enough to respond appropriately.
- **Current workaround:** Robocalls, warning letters, home visits, attendance contracts, truancy referral.
- **Observable harm:** Continued learning loss and punitive escalation against families facing structural barriers.
- **Why tools fail:** Student-information systems record that an absence happened, not why; generic outreach can reduce trust.
- **Evidence:** **P:** More than 30% of students were chronically absent in 20 states in 2022–23 ([U.S. Department of Education](https://www.ed.gov/teaching-and-administration/supporting-students/chronic-absenteeism)). **M, 2025:** Analysis of 5,223 home-visit records in one urban district found health was the primary reason in 71% and social factors in 18% ([peer-reviewed study](https://pubmed.ncbi.nlm.nih.gov/40683622/)).
- **Confidence:** High on prevalence, medium on nationally generalizing the cause distribution.
- **Contradiction:** Schools need causes early enough to help, but systems surface counts only after the pattern becomes severe.

## Adversarial flags

- **Saturated:** Generic AI tutors, homework helpers, quiz/lesson generators, automated grading, generic feedback, translation chatbots, source summarizers, and simulated patients. Any card that collapses into one of these should be rejected.
- **Scientific dead end:** “A better AI detector.” Detection does not establish mastery and creates serious fairness risk.
- **Child-safety/privacy:** Assessment, attendance, family communication, and edtech problems involve minors. Surveillance, hidden profiling, or punitive risk scores should be disqualifying.
- **Accessibility:** Materially pursuing accessibility without disabled-user co-design and validation is a selection risk, regardless of technical elegance.
- **High-stakes boundaries:** Transfer-credit, benefits, disability, and attendance outputs cannot silently become authoritative eligibility, legal, disciplinary, or clinical decisions.
- **Structural-problem warning:** Basic-needs and absenteeism failures are real, but an information layer alone can become theater if the underlying institution has no capacity or service to offer.
