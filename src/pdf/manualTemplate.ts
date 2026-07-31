export const INSTITUTION_VISION_TEXT =
  "To emerge as an Institution of Excellence by providing High Quality Education in Engineering, Technology and Management to contribute for the economic as well as societal growth of our Nation.";

export const INSTITUTION_MISSION_POINTS = [
  "To impart strong fundamental and Value-Based Academic knowledge in various Engineering, Technology and Management disciplines to nurture creativity.",
  "To promote innovative Research and Development activities by collaborating with Industries, R&D organizations and other statutory bodies.",
  "To provide conducive learning environment and training so as to empower the students with dynamic skill development for employability.",
  "To foster Entrepreneurial spirit amongst the students for making a positive impact on remarkable community development.",
];

export const DEPARTMENT_VISION_TEXT =
  "To emerge as a center of academic excellence to meet the industrial needs of the competitive world with IT technocrats and researchers for the social and economic growth of the country in the area of Information Technology.";

export const DEPARTMENT_MISSION_POINTS = [
  "To provide quality education to the students to attain new heights in IT industry and research.",
  "To create employable students at national/international level by training them with adequate skills.",
  "To produce good citizens with high personal and professional ethics to serve both the IT industry and society.",
];

export const PEO_POINTS = [
  "Graduates will be able to demonstrate technical competence in core and interdisciplinary areas.",
  "Graduates will pursue higher studies, research and continuous professional development.",
  "Graduates will exhibit leadership, ethical values, teamwork and communication skills.",
];

export const PO_PSO_POINTS = [
  "PO1: Engineering knowledge",
  "PO2: Problem analysis",
  "PO3: Design/development of solutions",
  "PO4: Conduct investigations of complex problems",
  "PSO1: Apply appropriate techniques and modern tools in domain-specific practice.",
  "PSO2: Build and manage scalable software and data-driven solutions.",
];

export const MANUAL_TEMPLATE = {
  page1: {
    collegeName: "St. PETER'S COLLEGE OF ENGINEERING AND TECHNOLOGY",
    autonomousLine: "(An Autonomous Institution)",
    affiliationLine: "Affiliated to Anna University | Approved by AICTE",
    locationLine: "AVADI, CHENNAI - 600054",
    recordTitle: "RECORD NOTEBOOK",
    academicYear: "ACADEMIC YEAR : 2025-2026",
  },
  page2: {
    title: "Bonafide Certificate",
    certificatePrefix:
      "Certified that this is a bonafide record of practical work done by the above student in",
    certificateSuffix: "during the academic year 2025-2026.",
    facultyText: "Faculty-in-Charge",
    hodText: "HOD",
  },
  page3: {
    visionTitle: "INSTITUTION VISION",
    missionTitle: "INSTITUTION MISSION",
  },
  page4: {
    title: "DEPARTMENT VISION AND MISSION",
    poPsoTitle: "PROGRAM OUTCOMES (POs) AND PSOs",
  },
  page5: {
    peoTitle: "PROGRAM EDUCATIONAL OBJECTIVES",
    psoTitle: "PROGRAM SPECIFIC OUTCOMES",
  },
  page6: {
    title: "COURSE OUTCOMES AND CO-PO MAPPING",
    headers: ["CO", "DESCRIPTION", "PO1", "PO2", "PO3", "PO4"],
    rows: [
      ["CO1", "Understand laboratory fundamentals", "3", "2", "2", "1"],
      ["CO2", "Develop and evaluate practical solutions", "2", "3", "2", "2"],
      ["CO3", "Interpret results and document outcomes", "2", "2", "3", "2"],
    ],
  },
  page7: {
    title: "LIST OF EXPERIMENTS",
    headers: ["EX NO", "EXPERIMENT TITLE"],
  },
  page8: {
    title: "TABLE OF CONTENTS",
    headers: ["SL.NO", "DATE", "EXERCISE", "PG.NO", "SIGN"],
  },
} as const;
